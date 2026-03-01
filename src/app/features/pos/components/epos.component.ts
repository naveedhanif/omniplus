import { Component, inject, signal, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { StoreConfigService } from '../../../core/services/store-config.service';
import { MockSupabaseService, Product, PaymentMethod, Store, Category, Customer, Transaction, TransactionItem } from '../../../core/services/mock-supabase.service';
import { DialogService } from '../../../core/services/dialog.service';
import { RouterLink } from '@angular/router';
import { TenantService } from '../../../core/tenant/tenant.service';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-epos',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule],
    template: `
    <!-- Dynamic Iframe Printing handles the receipt isolation -->
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
        
        <!-- LEFT: Main Interface -->
        <div class="flex-1 flex flex-col h-full overflow-hidden relative z-0">
          <!-- Header -->
          <header class="bg-[var(--primary-color)] text-white p-4 shadow-md z-10 flex flex-col md:flex-row gap-4 justify-between items-center transition-colors duration-300">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div>
                <h1 class="font-bold text-xl leading-none">{{ storeService.currentStore()?.name || 'Loading...' }}</h1>
                <p class="text-[10px] opacity-80 uppercase tracking-widest font-medium">{{ storeService.storeType() }} POS</p>
              </div>
              
              <!-- Store Switcher Dropdown -->
              <div class="relative group">
                <select 
                  [value]="storeService.currentStore()?.id" 
                  (change)="switchStore($event)"
                  class="bg-white/10 hover:bg-white/20 text-white pl-3 pr-8 py-1.5 rounded-lg text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer transition-colors border border-white/10">
                  @for (store of allStores(); track store.id) {
                    <option [value]="store.id" class="text-black">{{ store.name }}</option>                  }
                </select>
                <span class="material-symbols-rounded pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-white text-lg">expand_more</span>
              </div>
            </div>

            <!-- SEARCH / SCAN BAR -->
            <div class="relative flex-1 max-w-lg w-full flex gap-2">
               <div class="relative flex-1">
                  <!-- Added z-10 to bring icon above the white input background -->
                  <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10">qr_code_scanner</span>
                  <input 
                    type="text" 
                    [(ngModel)]="searchQuery"
                    (keyup.enter)="onSearchEnter()"
                    placeholder="Scan Barcode or Search Product..."
                    class="w-full bg-white text-black pl-10 pr-4 py-2 rounded-full shadow-inner focus:outline-none focus:ring-2 focus:ring-white/50 text-sm font-medium"
                    autofocus
                  >
                  @if (searchQuery()) {
                    <button (click)="searchQuery.set('')" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10">
                        <span class="material-symbols-rounded text-sm">close</span>
                    </button>
                  }
               </div>

               <!-- NEW: Order History Button -->
               <button (click)="openOrderHistory()" class="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center gap-2 font-medium transition-colors border border-white/10 shadow-sm" title="Lookup Past Orders">
                   <span class="material-symbols-rounded">history</span>
                   <span class="hidden sm:inline">Orders</span>
               </button>
            </div>

            <div class="hidden md:block text-sm bg-black/20 px-3 py-1.5 rounded-lg backdrop-blur-sm font-mono tracking-wide">
              {{ currentTime() | date:'mediumTime' }}
            </div>
          </header>

          <!-- Navigation / Breadcrumbs & Quick Items -->
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

             <!-- Quick Items Fast-Track (Dynamic Pills) -->
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
          </div>

          <!-- Main Content Grid -->
          <div class="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-black/20">

            <!-- VIEW STATE 1: SCAN-FORWARD (New Initial State) -->
            @if (cart().length === 0 && !searchQuery() && !selectedCategory() && !isBrowsing()) {
                <div class="flex flex-col items-center justify-center h-full text-center p-10 opacity-60 animate-in fade-in duration-500">
                    <div class="w-24 h-24 bg-[var(--card-bg)] border border-slate-200 dark:border-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <span class="material-symbols-rounded text-5xl text-slate-400">qr_code_scanner</span>
                    </div>
                    <h2 class="text-2xl font-bold mb-2 text-balance">Ready for Next Sale</h2>
                    <p class="max-w-xs text-sm mb-8 text-balance">Use the search bar above to find a product by name or barcode, or start scanning items.</p>
                    <button (click)="isBrowsing.set(true)" class="px-6 py-3 bg-[var(--card-bg)] border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm hover:shadow-md active:scale-95">
                        <span class="material-symbols-rounded">grid_view</span>
                        Or, Browse Departments
                    </button>
                </div>
            } @else {
                <!-- VIEW STATE 2: DEPARTMENT ROOT -->
                @if (!searchQuery() && !selectedCategory()) {
                   <div class="space-y-6">
                       <!-- Department Grid -->
                       <div>
                           <h3 class="text-xs font-bold uppercase tracking-wider opacity-60 mb-3 px-1">Departments</h3>
                           <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                               @for (cat of categories(); track cat.id) {
                                   <button 
                                      (click)="selectedCategory.set(cat.id)"
                                      class="aspect-[4/3] relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 group text-left border border-slate-200 dark:border-slate-700 active:scale-95 bg-[var(--card-bg)]">
                                      
                                      <!-- Color Strip -->
                                      <div class="absolute top-0 left-0 w-full h-1.5" [style.backgroundColor]="cat.color"></div>
                                      
                                      <div class="p-5 h-full flex flex-col justify-between z-10 relative">
                                          <div>
                                              <h3 class="font-bold text-lg leading-tight group-hover:text-[var(--primary-color)] transition-colors">{{ cat.name }}</h3>
                                          </div>
                                          <div class="flex justify-between items-end">
                                              <span class="text-xs font-medium bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md text-slate-600 dark:text-slate-300">
                                                  {{ categoryCounts()[cat.id] || 0 }} Items
                                              </span>
                                              <span class="material-symbols-rounded text-slate-300 group-hover:text-[var(--primary-color)] transition-colors transform group-hover:translate-x-1">arrow_forward</span>
                                          </div>
                                      </div>
                                      
                                      <!-- Hover Glow Effect -->
                                      <div class="absolute inset-0 bg-gradient-to-br from-transparent to-black/5 dark:to-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                   </button>
                               } @empty {
                                   <div class="col-span-full py-10 text-center opacity-50">
                                       <p>No categories defined.</p>
                                       <p class="text-sm">Go to Admin to setup your store.</p>
                                   </div>
                               }
                           </div>
                       </div>
                   </div>
                }
    
                <!-- VIEW STATE 3: PRODUCT GRID (Search Active OR Category Selected) -->
                @else {
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start animate-in fade-in slide-in-from-bottom-4 duration-300">
                        @for (product of filteredProducts(); track product.id) {
                        <div 
                            (click)="addToCart(product, $event)"
                            [class.opacity-40]="product.stock_shop <= 0"
                            [class.grayscale]="product.stock_shop <= 0"
                            class="bg-[var(--card-bg)] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between h-44 relative group select-none overflow-hidden">
                            
                            <!-- Static Overlay for "Flying" animation source -->
                            <div class="product-anim-source absolute inset-0 pointer-events-none opacity-0 bg-[var(--primary-color)] overflow-hidden"></div>
                            
                            <!-- Hover Add Icon -->
                            @if (product.stock_shop > 0) {
                                <div class="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--primary-color)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg scale-75 group-hover:scale-100">
                                    <span class="material-symbols-rounded text-lg">add</span>
                                </div>
                            } @else if (product.stock_warehouse > 0) {
                                <div title="Available in Warehouse" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity shadow-lg">
                                    <span class="material-symbols-rounded text-lg">warehouse</span>
                                </div>
                            }
    
                            <div class="flex-1">
                            <h3 class="font-bold text-base line-clamp-2 leading-tight mb-2">{{ product.name }}</h3>
                            
                            <!-- Dynamic Badges -->
                            <div class="flex flex-wrap gap-1 mt-1">
                                @if (product.barcode) {
                                <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-mono">
                                    {{ product.barcode }}
                                </span>
                                }
                                @if (product.metadata?.expiryDate && storeService.currentStore()?.config?.features?.trackExpiry) {
                                <span class="text-[9px] px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50">
                                    Exp: {{ product.metadata.expiryDate | date:'MM/yy' }}
                                </span>
                                }
                                
                                <!-- NEW VARIANTS BADGE -->
                                @if (!product.is_variant && hasVariantsMap()[product.id]) {
                                   <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center gap-0.5">
                                      <span class="material-symbols-rounded text-[10px]">alt_route</span> Alternates
                                   </span>
                                }

                                <!-- STOCK STATUS BADGES -->
                                @if (product.stock_shop <= 0) {
                                    <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 flex items-center gap-0.5">
                                        <span class="material-symbols-rounded text-[10px]">inventory_2</span> FINISHED
                                    </span>
                                    @if (product.stock_warehouse > 0) {
                                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                                            {{ product.stock_warehouse }} IN WHSE
                                        </span>
                                    }
                                } @else if (product.stock_shop <= 2) {
                                    <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center gap-0.5 animate-pulse">
                                        <span class="material-symbols-rounded text-[10px]">warning</span> LOW STOCK
                                    </span>
                                }
                            </div>
                            </div>
                            
                            <div class="flex justify-between items-end mt-2 pt-3 border-t border-slate-50 dark:border-slate-800">
                            <div class="flex flex-col gap-1">
                                <span class="font-extrabold text-lg text-[var(--primary-color)] leading-none">
                                    {{ product.price | currency:storeService.currentStore()?.config?.currency }}
                                </span>
                                
                                <!-- INDUSTRY SPECIFIC RENDERERS -->
                                @if (tenantService.currentTenant().industry === 'pharmacy' && product.metadata?.prescriptionRequired) {
                                    <span class="text-[9px] font-bold text-red-500 flex items-center gap-0.5 mt-1 border border-red-200 bg-red-50 rounded px-1 py-0.5"><span class="material-symbols-rounded text-[10px]">medical_information</span> Rx Only</span>
                                }
                                @if (tenantService.currentTenant().industry === 'grocery' && product.metadata?.isWeighed) {
                                    <span class="text-[9px] font-bold text-green-600 flex items-center gap-0.5 mt-1"><span class="material-symbols-rounded text-[10px]">scale</span> Weighable</span>
                                }
                                @if (product.is_serialized) {
                                    <span class="text-[9px] font-bold text-blue-600 flex items-center gap-0.5 mt-1 border border-blue-200 bg-blue-50 rounded px-1 py-0.5"><span class="material-symbols-rounded text-[10px]">qr_code</span> Serial Tracking</span>
                                }
                            </div>
                            
                            <!-- Dual Stock Display & Quick Transfer -->
                            <div class="text-right flex flex-col items-end">
                                <span class="text-xs font-bold" [class.text-red-500]="product.stock_shop < 3" [class.text-slate-400]="product.stock_shop >= 3">
                                    {{ product.stock_shop }} Floor
                                </span>
                                @if(product.stock_warehouse > 0) {
                                    @if (product.stock_shop <= 0) {
                                        <button 
                                            (click)="$event.stopPropagation(); requestFromWarehouse(product)"
                                            [disabled]="isTransferringFromWarehouse()[product.id]"
                                            class="mt-1 text-[9px] bg-blue-500 hover:bg-blue-600 text-white px-2 py-0.5 rounded font-black uppercase tracking-tighter flex items-center gap-0.5 transition-all active:scale-90 disabled:opacity-50">
                                            @if (isTransferringFromWarehouse()[product.id]) {
                                                <div class="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin"></div>
                                            } @else {
                                                <span class="material-symbols-rounded text-[10px]">move_item</span>
                                            }
                                            FETCH WHSE
                                        </button>
                                    } @else {
                                        <span class="text-[10px] text-blue-500 font-medium">
                                            +{{ product.stock_warehouse }} Whse
                                        </span>
                                    }
                                }
                            </div>
                            </div>
                        </div>
                        } @empty {
                            <div class="col-span-full flex flex-col items-center justify-center h-64 opacity-50">
                                <span class="material-symbols-rounded text-4xl mb-2">search_off</span>
                                <p>No products found.</p>
                                @if (selectedCategory()) {
                                    <button (click)="goHome()" class="mt-4 text-[var(--primary-color)] hover:underline">Go Back Home</button>
                                }
                            </div>
                        }
                    </div>
                }
            }
          </div>
        </div>

        <!-- RIGHT: Cart / Sidebar -->
        <div class="w-full md:w-96 bg-[var(--card-bg)] shadow-2xl flex flex-col z-20 md:border-l border-slate-200 dark:border-slate-800 relative">
          
                 <!-- Zone 1: Header Wrapper (Fixed Height) -->
                 <div class="shrink-0">
                    <!-- Sidebar Selection Tabs (Phase 4) -->
                    <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20">
                        <button 
                            (click)="showCustomerInsights.set(false)"
                            [class.border-b-2]="!showCustomerInsights()"
                            [class.border-[var(--primary-color)]]="!showCustomerInsights()"
                            [class.text-[var(--primary-color)]]="!showCustomerInsights()"
                            class="flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all">
                            Active Cart
                        </button>
                        <button 
                            (click)="toggleInsights()"
                            [class.border-b-2]="showCustomerInsights()"
                            [class.border-[var(--primary-color)]]="showCustomerInsights()"
                            [class.text-[var(--primary-color)]]="showCustomerInsights()"
                            class="flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all relative">
                            Insights
                            @if (customerHistory().length > 0) {
                                <span class="absolute top-2 right-4 w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                            }
                        </button>
                    </div>

                    <!-- Customer Context -->
             <div class="p-3 bg-[var(--bg-color)]/50 border-b border-slate-200 dark:border-slate-800">
                  @if (selectedCustomer()) {
                      <div class="bg-[var(--card-bg)] rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 relative group transition-all" (click)="openCustomerModal()">
                           <div class="flex justify-between items-start mb-1">
                               <span class="text-[10px] uppercase tracking-wider font-bold opacity-50">Customer</span>
                               <button (click)="$event.stopPropagation(); clearCustomer()" class="text-slate-400 hover:text-red-500"><span class="material-symbols-rounded text-sm">close</span></button>
                           </div>
                           <div class="flex justify-between items-center">
                               <div class="font-bold text-sm">{{ selectedCustomer()?.full_name }}</div>
                               <div class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-mono font-bold"
                                    [class.text-red-600]="(selectedCustomer()?.current_balance || 0) < 0">
                                   {{ selectedCustomer()?.current_balance | currency:storeService.currentStore()?.config?.currency }}
                               </div>
                           </div>
                           @if(selectedCustomer()?.is_vip) {
                              <div class="absolute -top-1 -right-1">
                                  <span class="flex h-3 w-3">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                    <span class="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                                  </span>
                              </div>
                           }
                      </div>
                  } @else {
                      <button (click)="openCustomerModal()" class="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-all flex items-center justify-center gap-2 text-sm font-medium group">
                          <span class="material-symbols-rounded group-hover:scale-110 transition-transform">person_add</span>
                          Assign Customer
                      </button>
                  }
             </div>

            <!-- Cart Header -->
            <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-[var(--card-bg)]">
              <div id="cart-header-anchor">
                <h2 class="font-bold text-lg flex items-center gap-2 opacity-80">
                  <span class="material-symbols-rounded text-[var(--primary-color)] transition-transform duration-300" 
                        [class.scale-125]="isCartPinging()"
                        [class.text-emerald-500]="isCartPinging()">shopping_bag</span>
                  Order #{{ orderNumber() }}
                </h2>
                <div class="text-[10px] text-slate-500 font-medium">
                  {{ tenantService.currentTenant().name }} ({{ tenantService.currentTenant().industry | uppercase }})
                </div>
              </div>
              
              @if (cart().length > 0) {
                <div class="flex items-center gap-1">
                    <button (click)="parkOrder()" class="text-slate-400 hover:text-orange-500 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" title="Park Current Order">
                      <span class="material-symbols-rounded text-xl">pause_presentation</span>
                    </button>
                    <button (click)="clearCart()" class="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" title="Clear Cart">
                      <span class="material-symbols-rounded text-xl">delete_sweep</span>
                    </button>
                </div>
              } @else if (parkedOrders().length > 0) {
                  <button (click)="showParkedOrdersList.set(true)" class="relative p-2 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:scale-110 transition-all">
                      <span class="material-symbols-rounded text-xl">pause_presentation</span>
                      <span class="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--card-bg)]">
                          {{ parkedOrders().length }}
                      </span>
                  </button>
              }
            </div>
          </div>

           <!-- Zone 2: Cart Items List OR Insights (Scrollable) -->
           <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--bg-color)]/30 min-h-0">
             @if (!showCustomerInsights()) {
                @for (item of cart(); track item.product.id) {
                  <div class="flex gap-3 bg-[var(--card-bg)] p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/50 animate-in fade-in slide-in-from-right-8 duration-300">
                     <!-- Quantity Controls (Vertical) -->
                    <div class="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-lg w-8 h-full shrink-0">
                      <button (click)="updateQuantity(item.product.id, 1)" class="w-full h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[var(--primary-color)] active:scale-90 transition-all">
                        <span class="material-symbols-rounded text-base">add</span>
                      </button>
                      <span class="text-sm font-bold my-1">{{ item.quantity }}</span>
                      <button (click)="updateQuantity(item.product.id, -1)" class="w-full h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-red-500 active:scale-90 transition-all">
                        <span class="material-symbols-rounded text-base">remove</span>
                      </button>
                    </div>

                    <div class="flex-1 min-w-0 flex flex-col justify-center">
                      <div class="flex justify-between items-start">
                        <span class="font-semibold text-sm leading-tight pr-2">{{ item.product.name }}</span>
                        <span class="font-bold text-sm whitespace-nowrap">{{ (item.product.price * item.quantity) | currency:storeService.currentStore()?.config?.currency }}</span>
                      </div>
                       <div class="text-xs text-slate-400 mt-1">{{ item.product.price | currency:storeService.currentStore()?.config?.currency }} / unit</div>

                       @if (item.product.metadata?.prescriptionRequired) {
                        <div class="mt-2 text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit">
                            <span class="material-symbols-rounded text-[12px]">medical_services</span> Rx Required
                        </div>
                      }

                      @if (item.product.is_serialized) {
                        <div class="mt-2 text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit border border-blue-200 dark:border-blue-800">
                            <span class="material-symbols-rounded text-[12px]">barcode_reader</span> Serial Needed
                        </div>
                      }
                    </div>
                  </div>
                } @empty {
                  <div class="flex flex-col items-center justify-center h-full opacity-40 select-none">
                      <div class="w-20 h-20 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <span class="material-symbols-rounded text-4xl text-slate-400">shopping_cart</span>
                      </div>
                      <p class="font-medium text-lg">Cart is empty</p>
                      <p class="text-sm">Scan items to start order</p>
                  </div>
                }

                <!-- PHASE 4: AI Recommendations at bottom of cart -->
                @if (cart().length > 0 && upsellProducts().length > 0) {
                    <div class="pt-4 mt-4 border-t border-dashed border-slate-200 dark:border-slate-800">
                        <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
                            <span class="material-symbols-rounded text-[14px] text-orange-500 animate-pulse">auto_awesome</span>
                            Smart Additions
                        </h4>
                        <div class="space-y-2">
                            @for (upsell of upsellProducts(); track upsell.id) {
                                <button (click)="addToCart(upsell, $event)" class="w-full p-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between hover:border-orange-400 transition-all group">
                                    <div class="text-left">
                                        <div class="text-[11px] font-bold truncate max-w-[140px]">{{ upsell.name }}</div>
                                        <div class="text-[9px] text-[var(--primary-color)] font-mono">{{ upsell.price | currency:storeService.currentStore()?.config?.currency }}</div>
                                    </div>
                                    <span class="material-symbols-rounded text-slate-300 group-hover:text-orange-500 group-hover:scale-110 transition-all">add_circle</span>
                                </button>
                            }
                        </div>
                    </div>
                }
             } @else {
                 <!-- CUSTOMER INSIGHTS VIEW -->
                 <div class="animate-in fade-in slide-in-from-right-4 duration-300">
                    @if (selectedCustomer()) {
                        <div class="space-y-6">
                            <!-- High Level Stats -->
                            <div class="grid grid-cols-2 gap-2">
                                <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
                                    <div class="text-[8px] font-black uppercase tracking-tighter opacity-50">Total Spend</div>
                                    <div class="text-lg font-black text-blue-700 dark:text-blue-400">£2,450</div>
                                </div>
                                <div class="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl border border-orange-100 dark:border-orange-800">
                                    <div class="text-[8px] font-black uppercase tracking-tighter opacity-50">Loyalty Score</div>
                                    <div class="text-lg font-black text-orange-700 dark:text-orange-400">Elite 4.8</div>
                                </div>
                            </div>
                            
                            <div>
                                <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Recent Purchases</h4>
                                @if (isFetchingHistory()) {
                                    <div class="flex justify-center p-4">
                                        <div class="w-6 h-6 border-2 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                } @else {
                                    <div class="space-y-2">
                                        @for (tx of customerHistory(); track tx.id) {
                                            <div class="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                                                <div class="flex justify-between items-start mb-1">
                                                    <span class="text-[10px] font-mono font-medium text-slate-500">{{ tx.created_at | date:'dd MMM yy' }}</span>
                                                    <span class="text-[10px] font-bold text-[var(--primary-color)]">{{ tx.total_amount | currency:storeService.currentStore()?.config?.currency }}</span>
                                                </div>
                                                <div class="text-xs font-bold truncate text-slate-800 dark:text-slate-200">
                                                    Order #{{ tx.id.substring(0,8) }}
                                                </div>
                                            </div>
                                        } @empty {
                                            <div class="text-center p-8 opacity-40">
                                                <span class="material-symbols-rounded text-4xl block mb-2">history</span>
                                                <p class="text-xs">No recent history found</p>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>

                            <!-- Behavior Prediction -->
                            <div class="p-4 bg-[var(--primary-color)]/10 rounded-2xl border border-[var(--primary-color)]/20 relative overflow-hidden">
                                <div class="absolute -top-2 -right-2 opacity-10">
                                    <span class="material-symbols-rounded text-6xl">psychology</span>
                                </div>
                                <h5 class="text-xs font-black text-[var(--primary-color)] mb-2 flex items-center gap-1">
                                    <span class="material-symbols-rounded text-sm">rocket_launch</span>
                                    AI Propensity
                                </h5>
                                <p class="text-[11px] leading-relaxed italic opacity-80">
                                    "Customer often returns for filters within 30 days. Suggest a bulk discount for the 3-pack today."
                                </p>
                            </div>
                        </div>
                    } @else {
                         <div class="flex flex-col items-center justify-center p-12 text-center opacity-40">
                            <span class="material-symbols-rounded text-5xl mb-4">search_insights</span>
                            <p class="font-bold">No Intelligence Data</p>
                            <p class="text-sm mt-1">Assign a customer to see history and AI predictions.</p>
                        </div>
                    }
                 </div>
             }
           </div>

          <!-- Zone 3: Footer / Totals & Payment (Fixed Height) -->
          <div class="p-5 bg-[var(--card-bg)] border-t border-slate-100 dark:border-slate-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30 shrink-0">
            <div class="space-y-2 mb-4">
              <div class="flex justify-between text-sm">
                <span class="text-slate-500">Subtotal</span>
                <span class="font-medium">{{ subtotal() | currency:storeService.currentStore()?.config?.currency }}</span>
              </div>
              @if (storeService.currentStore()?.config?.tax_enabled) {
                  <div class="flex justify-between text-sm">
                    <span class="text-slate-500">Tax ({{ (storeService.currentStore()?.config?.tax_rate || 0) * 100 }}%)</span>
                    <span class="font-medium">{{ tax() | currency:storeService.currentStore()?.config?.currency }}</span>
                  </div>
              }
              <div class="flex justify-between items-end pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
                <span class="font-bold text-xl">Total</span>
                <span class="font-extrabold text-2xl text-[var(--primary-color)]">{{ total() | currency:storeService.currentStore()?.config?.currency }}</span>
              </div>
            </div>
            
            @switch(paymentViewMode()) {
                @case('DEFAULT') {
                    <div class="grid grid-cols-4 gap-2 animate-in fade-in duration-200">
                        <button 
                          (click)="setPaymentView('CASH')"
                          [disabled]="cart().length === 0"
                          class="col-span-1 py-3 rounded-lg bg-emerald-600 text-white font-bold text-sm shadow-lg hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                          CASH
                        </button>
                         <button 
                          (click)="processPayment('CARD')"
                          [disabled]="cart().length === 0"
                          class="col-span-1 py-3 rounded-lg bg-[var(--primary-color)] text-white font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                          CARD
                        </button>
                         <button 
                          (click)="setPaymentView('SPLIT')"
                          [disabled]="cart().length === 0"
                          class="col-span-1 py-3 rounded-lg bg-purple-600 text-white font-bold text-sm shadow-lg hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                          SPLIT
                        </button>
                        <button 
                          (click)="processPayment('ON_ACCOUNT')"
                          [disabled]="!canPayOnAccount()"
                          [title]="!selectedCustomer() ? 'Select a customer first' : 'Account limit exceeded or empty cart'"
                          class="col-span-1 py-3 rounded-lg bg-orange-600 text-white font-bold text-xs shadow-lg hover:bg-orange-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center leading-none">
                          <span>ON</span>
                          <span>ACCT</span>
                        </button>
                    </div>
                }
                @case('CASH') {
                    <div class="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
                        <h3 class="font-bold text-center uppercase text-xs tracking-wider opacity-70">Cash Payment</h3>
                        
                        <div class="text-center text-3xl font-mono tracking-wider font-bold text-slate-800 dark:text-slate-100 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                            {{ cashInputStr() || '0' }}<span class="animate-pulse text-slate-300">|</span>
                        </div>

                        <div class="text-center font-bold text-sm h-6">
                            @if (changeDue() >= 0) {
                                <span class="text-emerald-600 dark:text-emerald-400">Change: {{ changeDue() | currency:storeService.currentStore()?.config?.currency }}</span>
                            } @else {
                                <span class="text-red-500 dark:text-red-400">Remaining: {{ (changeDue() * -1) | currency:storeService.currentStore()?.config?.currency }}</span>
                            }
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                            @for(key of ['1','2','3','4','5','6','7','8','9','.','0','backspace']; track key) {
                                <button (click)="handleNumpad(key)" class="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center font-bold text-lg text-slate-700 dark:text-slate-200 select-none group">
                                    @if(key === 'backspace') {
                                        <span class="material-symbols-rounded text-lg opacity-50 group-hover:text-red-500 transition-colors">backspace</span>
                                    } @else {
                                        {{ key }}
                                    }
                                </button>
                            }
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-2">
                            <button (click)="paymentViewMode.set('DEFAULT')" class="py-3 bg-slate-200 dark:bg-slate-700 font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button (click)="confirmPayment()" [disabled]="changeDue() < 0" class="py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                Complete
                            </button>
                        </div>
                    </div>
                }
                @case('SPLIT') {
                     <div class="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
                        <h3 class="font-bold text-center uppercase text-xs tracking-wider opacity-70">Split Payment (Enter Cash Amount)</h3>
                        
                        <div class="relative w-full h-10 bg-slate-200 dark:bg-zinc-800 rounded-lg overflow-hidden shadow-inner">
                            <div class="absolute inset-0 bg-stripes-light flex items-center justify-end px-2">
                                <span class="font-bold font-mono text-slate-500 dark:text-slate-400 text-[10px]">
                                    CARD: {{ splitCardAmount() | currency:storeService.currentStore()?.config?.currency }}
                                </span>
                            </div>
                            <div class="absolute top-0 left-0 h-full bg-[var(--primary-color)] transition-all duration-300 ease-out flex items-center px-2"
                                 [style.width.%]="cashSplitPercentage()">
                                 <span class="font-bold font-mono text-white text-[10px] whitespace-nowrap">
                                    CASH: {{ cashTendered() | currency:storeService.currentStore()?.config?.currency }}
                                 </span>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                            @for(key of ['1','2','3','4','5','6','7','8','9','.','0','backspace']; track key) {
                                <button (click)="handleNumpad(key)" class="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center font-bold text-lg text-slate-700 dark:text-slate-200 select-none group">
                                    @if(key === 'backspace') {
                                        <span class="material-symbols-rounded text-lg opacity-50 group-hover:text-red-500 transition-colors">backspace</span>
                                    } @else {
                                        {{ key }}
                                    }
                                </button>
                            }
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-2">
                            <button (click)="paymentViewMode.set('DEFAULT')" class="py-3 bg-slate-200 dark:bg-slate-700 font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button (click)="confirmPayment()" [disabled]="cashTendered() <= 0 || cashTendered() >= total()" class="py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                Confirm Split
                            </button>
                        </div>
                    </div>
                }
            }
          </div>
        </div>
      </div>

      <!-- Parked Orders Modal -->
      @if (showParkedOrdersList()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-[var(--bg-color)] flex justify-between items-center">
                      <h3 class="text-lg font-bold flex items-center gap-2 text-orange-600">
                          <span class="material-symbols-rounded">pause_presentation</span>
                          Parked Sales
                      </h3>
                      <button (click)="showParkedOrdersList.set(false)" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full">
                          <span class="material-symbols-rounded">close</span>
                      </button>
                  </div>
                  <div class="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                      @for (order of parkedOrders(); track order.id) {
                          <div class="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group hover:border-orange-400 transition-all">
                              <div class="flex-1">
                                  <div class="font-bold text-sm">Sale Reference #{{ order.id }}</div>
                                  <div class="text-[10px] text-slate-500 uppercase font-medium">{{ order.cart.length }} Items • {{ order.timestamp | date:'shortTime' }}</div>
                                  <div class="text-xs font-bold text-orange-600 mt-1">{{ order.total | currency:storeService.currentStore()?.config?.currency }}</div>
                              </div>
                              <button (click)="resumeParkedOrder(order)" class="px-4 py-2 bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 rounded-lg font-bold text-xs hover:bg-orange-600 hover:text-white transition-all">
                                  RESUME
                              </button>
                          </div>
                      }
                  </div>
              </div>
          </div>
      }

      <!-- Serial Number Force-Select Modal -->
      @if (showSerialModal()) {
          <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <div class="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-200 dark:border-slate-700">
                  <div class="p-6 border-b border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20">
                      <h3 class="text-2xl font-black text-blue-800 dark:text-blue-400 flex items-center gap-3">
                          <span class="material-symbols-rounded text-3xl">barcode_reader</span>
                          Serial Assignment
                      </h3>
                      <p class="text-sm opacity-70 mt-1">Assignment is required for high-value hardware tracking.</p>
                  </div>

                  <div class="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                      @for (item of serializedItemsToConfigure(); track item.product.id) {
                          <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                              <div class="flex justify-between items-start mb-4">
                                  <div>
                                      <h4 class="font-bold text-lg leading-tight">{{ item.product.name }}</h4>
                                      <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Assignment Required: {{ item.quantity }} Units</span>
                                  </div>
                              </div>

                              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  @for (idx of [].constructor(item.quantity); track idx; let i = $index) {
                                      <div class="flex flex-col gap-1">
                                          <label class="text-[10px] font-bold uppercase text-slate-500">Unit #{{ i + 1 }} Serial</label>
                                          <select 
                                              [(ngModel)]="item.selectedSerials[i]"
                                              class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none">
                                              <option value="">Select a specific box...</option>
                                              @for (sn of availableSerialsMap()[item.product.id]; track sn) {
                                                  <option [value]="sn" [disabled]="isSerialAlreadySelected(item, sn, i)">{{ sn }}</option>
                                              }
                                          </select>
                                      </div>
                                  }
                              </div>
                          </div>
                      }
                  </div>

                  <div class="p-6 bg-slate-50 dark:bg-zinc-900 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3">
                      <button (click)="showSerialModal.set(false)" class="flex-1 py-4 font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Cancel Sale</button>
                      <button (click)="finalCheckoutAfterSerials()" [disabled]="!areAllSerialsAssigned()" class="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95">
                          Confirm & Continue to Payment
                      </button>
                  </div>
              </div>
          </div>
      }

      <!-- Customer Selection Modal -->
      @if (showCustomerModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
                 <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-[var(--bg-color)] flex justify-between items-center">
                    <h3 class="text-lg font-bold">Select Customer</h3>
                    <button (click)="showCustomerModal.set(false)" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"><span class="material-symbols-rounded">close</span></button>
                 </div>
                 <div class="p-4 border-b border-slate-200 dark:border-slate-700">
                     <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-rounded text-slate-400">search</span>
                        <input 
                            type="text" 
                            [(ngModel)]="customerSearchQuery"
                            (ngModelChange)="performCustomerSearch()"
                            placeholder="Type name or phone number..."
                            class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors"
                            autofocus
                        >
                         @if (isSearchingCustomers()) {
                             <div class="absolute right-3 top-1/2 -translate-y-1/2">
                                 <div class="w-4 h-4 border-2 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin"></div>
                             </div>
                         }
                     </div>
                 </div>
                 <div class="flex-1 overflow-y-auto p-2 min-h-[200px]">
                     @for(cust of searchedCustomers(); track cust.id) {
                         <button (click)="selectCustomer(cust)" class="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex justify-between items-center border-b border-slate-50 dark:border-slate-800 last:border-0 group">
                             <div>
                                 <div class="font-bold group-hover:text-[var(--primary-color)] transition-colors">{{ cust.full_name }}</div>
                                 <div class="text-xs opacity-60">{{ cust.phone || 'No Phone' }}</div>
                             </div>
                             <div class="text-right">
                                 <div class="font-mono text-sm font-bold" [class.text-red-500]="cust.current_balance < 0">
                                     {{ cust.current_balance | currency:storeService.currency() }}
                                 </div>
                                 @if (cust.is_vip) {
                                     <span class="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">VIP</span>
                                 }
                             </div>
                         </button>
                     } @empty {
                         <div class="flex flex-col items-center justify-center h-full text-center p-8 opacity-50 gap-2">
                             @if (customerSearchQuery().length < 2) {
                                 <span class="material-symbols-rounded text-4xl">keyboard</span>
                                 <span>Start typing to find a customer...</span>
                             } @else {
                                 <span class="material-symbols-rounded text-4xl">person_off</span>
                                 <span>No customers found matching "{{ customerSearchQuery() }}"</span>
                             }
                         </div>
                     }
                 </div>
            </div>
        </div>
      }

      <!-- Order History & Refund Modal -->
      @if (showOrderHistoryModal()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:hidden">
              <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-[var(--bg-color)]">
                      <h3 class="text-xl font-bold flex items-center gap-2">
                          <span class="material-symbols-rounded text-[var(--primary-color)]">history</span>
                          Order Lookup
                      </h3>
                      <button (click)="showOrderHistoryModal.set(false)" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"><span class="material-symbols-rounded">close</span></button>
                  </div>
                  
                  <div class="p-4 border-b border-slate-200 dark:border-slate-700">
                       <div class="relative">
                          <span class="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-rounded text-slate-400">search</span>
                          <input 
                              type="text" 
                              [(ngModel)]="orderSearchQuery"
                              (ngModelChange)="performOrderSearch()"
                              placeholder="Search Order ID or Customer Name..."
                              class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors"
                              autofocus
                          >
                      </div>
                  </div>

                  <div class="flex-1 overflow-y-auto">
                      @for (tx of searchedOrders(); track tx.id) {
                          <button (click)="selectOrder(tx)" class="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 transition-colors flex justify-between items-center group">
                              <div>
                                  <div class="font-bold font-mono text-sm text-[var(--primary-color)]">{{ tx.id.substring(0,8) }}</div>
                                  <div class="text-xs opacity-60">{{ tx.created_at | date:'medium' }}</div>
                                  @if (tx.customer) {
                                      <div class="text-xs font-bold mt-1">{{ tx.customer.full_name }}</div>
                                  }
                              </div>
                              <div class="text-right">
                                  <div class="font-bold" [class.text-red-500]="tx.total_amount < 0">{{ tx.total_amount | currency:storeService.currentStore()?.config?.currency }}</div>
                                  <div class="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded inline-block mt-1">{{ tx.payment_method }}</div>
                                  @if(tx.metadata?.status === 'VOID') {
                                      <div class="text-red-500 font-bold text-xs mt-1">VOIDED</div>
                                  }
                              </div>
                          </button>
                      } @empty {
                          <div class="p-8 text-center opacity-50">
                              No orders found.
                          </div>
                      }
                  </div>
              </div>
          </div>
      }
      

      @if (selectedOrder(); as tx) {
          <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
             <!-- Modal Container -->
             <div class="w-full max-w-[400px] relative flex flex-col items-center">
                 
                 <!-- Top Action Badge -->
                 <div class="absolute -top-5 bg-[var(--primary-color)] text-white px-6 py-1.5 rounded-full font-bold shadow-xl border-4 border-[var(--bg-color)] z-10 flex items-center gap-2 text-sm shadow-[var(--primary-color)]/30">
                     <span class="material-symbols-rounded text-base">page_info</span>
                     Receipt Details
                 </div>

                 <div class="bg-white text-black w-full rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 relative flex flex-col max-h-[90vh]">
                     <!-- Colorful Top Border -->
                     <div class="h-2 w-full bg-gradient-to-r from-blue-500 via-[var(--primary-color)] to-purple-500 shrink-0"></div>

                     <!-- Printable Area (Scrollable if long) -->
                     <div class="overflow-y-auto no-scrollbar shrink">
                         <div id="receipt-printable" class="p-8 pb-6 bg-white text-black">
                             <!-- Store Header -->
                             <div class="text-center mb-6">
                                 <div class="w-16 h-16 bg-slate-100 rounded-full mx-auto flex items-center justify-center mb-4 border border-slate-200">
                                     <span class="material-symbols-rounded text-3xl text-slate-700">storefront</span>
                                 </div>
                                 <h2 class="text-2xl font-extrabold uppercase tracking-widest text-slate-800 leading-tight">{{ storeService.currentStore()?.name }}</h2>
                                 <p class="text-xs text-slate-500 mt-1 tracking-wider">{{ storeService.currentStore()?.location || 'Retail Location' }}</p>
                                 
                                 <div class="mt-4 flex flex-col items-center justify-center gap-0.5 opacity-60">
                                     <p class="text-[11px] font-mono font-medium">{{ tx.created_at | date:'dd MMM yyyy, HH:mm' }}</p>
                                     <p class="text-[11px] font-mono font-medium">ORDER #{{ tx.id.substring(0,8) }}</p>
                                 </div>

                                 @if (tx.metadata?.status === 'VOID') {
                                     <div class="mt-5 border-2 border-red-500 text-red-500 font-black text-2xl uppercase -rotate-6 inline-block px-4 py-1 rounded-lg">VOID</div>
                                 }
                                 @if (tx.metadata?.type === 'RETURN') {
                                      <div class="mt-5 border-2 border-blue-500 text-blue-500 font-black text-2xl uppercase -rotate-6 inline-block px-4 py-1 rounded-lg">RETURN</div>
                                 }
                             </div>

                             <!-- Divider -->
                             <div class="w-full border-t border-dashed border-slate-300 my-4"></div>

                             <!-- Items Table -->
                             <table class="w-full text-sm font-medium">
                                 <thead>
                                     <tr class="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                                         <th class="text-left pb-2 font-bold tracking-wider">Item Details</th>
                                         <th class="text-right pb-2 font-bold tracking-wider">Amount</th>
                                     </tr>
                                 </thead>
                                 <tbody class="divide-y divide-slate-100">
                                     @for (item of selectedOrderItems(); track item.id) {
                                         <tr>
                                             <td class="py-3 pr-2">
                                                <div class="text-slate-800 font-bold text-sm leading-tight">{{ item.product?.name || 'Unknown Item' }}</div>
                                                <div class="text-[11px] text-slate-500 mt-0.5">{{ item.quantity }} x {{ item.price_at_sale | currency:storeService.currentStore()?.config?.currency }}</div>
                                             </td>
                                             <td class="py-3 text-right text-slate-800 font-bold whitespace-nowrap align-top">
                                                 {{ (item.price_at_sale * item.quantity) | currency:storeService.currentStore()?.config?.currency }}
                                             </td>
                                         </tr>
                                     }
                                 </tbody>
                             </table>

                             <!-- Divider -->
                             <div class="w-full border-t border-dashed border-slate-300 my-4"></div>

                             <!-- Totals -->
                             <div class="space-y-2 mb-2">
                                  <div class="flex justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                                      <span>Sub Total</span>
                                      <span>{{ (tx.total_amount - (tx.tax_amount || 0)) | currency:storeService.currentStore()?.config?.currency }}</span>
                                  </div>
                                  @if (storeService.currentStore()?.config?.tax_enabled) {
                                      <div class="flex justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                                          <span>Tax</span>
                                          <span>{{ (tx.tax_amount || 0) | currency:storeService.currentStore()?.config?.currency }}</span>
                                      </div>
                                  }
                                  <div class="flex justify-between items-end border-t-2 border-slate-800 pt-3 mt-3">
                                      <span class="font-black text-lg uppercase tracking-wider text-slate-800">Total</span>
                                      <span class="font-black text-3xl text-slate-800 leading-none">{{ tx.total_amount | currency:storeService.currentStore()?.config?.currency }}</span>
                                  </div>
                             </div>
                             
                             <div class="mt-6 text-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                 <span class="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-1">Paid Via</span>
                                 <span class="font-extrabold text-sm text-[var(--primary-color)] uppercase tracking-wider">{{ tx.payment_method }}</span>
                             </div>
                             
                             <div class="mt-6 text-center text-[10px] text-slate-400 font-medium">
                                 Thank you for your business!
                             </div>
                         </div>
                     </div>
                                          <!-- Actions (Outside printable area) -->
                      <div class="bg-slate-50 p-5 border-t border-slate-200 flex flex-col gap-3 shrink-0 rounded-b-2xl z-10 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
                          <div class="flex gap-2">
                              <button (click)="printReceipt()" class="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-800/20 hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                                  <span class="material-symbols-rounded">print</span> Print
                              </button>
                              <button (click)="shareToWhatsApp()" class="flex-1 py-3.5 bg-[#25D366] text-white rounded-xl font-bold shadow-lg shadow-[#25D366]/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2">
                                  <span class="material-symbols-rounded">chat</span> WhatsApp
                              </button>
                          </div>
                          
                          <button (click)="selectedOrder.set(null)" class="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-100 shadow-sm transition-colors cursor-pointer">
                              Done / New Sale
                          </button>
                             @if (tx.metadata?.status !== 'VOID' && tx.total_amount > 0) {
                                  <button (click)="initiateReturn(tx)" class="flex-1 py-3 border border-red-200 text-red-500 bg-red-50 rounded-xl font-bold hover:bg-red-100 transition-colors flex justify-center items-center gap-1 shadow-sm">
                                      <span class="material-symbols-rounded text-base">undo</span> Refund
                                  </button>
                             }
                         </div>
                     </div>
                     
                 </div>
             </div>
          </div>
      }

      <!-- Item Return Selection Modal -->
      @if (showReturnModal()) {
          <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
               <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-red-50 dark:bg-red-900/20 flex justify-between items-center">
                       <div>
                           <h3 class="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                               <span class="material-symbols-rounded">keyboard_return</span>
                               Process Return
                           </h3>
                           <p class="text-xs opacity-70">Select items to refund to customer</p>
                       </div>
                       <button (click)="showReturnModal.set(false)" class="p-1 hover:bg-red-100 dark:hover:bg-red-800 rounded-full"><span class="material-symbols-rounded">close</span></button>
                    </div>
                    
                    <div class="p-4 max-h-[60vh] overflow-y-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="text-left text-xs uppercase opacity-60 border-b border-slate-200 dark:border-slate-700">
                                    <th class="pb-2">Return?</th>
                                    <th class="pb-2">Item</th>
                                    <th class="pb-2 text-right">Refund Qty</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                @for (item of selectedOrderItems(); track item.id) {
                                    <tr>
                                        <td class="py-3 w-10">
                                            <input type="checkbox" 
                                                   [checked]="returnSelection()[item.product_id] > 0"
                                                   (change)="toggleReturnItem(item, $event)"
                                                   class="w-5 h-5 text-red-600 rounded focus:ring-red-500">
                                        </td>
                                        <td class="py-3">
                                            <div class="font-bold">{{ item.product?.name }}</div>
                                            <div class="text-xs opacity-60">Sold for: {{ item.price_at_sale | currency:storeService.currentStore()?.config?.currency }}</div>
                                            <div class="text-xs opacity-60">Qty Sold: {{ item.quantity }}</div>
                                        </td>
                                        <td class="py-3 text-right">
                                            @if(returnSelection()[item.product_id] > 0) {
                                                <div class="flex items-center justify-end gap-2">
                                                    <button (click)="updateReturnQty(item, -1)" class="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-lg">-</button>
                                                    <span class="font-bold w-4 text-center">{{ returnSelection()[item.product_id] }}</span>
                                                    <button (click)="updateReturnQty(item, 1)" class="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-lg">+</button>
                                                </div>
                                            } @else {
                                                <span class="text-xs opacity-40 italic">Not selected</span>
                                            }
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>

                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                        <div class="flex justify-between items-center mb-4">
                            <span class="font-bold">Total Refund Amount:</span>
                            <span class="text-xl font-extrabold text-red-600">{{ calculateRefundTotal() | currency:storeService.currentStore()?.config?.currency }}</span>
                        </div>
                        <button (click)="confirmReturn()" [disabled]="calculateRefundTotal() === 0" class="w-full py-3 bg-red-600 text-white font-bold rounded-lg shadow hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                            Confirm Refund
                        </button>
                    </div>
               </div>
          </div>
      }

      <!-- Variant Options Modal -->
      @if (showVariantsModal()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:hidden">
              <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-[var(--bg-color)] flex justify-between items-center">
                      <h3 class="text-xl font-bold flex items-center gap-2">
                          <span class="material-symbols-rounded text-orange-500">alt_route</span>
                          Alternative Options Available
                      </h3>
                      <button (click)="cancelVariants()" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"><span class="material-symbols-rounded">close</span></button>
                  </div>
                  
                  <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--bg-color)]">
                      <p class="text-sm border-b border-slate-200 dark:border-slate-800 pb-2 mb-2">
                          You selected <strong>{{ selectedMasterForVariants()?.name }}</strong>. There are multiple versions of this part available:
                      </p>

                      <!-- Master Product Option -->
                      @if(selectedMasterForVariants()) {
                      <button (click)="executeAddToCart(selectedMasterForVariants()!)" class="w-full text-left p-4 bg-[var(--card-bg)] border-2 border-slate-200 dark:border-slate-700 hover:border-[var(--primary-color)] rounded-xl shadow-sm transition-all group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div class="flex-1">
                              <div class="flex items-center gap-2 mb-1">
                                  <span class="text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded tracking-widest">Standard / OEM</span>
                                  <div class="font-bold text-lg group-hover:text-[var(--primary-color)] transition-colors line-clamp-1">{{ selectedMasterForVariants()?.name }}</div>
                              </div>
                              <div class="text-xs text-slate-500 font-mono">{{ selectedMasterForVariants()?.barcode || selectedMasterForVariants()?.supplier_sku }}</div>
                          </div>
                          
                          <div class="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6 sm:gap-4 shrink-0 px-2">
                              <div class="flex flex-col items-end">
                                  <span class="font-black text-xl text-[var(--primary-color)] leading-none">{{ selectedMasterForVariants()?.price | currency:storeService.currentStore()?.config?.currency }}</span>
                                  <span class="text-[10px] font-bold mt-1" [class.text-green-500]="(selectedMasterForVariants()?.stock_quantity || 0) > 0" [class.text-red-500]="(selectedMasterForVariants()?.stock_quantity || 0) <= 0">{{ selectedMasterForVariants()?.stock_quantity }} IN STOCK</span>
                              </div>
                              <span class="material-symbols-rounded text-slate-300 group-hover:text-[var(--primary-color)] group-hover:translate-x-1 transition-all">add_circle</span>
                          </div>
                      </button>
                      }

                      <!-- Variant Options -->
                      @for (variant of availableVariants(); track variant.id) {
                          <button (click)="executeAddToCart(variant)" class="w-full text-left p-4 bg-[var(--card-bg)] border-2 border-orange-100 dark:border-orange-900/30 hover:border-orange-400 dark:hover:border-orange-500 rounded-xl shadow-sm transition-all group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
                              <div class="absolute inset-0 bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-900/10 pointer-events-none w-1/3"></div>
                              <div class="flex-1 relative z-10">
                                  <div class="flex items-center gap-2 mb-1">
                                      <span class="text-[10px] font-black uppercase bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded tracking-widest">Alternative</span>
                                      <div class="font-bold text-lg group-hover:text-orange-500 transition-colors line-clamp-1">{{ variant.name }}</div>
                                  </div>
                                  <div class="text-xs text-slate-500 font-mono">{{ variant.barcode || variant.supplier_sku }}</div>
                              </div>
                              
                              <div class="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6 sm:gap-4 shrink-0 px-2 relative z-10">
                                  <div class="flex flex-col items-end">
                                      <span class="font-black text-xl text-orange-600 dark:text-orange-400 leading-none">{{ variant.price | currency:storeService.currentStore()?.config?.currency }}</span>
                                      <span class="text-[10px] font-bold mt-1" [class.text-green-500]="(variant.stock_quantity || 0) > 0" [class.text-red-500]="(variant.stock_quantity || 0) <= 0">{{ variant.stock_quantity }} IN STOCK</span>
                                  </div>
                                  <span class="material-symbols-rounded text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all">add_circle</span>
                              </div>
                          </button>
                      }
                  </div>
              </div>
          </div>
      }

    } @else {
      <div class="h-[calc(100vh-60px)] flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-color)]">
        <div class="w-32 h-32 bg-[var(--card-bg)] rounded-full flex items-center justify-center shadow-lg mb-6">
          <span class="material-symbols-rounded text-6xl text-[var(--primary-color)]">storefront</span>
        </div>
        <h1 class="text-3xl font-bold mb-2">Welcome to OmniPOS!</h1>
        <p class="text-lg opacity-70 mb-8 max-w-md">You haven't created any stores yet. To get started, please go to the Admin Panel and set up your first store.</p>
        <a routerLink="/admin"
            class="px-8 py-4 rounded-xl bg-[var(--primary-color)] text-white font-bold text-lg shadow-lg hover:brightness-110 active:scale-95 transition-all flex justify-center items-center gap-3">
            <span class="material-symbols-rounded">settings_applications</span>
            Go to Admin Panel
        </a>
      </div>
    }
  `
})
export class EposComponent {
    storeService = inject(StoreConfigService);
    supabase = inject(MockSupabaseService);
    dialog = inject(DialogService);
    tenantService = inject(TenantService);

