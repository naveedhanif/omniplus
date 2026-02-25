import { Injectable, inject, signal, effect, computed, Signal } from '@angular/core';
import { MockSupabaseService, Store } from './mock-supabase.service';
import { DOCUMENT } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StoreConfigService {
  private supabase = inject(MockSupabaseService);
  private document = inject<Document>(DOCUMENT);

  // Convert stores observable to a signal for use in computed
  // Explicitly typing as Signal<Store[]> to resolve 'unknown' type errors
  private allStores: Signal<Store[]> = toSignal(this.supabase.getAllStores(), { initialValue: [] as Store[] });

  // State is now derived directly from the active ID and the list of all stores.
  readonly currentStore = computed(() => {
    const stores = this.allStores();
    const activeId = this.supabase.activeStoreId();
    if (!activeId || stores.length === 0) {
      return null;
    }
    return stores.find(s => s.id === activeId) ?? null;
  });

  readonly currentStore$: Observable<Store | null> = toObservable(this.currentStore);

  readonly primaryColor = computed(() => this.currentStore()?.config.primaryColor || '#3b82f6');
  readonly isDarkMode = computed(() => this.currentStore()?.config.darkMode || false);
  readonly storeType = computed(() => this.currentStore()?.type || 'RESTAURANT');
  readonly currency = computed(() => this.currentStore()?.config.currency || '$');

  constructor() {
    // This effect is a valid use case: it performs a side effect (DOM manipulation)
    // based on signal state, without writing back to any signals.
    effect(() => {
      const color = this.primaryColor();
      const isDark = this.isDarkMode();
      const body = this.document.body;

      body.style.setProperty('--primary-color', color);

      // Tailwind uses 'dark' class by default with darkMode: 'class' strategy
      if (isDark) {
        body.classList.add('dark');
      } else {
        body.classList.remove('dark');
      }
    });
  }

  // This is the single public method to change the store context.
  // It updates the source of truth (the active ID signal) in the Supabase service.
  loadStore(storeId: string) {
    this.supabase.setActiveStoreId(storeId);
  }
}