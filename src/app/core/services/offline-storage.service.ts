import { Injectable } from '@angular/core';

const DB_NAME = 'omniplus_offline';
const DB_VERSION = 1;

// All the "tables" (object stores) inside our local IndexedDB database
const STORES = {
    PRODUCTS: 'products',
    CATEGORIES: 'categories',
    STAFF: 'app_users',
    SUPPLIERS: 'suppliers',
    SHIFTS: 'shifts',
    SYNC_QUEUE: 'sync_queue',    // Pending transactions waiting to go to Supabase
};

export interface SyncQueueItem {
    id?: number;                   // Auto-incremented local ID
    table: string;                 // Which Supabase table this targets
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: any;                  // The data to send
    created_at: string;            // When was this queued
    retry_count: number;           // How many upload attempts have failed
    status: 'PENDING' | 'FAILED';
}

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
    private db: IDBDatabase | null = null;
    private readonly STORES = STORES;

    /** Opens (or creates) the local IndexedDB database */
    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create all our object stores (equivalent to SQL tables)
                if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
                    const store = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
                    store.createIndex('store_id', 'store_id', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
                    db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORES.STAFF)) {
                    const store = db.createObjectStore(STORES.STAFF, { keyPath: 'id' });
                    store.createIndex('pin_code', 'pin_code', { unique: true });
                }
                if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
                    db.createObjectStore(STORES.SUPPLIERS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORES.SHIFTS)) {
                    db.createObjectStore(STORES.SHIFTS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    // autoIncrement so every queued item gets a unique local ID
                    const queue = db.createObjectStore(STORES.SYNC_QUEUE, {
                        keyPath: 'id', autoIncrement: true
                    });
                    queue.createIndex('status', 'status', { unique: false });
                }

                console.log('[OfflineStorage] IndexedDB schema created successfully.');
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                console.log('[OfflineStorage] ✅ IndexedDB opened successfully.');
                resolve();
            };

            request.onerror = (event) => {
                console.error('[OfflineStorage] ❌ Failed to open IndexedDB:', event);
                reject(event);
            };
        });
    }

    // ─── Generic Read / Write helpers ─────────────────────────────────────────

    /** Save (upsert) a single record into a local store */
    put(storeName: string, record: any): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not open');
            const tx = this.db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /** Save a whole array of records at once (bulk upsert) */
    async putBulk(storeName: string, records: any[]): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not open');
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            records.forEach(r => store.put(r));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /** Read ALL records from a local store */
    getAll<T>(storeName: string): Promise<T[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not open');
            const tx = this.db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result as T[]);
            request.onerror = () => reject(request.error);
        });
    }

    /** Look up a record by its PIN code index */
    getByPin(pin: string): Promise<any | null> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not open');
            const tx = this.db.transaction(STORES.STAFF, 'readonly');
            const index = tx.objectStore(STORES.STAFF).index('pin_code');
            const request = index.get(pin);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    // ─── Sync Queue helpers ─────────────────────────────────────────────────

    /** Add a pending operation to the sync queue */
    addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'retry_count' | 'status'>): Promise<void> {
        return this.put(STORES.SYNC_QUEUE, {
            ...item,
            retry_count: 0,
            status: 'PENDING'
        });
    }

    /** Get all pending items from the queue */
    getPendingSyncItems(): Promise<SyncQueueItem[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not open');
            const tx = this.db.transaction(STORES.SYNC_QUEUE, 'readonly');
            const index = tx.objectStore(STORES.SYNC_QUEUE).index('status');
            const request = index.getAll('PENDING');
            request.onsuccess = () => resolve(request.result as SyncQueueItem[]);
            request.onerror = () => reject(request.error);
        });
    }

    /** Remove a successfully synced item from the queue */
    removeFromSyncQueue(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not open');
            const tx = this.db.transaction(STORES.SYNC_QUEUE, 'readwrite');
            tx.objectStore(STORES.SYNC_QUEUE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /** Update a failed queue item's retry count */
    markSyncItemFailed(item: SyncQueueItem): Promise<void> {
        return this.put(STORES.SYNC_QUEUE, {
            ...item,
            retry_count: item.retry_count + 1,
            status: 'FAILED'
        });
    }

    /** Expose store names for external use */
    get storeNames() { return this.STORES; }
}