    cart = signal<{ product: Product, quantity: number }[]>([]);
    orderNumber = signal(Math.floor(Math.random() * 1000) + 1000);
    currentTime = signal(new Date());

    // Explicitly typing as Signal<Store[]> to resolve 'unknown' type errors
    allStores: Signal<Store[]> = toSignal(this.supabase.getAllStores(), { initialValue: [] as Store[] });

    // View State
    selectedCategory = signal<string | null>(null);
    isBrowsing = signal(false); // New signal to control view state

    // Search / Scanner State
    searchQuery = signal('');

    // --- NEW: Integrated Payment View State ---
    paymentViewMode = signal<'DEFAULT' | 'CASH' | 'SPLIT'>('DEFAULT');

    // New Payment Logic: String-driven for Numpad
    cashInputStr = signal('');
    // Computed cashTendered derived from string input
    cashTendered = computed(() => {
        const val = parseFloat(this.cashInputStr());
        return isNaN(val) ? 0 : val;
    });

    // Computed for Split Bar Width
    cashSplitPercentage = computed(() => {
        const t = this.total();
        if (t === 0) return 0;
        const p = (this.cashTendered() / t) * 100;
        return Math.min(100, Math.max(0, p));
    });

    // Customer State
    selectedCustomer = signal<Customer | null>(null);
    showCustomerModal = signal(false);
    customerSearchQuery = signal('');

