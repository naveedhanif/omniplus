import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {

    /** Live signal — true = connected to internet, false = offline */
    isOnline = signal<boolean>(navigator.onLine);

    /** Counts how many times connection was lost this session */
    disconnectionCount = signal<number>(0);

    /** Timestamp of the last disconnection event */
    lastDisconnected = signal<Date | null>(null);

    /** Timestamp of the last reconnection event */
    lastReconnected = signal<Date | null>(null);

    constructor() {
        // Listen to the browser's native online/offline events
        window.addEventListener('online', () => {
            this.isOnline.set(true);
            this.lastReconnected.set(new Date());
            console.log('[Connectivity] ✅ Internet connection restored.');
        });

        window.addEventListener('offline', () => {
            this.isOnline.set(false);
            this.lastDisconnected.set(new Date());
            this.disconnectionCount.update(n => n + 1);
            console.warn('[Connectivity] ⚠️ Internet connection lost. Switching to offline mode.');
        });
    }
}
