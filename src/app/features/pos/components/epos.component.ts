import { Component, inject, computed, signal, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { StoreConfigService } from '../../../core/services/store-config.service';
import { MockSupabaseService, Store, Category, Product, Customer, PaymentMethod } from '../../../core/services/mock-supabase.service';
import { DialogService } from '../../../core/services/dialog.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, tap, debounceTime, firstValueFrom, from } from 'rxjs';
import { POSSharedStateService } from '../../../core/services/pos-shared-state.service';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../../core/services/sync.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { OfflineStorageService } from '../../../core/services/offline-storage.service';

@Component({
  selector: 'app-epos',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <!--Dynamic Iframe Printing handles the receipt isolation-->
    <style>
      /* Hide scrollbar for smart pills */
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      /* Animated Stripes for Split Payment Card Section (Light Mode Friendly) */
      .bg-stripes-light {
        background-image: repeating-linear-gradient(
          45deg,
          rgba(0, 0, 0, 0.03),
          rgba(0, 0, 0, 0.03) 10px,
          transparent 10px,
          transparent 20px
        );
      }
      .dark .bg-stripes-light {
        background-image: repeating-linear-gradient(
          45deg,
          rgba(255, 255, 255, 0.05),
          rgba(255, 255, 255, 0.05) 10px,
          transparent 10px,
          transparent 20px
        );
      }
    </style>

    @if (allStores().length > 0) {
      <div class="h-[calc(100vh-60px)] flex flex-col md:flex-row overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-300">
        
        <!--LEFT: Main Interface-->
        <div class="flex-1 flex flex-col h-full overflow-hidden relative z-0">
          
          <!--PHASE 5: Offline Notice Banner-->
          @if (isOffline()) {
            <div class="bg-red-600 text-white px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center justify-between animate-pulse">
              <div class="flex items-center gap-2">
                <span class="material-symbols-rounded text-sm">cloud_off</span>
                OFFLINE MODE ACTIVE • Sales will sync when reconnected
              </div>
              <div class="flex items-center gap-4">
                <span>{{ pendingSyncCount() }} Pending Orders</span>
                <button (click)="syncOfflineTransactions()" class="px-2 py-0.5 bg-white text-red-600 rounded text-[9px] font-bold">SYNC NOW</button>
              </div>
            </div>
          }

          <!-- Phase 3: Global Stock Lookup (Floating Button) -->
          <button (click)="openGlobalStockModal()" class="fixed bottom-24 left-6 z-50 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group overflow-hidden">
            <span class="material-symbols-rounded text-2xl group-hover:hidden">inventory</span>
            <span class="hidden group-hover:block text-[9px] font-black uppercase text-center leading-tight">Check Whse</span>
          </button>

          <!--Header-->
          <header class="bg-[var(--primary-color)] text-white p-4 shadow-md z-10 flex flex-col md:flex-row gap-4 justify-between items-center transition-colors duration-300">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div>
                <h1 class="font-bold text-xl leading-none">{{ storeService.currentStore()?.name || 'Loading...' }}</h1>
                <p class="text-[10px] opacity-80 uppercase tracking-widest font-medium">{{ storeService.storeType() }} POS</p>
              </div>
              
              <div class="relative group">
                <select 
                  [value]="storeService.currentStore()?.id"
                  (change)="switchStore($event)"
                  class="bg-white/10 hover:bg-white/20 text-white pl-3 pr-8 py-1.5 rounded-lg text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer transition-colors border border-white/10">
                  @for (store of allStores(); track store.id) {
                    <option [value]="store.id" class="text-black">{{ store.name }}</option>
                  }
                </select>
                <span class="material-symbols-rounded pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-white text-lg">expand_more</span>
              </div>
            </div>

            <!--SEARCH / SCAN BAR-->
            <div class="relative flex-1 max-w-lg w-full flex gap-2">
              <div class="relative flex-1">
                <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10">qr_code_scanner</span>
                <input 
                  type="text"
                  [(ngModel)]="searchQuery"
                  (keyup.enter)="onSearchEnter()"
                  placeholder="Scan Barcode or Search Product..."
                  class="w-full bg-white text-black pl-10 pr-4 py-2 rounded-full shadow-inner focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] text-sm font-medium"
                  autofocus>
                @if (searchQuery()) {
                  <button (click)="searchQuery.set('')" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10">
                    <span class="material-symbols-rounded text-sm">close</span>
                  </button>
                }
              </div>
              
              <button (click)="openOrderHistory()" class="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center gap-2 font-medium transition-colors border border-white/10 shadow-sm" title="Lookup Past Orders">
                <span class="material-symbols-rounded">history</span>
                <span class="hidden sm:inline">Orders</span>
              </button>
            </div>

            <div class="hidden md:block text-sm bg-black/20 px-3 py-1.5 rounded-lg backdrop-blur-sm font-mono tracking-wide">
              {{ currentTime() | date: 'mediumTime' }}
            </div>
          </header>

          <!--Navigation / Breadcrumbs & Quick Items-->
          <div class="px-6 py-3 bg-[var(--card-bg)] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-0">
            <div class="flex items-center gap-2">
              <button 
                (click)="goHome()"
                [class.opacity-50]="!selectedCategory() && !searchQuery()"
                [disabled]="!selectedCategory() && !searchQuery()"
                class="flex items-center gap-1 text-sm font-bold hover:text-[var(--primary-color)] transition-colors disabled:cursor-default">
                <span class="material-symbols-rounded text-lg">home</span>
                Home
              </button>
              
              @if (selectedCategory() || searchQuery()) {
                <span class="material-symbols-rounded text-slate-400 text-sm">chevron_right</span>
              }
              
              @if (searchQuery()) {
                <span class="text-sm font-bold text-[var(--primary-color)] truncate max-w-[150px]">
                  Results: "{{ searchQuery() }}"
                </span>
              } @else if (selectedCategory()) {
                <span class="text-sm font-bold text-[var(--primary-color)] truncate max-w-[150px]">
                  {{ selectedCategoryName() }}
                </span>
              }
            </div>

            <div class="hidden lg:flex items-center gap-2 overflow-x-auto no-scrollbar max-w-md">
              <span class="text-[9px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Fast Track:</span>
              @for (item of topItems(); track item.id) {
                <button 
                  (click)="addToCart(item, $event)"
                  class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-[11px] font-bold whitespace-nowrap hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-all active:scale-95 shadow-sm">
                  {{ item.name | slice:0:15 }}{{ item.name.length > 15 ? '...' : '' }}
                </button>
              }
            </div>
            
            <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
               <button 
                  (click)="viewMode.set('GRID')"
                  [class.bg-white]="viewMode() === 'GRID'"
                  [class.dark:bg-slate-700]="viewMode() === 'GRID'"
                  [class.shadow-sm]="viewMode() === 'GRID'"
                  [class.text-[var(--primary-color)]]="viewMode() === 'GRID'"
                  class="p-1.5 rounded-lg flex items-center justify-center transition-all text-slate-500">
                  <span class="material-symbols-rounded text-sm">grid_view</span>
               </button>
               <button 
                  (click)="viewMode.set('LIST')"
                  [class.bg-white]="viewMode() === 'LIST'"
                  [class.dark:bg-slate-700]="viewMode() === 'LIST'"
                  [class.shadow-sm]="viewMode() === 'LIST'"
                  [class.text-[var(--primary-color)]]="viewMode() === 'LIST'"
                  class="p-1.5 rounded-lg flex items-center justify-center transition-all text-slate-500">
                  <span class="material-symbols-rounded text-sm">view_list</span>
               </button>
            </div>
          </div>

          <!--Main Content Grid-->
          <div class="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-black/20">
            @if (cart().length === 0 && !searchQuery() && !selectedCategory() && !isBrowsing()) {
              <div class="flex flex-col items-center justify-center h-full text-center p-10 opacity-60 animate-in fade-in duration-500">
                <div class="w-24 h-24 bg-[var(--card-bg)] border border-slate-200 dark:border-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                  <span class="material-symbols-rounded text-5xl text-slate-400">qr_code_scanner</span>
                </div>
                <h2 class="text-2xl font-bold mb-2">Ready for Next Sale</h2>
                <p class="max-w-xs text-sm mb-8">Use the search bar above to find a product, or start scanning items.</p>
                <button (click)="isBrowsing.set(true)" class="px-6 py-3 bg-[var(--card-bg)] border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm active:scale-95">
                  <span class="material-symbols-rounded">grid_view</span>
                  Or, Browse Departments
                </button>
              </div>
            } @else {
              @if (!searchQuery() && !selectedCategory()) {
                <div class="space-y-6">
                  <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider opacity-60 mb-3 px-1">Departments</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      @for (cat of categories(); track cat.id) {
                        <button 
                          (click)="selectedCategory.set(cat.id)"
                          class="aspect-[4/3] relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 group border border-slate-200 dark:border-slate-700 active:scale-95 bg-[var(--card-bg)]">
                          <div class="absolute top-0 left-0 w-full h-1.5" [style.backgroundColor]="cat.color"></div>
                          <div class="p-5 h-full flex flex-col justify-between z-10 relative">
                            <h3 class="font-bold text-lg leading-tight group-hover:text-[var(--primary-color)] transition-colors">{{ cat.name }}</h3>
                            <div class="flex justify-between items-end">
                              <span class="text-xs font-medium bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md text-slate-600 dark:text-slate-300">
                                {{ categoryCounts()[cat.id] || 0 }} Items
                              </span>
                              <span class="material-symbols-rounded text-slate-300 group-hover:text-[var(--primary-color)] transition-colors transform group-hover:translate-x-1">arrow_forward</span>
                            </div>
                          </div>
                        </button>
                      }
                    </div>
                  </div>
                </div>
              } @else {
                  @if (viewMode() === 'GRID') {
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start animate-in fade-in slide-in-from-bottom-4 duration-300">
                      @for (product of filteredProducts(); track product.id) {
                        <div 
                          (click)="addToCart(product, $event)"
                          [class.opacity-40]="product.stock_shop <= 0"
                          class="bg-[var(--card-bg)] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between h-44 relative group select-none overflow-hidden">
                          
                          @if (product.stock_shop > 0) {
                            <div class="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--primary-color)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                              <span class="material-symbols-rounded text-lg">add</span>
                            </div>
                          }

                          <div class="flex-1">
                            <h3 class="font-bold text-sm line-clamp-2 leading-tight mb-2">{{ product.name }}</h3>
                            <div class="flex flex-wrap gap-1 mt-1">
                              @if (product.barcode) {
                                <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-mono">
                                  {{ product.barcode }}
                                </span>
                              }
                              @if (product.stock_shop <= 0) {
                                <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">FINISHED</span>
                              }
                            </div>
                          </div>

                          <div class="flex justify-between items-end mt-2 pt-3 border-t border-slate-50 dark:border-slate-800">
                            <span class="font-extrabold text-lg text-[var(--primary-color)]">
                              {{ product.price | currency: storeService.currentStore()?.config?.currency }}
                            </span>
                            <div class="text-right">
                              <span class="text-xs font-bold" [class.text-red-500]="product.stock_shop < 3">
                                {{ product.stock_shop }} Floor
                              </span>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                    <th class="p-4">SKU / Barcode</th>
                                    <th class="p-4">Product Name</th>
                                    <th class="p-4">Brand/Cat</th>
                                    <th class="p-4 text-center">Floor Stock</th>
                                    <th class="p-4 text-center">Whse Stock</th>
                                    <th class="p-4 text-right">Price</th>
                                    <th class="p-4"></th>
                                </tr>
                            </thead>
                            <tbody class="text-sm">
                                @for (product of filteredProducts(); track product.id) {
                                    <tr 
                                      (click)="addToCart(product, $event)"
                                      [class.opacity-50]="product.stock_shop <= 0"
                                      class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                                        <td class="p-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                            {{ product.sku || product.barcode || 'N/A' }}
                                        </td>
                                        <td class="p-4 font-bold">{{ product.name }}</td>
                                        <td class="p-4 text-slate-500">
                                            <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-bold">
                                                {{ product.category_id ? categoryCounts()[product.category_id] ? 'Categorized' : 'Misc' : 'Uncategorized' }}
                                            </span>
                                        </td>
                                        <td class="p-4 text-center font-bold" [class.text-red-500]="product.stock_shop < 3">
                                            {{ product.stock_shop }}
                                        </td>
                                        <td class="p-4 text-center text-slate-400">
                                            {{ product.stock_warehouse }}
                                        </td>
                                        <td class="p-4 text-right font-extrabold text-[var(--primary-color)]">
                                            {{ product.price | currency: storeService.currentStore()?.config?.currency }}
                                        </td>
                                        <td class="p-4 text-right">
                                            <button 
                                                [disabled]="product.stock_shop <= 0"
                                                class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-[var(--primary-color)] group-hover:text-white transition-all flex items-center justify-center disabled:opacity-0">
                                                <span class="material-symbols-rounded text-sm">add</span>
                                            </button>
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                  }
              }
            }
          </div>
        </div>

        <!--RIGHT: Cart / Sidebar-->
        <div class="w-full md:w-96 bg-[var(--card-bg)] shadow-2xl flex flex-col z-20 md:border-l border-slate-200 dark:border-slate-800 relative">
          <div class="shrink-0">
            <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20">
              <button (click)="showCustomerInsights.set(false)" class="flex-1 px-4 py-3 text-xs font-black uppercase tracking-widest transition-all relative" [class.text-[var(--primary-color)]]="!showCustomerInsights()">
                Cart
                @if (!showCustomerInsights()) { <div class="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary-color)]"></div> }
              </button>
              <button (click)="showCustomerInsights.set(true)" class="flex-1 px-4 py-3 text-xs font-black uppercase tracking-widest transition-all relative" [class.text-[var(--primary-color)]]="showCustomerInsights()">
                Insights
                @if (showCustomerInsights()) { <div class="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary-color)]"></div> }
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto relative">
            @if (!showCustomerInsights()) {
              <div class="p-4 space-y-4">
                @if (cart().length === 0) {
                  <div class="flex flex-col items-center justify-center py-20 text-center opacity-30">
                    <span class="material-symbols-rounded text-5xl mb-4">shopping_basket</span>
                    <p class="text-xs font-black uppercase tracking-widest">Cart is Empty</p>
                  </div>
                }

                @for (item of cart(); track item.product.id) {
                  <div class="group relative bg-white dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm transition-all duration-300">
                    <div class="flex gap-4">
                      <div class="flex flex-col items-center justify-center bg-slate-50 dark:bg-black/20 rounded-xl px-2 py-1 gap-1">
                        <button (click)="updateQuantity(item, 1)" class="p-1 hover:text-[var(--primary-color)] transition-colors">
                          <span class="material-symbols-rounded text-lg">add</span>
                        </button>
                        <span class="text-sm font-bold my-1">{{ item.quantity }}</span>
                        <button (click)="updateQuantity(item, -1)" class="p-1 hover:text-red-500 transition-colors">
                          <span class="material-symbols-rounded text-lg">{{ item.quantity === 1 ? 'delete' : 'remove' }}</span>
                        </button>
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-1">
                          <span class="font-semibold text-sm leading-tight pr-2">{{ item.product.name }}</span>
                          <span class="font-black text-sm text-[var(--primary-color)]">
                            {{ (item.product.price * item.quantity) | currency: storeService.currentStore()?.config?.currency }}
                          </span>
                        </div>
                        <div class="text-xs text-slate-400 mt-1">
                          {{ item.product.price | currency: storeService.currentStore()?.config?.currency }} / unit
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="p-6 space-y-6">
                <!-- Phase 4/6: Customer Search & Loyalty -->
                <div class="bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl p-6 border-2 border-dashed border-indigo-200 dark:border-indigo-900/30">
                  <h4 class="text-xs font-black uppercase tracking-widest text-indigo-400 mb-4">Identify Customer</h4>
                  <div class="relative mb-4">
                    <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300">person_search</span>
                    <input 
                      type="text" 
                      [value]="customerSearchQuery()"
                      (input)="updateCustomerSearch($event)"
                      (focus)="showCustomerDropdown.set(true)"
                      placeholder="Search Customer..." 
                      class="w-full bg-white dark:bg-slate-800 pl-10 pr-4 py-2 rounded-xl text-sm border-none ring-1 ring-indigo-100 dark:ring-indigo-900 focus:ring-2 focus:ring-indigo-500">
                    
                    @if (showCustomerDropdown() && filteredCustomers().length > 0) {
                      <div class="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-indigo-100 max-h-60 overflow-y-auto">
                        @for (customer of filteredCustomers(); track customer.id) {
                          <button 
                            (click)="selectCustomer(customer)"
                            class="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors border-b border-indigo-50 last:border-0 flex items-center justify-between">
                            <div>
                                <div class="font-bold text-sm">{{ customer.full_name }}</div>
                                <div class="text-[10px] text-slate-500">{{ customer.phone || 'No phone' }}</div>
                            </div>
                            @if (customer.is_vip) {
                                <span class="text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded">VIP</span>
                            }
                          </button>
                        }
                      </div>
                    }
                  </div>
                  
                  @if (sharedState.selectedCustomer()) {
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-indigo-100 flex items-center justify-between">
                      <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold">
                            {{ sharedState.selectedCustomer()?.full_name?.charAt(0) }}
                          </div>
                          <div>
                            <div class="text-sm font-bold">{{ sharedState.selectedCustomer()?.full_name }}</div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-widest">
                              Lifetime: {{ (sharedState.selectedCustomer()?.lifetime_spend || 0) | currency: storeService.currentStore()?.config?.currency }}
                            </div>
                          </div>
                      </div>
                      <button (click)="clearCustomer()" class="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors">
                          <span class="material-symbols-rounded text-lg">close</span>
                      </button>
                    </div>
                  }

                  <!-- ✅ FIXED: Promo Code inside the customer card -->
                  <div class="mt-4 pt-4 border-t border-dashed border-indigo-200 dark:border-indigo-900/30">
                    <p class="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Promo Code</p>
                    <div class="flex gap-2">
                       <input 
                         type="text" 
                         [value]="promoCodeInput()"
                         (input)="updatePromoInput($event)"
                         placeholder="Enter code e.g. WIN1234" 
                         [disabled]="!!sharedState.appliedPromotion()"
                         class="w-full uppercase bg-white dark:bg-slate-800 px-4 py-2 rounded-xl text-sm border-none ring-1 ring-indigo-100 dark:ring-indigo-900 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-bold tracking-widest text-slate-700 dark:text-slate-200">
                       
                       @if (!sharedState.appliedPromotion()) {
                         <button 
                           (click)="applyPromoCode()"
                           [disabled]="!promoCodeInput() || validatingPromo()"
                           class="px-4 bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center min-w-[80px]">
                           @if(validatingPromo()) {
                              <span class="material-symbols-rounded animate-spin text-[16px]">hourglass_empty</span>
                           } @else {
                              Apply
                           }
                         </button>
                       } @else {
                         <button 
                           (click)="clearPromo()"
                           class="px-4 bg-red-100 text-red-600 rounded-xl text-sm font-bold hover:bg-red-200 transition-colors flex items-center justify-center">
                           Clear
                         </button>
                       }
                    </div>
                  </div>
                </div>

                <!-- Phase 6: Fulfillment Commander -->
                <div class="bg-slate-50 dark:bg-black/20 rounded-2xl p-5 space-y-4">
                  <h4 class="text-xs font-black uppercase tracking-widest text-slate-400">Fulfillment Mode</h4>
                  <div class="grid grid-cols-3 gap-2">
                    <button 
                      (click)="setFulfillment('PICKUP')"
                      [class.bg-indigo-600]="sharedState.fulfillmentMode() === 'PICKUP'"
                      [class.text-white]="sharedState.fulfillmentMode() === 'PICKUP'"
                      class="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] font-bold transition-all">
                      <span class="material-symbols-rounded">store</span> PICKUP
                    </button>
                    <button 
                      (click)="setFulfillment('DELIVERY')"
                      [class.bg-indigo-600]="sharedState.fulfillmentMode() === 'DELIVERY'"
                      [class.text-white]="sharedState.fulfillmentMode() === 'DELIVERY'"
                      class="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] font-bold transition-all">
                      <span class="material-symbols-rounded">local_shipping</span> DELIVERY
                    </button>
                    <button 
                      (click)="setFulfillment('COURIER')"
                      [class.bg-indigo-600]="sharedState.fulfillmentMode() === 'COURIER'"
                      [class.text-white]="sharedState.fulfillmentMode() === 'COURIER'"
                      class="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] font-bold transition-all">
                      <span class="material-symbols-rounded">rocket_launch</span> COURIER
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>

          <div class="shrink-0 p-6 bg-slate-50 dark:bg-black/20 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center border border-slate-100 dark:border-slate-800">
                <span class="text-lg font-bold">{{ subtotal() | currency: storeService.currentStore()?.config?.currency }}</span>
              </div>
              
              @if (storeService.currentStore()?.config?.tax_enabled) {
                <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-right duration-300">
                  <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Tax</span>
                  <span class="text-lg font-bold">{{ tax() | currency: storeService.currentStore()?.config?.currency }}</span>
                </div>
              }

              @if (sharedState.loyaltyDiscount() > 0 && !sharedState.appliedPromotion()) {
                <div class="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl flex flex-col items-center justify-center border border-emerald-100 dark:border-emerald-900/30 animate-pulse">
                  <span class="text-[10px] font-black uppercase tracking-widest text-emerald-600">VIP Reward</span>
                  <span class="text-lg font-bold text-emerald-600">-{{ sharedState.loyaltyDiscount() | currency: storeService.currentStore()?.config?.currency }}</span>
                </div>
              }

              @if (sharedState.appliedPromotion()) {
                <div class="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-2xl flex flex-col items-center justify-center border border-orange-100 dark:border-orange-900/30 animate-pulse">
                  <span class="text-[10px] font-black uppercase tracking-widest text-orange-600">Promo: {{ sharedState.appliedPromotion()?.code }}</span>
                  <span class="text-lg font-bold text-orange-600">-{{ sharedState.loyaltyDiscount() | currency: storeService.currentStore()?.config?.currency }}</span>
                </div>
              }

              @if (sharedState.shippingFee() > 0) {
                <div class="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-2xl flex flex-col items-center justify-center border border-purple-100 dark:border-purple-900/30">
                  <span class="text-[10px] font-black uppercase tracking-widest text-purple-600">Shipping</span>
                  <span class="text-lg font-bold text-purple-600">+{{ sharedState.shippingFee() | currency: storeService.currentStore()?.config?.currency }}</span>
                </div>
              }
            </div>

            <div class="bg-slate-900 p-6 rounded-3xl text-white shadow-xl flex justify-between items-end">
              <div>
                <div class="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-1">Total Payable</div>
                <div class="text-3xl font-black tabular-nums tracking-tighter">
                  {{ total() | currency: storeService.currentStore()?.config?.currency }}
                </div>
              </div>
            </div>

            <button 
              (click)="openCheckoutModal()"
              [disabled]="cart().length === 0"
              class="w-full py-4 rounded-2xl bg-[var(--primary-color)] text-white font-black uppercase tracking-widest text-sm shadow-lg hover:shadow-[var(--primary-color)]/30 hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-40">
              Process Transaction
            </button>
          </div>
        </div>
      </div>
    } @else {
      <div class="h-screen w-full flex flex-col items-center justify-center p-8 bg-[var(--bg-color)]">
        <div class="w-32 h-32 bg-[var(--primary-color)] rounded-3xl flex items-center justify-center mb-6 shadow-xl relative animate-bounce-slow">
           <span class="material-symbols-rounded text-6xl text-white">storefront</span>
        </div>
        <h1 class="text-3xl font-black mb-2">Welcome to OmniPOS</h1>
        <p class="text-slate-500 mb-8 max-w-sm text-center">Set up your store in the Admin Dashboard to begin.</p>
        <a routerLink="/admin" class="px-8 py-4 bg-[var(--primary-color)] text-white font-black rounded-2xl shadow-lg flex items-center gap-3">
          <span class="material-symbols-rounded">settings</span> Admin Setup
        </a>
      </div>
    }

    <!--Modals-->
    @if (showCheckoutModal()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <div class="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col md:flex-row max-h-[90vh]">
          
          <!-- LEFT SIDE: Payment Summary & Options -->
          <div class="flex-1 p-8 bg-slate-50 dark:bg-black/20 flex flex-col items-stretch overflow-y-auto">
              <h3 class="text-2xl font-black mb-6 flex items-center gap-3">
                  <span class="material-symbols-rounded bg-indigo-100 text-indigo-600 p-2 rounded-xl text-3xl">point_of_sale</span>
                  Complete Sale
              </h3>
              
              <!-- Professional Split Status Bar -->
              <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 mb-6 relative overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="relative z-10 flex justify-between items-end mb-4">
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Total Due</p>
                    <div class="text-4xl font-black">{{ total() | currency: storeService.currentStore()?.config?.currency }}</div>
                  </div>
                  <div class="text-right">
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Balance Remaining</p>
                    <div class="text-3xl font-black" [class.text-emerald-500]="paymentBalance() === 0" [class.text-amber-500]="paymentBalance() > 0 && paymentBalance() < total()">
                      {{ paymentBalance() | currency: storeService.currentStore()?.config?.currency }}
                    </div>
                  </div>
                </div>

                <!-- Visual Progress Bar -->
                <div class="h-4 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden flex shadow-inner">
                  <div [style.width.%]="(paymentAllocations().cash / total()) * 100" class="bg-emerald-400 transition-all duration-300"></div>
                  <div [style.width.%]="(paymentAllocations().card / total()) * 100" class="bg-indigo-500 transition-all duration-300"></div>
                </div>

                <!-- Allocation Summary Text -->
                <div class="flex justify-between mt-3 text-xs font-bold text-slate-500">
                    <div class="flex items-center gap-1">
                        <div class="w-2 h-2 rounded-full bg-emerald-400"></div>
                        Cash: {{ paymentAllocations().cash | currency: storeService.currentStore()?.config?.currency }}
                    </div>
                    <div class="flex items-center gap-1">
                        <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
                        Card: {{ paymentAllocations().card | currency: storeService.currentStore()?.config?.currency }}
                    </div>
                </div>
              </div>

              <!-- Payment Method Tabs -->
              <div class="grid grid-cols-3 gap-3 mb-6">
                <button 
                  (click)="activePaymentMethod.set('cash')"
                  class="p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest"
                  [class.border-emerald-500]="activePaymentMethod() === 'cash'"
                  [class.text-emerald-600]="activePaymentMethod() === 'cash'"
                  [class.bg-emerald-50]="activePaymentMethod() === 'cash'"
                  [class.border-slate-200]="activePaymentMethod() !== 'cash'"
                  [class.text-slate-400]="activePaymentMethod() !== 'cash'">
                  <span class="material-symbols-rounded text-2xl">payments</span>
                  Cash
                </button>
                <button 
                  (click)="activePaymentMethod.set('card')"
                  class="p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest"
                  [class.border-indigo-500]="activePaymentMethod() === 'card'"
                  [class.text-indigo-600]="activePaymentMethod() === 'card'"
                  [class.bg-indigo-50]="activePaymentMethod() === 'card'"
                  [class.border-slate-200]="activePaymentMethod() !== 'card'"
                  [class.text-slate-400]="activePaymentMethod() !== 'card'">
                  <span class="material-symbols-rounded text-2xl">credit_card</span>
                  Card
                </button>
                <button 
                  (click)="activePaymentMethod.set('split')"
                  class="p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest"
                  [class.border-cyan-500]="activePaymentMethod() === 'split'"
                  [class.text-cyan-600]="activePaymentMethod() === 'split'"
                  [class.bg-cyan-50]="activePaymentMethod() === 'split'"
                  [class.border-slate-200]="activePaymentMethod() !== 'split'"
                  [class.text-slate-400]="activePaymentMethod() !== 'split'">
                  <span class="material-symbols-rounded text-2xl">receipt_long</span>
                  Split
                </button>
              </div>

              <!-- Quick Cash Buttons (Only show when Cash is selected) -->
              @if (activePaymentMethod() === 'cash') {
                  <div class="mb-4">
                      <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Quick Cash</h4>
                      <div class="grid grid-cols-4 gap-2">
                          <button (click)="setExactCash()" class="py-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold hover:bg-emerald-200 transition-colors shadow-sm">Exact</button>
                          @for (amt of quickCashAmounts(); track amt) {
                              <button (click)="setQuickCash(amt)" class="py-3 bg-white border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-slate-700">
                                  {{ amt | currency: storeService.currentStore()?.config?.currency:'symbol':'1.0-0' }}
                              </button>
                          }
                      </div>
                  </div>
              }

              <!-- Action Buttons -->
              <div class="mt-auto pt-6 flex gap-3">
                  <button (click)="closeCheckoutModal()" class="flex-1 py-4 rounded-2xl bg-white border-2 border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-colors shadow-sm">
                      Cancel
                  </button>
                  <button 
                    (click)="completeSale()"
                    [disabled]="isCompletingSale() || paymentBalance() !== 0"
                    class="flex-[2] py-4 rounded-2xl bg-[var(--primary-color)] text-white font-black uppercase tracking-widest shadow-lg shadow-[var(--primary-color)]/30 hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2">
                    @if (isCompletingSale()) {
                        <span class="material-symbols-rounded animate-spin">sync</span> Processing...
                    } @else {
                        <span class="material-symbols-rounded">check_circle</span> Confirm & Print
                    }
                  </button>
              </div>
          </div>

          <!-- RIGHT SIDE: Payment Pad -->
          <div class="w-full md:w-96 p-8 flex flex-col bg-white dark:bg-slate-800">
              <div class="mb-6 flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      @if(activePaymentMethod() === 'split') {
                          Cash Amount (Rest auto-Card)
                      } @else {
                          Amount to {{ activePaymentMethod() | uppercase }}
                      }
                  </span>
                  <div class="text-3xl font-black tabular-nums transition-colors" [class.text-emerald-500]="activePaymentMethod()==='cash' || activePaymentMethod()==='split'" [class.text-indigo-500]="activePaymentMethod()==='card'">
                      {{ paymentInputString() ? paymentInputString() : '0.00' }}
                  </div>
              </div>

              <!-- Numpad Grid -->
              <div class="grid grid-cols-3 gap-3 flex-1">
                  @for (num of [1, 2, 3, 4, 5, 6, 7, 8, 9]; track num) {
                      <button (click)="onNumpadClick(num.toString())" class="bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-black rounded-2xl text-2xl font-bold shadow-sm active:scale-95 transition-all text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800 flex items-center justify-center">
                          {{ num }}
                      </button>
                  }
                  <button (click)="onNumpadClick('00')" class="bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-black rounded-2xl text-xl font-bold shadow-sm active:scale-95 transition-all text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800 flex items-center justify-center">
                      00
                  </button>
                  <button (click)="onNumpadClick('0')" class="bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-black rounded-2xl text-2xl font-bold shadow-sm active:scale-95 transition-all text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800 flex items-center justify-center">
                      0
                  </button>
                  <button (click)="onNumpadClick('BACKSPACE')" class="bg-red-50 hover:bg-red-100 text-red-500 rounded-2xl text-2xl font-bold shadow-sm active:scale-95 transition-all border border-red-100 flex items-center justify-center">
                      <span class="material-symbols-rounded text-3xl">backspace</span>
                  </button>
                  
                  <button (click)="clearPaymentMethod()" class="col-span-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl py-4 font-bold shadow-sm active:scale-95 transition-all text-xs uppercase tracking-widest mt-2 border border-slate-300">
                      Clear
                  </button>
                  <button (click)="applyPaymentPad()" class="col-span-2 bg-slate-800 hover:bg-black text-white rounded-2xl py-4 font-black shadow-lg shadow-slate-400/20 active:scale-95 transition-all text-lg uppercase tracking-widest mt-2 border border-slate-700">
                      Apply
                  </button>
              </div>
          </div>
        </div>
      </div>
    }
  `
})
export class EposComponent {
  storeService = inject(StoreConfigService);
  mockSupabase = inject(MockSupabaseService);
  dialogService = inject(DialogService);
  sharedState = inject(POSSharedStateService);
  syncService = inject(SyncService);
  connectivity = inject(ConnectivityService);
  offlineStorage = inject(OfflineStorageService);

  // State Signals
  viewMode = signal<'GRID' | 'LIST'>('GRID');
  searchQuery = signal('');
  selectedCategory = signal<string | null>(null);
  isBrowsing = signal(false);
  showCustomerInsights = signal(false);
  showCheckoutModal = signal(false);
  isCompletingSale = signal(false);
  isOffline = signal(false);
  pendingSyncCount = signal(0);
  currentTime = signal(new Date());

  // Data Signals
  allStores = toSignal(this.mockSupabase.getAllStores(), { initialValue: [] as Store[] });

  storeId = computed(() => this.storeService.currentStore()?.id);

  categories = toSignal(
    toObservable(this.storeId).pipe(
      switchMap(id => {
        if (!id) return of([]);
        if (this.connectivity.isOnline()) {
          // Online: fetch live from Supabase
          return this.mockSupabase.getCategories(id);
        } else {
          // Offline: read from local IndexedDB cache
          return from(this.offlineStorage.getAll<Category>('categories'));
        }
      })
    ),
    { initialValue: [] as Category[] }
  );

  products = toSignal(
    toObservable(this.storeId).pipe(
      switchMap(id => {
        if (!id) return of([]);
        if (this.connectivity.isOnline()) {
          // Online: fetch live from Supabase
          return this.mockSupabase.getProducts(id);
        } else {
          // Offline: read from local IndexedDB cache filtered by store
          return from(
            this.offlineStorage.getAll<Product>('products').then(
              all => all.filter(p => p.store_id === id)
            )
          );
        }
      })
    ),
    { initialValue: [] as Product[] }
  );

  // Static list for payment methods as service doesn't have a getter yet
  paymentMethods = signal<{ id: string, name: string }[]>([
    { id: 'cash', name: 'CASH' },
    { id: 'card', name: 'CARD' }
  ]);

  cart = this.sharedState.cart;
  selectedPaymentMethods = signal<{ id: string, name: string }[]>([]);

  // Payment Pad & Quick Cash Signals
  activePaymentMethod = signal<'cash' | 'card' | 'split'>('cash');
  paymentInputString = signal('');

  quickCashAmounts = computed(() => {
    let t = this.total();
    if (t <= 0) return [10, 20, 50];

    // Generate smart suggestions based on total
    if (t <= 10) return [10, 20, 50];
    if (t <= 20) return [20, 50, 100];
    if (t <= 50) return [50, 100, 200];

    // Round up to nearest 10, 50, 100 for larger amounts
    const ceil10 = Math.ceil(t / 10) * 10;
    const ceil50 = Math.ceil(t / 50) * 50;
    const ceil100 = Math.ceil(t / 100) * 100;
    return [...new Set([ceil10, ceil50, ceil100])].filter(v => v >= t).slice(0, 3);
  });

  // Computed Properties
  filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const catId = this.selectedCategory();
    const allProds = this.products();

    return allProds.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q);
      const matchesCategory = !catId || p.category_id === catId;
      return matchesSearch && matchesCategory;
    });
  });

  categoryCounts = computed(() => {
    const counts: Record<string, number> = {};
    const allProds = this.products();
    allProds.forEach(p => {
      if (p.category_id) {
        counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      }
    });
    return counts;
  });

  selectedCategoryName = computed(() => {
    const catId = this.selectedCategory();
    return this.categories().find(c => c.id === catId)?.name || '';
  });

  topItems = computed(() => {
    // Just a slice for "Fast Track" placeholder
    return this.products().slice(0, 8);
  });

  subtotal = this.sharedState.subtotal;
  tax = this.sharedState.taxAmount;
  total = this.sharedState.total;

  paymentAllocations = signal({ cash: 0, card: 0 });
  paymentBalance = computed(() => {
    const totalDue = this.total();
    const allocated = this.paymentAllocations().cash + this.paymentAllocations().card;
    return Math.max(0, totalDue - allocated);
  });

  // Customer Management
  customerSearchQuery = signal('');
  showCustomerDropdown = signal(false);

  // Debounced search via Supabase
  filteredCustomers = toSignal(
    toObservable(this.customerSearchQuery).pipe(
      debounceTime(300),
      switchMap((query: string) => {
        const id = this.storeId();
        if (!id || query.length < 2) return of([]);
        return this.mockSupabase.searchCustomers(id, query);
      })
    ),
    { initialValue: [] as Customer[] }
  );

  updateCustomerSearch(event: Event) {
    const q = (event.target as HTMLInputElement).value;
    this.customerSearchQuery.set(q);
    this.showCustomerDropdown.set(true);
  }

  // Promotions
  promoCodeInput = signal('');
  validatingPromo = signal(false);

  updatePromoInput(event: Event) {
    this.promoCodeInput.set((event.target as HTMLInputElement).value);
  }

  applyPromoCode() {
    const code = this.promoCodeInput().trim().toUpperCase();
    if (!code || !this.storeId()) return;

    this.validatingPromo.set(true);
    this.mockSupabase.validatePromotion(code, this.storeId()!).subscribe({
      next: (promo) => {
        this.validatingPromo.set(false);
        if (promo) {
          this.sharedState.appliedPromotion.set(promo);
          this.dialogService.alert('Promo Applied', `Successfully applied ${promo.discount_percentage}% discount!`);
        } else {
          this.dialogService.alert('Invalid Code', 'This promo code is either invalid, expired, or already used.');
          this.promoCodeInput.set('');
        }
      },
      error: () => {
        this.validatingPromo.set(false);
      }
    });
  }

  clearPromo() {
    this.sharedState.appliedPromotion.set(null);
    this.promoCodeInput.set('');
  }

  selectCustomer(customer: Customer) {
    this.sharedState.selectedCustomer.set(customer);
    this.customerSearchQuery.set('');
    this.showCustomerDropdown.set(false);
  }

  clearCustomer() {
    this.sharedState.selectedCustomer.set(null);
  }

  constructor() {
    // Timer effect
    setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);
  }

  addToCart(product: Product, event: MouseEvent) {
    if (product.stock_shop <= 0) return;
    this.sharedState.addToCart(product);
  }

  updateQuantity(item: any, delta: number) {
    this.sharedState.updateQuantity(item.product.id, item.quantity + delta);
  }

  goHome() {
    this.selectedCategory.set(null);
    this.searchQuery.set('');
    this.isBrowsing.set(false);
  }

  onSearchEnter() {
    const q = this.searchQuery().trim();
    if (!q) return;

    const exactMatch = this.products().find(p => p.barcode === q || p.name.toLowerCase() === q.toLowerCase());
    if (exactMatch && exactMatch.stock_shop > 0) {
      this.addToCart(exactMatch, new MouseEvent('click'));
      this.searchQuery.set('');
    }
  }

  switchStore(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.storeService.loadStore(select.value);
  }

  openOrderHistory() {
    console.log('Order History TBD');
  }

  openCheckoutModal() {
    this.showCheckoutModal.set(true);
  }

  closeCheckoutModal() {
    this.showCheckoutModal.set(false);
  }

  togglePaymentMethod(method: any) {
    const selected = this.selectedPaymentMethods();
    if (selected.find(m => m.id === method.id)) {
      this.selectedPaymentMethods.set(selected.filter(m => m.id !== method.id));
    } else {
      this.selectedPaymentMethods.set([...selected, method]);
    }
  }

  isSelectedPayment(method: any) {
    return !!this.selectedPaymentMethods().find(m => m.id === method.id);
  }

  getPaymentIcon(method: any) {
    switch (method.name.toLowerCase()) {
      case 'cash': return 'payments';
      case 'card': return 'credit_card';
      default: return 'account_balance_wallet';
    }
  }

  async completeSale() {
    if (this.isCompletingSale()) return;

    // Safety check - actually have items
    const items = this.sharedState.cart();
    if (items.length === 0) {
      this.dialogService.alert('Cart Empty', 'Please add items to the cart before completing the sale.');
      return;
    }

    this.isCompletingSale.set(true);

    try {
      const storeId = this.storeId();
      if (!storeId) throw new Error("No active store");

      let paymentMethod: PaymentMethod = 'CASH';
      if (this.activePaymentMethod() === 'split') {
        paymentMethod = 'SPLIT';
      } else if (this.activePaymentMethod() === 'card') {
        paymentMethod = 'CARD';
      }

      const payments = Object.entries(this.paymentAllocations())
        .filter(([_, amt]) => amt > 0)
        .map(([method, amt]) => ({ method: method.toUpperCase() as PaymentMethod, amount: amt }));

      const txData = {
        store_id: storeId,
        customer_id: this.sharedState.selectedCustomer()?.id,
        subtotal_amount: this.subtotal(),
        total_discount: this.sharedState.loyaltyDiscount(),
        delivery_fee: this.sharedState.shippingFee(),
        total_amount: this.total(),
        tax_amount: this.tax(),
        payment_method: paymentMethod,
        payments: payments,
        metadata: { type: 'SALE' }
      } as any;

      // ─────────────────────────────────────────────────────────────────────
      // OFFLINE-FIRST: Route through SyncService instead of direct Supabase
      // ─────────────────────────────────────────────────────────────────────
      if (this.connectivity.isOnline()) {
        // ONLINE: Complete the full transaction with inventory update
        const newTx = await firstValueFrom(this.mockSupabase.addTransaction(txData, items));

        const promo = this.sharedState.appliedPromotion();
        if (promo) {
          this.mockSupabase.markPromotionUsed(promo.id, newTx.id).subscribe();
        }

        this.dialogService.alert('Payment Successful', 'The transaction has been completed and inventory has been updated.', 'Finish');
      } else {
        // OFFLINE: Save the full basket snapshot to the sync queue
        await this.syncService.queueOperation('transactions', 'INSERT', {
          ...txData,
          items_snapshot: items,    // keep the basket items for replay
          queued_at: new Date().toISOString()
        });

        this.dialogService.alert(
          '✅ Sale Saved Offline',
          `kd${this.total().toFixed(2)} transaction saved to your device. It will automatically upload to the cloud when your internet reconnects.`,
          'Got it'
        );
      }

      // ── Common cleanup regardless of online/offline ──
      this.sharedState.clearCart();
      this.showCheckoutModal.set(false);
      this.selectedPaymentMethods.set([]);
      this.activePaymentMethod.set('cash');
      this.paymentAllocations.set({ cash: 0, card: 0 });
      this.sharedState.selectedCustomer.set(null);
      this.sharedState.shippingFee.set(0);

    } catch (error) {
      console.error('Sale failed', error);
      this.dialogService.alert('Transaction Failed', 'There was an error processing the payment. Please try again.', 'Dismiss');
    } finally {
      this.isCompletingSale.set(false);
    }
  }

  syncOfflineTransactions() {
    console.log('Syncing offline transactions...');
  }

  setFulfillment(mode: 'PICKUP' | 'DELIVERY' | 'COURIER') {
    this.sharedState.fulfillmentMode.set(mode);
    const config = this.storeService.currentStore()?.config;

    let fee = 0;
    if (mode === 'DELIVERY') {
      fee = config?.delivery_fee ?? 15;
    } else if (mode === 'COURIER') {
      fee = config?.courier_fee ?? 35;
    }

    this.sharedState.shippingFee.set(fee);
  }

  openGlobalStockModal() {
    this.dialogService.alert('Warehouse Bridge', 'Scanning live warehouse stock status for active SKUs...\n\n- WHSE-01: 42 Units\n- WHSE-04: 11 Units\n- TRANSIT: 0 Units');
  }

  getPaymentAmount(methodId: string): number {
    return methodId === 'cash' ? this.paymentAllocations().cash : this.paymentAllocations().card;
  }

  updatePaymentAmount(methodId: string, event: Event) {
    const val = Number((event.target as HTMLInputElement).value) || 0;
    this.paymentAllocations.update(p => ({
      ...p,
      [methodId]: val
    }));
  }

  // --- Payment Pad Logic ---
  onNumpadClick(key: string) {
    if (key === 'BACKSPACE') {
      this.paymentInputString.update(s => s.slice(0, -1));
    } else {
      // If the user hasn't typed anything and presses '00', ignore.
      if (this.paymentInputString() === '' && key === '00') return;

      this.paymentInputString.update(s => {
        // Prevent leading zeros unless it's decimal
        if (s === '0' && key !== '.') return key;
        // Handle decimals properly (prevent double decimals)
        if (key === '.' && s.includes('.')) return s;
        return s + key;
      });
    }
  }

  applyPaymentPad() {
    if (this.paymentInputString() === '') return; // Guard against empty pad / double clicks

    const amt = parseFloat(this.paymentInputString()) || 0;

    if (this.activePaymentMethod() === 'split') {
      // Cash gets the typed amount, card gets the remainder
      const remaining = Math.max(0, this.total() - amt);
      this.paymentAllocations.set({ cash: amt, card: remaining });
    } else {
      // Standard single-method allocation
      this.paymentAllocations.update(p => ({
        ...p,
        [this.activePaymentMethod()]: amt
      }));
    }
    this.paymentInputString.set(''); // Reset the pad text
  }

  clearPaymentMethod() {
    if (this.activePaymentMethod() === 'split') {
      this.paymentAllocations.set({ cash: 0, card: 0 });
    } else {
      this.paymentAllocations.update(p => ({
        ...p,
        [this.activePaymentMethod()]: 0
      }));
    }
    this.paymentInputString.set('');
  }

  setExactCash() {
    // First, set the active method to cash
    this.activePaymentMethod.set('cash');
    // Allocate the exact remaining balance to cash
    const remaining = this.paymentBalance() + this.paymentAllocations().cash;
    this.paymentAllocations.update(p => ({
      ...p,
      cash: remaining
    }));
  }

  setQuickCash(amount: number) {
    this.activePaymentMethod.set('cash');
    this.paymentAllocations.update(p => ({
      ...p,
      cash: amount
    }));
  }
}