    // Async Search State
    searchedCustomers = signal<Customer[]>([]);
    isSearchingCustomers = signal(false);

    // --- NEW: Order History & Return Signals ---
    showOrderHistoryModal = signal(false);
    orderSearchQuery = signal('');

    // New: Store all recent orders in memory for fast filtering
    allRecentOrders = signal<Transaction[]>([]);
    searchedOrders = signal<Transaction[]>([]);

    selectedOrder = signal<Transaction | null>(null);
    selectedOrderItems = signal<TransactionItem[]>([]);

    // --- PHASE 4 Variants Logic ---
    showVariantsModal = signal(false);
    selectedMasterForVariants = signal<Product | null>(null);
    availableVariants = signal<Product[]>([]);

    // Map of ParentID -> number of variants available
    hasVariantsMap = computed(() => {
        const prods = this.products();
        const map: Record<string, boolean> = {};
        for (const p of prods) {
            if (p.is_variant && p.parent_product_id) {
                map[p.parent_product_id] = true;
            }
        }
        return map;
    });

    // --- PHASE 3: Parked Orders & Serials ---
    parkedOrders = signal<{ id: number, cart: { product: Product, quantity: number }[], customer: Customer | null, total: number, timestamp: Date }[]>([]);
    showParkedOrdersList = signal(false);

