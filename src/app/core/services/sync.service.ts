import { Injectable, inject, signal, effect } from '@angular/core';
import { ConnectivityService } from './connectivity.service';
import { OfflineStorageService, SyncQueueItem } from './offline-storage.service';
import { MockSupabaseService, Product, Supplier } from './mock-supabase.service';

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

    constructor() {
        // When the internet comes back, automatically start draining the queue
        effect(() => {
            if (this.connectivity.isOnline()) {
                console.log('[SyncService] Back online — draining sync queue...');
                this.drainSyncQueue();
            }
        });
    }

    // ─── Initialisation ─────────────────────────────────────────────────────

    /**
     * Called once on app startup.
     * Opens the local DB and populates it with fresh data from Supabase.
     */
    async initialise(): Promise<void> {
        await this.offlineStorage.init();
        await this.refreshPendingCount();

        if (this.connectivity.isOnline()) {
            await this.seedLocalCache();
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

                // ✅ Successfully synced - remove from queue
                await this.offlineStorage.removeFromSyncQueue(item.id!);
                successCount++;
            } catch (err: any) {
                console.error(`[SyncService] ❌ Failed to sync item ${item.id}:`, err.message);
                await this.offlineStorage.markSyncItemFailed(item);
            }
        }

        await this.refreshPendingCount();
        this.isSyncing.set(false);
        console.log(`[SyncService] ✅ Sync complete: ${successCount}/${pending.length} items uploaded.`);
    }

    /** Refreshes the pending count signal for the UI badge */
    private async refreshPendingCount(): Promise<void> {
        const pending = await this.offlineStorage.getPendingSyncItems();
        this.pendingCount.set(pending.length);
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
