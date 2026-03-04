import { Injectable, inject, signal, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConnectivityService } from './connectivity.service';
import { OfflineStorageService, SyncQueueItem } from './offline-storage.service';
import { MockSupabaseService } from './mock-supabase.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
    private connectivity = inject(ConnectivityService);
    private offlineStorage = inject(OfflineStorageService);
    private supabase = inject(MockSupabaseService);

    /** How many transactions are sitting in the queue, waiting to sync */
    pendingCount = signal<number>(0);

    /** Whether we are currently in the process of uploading the queue */
    isSyncing = signal<boolean>(false);

    /** Last error message from a sync attempt */
    syncError = signal<string | null>(null);

    /**
     * Guards the reactive effect — set to true only AFTER the IndexedDB
     * has fully opened. This prevents the race condition where the effect
     * fires on startup before the database is ready.
     */
    private isInitialised = signal<boolean>(false);

    constructor() {
        // When the internet comes back, automatically start draining the queue.
        // The isInitialised guard ensures the DB is open before we attempt reads.
        effect(() => {
            if (this.connectivity.isOnline() && this.isInitialised()) {
                console.log('[SyncService] Back online — draining sync queue...');
                this.drainSyncQueue();
            }
        });
    }

    // ─── Initialisation ─────────────────────────────────────────────────────

    /**
     * Called once on app startup from AppComponent.
     * Strictly sequenced: open DB → count queue → mark ready → seed → drain.
     */
    async initialise(): Promise<void> {
        await this.offlineStorage.init();    // Step 1: Open IndexedDB — MUST complete first
        await this.refreshPendingCount();    // Step 2: Count any leftover queued items

        // Step 3: Mark as ready — the effect above will now respond safely
        this.isInitialised.set(true);

        if (this.connectivity.isOnline()) {
            await this.seedLocalCache();     // Step 4: Populate local cache from Supabase
            await this.drainSyncQueue();     // Step 5: Drain any queue from a previous offline session
        }
    }

    /**
     * Downloads key reference data from Supabase and stores it locally.
     * Call this whenever the app is online to keep the local cache fresh.
     */
    async seedLocalCache(): Promise<void> {
        try {
            const storeId = this.supabase.activeStoreId();
            if (!storeId) return;

            console.log('[SyncService] Seeding local cache from Supabase...');

            // Fetch products, categories, suppliers, and staff in parallel
            const [
                { data: products },
                { data: categories },
                { data: suppliers },
                { data: staff }
            ] = await Promise.all([
                this.supabase.client.from('products').select('*').eq('store_id', storeId),
                this.supabase.client.from('categories').select('*'),
                this.supabase.client.from('suppliers').select('*'),
                this.supabase.client.from('app_users').select('*')
            ]);

            // Write each dataset into IndexedDB
            if (products?.length) await this.offlineStorage.putBulk('products', products);
            if (categories?.length) await this.offlineStorage.putBulk('categories', categories);
            if (suppliers?.length) await this.offlineStorage.putBulk('suppliers', suppliers);
            if (staff?.length) await this.offlineStorage.putBulk('app_users', staff);

            console.log(`[SyncService] ✅ Local cache seeded: ${products?.length ?? 0} products, ${categories?.length ?? 0} categories, ${staff?.length ?? 0} staff.`);

        } catch (err) {
            console.error('[SyncService] ❌ Failed to seed local cache:', err);
        }
    }

    // ─── Offline-aware operations ─────────────────────────────────────────────

    /**
     * Completes a sale transaction — saves to Supabase if online,
     * or queues it locally if offline.
     */
    async completeTransaction(transactionPayload: any): Promise<{ success: boolean; offline: boolean }> {
        if (this.connectivity.isOnline()) {
            // Online path: write directly to Supabase
            try {
                const { error } = await this.supabase.client
                    .from('transactions')
                    .insert(transactionPayload);

                if (error) throw error;
                return { success: true, offline: false };
            } catch (err: any) {
                console.error('[SyncService] Online transaction failed, falling back to queue:', err);
                // Even if Supabase is temporarily slow/down, queue it safely
                await this.queueOperation('transactions', 'INSERT', transactionPayload);
                return { success: true, offline: true };
            }
        } else {
            // Offline path: save to local queue
            await this.queueOperation('transactions', 'INSERT', transactionPayload);
            return { success: true, offline: true };
        }
    }

    // ─── Queue management ──────────────────────────────────────────────────────

    /** Adds any database operation to the local sync queue */
    async queueOperation(table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', payload: any): Promise<void> {
        await this.offlineStorage.addToSyncQueue({
            table,
            operation,
            payload,
            created_at: new Date().toISOString()
        });
        await this.refreshPendingCount();
        console.log(`[SyncService] ⏳ Queued ${operation} on '${table}'. Total pending: ${this.pendingCount()}`);
    }

    /**
     * Drains the pending sync queue by replaying each operation against Supabase.
     * Called automatically when the internet reconnects.
     *
     * IMPORTANT: For 'transactions' table items, we call the full addTransaction()
     * pipeline which handles line items, stock updates and customer updates —
     * NOT a simple raw insert.
     */
    async drainSyncQueue(): Promise<void> {
        if (this.isSyncing()) return; // prevent double runs
        const pending = await this.offlineStorage.getPendingSyncItems();
        if (pending.length === 0) return;

        this.isSyncing.set(true);
        this.syncError.set(null);
        console.log(`[SyncService] 🔄 Draining ${pending.length} pending items...`);

        let successCount = 0;
        for (const item of pending) {
            try {
                await this.replayQueueItem(item);

                // ✅ Successfully synced — remove from queue
                await this.offlineStorage.removeFromSyncQueue(item.id!);
                successCount++;
                console.log(`[SyncService] ✅ Synced item ${item.id} (${item.table})`);
            } catch (err: any) {
                console.error(`[SyncService] ❌ Failed to sync item ${item.id}:`, err.message);
                await this.offlineStorage.markSyncItemFailed(item);
            }
        }

        await this.refreshPendingCount();
        this.isSyncing.set(false);
        console.log(`[SyncService] ✅ Sync complete: ${successCount}/${pending.length} items uploaded.`);
    }

    /**
     * Replays a single queued item against Supabase.
     * Uses the correct service method for each table type.
     */
    private async replayQueueItem(item: SyncQueueItem): Promise<void> {
        // ─── Special handler: full sale transaction ────────────────────────────
        if (item.table === 'transactions' && item.operation === 'INSERT') {
            const { items_snapshot, queued_at, ...txData } = item.payload;

            if (!items_snapshot || !Array.isArray(items_snapshot)) {
                throw new Error('Transaction queue item is missing items_snapshot')
            }

            // Replay via the FULL addTransaction pipeline:
            // This creates the transaction, all its line items, and updates stock
            await firstValueFrom(this.supabase.addTransaction(txData, items_snapshot));
            return;
        }

        // ─── Generic handler for all other tables ─────────────────────────────
        if (item.operation === 'INSERT') {
            const { error } = await this.supabase.client.from(item.table).insert(item.payload);
            if (error) throw error;
        } else if (item.operation === 'UPDATE') {
            const { error } = await this.supabase.client.from(item.table).update(item.payload).eq('id', item.payload.id);
            if (error) throw error;
        } else if (item.operation === 'DELETE') {
            const { error } = await this.supabase.client.from(item.table).delete().eq('id', item.payload.id);
            if (error) throw error;
        }
    }

    /** Refreshes the pending count signal for the UI badge */
    private async refreshPendingCount(): Promise<void> {
        try {
            const pending = await this.offlineStorage.getPendingSyncItems();
            this.pendingCount.set(pending.length);
        } catch {
            // DB may not be open yet — silently ignore
            this.pendingCount.set(0);
        }
    }

    /** Offline-aware PIN lookup — checks local IndexedDB first */
    async findUserByPin(pin: string): Promise<any | null> {
        if (this.connectivity.isOnline()) {
            // Online: query Supabase directly (always most up to date)
            const { data } = await this.supabase.client
                .from('app_users')
                .select('*')
                .eq('pin_code', pin)
                .single();
            return data;
        } else {
            // Offline: look up from cached IndexedDB staff records
            return await this.offlineStorage.getByPin(pin);
        }
    }
}