    showSerialModal = signal(false);
    serializedItemsToConfigure = signal<{ product: Product, quantity: number, selectedSerials: string[] }[]>([]);
    availableSerialsMap = signal<Record<string, string[]>>({}); // ProductID -> Array of Serial Numbers

    isTransferringFromWarehouse = signal<Record<string, boolean>>({});

    // This holds the transaction we are actively returning from
    transactionToReturn = signal<Transaction | null>(null);
    showReturnModal = signal(false);
    // --- PHASE 4: AI & Insights ---
    showCustomerInsights = signal(false);
    customerHistory = signal<Transaction[]>([]);
    isFetchingHistory = signal(false);

    upsellProducts = computed(() => {
        const cartItems = this.cart();
        if (cartItems.length === 0) return this.products().slice(0, 3); // Default best sellers

        const lastItem = cartItems[cartItems.length - 1];
        return this.products().filter(p =>
            p.category_id === lastItem.product.category_id &&
            !cartItems.some(ci => ci.product.id === p.id) &&
            p.stock_shop > 0
        ).slice(0, 3);
    });

    // Map of ProductID -> Quantity to Return
    returnSelection = signal<Record<string, number>>({});


    private products$ = this.storeService.currentStore$.pipe(
        // Clear cart as a side-effect whenever the store changes
        tap(() => {
            this.cart.set([]);
            this.goHome(); // Reset view state
            this.selectedCustomer.set(null); // Clear customer
        }),
        // Switch to the new products observable for the current store
        switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
    );
    // Explicitly typing as Signal<Product[]> to resolve 'unknown' type errors
    products: Signal<Product[]> = toSignal(this.products$, { initialValue: [] as Product[] });

