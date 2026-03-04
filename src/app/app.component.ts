import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { StoreConfigService } from './core/services/store-config.service';
import { MockSupabaseService } from './core/services/mock-supabase.service';
import { DialogModalComponent } from './shared/components/dialog-modal.component';
import { SyncService } from './core/services/sync.service';
import { ConnectivityService } from './core/services/connectivity.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DialogModalComponent],
  template: `
    <!-- ── Global Offline / Sync Status Banner ── -->
    @if (!connectivity.isOnline()) {
      <div class="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 bg-amber-500 text-white text-xs font-black uppercase tracking-widest py-2.5 shadow-lg transition-all duration-300">
        <span class="material-symbols-rounded text-[16px]">wifi_off</span>
        Offline Mode — Working from local cache
        @if (syncService.pendingCount() > 0) {
          <span class="bg-white text-amber-600 rounded-full px-2.5 py-0.5 font-black">{{ syncService.pendingCount() }} queued</span>
        }
      </div>
    }
    @if (connectivity.isOnline() && syncService.isSyncing()) {
      <div class="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest py-2.5 shadow-lg transition-all duration-300">
        <span class="material-symbols-rounded text-[16px] animate-spin">sync</span>
        Syncing {{ syncService.pendingCount() }} pending transactions...
      </div>
    }
    @if (supabase.isConfigured()) {
      <nav class="bg-gray-800 text-white shadow-md sticky top-0 z-50">
        <div class="container mx-auto px-6 py-3 flex justify-between items-center">
          <div class="flex items-center gap-3">
            <span class="material-symbols-rounded text-2xl" [style.color]="storeService.primaryColor()">point_of_sale</span>
            <span class="text-xl font-bold">OmniPOS</span>
          </div>
          <div class="flex items-center gap-6">
            <a routerLink="/"
              class="px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
              routerLinkActive="bg-[var(--primary-color)]"
              [routerLinkActiveOptions]="{exact: true}">
              EPOS View
            </a>
            <a routerLink="/admin"
              class="px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
              routerLinkActive="bg-[var(--primary-color)]">
              Admin Panel
            </a>
          </div>
        </div>
      </nav>
      <main>
        <router-outlet></router-outlet>
      </main>
      
      <!-- Global Modal Container -->
      <app-dialog-modal></app-dialog-modal>
      
    } @else {
      <div class="flex flex-col items-center justify-center min-h-screen bg-red-50 text-red-800 p-4">
        <div class="w-full max-w-2xl bg-white border-2 border-red-200 rounded-lg shadow-lg p-8 text-center">
          <div class="flex justify-center items-center mb-4">
            <span class="material-symbols-rounded text-6xl text-red-500">error</span>
          </div>
          <h1 class="text-3xl font-bold text-red-900 mb-2">Configuration Error</h1>
          <p class="text-lg mb-6">Your Supabase credentials are missing or invalid.</p>
          
          <div class="text-left bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 class="font-bold text-lg mb-2">Action Required:</h2>
            <p class="mb-4">To fix this, you need to edit the configuration file and add your Supabase Project URL and anon key.</p>
            <ol class="list-decimal list-inside space-y-2">
              <li>Open the file: <code class="bg-red-200 text-red-900 font-mono p-1 rounded text-sm">src/environments/environment.ts</code></li>
              <li>Replace the placeholder values for <code class="bg-red-200 text-red-900 font-mono p-1 rounded text-sm">supabaseUrl</code> and <code class="bg-red-200 text-red-900 font-mono p-1 rounded text-sm">supabaseKey</code> with your actual credentials from your Supabase dashboard.</li>
            </ol>
          </div>
          <p class="mt-6 text-sm text-red-600">The application will not work until this is configured correctly.</p>
        </div>
      </div>
    }
  `
})
export class AppComponent {
  storeService = inject(StoreConfigService);
  supabase = inject(MockSupabaseService);
  syncService = inject(SyncService);
  connectivity = inject(ConnectivityService);

  constructor() {
    // Bootstrap the offline engine on every app startup
    this.syncService.initialise().catch(err =>
      console.error('[AppComponent] Failed to initialise SyncService:', err)
    );
  }
}