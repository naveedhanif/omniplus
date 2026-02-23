import { Component, inject, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreConfigService } from '../../services/store-config.service';
import { MockSupabaseService, Store } from '../../services/mock-supabase.service';
import { toSignal } from '@angular/core/rxjs-interop';

// Feature Components
import { StoreManagerComponent } from './features/stores/store-manager.component';
import { CustomerCRMComponent } from './features/crm/customer-crm.component';
import { InventoryManagerComponent } from './features/inventory/inventory-manager.component';
import { CategoriesManagerComponent } from './features/categories/categories-manager.component';
import { ConfigurationManagerComponent } from './features/config/configuration-manager.component';
import { SalesHistoryComponent } from './features/history/sales-history.component';
import { PurchaseOrderComponent } from './features/purchase-orders/purchase-orders.component';
import { DatabaseSchemaComponent } from './features/schema/database-schema.component';
import { ActivityLogComponent } from './features/auditing/activity-log.component';
import { StockManagerComponent } from './features/stock/stock-manager.component';
import { SupplierManagerComponent } from './features/suppliers/supplier-manager.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    StoreManagerComponent,
    CustomerCRMComponent,
    InventoryManagerComponent,
    CategoriesManagerComponent,
    ConfigurationManagerComponent,
    SalesHistoryComponent,
    PurchaseOrderComponent,
    DatabaseSchemaComponent,
    ActivityLogComponent,
    StockManagerComponent,
    SupplierManagerComponent
  ],
  template: `
    <div class="min-h-screen p-6 transition-colors duration-300">
      <header class="mb-8 flex justify-between items-center">
        <div>
          <h1 class="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p class="opacity-70">Manage your stores, settings, and inventory</p>
        </div>
        
        @if (allStores().length > 0) {
          <div class="flex gap-4 items-center bg-[var(--card-bg)] p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <span class="text-sm font-medium">Switch Store Context:</span>
            <select 
              [value]="storeService.currentStore()?.id" 
              (change)="switchStore($event)"
              class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors">
              @for (store of allStores(); track store.id) {
                <option [value]="store.id">{{ store.name }} ({{ store.type }})</option>
              }
            </select>
          </div>
        }
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Sidebar Navigation -->
        <div class="lg:col-span-3">
          <nav class="flex flex-col gap-2 sticky top-6">
             <button 
              (click)="activeTab.set('stores')"
              [class.bg-[var(--primary-color)]]="activeTab() === 'stores'"
              [class.text-white]="activeTab() === 'stores'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span class="material-symbols-rounded">store</span>
              Stores
            </button>
            <button 
              (click)="activeTab.set('config')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'config'"
              [class.text-white]="activeTab() === 'config'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">settings</span>
              Configuration
            </button>
             <button 
              (click)="activeTab.set('categories')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'categories'"
              [class.text-white]="activeTab() === 'categories'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">category</span>
              Categories
            </button>
            <button 
              (click)="activeTab.set('inventory')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'inventory'"
              [class.text-white]="activeTab() === 'inventory'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">inventory_2</span>
              Inventory Manager
            </button>
            <button 
              (click)="activeTab.set('stock')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'stock'"
              [class.text-white]="activeTab() === 'stock'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">warehouse</span>
              Stock Management
            </button>
             <button 
              (click)="activeTab.set('customers')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'customers'"
              [class.text-white]="activeTab() === 'customers'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">group</span>
              Customers & CRM
            </button>
            <button 
              (click)="activeTab.set('suppliers')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'suppliers'"
              [class.text-white]="activeTab() === 'suppliers'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">local_shipping</span>
              Suppliers
            </button>
            <button 
              (click)="activeTab.set('purchase-orders')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'purchase-orders'"
              [class.text-white]="activeTab() === 'purchase-orders'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">shopping_cart</span>
              Purchase Orders
            </button>
            <button 
              (click)="activeTab.set('history')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'history'"
              [class.text-white]="activeTab() === 'history'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">receipt_long</span>
              Sales History
            </button>
            <button 
              (click)="activeTab.set('auditing')"
              [disabled]="allStores().length === 0"
              [class.bg-[var(--primary-color)]]="activeTab() === 'auditing'"
              [class.text-white]="activeTab() === 'auditing'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-rounded">analytics</span>
              Activity Audit
            </button>
            <div class="border-t border-slate-200 dark:border-slate-700 my-2"></div>
            <button 
              (click)="activeTab.set('schema')"
              [class.bg-[var(--primary-color)]]="activeTab() === 'schema'"
              [class.text-white]="activeTab() === 'schema'"
              class="text-left px-4 py-3 rounded-lg font-medium transition-colors hover:bg-opacity-80 flex items-center gap-3 bg-[var(--card-bg)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 justify-between">
              <div class="flex items-center gap-3">
                <span class="material-symbols-rounded">database</span>
                Database Schema
              </div>
            </button>
          </nav>
        </div>

        <!-- Main Content Area -->
        <div class="lg:col-span-9">
          @switch (activeTab()) {
            @case ('stores') { <app-store-manager /> }
            @case ('config') { <app-configuration-manager /> }
            @case ('categories') { <app-categories-manager /> }
            @case ('inventory') { <app-inventory-manager /> }
            @case ('stock') { <app-stock-manager /> }
            @case ('customers') { <app-customer-crm /> }
            @case ('purchase-orders') { <app-purchase-orders /> }
            @case ('history') { <app-sales-history /> }
            @case ('auditing') { <app-activity-log /> }
            @case ('suppliers') { <app-supplier-manager /> }
            @case ('schema') { <app-database-schema /> }
          }
        </div>
      </div>
    </div>
  `
})
export class AdminDashboardComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);

  activeTab = signal<'stores' | 'config' | 'categories' | 'inventory' | 'stock' | 'customers' | 'purchase-orders' | 'history' | 'auditing' | 'schema' | 'suppliers'>('stores');

  allStores: Signal<Store[]> = toSignal(this.supabase.getAllStores(), { initialValue: [] as Store[] });

  switchStore(event: Event) {
    const storeId = (event.target as HTMLSelectElement).value;
    if (storeId) {
      this.storeService.loadStore(storeId);
    }
  }
}
