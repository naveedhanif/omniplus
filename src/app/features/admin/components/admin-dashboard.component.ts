import { Component, inject, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreConfigService } from '../../../core/services/store-config.service';
import { MockSupabaseService, Store } from '../../../core/services/mock-supabase.service';
import { toSignal } from '@angular/core/rxjs-interop';

// Feature Components
import { StoreManagerComponent } from './stores/store-manager.component';
import { CustomerCRMComponent } from './crm/customer-crm.component';
import { InventoryManagerComponent } from '../../inventory/components/inventory/inventory-manager.component';
import { CategoriesManagerComponent } from '../../inventory/components/categories/categories-manager.component';
import { ConfigurationManagerComponent } from './config/configuration-manager.component';
import { SalesHistoryComponent } from '../../inventory/components/history/sales-history.component';
import { PurchaseOrderComponent } from '../../procurement/components/purchase-orders/purchase-orders.component';
import { DatabaseSchemaComponent } from './schema/database-schema.component';
import { ActivityLogComponent } from './auditing/activity-log.component';
import { StockManagerComponent } from '../../inventory/components/stock/stock-manager.component';
import { SupplierManagerComponent } from '../../procurement/components/suppliers/supplier-manager.component';
import { AnalyticsDashboardComponent } from './analytics/analytics-dashboard.component';

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
    SupplierManagerComponent,
    AnalyticsDashboardComponent
  ],
  template: `
    <div class="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      <!-- Rail Navigation (Auto-Collapsing Drawer) -->
      <nav class="group relative z-50 h-full transition-all duration-300 ease-in-out flex-shrink-0 w-[72px] hover:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col pt-6 shadow-[4px_0_24px_rgba(0,0,0,0)] hover:shadow-[4px_0_24px_rgba(0,0,0,0.05)]">
        
        <!-- Logo / App Icon Area -->
        <div class="px-[20px] mb-8 flex items-center overflow-hidden whitespace-nowrap h-8">
          <div class="w-8 h-8 rounded-xl bg-[var(--primary-color)] text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--primary-color)]/30 group-hover:rotate-12 transition-transform duration-300">
             <span class="material-symbols-rounded text-[20px]">api</span>
          </div>
          <span class="ml-4 font-black tracking-widest text-[15px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75 pointer-events-none">OMNIPLUS</span>
        </div>

        <div class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-3 space-y-1">
          <!-- Navigation Items -->
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'stores', icon: 'store', label: 'Stores', disabled: false }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'analytics', icon: 'insights', label: 'Reports & Analytics', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'config', icon: 'settings', label: 'Configuration', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'categories', icon: 'category', label: 'Categories', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'inventory', icon: 'inventory_2', label: 'Inventory Manager', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'stock', icon: 'warehouse', label: 'Stock Management', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'customers', icon: 'group', label: 'Customers & CRM', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'suppliers', icon: 'local_shipping', label: 'Suppliers', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'purchase-orders', icon: 'shopping_cart', label: 'Purchase Orders', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'history', icon: 'receipt_long', label: 'Sales History', disabled: allStores().length === 0 }"></ng-container>
          <ng-container *ngTemplateOutlet="navItem; context: { id: 'auditing', icon: 'analytics', label: 'Activity Audit', disabled: allStores().length === 0 }"></ng-container>
        </div>

        <div class="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
           <ng-container *ngTemplateOutlet="navItem; context: { id: 'schema', icon: 'database', label: 'Database Schema', disabled: false }"></ng-container>
        </div>
        
        <!-- Reusable Nav Item Template -->
        <ng-template #navItem let-id="id" let-icon="icon" let-label="label" let-disabled="disabled">
            <button 
              (click)="activeTab.set(id)"
              [disabled]="disabled"
              [class.bg-[var(--primary-color)]]="activeTab() === id"
              [class.text-white]="activeTab() === id"
              [class.shadow-md]="activeTab() === id"
              [class.text-slate-500]="activeTab() !== id"
              [class.dark:text-slate-400]="activeTab() !== id"
              class="w-full flex items-center h-12 rounded-[14px] transition-all duration-200 relative hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">
              
              <!-- Icon Container (Fixed Width) -->
              <div class="w-[48px] h-full flex items-center justify-center flex-shrink-0">
                 <span class="material-symbols-rounded text-[22px]"
                       [class.text-white]="activeTab() === id">{{ icon }}</span>
              </div>
              
              <!-- Label Container (Expands with hover) -->
              <div class="flex-1 whitespace-nowrap overflow-hidden text-left font-bold text-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                {{ label }}
              </div>
            </button>
        </ng-template>

      </nav>

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col h-full overflow-hidden relative">
        
        <!-- Header -->
        <header class="px-6 pt-6 pb-6 flex-shrink-0 flex justify-between items-center bg-transparent z-10">
          <div>
            <h1 class="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Admin Dashboard</h1>
            <p class="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">Manage your enterprise</p>
          </div>
          
          @if (allStores().length > 0) {
            <div class="flex items-center bg-white dark:bg-slate-800 p-1 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-200 dark:border-slate-700">
              <div class="px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700">Context</div>
              <div class="relative cursor-pointer">
                <select 
                  [value]="storeService.currentStore()?.id" 
                  (change)="switchStore($event)"
                  class="bg-transparent border-none rounded-lg pl-4 pr-8 py-2 text-xs font-black text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[var(--primary-color)]/30 outline-none transition-all appearance-none cursor-pointer">
                  @for (store of allStores(); track store.id) {
                    <option [value]="store.id">{{ store.name }} ({{ store.type }})</option>
                  }
                </select>
                <span class="material-symbols-rounded absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none">expand_content</span>
              </div>
            </div>
          }
        </header>

        <!-- Dynamic Feature Component Loading -->
        <main class="flex-1 overflow-auto px-6 pb-6 w-full">
          @switch (activeTab()) {
            @case ('stores') { <app-store-manager /> }
            @case ('analytics') { <app-analytics-dashboard /> }
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
        </main>
      </div>
    </div>
  `
})
export class AdminDashboardComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);

  activeTab = signal<'stores' | 'analytics' | 'config' | 'categories' | 'inventory' | 'stock' | 'customers' | 'purchase-orders' | 'history' | 'auditing' | 'schema' | 'suppliers'>('analytics');

  allStores: Signal<Store[]> = toSignal(this.supabase.getAllStores(), { initialValue: [] as Store[] });

  switchStore(event: Event) {
    const storeId = (event.target as HTMLSelectElement).value;
    if (storeId) {
      this.storeService.loadStore(storeId);
    }
  }
}