    private categories$ = this.storeService.currentStore$.pipe(
        switchMap(store => store ? this.supabase.getCategories(store.id) : of([]))
    );
    // Explicitly typing as Signal<Category[]> to resolve 'unknown' type errors
    categories: Signal<Category[]> = toSignal(this.categories$, { initialValue: [] as Category[] });

    // Computed helper to get item counts per category for the UI
    categoryCounts = computed(() => {
        const counts: Record<string, number> = {};
        const prods = this.products();
        prods.forEach(p => {
            if (p.category_id) {
                counts[p.category_id] = (counts[p.category_id] || 0) + 1;
            }
        });
        return counts;
    });

    selectedCategoryName = computed(() => {
        const cat = this.categories().find(c => c.id === this.selectedCategory());
        return cat ? cat.name : 'Unknown';
    });

    topItems = computed(() => {
        return this.products().slice(0, 8); // Fast Access top 8 products
    });

    filteredProducts = computed(() => {
        const all = this.products();
        const catId = this.selectedCategory();
        const query = this.searchQuery().toLowerCase().trim();

        if (query) {
            return all.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.barcode && p.barcode.toLowerCase().includes(query)) ||
                (p.compatible_models && p.compatible_models.some(m => m.toLowerCase().includes(query)))
            );
        }

