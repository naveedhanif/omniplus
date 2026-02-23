import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { StoreConfigService } from '../services/store-config.service';
import { MockSupabaseService } from '../services/mock-supabase.service';
import { DialogModalComponent } from '../components/shared/dialog-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DialogModalComponent],
  template: `
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
}