        if (catId) {
            return all.filter(p => p.category_id === catId);
        }

        return [];
    });

    // Computed Values
    subtotal = computed(() => {
        return this.cart().reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
    });

    tax = computed(() => {
        const store = this.storeService.currentStore();
        if (store?.config?.tax_enabled) {
            return this.subtotal() * (store.config.tax_rate ?? 0);
        }
        return 0;
    });

    total = computed(() => this.subtotal() + this.tax());

    changeDue = computed(() => this.cashTendered() - this.total());

    // Updated Split Logic: driven by cashTendered (from numpad) now
    splitCardAmount = computed(() => Math.max(0, this.total() - this.cashTendered()));

    // Account Payment Validation
    canPayOnAccount = computed(() => {
        const cust = this.selectedCustomer();
        if (!cust || this.cart().length === 0) return false;

        const purchaseAmount = this.total();
        const projectedBalance = (cust.current_balance || 0) - purchaseAmount;
        return projectedBalance >= -(cust.credit_limit || 0);
    });

    constructor() {
        // Update time every minute
        setInterval(() => this.currentTime.set(new Date()), 60000);
    }

    switchStore(event: Event) {
        const select = event.target as HTMLSelectElement;
        this.storeService.loadStore(select.value);
    }

    // --- Navigation Logic ---

    goHome() {
        this.selectedCategory.set(null);
        this.searchQuery.set('');
        this.isBrowsing.set(false);
        this.paymentViewMode.set('DEFAULT');
    }

    // --- Search & Barcode Logic ---

    onSearchEnter() {
        const query = this.searchQuery().trim();
        if (!query) return;

        const exactMatch = this.products().find(p => p.barcode === query);

        if (exactMatch) {
            this.addToCart(exactMatch);
            this.searchQuery.set('');
            this.playBeep();
        }
    }

    // Animation Helper
    isCartPinging = signal(false);

    playBeep() {
        try {
            this.isCartPinging.set(true);
            setTimeout(() => this.isCartPinging.set(false), 300);

            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.frequency.value = 1200;
            osc.type = 'sine';

            gain.gain.value = 0.1;

            osc.start();
            setTimeout(() => {
                osc.stop();
                ctx.close();
            }, 100);
        } catch (e) {
            console.error('Audio beep failed', e);
        }
    }

    animateFlyToCart(event: MouseEvent) {
        const cartIcon = document.getElementById('cart-header-anchor');
        const target = event.currentTarget as HTMLElement;
        if (!cartIcon || !target) return;

        const startRect = target.getBoundingClientRect();
        const endRect = cartIcon.getBoundingClientRect();

        // Create a ghost element for the animation
        const ghost = document.createElement('div');
        ghost.style.position = 'fixed';
        ghost.style.left = `${startRect.left}px`;
        ghost.style.top = `${startRect.top}px`;
        ghost.style.width = `${startRect.width}px`;
        ghost.style.height = `${startRect.height}px`;
        ghost.style.backgroundColor = 'var(--primary-color)';
        ghost.style.borderRadius = '20px';
        ghost.style.opacity = '0.5';
        ghost.style.zIndex = '9999';
        ghost.style.pointerEvents = 'none';
        ghost.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        document.body.appendChild(ghost);

        // Animate frame
        requestAnimationFrame(() => {
            ghost.style.left = `${endRect.left}px`;
            ghost.style.top = `${endRect.top}px`;
            ghost.style.width = '20px';
            ghost.style.height = '20px';
            ghost.style.borderRadius = '50%';
            ghost.style.opacity = '0';
        });

        setTimeout(() => {
            document.body.removeChild(ghost);
        }, 600);
    }


    addToCart(product: Product, event?: MouseEvent) {
        if (event) this.animateFlyToCart(event);

        // Phase 4: Intercept add payload if there are alternatives
        if (!product.is_variant && this.hasVariantsMap()[product.id]) {
            const variants = this.products().filter(p => p.parent_product_id === product.id);
            this.selectedMasterForVariants.set(product);
            this.availableVariants.set(variants);
            this.showVariantsModal.set(true);
            return;
        }

        this.executeAddToCart(product);
    }

    cancelVariants() {
        this.showVariantsModal.set(false);
        this.selectedMasterForVariants.set(null);
        this.availableVariants.set([]);
    }

    executeAddToCart(product: Product) {
        this.showVariantsModal.set(false); // Close it if it was open

        const itemInCart = this.cart().find(i => i.product.id === product.id);
        const currentStock = product.stock_shop; // Use Floor Stock as the gatekeeper for POS
        const cartQty = itemInCart?.quantity ?? 0;

        if (currentStock - cartQty <= 0) {
            this.dialog.alert('Stock Warning', 'No more stock available on the shop floor!');
            return;
        }

        this.cart.update(items => {
            if (itemInCart) {
                return items.map(i =>
                    i.product.id === product.id
                        ? { ...i, quantity: i.quantity + 1 }
                        : i
                );
            } else {
                return [...items, { product, quantity: 1 }];
            }
        });
    }

    updateQuantity(productId: string, delta: number) {
        this.cart.update(items => {
            return items.map(item => {
                if (item.product.id === productId) {
                    const newQty = item.quantity + delta;
                    if (delta > 0 && newQty > item.product.stock_quantity) {
                        this.dialog.alert('Stock Warning', 'Not enough stock!');
                        return item;
                    }
                    return { ...item, quantity: newQty };
                }
                return item;
            }).filter(item => item.quantity > 0);
        });
    }

    clearCart() {
        this.cart.set([]);
        this.paymentViewMode.set('DEFAULT');
    }

    // --- Customer Selection ---

    openCustomerModal() {
        this.customerSearchQuery.set('');
        this.searchedCustomers.set([]);
        this.showCustomerModal.set(true);
    }

    performCustomerSearch() {
        const query = this.customerSearchQuery().trim();
        const currentStore = this.storeService.currentStore();

        if (!currentStore || query.length < 2) {
            this.searchedCustomers.set([]);
            return;
        }

        this.isSearchingCustomers.set(true);

        this.supabase.searchCustomers(currentStore.id, query).subscribe({
            next: (results) => {
                this.searchedCustomers.set(results);
                this.isSearchingCustomers.set(false);
            },
            error: () => this.isSearchingCustomers.set(false)
        });
    }

    toggleInsights() {
        this.showCustomerInsights.set(true);
        const cust = this.selectedCustomer();
        if (cust && this.customerHistory().length === 0) {
            this.fetchCustomerHistory(cust.id);
        }
    }

    fetchCustomerHistory(customerId: string) {
        this.isFetchingHistory.set(true);
        this.supabase.getRecentTransactionsByCustomer(customerId).subscribe({
            next: (txs) => {
                this.customerHistory.set(txs);
                this.isFetchingHistory.set(false);
            },
            error: () => this.isFetchingHistory.set(false)
        });
    }

    selectCustomer(customer: Customer) {
        this.selectedCustomer.set(customer);
        this.showCustomerModal.set(false);
        this.customerHistory.set([]); // Reset history for new customer
        if (this.showCustomerInsights()) {
            this.fetchCustomerHistory(customer.id);
        }
    }

    clearCustomer() {
        this.selectedCustomer.set(null);
        this.customerHistory.set([]);
    }

    // --- PHASE 3: Parked Orders & Serials Logic ---

    parkOrder() {
        if (this.cart().length === 0) return;

        const newParked = {
            id: Math.floor(Math.random() * 900) + 100,
            cart: this.cart(),
            customer: this.selectedCustomer(),
            total: this.total(),
            timestamp: new Date()
        };

        this.parkedOrders.update(p => [...p, newParked]);
        this.clearCart();
        this.selectedCustomer.set(null);
        this.goHome();

        this.dialog.alert('Order Parked', `Reference #${newParked.id} is now on hold.`);
    }

    resumeParkedOrder(order: any) {
        if (this.cart().length > 0) {
            this.dialog.alert('Action Required', 'Please clear the current cart before resuming a parked order.');
            return;
        }

        this.cart.set(order.cart);
        this.selectedCustomer.set(order.customer);
        this.parkedOrders.update(p => p.filter(o => o.id !== order.id));
        this.showParkedOrdersList.set(false);
    }

    requestFromWarehouse(product: Product) {
        const storeId = this.storeService.currentStore()?.id;
        if (!storeId) return;

        this.isTransferringFromWarehouse.update(m => ({ ...m, [product.id]: true }));

        // Simulating a quick-transfer background request
        // In reality, this would call stockManagementService.createQuickTransfer
        setTimeout(() => {
            this.supabase.getProducts(storeId).subscribe(() => {
                this.isTransferringFromWarehouse.update(m => ({ ...m, [product.id]: false }));
                this.dialog.alert('Warehouse Request', `A unit of ${product.name} has been requested from Warehouse to Floor.`);
            });
        }, 1500);
    }

    checkSerialsAndProceed(paymentMethod: PaymentMethod, metadata?: any, payments?: any[]) {
        const serializedItems = this.cart().filter(i => i.product.is_serialized);

        if (serializedItems.length === 0) {
            this.processPayment(paymentMethod, metadata, payments);
            return;
        }

        // Setup serial requirements
        const config = serializedItems.map(i => ({
            product: i.product,
            quantity: i.quantity,
            selectedSerials: new Array(i.quantity).fill('')
        }));

        this.serializedItemsToConfigure.set(config);

        // Fetch available serials for each product
        const storeId = this.storeService.currentStore()?.id;
        if (!storeId) return;

        // In a real app we'd use forkJoin to get all available serials
        const map: Record<string, string[]> = {};
        serializedItems.forEach(item => {
            // Mocking serials for demo: In reality call supabase.getAvailableSerials(storeId, productId)
            map[item.product.id] = [
                `SN-${item.product.id.substring(0, 4)}-991`,
                `SN-${item.product.id.substring(0, 4)}-992`,
                `SN-${item.product.id.substring(0, 4)}-993`,
                `SN-${item.product.id.substring(0, 4)}-994`
            ];
        });
        this.availableSerialsMap.set(map);

        // Store payment context for after serial selection
        this.pendingPaymentContext = { method: paymentMethod, metadata, payments };
        this.showSerialModal.set(true);
    }

    pendingPaymentContext: any = null;

    isSerialAlreadySelected(item: any, sn: string, currentIdx: number): boolean {
        return item.selectedSerials.some((val: string, i: number) => i !== currentIdx && val === sn);
    }

    areAllSerialsAssigned(): boolean {
        return this.serializedItemsToConfigure().every(item =>
            item.selectedSerials.length === item.quantity &&
            item.selectedSerials.every(sn => sn !== '')
        );
    }

    finalCheckoutAfterSerials() {
        const { method, metadata, payments } = this.pendingPaymentContext;

        // Attach serials to metadata
        const serialsMetadata = {
            ...metadata,
            assignedSerials: this.serializedItemsToConfigure().map(i => ({
                productId: i.product.id,
                serials: i.selectedSerials
            }))
        };

        this.showSerialModal.set(false);
        this.processPayment(method, serialsMetadata, payments);
    }

    // --- Payment Handling & Numpad Logic ---

    setPaymentView(mode: 'CASH' | 'SPLIT') {
        this.paymentViewMode.set(mode);
        this.cashInputStr.set(''); // Reset string input
    }

    handleNumpad(key: string) {
        const current = this.cashInputStr();

        if (key === 'backspace') {
            this.cashInputStr.set(current.slice(0, -1));
            return;
        }

        // Prevent multiple decimals
        if (key === '.' && current.includes('.')) return;

        // Prevent leading zeros issues (e.g. 0005)
        if (key === '0' && current === '0') return;

        // Limit decimals to 2 places
        if (current.includes('.')) {
            const [, decimals] = current.split('.');
            if (decimals && decimals.length >= 2) return;
        }

        // If empty and dot is pressed, assume 0.
        if (current === '' && key === '.') {
            this.cashInputStr.set('0.');
            return;
        }

        this.cashInputStr.set(current + key);
    }

    confirmPayment() {
        const mode = this.paymentViewMode();
        if (mode === 'CASH') {
            if (this.changeDue() < 0) return; // Prevent insufficient payment

            this.processPayment('CASH', {
                tendered: this.cashTendered(),
                change: this.changeDue()
            }, [
                { method: 'CASH', amount: this.total() }
            ]);
        } else if (mode === 'SPLIT') {
            const cashAmount = this.cashTendered();
            const cardAmount = this.splitCardAmount();

            this.processPayment('SPLIT', {
                split: {
                    cash: cashAmount,
                    card: cardAmount
                }
            }, [
                { method: 'CASH', amount: cashAmount },
                { method: 'CARD', amount: cardAmount }
            ]);
        }
    }

    processPayment(paymentMethod: PaymentMethod, metadata?: any, payments?: any[]) {
        // Intercept for Serial check if not already coming from Serial Modal
        if (this.showSerialModal() === false && !metadata?.assignedSerials && this.cart().some(i => i.product.is_serialized)) {
            this.checkSerialsAndProceed(paymentMethod, metadata, payments);
            return;
        }

        const currentStore = this.storeService.currentStore();
        const customer = this.selectedCustomer();

        if (!currentStore || this.cart().length === 0) return;

        // Additional Validation for On Account
        if (paymentMethod === 'ON_ACCOUNT' && !this.canPayOnAccount()) {
            this.dialog.alert('Transaction Blocked', 'Credit limit exceeded or no customer selected.');
            return;
        }

        const transactionData: any = {
            store_id: currentStore.id,
            customer_id: customer?.id,
            total_amount: this.total(),
            tax_amount: this.tax(),
            payment_method: paymentMethod,
            metadata: metadata || {}
        };

        // Phase 2: Add multipayment support
        if (payments) {
            transactionData.payments = payments;
        } else if (paymentMethod !== 'SPLIT') {
            transactionData.payments = [{ method: paymentMethod, amount: this.total() }];
        }

        this.supabase.addTransaction(transactionData, this.cart()).subscribe({
            next: (tx) => {
                let msg = `Sale successful! Transaction ID: ${tx.id.substring(0, 8)}`;

                // Audit logging
                this.supabase.logActivity({
                    store_id: currentStore.id,
                    staff_id: 'S1', // Default Manager for demo
                    action: 'SALE',
                    entity_type: 'TRANSACTION',
                    entity_id: tx.id,
                    metadata: { method: paymentMethod, split: !!payments }
                }).subscribe();

                if (paymentMethod === 'ON_ACCOUNT' || (payments && payments.some(p => p.method === 'ON_ACCOUNT'))) {
                    if (customer) {
                        // We rely on the backend/ledger to maintain balance, but update signal for immediate UI feedback
                        this.supabase.getCustomer(customer.id).subscribe(c => this.selectedCustomer.set(c));
                    }
                }

                // Empty cart and reset form after checkout
                this.cart.set([]);
                this.orderNumber.set(Math.floor(Math.random() * 1000) + 1000);
                this.paymentViewMode.set('DEFAULT');
                this.cashInputStr.set('');

                // Refresh products to sync store stock levels immediately
                const store = this.storeService.currentStore();
                if (store) {
                    this.supabase.getProducts(store.id).subscribe();
                }

                this.goHome(); // Reset view to scan-forward for next customer

                // POP OPEN THE EXPERT RECEIPT MODAL IMMEDIATELY FOR PRINTING
                this.selectOrder(tx);
            },
            error: (err) => {
                console.error('Failed to process payment:', err);
                this.dialog.alert('Payment Error', 'There was an error processing the payment.');
            }
        });
    }

    // --- NEW: Order History & Return Logic ---

    openOrderHistory() {
        this.orderSearchQuery.set('');
        this.showOrderHistoryModal.set(true);

        const storeId = this.storeService.currentStore()?.id;
        if (!storeId) return;

        this.supabase.getRecentTransactions(storeId).subscribe({
            next: (txs) => {
                this.allRecentOrders.set(txs);
                this.searchedOrders.set(txs);
            },
            error: (err) => console.error(err)
        });
    }

    performOrderSearch() {
        const query = this.orderSearchQuery().toLowerCase().trim();
        const all = this.allRecentOrders();

        if (!query) {
            this.searchedOrders.set(all);
            return;
        }

        const filtered = all.filter(tx =>
            tx.id.toLowerCase().includes(query) ||
            (tx.customer?.full_name || '').toLowerCase().includes(query) ||
            tx.total_amount.toString().includes(query)
        );
        this.searchedOrders.set(filtered);
    }

    selectOrder(tx: Transaction) {
        this.selectedOrder.set(tx);
        this.selectedOrderItems.set([]);

        this.supabase.getTransactionItems(tx.id).subscribe({
            next: (items) => this.selectedOrderItems.set(items),
            error: (err) => console.error(err)
        });
    }

    shareToWhatsApp() {
        const tx = this.selectedOrder();
        const items = this.selectedOrderItems();
        if (!tx) return;

        let message = `*Receipt from ${this.storeService.currentStore()?.name}*\n`;
        message += `Order: #${tx.id.substring(0, 8)}\n`;
        message += `Date: ${new Date(tx.created_at).toLocaleString()}\n\n`;

        items.forEach(i => {
            message += `- ${i.product?.name}: ${i.quantity} x ${i.price_at_sale}\n`;
        });

        message += `\n*Total: ${tx.total_amount}*`;
        if (tx.customer?.full_name) {
            message += `\nCustomer: ${tx.customer.full_name}`;
        }

        const encoded = encodeURIComponent(message);
        const url = `https://wa.me/${tx.customer?.phone || ''}?text=${encoded}`;
        window.open(url, '_blank');
    }

    printReceipt() {
        const printContent = document.getElementById('receipt-printable');
        if (!printContent) return;

        // Create a hidden iframe
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'absolute';
        printFrame.style.top = '-1000px';
        printFrame.style.left = '-1000px';
        printFrame.style.width = '80mm'; // Standard thermal size
        printFrame.style.height = '100px';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow?.document;
        if (!frameDoc) return;

        frameDoc.write(`
            <html>
                <head>
                    <title>Print Receipt</title>
                    <style>
                        /* Thermal Printer Optimization */
                        @page { margin: 0; }
                        body {
                            font-family: 'Courier New', Courier, monospace;
                            width: 80mm;
                            margin: 0;
                            padding: 8px;
                            color: black;
                            background: white;
                            font-size: 12px;
                        }
                        
                        /* Mimic Tailwind Utility Classes used in the template */
                        .text-center { text-align: center; }
                        .text-2xl { font-size: 1.5rem; }
                        .text-sm { font-size: 0.875rem; }
                        .text-xs { font-size: 0.75rem; }
                        .text-lg { font-size: 1.125rem; }
                        .text-xl { font-size: 1.25rem; }
                        .font-bold, .font-extrabold { font-weight: bold; }
                        .uppercase { text-transform: uppercase; }
                        .tracking-wide { letter-spacing: 0.05em; }
                        .opacity-60 { color: #555; }
                        .mb-6 { margin-bottom: 1.5rem; }
                        .mb-4 { margin-bottom: 1rem; }
                        .mt-2 { margin-top: 0.5rem; }
                        .mt-1 { margin-top: 0.25rem; }
                        .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
                        .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
                        .pt-1 { padding-top: 0.25rem; }
                        .px-4 { padding-left: 1rem; padding-right: 1rem; }
                        .pr-2 { padding-right: 0.5rem; }
                        
                        /* Thermal printers need high contrast borders */
                        .border-t { border-top: 1px dashed black; }
                        .border-b { border-bottom: 1px dashed black; }
                        .border-slate-300 { border-color: black; }
                        
                        .border-2 { border: 2px solid black; padding: 2px; }
                        .border-red-500, .border-blue-500 { border-color: black; }
                        .text-red-500, .text-blue-500 { color: black; }
                        
                        .w-full { width: 100%; }
                        
                        /* Tables */
                        table { border-collapse: collapse; width: 100%; }
                        th { text-align: left; font-weight: bold; border-bottom: 1px solid black; padding-bottom: 4px; }
                        th.text-right, td.text-right { text-align: right; }
                        td { padding-top: 4px; padding-bottom: 4px; vertical-align: top; }
                        
                        /* Flexbox Shims for generic printing */
                        .flex { display: flex; }
                        .justify-between { justify-content: space-between; }
                        .space-y-1 > * + * { margin-top: 0.25rem; }
                        
                        /* Reset rotations and radiuses for thermal print legibility */
                        .-rotate-6 { transform: none; }
                        .rounded { border-radius: 0; }
                        .inline-block { display: inline-block; }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                </body>
            </html>
        `);
        frameDoc.close();

        // Let the browser parse and render the simple iframe layout
        setTimeout(() => {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();

            // Clean up iframe after print dialog is closed or cancelled
            setTimeout(() => {
                if (document.body.contains(printFrame)) {
                    document.body.removeChild(printFrame);
                }
            }, 1000);
        }, 200);
    }

    initiateReturn(tx: Transaction) {
        const initialMap: Record<string, number> = {};
        this.selectedOrderItems().forEach(item => {
            initialMap[item.product_id] = 0;
        });
        this.returnSelection.set(initialMap);

        this.transactionToReturn.set(tx);
        this.selectedOrder.set(null);
        this.showReturnModal.set(true);
    }

    toggleReturnItem(item: TransactionItem, event: any) {
        const checked = event.target.checked;
        const currentMap = { ...this.returnSelection() };

        if (checked) {
            currentMap[item.product_id] = item.quantity;
        } else {
            currentMap[item.product_id] = 0;
        }
        this.returnSelection.set(currentMap);
    }

    updateReturnQty(item: TransactionItem, delta: number) {
        const currentMap = { ...this.returnSelection() };
        const currentQty = currentMap[item.product_id] || 0;
        const newQty = currentQty + delta;

        if (newQty >= 0 && newQty <= item.quantity) {
            currentMap[item.product_id] = newQty;
            this.returnSelection.set(currentMap);
        }
    }

    calculateRefundTotal() {
        let total = 0;
        const map = this.returnSelection();
        const items = this.selectedOrderItems();

        items.forEach(item => {
            const qty = map[item.product_id] || 0;
            total += (qty * item.price_at_sale);
        });
        return total;
    }

    async confirmReturn() {
        const map = this.returnSelection();
        const itemsToReturn: { product_id: string, quantity: number, price: number }[] = [];
        const originalItems = this.selectedOrderItems();
        const tx = this.transactionToReturn();

        if (!tx) return;

        originalItems.forEach(item => {
            const qty = map[item.product_id] || 0;
            if (qty > 0) {
                itemsToReturn.push({
                    product_id: item.product_id,
                    quantity: qty,
                    price: item.price_at_sale
                });
            }
        });

        if (itemsToReturn.length === 0) return;

        const confirmed = await this.dialog.confirm(
            'Confirm Refund',
            `Process refund of ${this.calculateRefundTotal().toFixed(2)}?\nStock will be restored.`
        );

        if (confirmed) {
            this.supabase.processReturnTransaction(tx, itemsToReturn, tx.payment_method).subscribe({
                next: (returnTx) => {
                    this.dialog.alert('Success', `Return Processed. ID: ${returnTx.id.substring(0, 8)}`);
                    this.showReturnModal.set(false);
                    this.performOrderSearch();
                },
                error: (err) => {
                    this.dialog.alert('Error', 'Failed to process return.');
                    console.error(err);
                }
            });
        }
    }
}