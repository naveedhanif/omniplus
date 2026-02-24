import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup, FormArray, FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { MockSupabaseService, PurchaseOrder, POStatus, Supplier, Store, Product } from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, DatePipe],
  template: `
    <div class="flex gap-0 h-[calc(100vh-120px)] bg-[var(--card-bg)] rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden relative">

      <!-- ── Receive PO Dialog Overlay (Global) ─────────────────────────── -->
      <div *ngIf="showReceiveDialog()" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <!-- Overlay content... (this will be filled in subsequent steps) -->
      </div>

      <!-- ══════════════════════════════════════════════════════════
           COLUMN 2 — PO List
      ══════════════════════════════════════════════════════════ -->
      <div class="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        
        <!-- Header: Search & Filter & New -->
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-[var(--primary-color)]">shopping_cart</span>
              Orders
              <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full text-[10px] font-black text-slate-600 dark:text-slate-400">{{ filteredPOs().length }}</span>
            </h2>
            <button (click)="startNewPO()" 
                    class="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary-color)] text-white text-xs font-bold rounded-lg shadow hover:brightness-110 active:scale-95 transition-all">
              <span class="material-symbols-rounded text-sm">add</span>
              New
            </button>
          </div>


          <!-- Filters Strip -->
          <div class="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1 overflow-x-auto no-scrollbar">
            <button *ngFor="let filter of ['ALL', 'DRAFT', 'SENT', 'ORDERED', 'RECEIVED']"
                    (click)="statusFilter.set(filter)"
                    [class.bg-white]="statusFilter() === filter"
                    [class.dark:bg-slate-600]="statusFilter() === filter"
                    [class.shadow-sm]="statusFilter() === filter"
                    [class.text-slate-900]="statusFilter() === filter"
                    class="flex-1 px-2 py-1.5 text-[10px] font-black rounded-md transition-all whitespace-nowrap">
              {{ filter }}
            </button>
          </div>

          <!-- Search Input -->
          <div class="relative">
            <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
            <input type="text" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" 
                   placeholder="Search ID or supplier..."
                   class="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 transition-all">
          </div>
        </div>

        <!-- Scrollable PO cards -->
        <div class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
           @for (po of filteredPOs(); track po.id) {
             <button type="button" (click)="viewPODetail(po)"
                     class="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all group border-l-4"
                     [ngClass]="{
                        'bg-blue-50 dark:bg-blue-900/10 border-l-[var(--primary-color)]': selectedPO()?.id === po.id,
                        'border-l-transparent': selectedPO()?.id !== po.id
                     }">
                
                <div class="flex justify-between items-start mb-1">
                  <span class="text-xs font-mono font-bold text-slate-400">#{{ po.id.substring(0,8) }}</span>
                  <span class="text-[10px] font-black px-2 py-0.5 rounded-full" [ngClass]="getStatusClass(po.status)">
                    {{ po.status }}
                  </span>
                </div>
                
                <div class="font-bold text-slate-800 dark:text-slate-100 truncate mb-1">{{ po.supplier?.name || 'Unknown' }}</div>
                
                <div class="flex items-center justify-between mt-2">
                  <span class="text-xs font-black text-slate-600 dark:text-slate-400">{{ po.total_amount | currency: storeService.currency() }}</span>
                  <span class="text-[10px] text-slate-400 font-medium">
                    {{ po.expected_arrival ? (po.expected_arrival | date:'MMM d') : (po.created_at | date:'MMM d') }}
                  </span>
                </div>
             </button>
           } @empty {
             <div class="flex flex-col items-center py-20 text-slate-400 text-sm gap-2 opacity-50 px-6 text-center">
                <span class="material-symbols-rounded text-4xl">inventory_2</span>
                <span>No orders match filters</span>
             </div>
           }
        </div>

        <!-- Footer: Mini Stats -->
        <div class="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-1 text-[10px]">
           <div class="flex justify-between">
             <span class="text-slate-400 uppercase font-black">Open Amount</span>
             <span class="font-bold text-blue-600">{{ calculateOpenValue() | currency: storeService.currency() }}</span>
           </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           COLUMN 3 — Detail View / Form Area
      ══════════════════════════════════════════════════════════ -->
      <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">

        <!-- Case A: DETAIL VIEW -->
        @if ((viewState() === 'DETAIL' || viewState() === 'LIST') && selectedPO()) {
          @if (selectedPO(); as po) {
            <div class="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
              
              <!-- Detail Header -->
              <div class="px-8 py-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
                 <div>
                   <div class="flex items-center gap-3 mb-1">
                     <h1 class="text-2xl font-black font-mono">PO-{{ po.id.substring(0,8) }}</h1>
                     <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm" [ngClass]="getStatusClass(po.status)">
                        {{ po.status }}
                     </span>
                   </div>
                   <p class="text-slate-500 font-medium flex items-center gap-2">
                     <span class="material-symbols-rounded text-sm">local_shipping</span>
                     {{ po.supplier?.name || 'Unknown Supplier' }}
                     <span class="text-slate-300">•</span>
                     Ordered {{ po.created_at | date:'mediumDate' }}
                   </p>
                 </div>
                  <div class="flex items-center gap-2 flex-wrap justify-end">
                    <!-- Workflow Transitions -->
                    @if (po.status === 'DRAFT') {
                      <button (click)="startEditPO(po)" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs rounded-lg transition-all">
                        Edit Draft
                      </button>
                      <button (click)="advanceStatus(po, 'SENT')" class="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
                        <span class="material-symbols-rounded text-sm">send</span> Mark as Sent
                      </button>
                    }
                    @if (po.status === 'SENT') {
                        <button (click)="advanceStatus(po, 'ORDERED')" class="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
                            <span class="material-symbols-rounded text-sm">inventory_2</span> Mark as Ordered
                        </button>
                    }
                    @if (['ORDERED', 'PARTIAL'].includes(po.status)) {
                        <button (click)="openReceiveDialog(po)" class="px-4 py-2 bg-green-600 text-white font-bold text-xs rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
                            <span class="material-symbols-rounded text-sm">move_to_inbox</span> Receive Order
                        </button>
                    }

                    <!-- Destructive Actions -->
                    @if (!['RECEIVED', 'CANCELLED'].includes(po.status)) {
                        <button (click)="cancelPO(po)" class="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-bold text-xs rounded-lg transition-all flex items-center gap-2 border border-red-100">
                            <span class="material-symbols-rounded text-sm">cancel</span> Cancel
                        </button>
                    }

                    <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>

                    <button (click)="printPO(po)" 
                            class="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-all"
                            title="Print Purchase Order">
                      <span class="material-symbols-rounded text-lg">print</span>
                    </button>
                  </div>
              </div>

              <!-- Premium KPI Tiles Area -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 py-4 flex-shrink-0">
                <!-- Line Items-->
                <div class="rounded-xl p-4 transition-all" [ngStyle]="kpiStyles.items">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">inventory_2</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Line Items</span>
                  </div>
                  <div class="text-xl font-black text-white">{{ selectedPOItems()?.length || 0 }}</div>
                </div>

                <!-- Total Value -->
                <div class="rounded-xl p-4 transition-all" [ngStyle]="kpiStyles.value">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">payments</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Total Value</span>
                  </div>
                  <div class="text-xl font-black text-white">{{ po.total_amount | currency: storeService.currency() }}</div>
                </div>

                <!-- Expected Delivery -->
                <div class="rounded-xl p-4 transition-all" [ngStyle]="kpiStyles.delivery">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">local_shipping</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Expected Delivery</span>
                  </div>
                  <div class="text-xl font-black text-white">{{ po.expected_arrival ? (po.expected_arrival | date:'MMM d') : 'Not Set' }}</div>
                </div>
              </div>

              <!-- Content Area Scrollable -->
              <div class="flex-1 overflow-auto px-6 pb-6">
                 <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div class="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                      <div class="px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 border-[var(--primary-color)] text-[var(--primary-color)]">Line Items</div>
                    </div>
                    
                    <div class="p-0">
                       @if (isLoadingItems()) {
                          <div class="p-10 flex flex-col items-center justify-center gap-2 opacity-50">
                             <span class="material-symbols-rounded animate-spin">progress_activity</span>
                             <span class="text-xs">Fetching items...</span>
                          </div>
                       } @else {
                          <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 font-black">
                              <tr>
                                <th class="px-6 py-4">PRODUCT</th>
                                <th class="px-4 py-4 text-center">ORDERED</th>
                                <th class="px-4 py-4 text-center">RECEIVED</th>
                                <th class="px-4 py-4 text-right">UNIT COST</th>
                                <th class="px-6 py-4 text-right">TOTAL</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                               @for (item of selectedPOItems(); track item.id) {
                                 <tr>
                                    <td class="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{{ getProductName(item.product_id) }}</td>
                                    <td class="px-4 py-4 text-center">
                                       <span class="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded font-black text-slate-700 dark:text-slate-300">{{ item.quantity_ordered }}</span>
                                    </td>
                                    <td class="px-4 py-4 text-center">
                                       <span class="px-2 py-1 rounded font-black shadow-sm" 
                                             [ngClass]="item.quantity_received >= item.quantity_ordered ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'">
                                         {{ item.quantity_received || 0 }}
                                       </span>
                                    </td>
                                    <td class="px-4 py-4 text-right opacity-60">{{ item.unit_cost | currency: storeService.currency() }}</td>
                                    <td class="px-6 py-4 text-right font-black">{{ (item.quantity_ordered * item.unit_cost) | currency: storeService.currency() }}</td>
                                 </tr>
                               }
                            </tbody>
                          </table>
                       }
                    </div>

                    <!-- Order Footer / Notes -->
                    <div class="p-6 bg-slate-50 dark:bg-slate-900/20 border-t border-slate-200 dark:border-slate-700">
                       <div class="flex flex-col md:flex-row justify-between gap-6">
                          <div class="flex-1">
                             <label class="block text-[10px] font-black uppercase text-slate-400 mb-2">Internal Notes</label>
                             <div class="text-sm text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                                {{ po.notes || 'No notes added to this order.' }}
                              </div>
                          </div>
                          <div class="w-full md:w-64 space-y-2">
                             <div class="flex justify-between text-xs opacity-60 font-bold">
                                <span>Subtotal</span>
                                <span>{{ po.total_amount | currency: storeService.currency() }}</span>
                             </div>
                             <div class="h-px bg-slate-200 dark:bg-slate-700"></div>
                             <div class="flex justify-between text-lg font-black text-[var(--primary-color)]">
                                <span>Grand Total</span>
                                <span>{{ po.total_amount | currency: storeService.currency() }}</span>
                             </div>
                          </div>
                       </div>
                     </div>
                  </div>
               </div>
            </div>
          }
        }

        <!-- Case B: CREATE / EDIT FORM VIEW -->
        @if (viewState() === 'CREATE' || viewState() === 'EDIT') {
          <div class="flex-1 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">

            <div class="px-8 py-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-between items-center flex-shrink-0">
                <div>
                    <h2 class="text-2xl font-black">
                        {{ editMode() ? 'Edit Order' : 'New Purchase Order' }}
                    </h2>
                    @if (editMode() && editingPoId()) {
                        <p class="text-xs text-slate-500 font-medium mt-1">PO #{{ editingPoId()!.substring(0, 8) }} &mdash; Modification Mode</p>
                    } @else {
                        <p class="text-xs text-slate-500 font-medium mt-1">Drafting a new procurement request</p>
                    }
                </div>
                <button (click)="discardForm()" class="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all">
                  Discard
                </button>
            </div>


            <div class="flex-1 overflow-auto p-8">
                <form [formGroup]="poForm" class="max-w-4xl space-y-8">

                    <!-- Header Inputs: Supplier & Dates -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-2">
                            <label class="block text-xs font-black uppercase tracking-widest text-slate-400">Supplier Selection</label>
                            <select formControlName="supplier_id" (change)="onSupplierChange()" 
                                    class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-4 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                                <option [ngValue]="null">Choose a Supplier...</option>
                                @for (supplier of suppliers(); track supplier.id) {
                                    <option [value]="supplier.id">{{ supplier.name }}</option>
                                }
                            </select>
                            
                            @if (lastSupplierPO()) {
                              <button type="button" (click)="repeatLastOrder()" [disabled]="isRepeatLoading()"
                                      class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[11px] font-black rounded-lg hover:bg-blue-100 transition-all">
                                <span class="material-symbols-rounded text-xs animate-spin" *ngIf="isRepeatLoading()">progress_activity</span>
                                <span class="material-symbols-rounded text-xs" *ngIf="!isRepeatLoading()">history</span>
                                Repeat Last Order ({{ lastSupplierPO()!.total_amount | currency: storeService.currency() }})
                              </button>
                            }
                        </div>
                        <div class="space-y-2">
                            <label class="block text-xs font-black uppercase tracking-widest text-slate-400">Expected Delivery</label>
                            <input type="date" formControlName="expected_arrival"
                                   class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-4 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                            <p class="text-[10px] text-slate-400 font-medium">Auto-calculated based on supplier lead time.</p>
                        </div>
                    </div>

                    <!-- Catalogue Grid for Selection -->
                    <div class="space-y-4 pt-4">
                      <div class="flex items-center justify-between">
                        <h3 class="font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <span class="material-symbols-rounded text-[var(--primary-color)]">inventory_2</span>
                          Product Catalogue
                        </h3>
                        <div class="relative w-64" *ngIf="_selectedSupplierId()">
                          <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                          <input type="text" [value]="catalogSearchQuery()" (input)="catalogSearchQuery.set($any($event.target).value)"
                                 placeholder="Search items..."
                                 class="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-transparent rounded-lg text-xs outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 transition-all">
                        </div>
                      </div>

                      @if (!_selectedSupplierId()) {
                        <div class="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl opacity-50">
                          <span class="material-symbols-rounded text-4xl mb-2">local_shipping</span>
                          <span class="text-sm font-bold uppercase tracking-widest">Select a supplier to start</span>
                        </div>
                      } @else {
                        <!-- restockSuggestions banner -->
                        @if (restockSuggestions().length > 0) {
                          <div class="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl animate-in fade-in slide-in-from-top-2">
                            <div class="flex items-center gap-3">
                              <span class="material-symbols-rounded text-amber-600">notification_important</span>
                              <span class="text-xs font-bold text-amber-800 dark:text-amber-300">
                                {{ restockSuggestions().length }} items need restocking.
                              </span>
                            </div>
                            <button type="button" (click)="preloadLowStockItems()"
                                    class="px-4 py-2 bg-amber-100 dark:bg-amber-800 text-amber-900 dark:text-amber-200 text-xs font-black rounded-lg hover:bg-amber-200 transition-all">
                              Pre-fill All
                            </button>
                          </div>
                        }
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
                          @for (product of catalogueProducts(); track product.id) {
                            <div class="p-4 bg-white dark:bg-slate-800 rounded-xl border-2 transition-all group relative cursor-pointer hover:shadow-md"
                                 (click)="addProductToOrder(product)"
                                 [ngClass]="{
                                    'border-[var(--primary-color)] bg-blue-50/30': isInOrder(product.id),
                                    'border-transparent': !isInOrder(product.id)
                                 }">
                              
                              <div *ngIf="isInOrder(product.id)" class="absolute -top-2 -right-2 w-6 h-6 bg-[var(--primary-color)] text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in border-2 border-white dark:border-slate-800">
                                <span class="material-symbols-rounded text-sm">check</span>
                              </div>

                              <div class="font-bold text-slate-800 dark:text-slate-100 text-sm truncate mb-0.5">{{ product.name }}</div>
                              <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5" [class.text-red-500]="(product.stock_quantity || 0) <= 0">
                                <span class="material-symbols-rounded text-xs">{{ (product.stock_quantity || 0) <= 0 ? 'block' : 'inventory' }}</span>
                                Stock: {{ product.stock_quantity || 0 }}
                              </div>

                              <div class="flex items-center gap-2 mt-auto" (click)="$event.stopPropagation()">
                                <div class="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden flex-1 h-9 border border-slate-200 dark:border-slate-600">
                                  <button type="button" (click)="setCardQty(product.id, getCardQty(product.id)-1)" class="flex-1 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-bold text-slate-500">&minus;</button>
                                  <span class="px-2 text-xs font-black text-slate-700 dark:text-slate-200">{{ getCardQty(product.id) }}</span>
                                  <button type="button" (click)="setCardQty(product.id, getCardQty(product.id)+1)" class="flex-1 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-bold text-slate-500">&plus;</button>
                                </div>
                                <button type="button" (click)="addProductToOrder(product)"
                                        class="h-9 w-9 flex items-center justify-center bg-[var(--primary-color)] text-white rounded-lg hover:brightness-110 active:scale-90 transition-all shadow-sm">
                                  <span class="material-symbols-rounded text-sm">add_shopping_cart</span>
                                </button>
                              </div>
                            </div>
                          }
                        </div>
                      }
                    </div>

                    <!-- Items Summary List -->
                    @if (items.length > 0) {
                      <div class="space-y-4">
                        <h3 class="font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <span class="material-symbols-rounded text-[var(--primary-color)]">receipt_long</span>
                          Order Breakdown
                          <span class="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-[10px] font-black rounded-full text-slate-500">{{ items.length }} SKU{{ items.length !== 1 ? 's' : '' }}</span>
                        </h3>
                        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                          <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 dark:bg-slate-800/50 font-black text-slate-400 text-[10px] uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                <th class="px-6 py-4">Product Detail</th>
                                <th class="px-4 py-4 text-center">Quantity</th>
                                <th class="px-4 py-4 text-right">Unit Price</th>
                                <th class="px-4 py-4 text-right">Total</th>
                                <th class="px-6 py-4"></th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-700" formArrayName="items">
                              @for (item of items.controls; track item.get('product_id')?.value; let i = $index) {
                                <tr [formGroupName]="i" class="group hover:bg-slate-50 dark:hover:bg-slate-900/10 transition-colors">
                                  <td class="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{{ getProductName(item.get('product_id')?.value) }}</td>
                                  <td class="px-4 py-4">
                                    <input type="number" formControlName="quantity" min="1"
                                           class="w-16 mx-auto block bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg p-2 text-center font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                                  </td>
                                  <td class="px-4 py-4 text-right">
                                    <div class="flex items-center justify-end gap-1 font-bold">
                                      <span class="text-[10px] opacity-30">{{ storeService.currency() }}</span>
                                      <input type="number" formControlName="cost" min="0" step="0.01"
                                             class="w-24 bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg p-2 text-right outline-none focus:border-[var(--primary-color)] transition-all">
                                    </div>
                                  </td>
                                  <td class="px-4 py-4 text-right font-black text-slate-900 dark:text-slate-100">
                                    {{ (item.get('quantity')?.value || 0) * (item.get('cost')?.value || 0) | currency: storeService.currency() }}
                                  </td>
                                  <td class="px-6 py-4 text-right">
                                    <button type="button" (click)="removeItem(i)" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                                      <span class="material-symbols-rounded text-base">delete_sweep</span>
                                    </button>
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    }

                    <!-- Notes -->
                    <div class="space-y-2">
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400">Notes & Special Instructions</label>
                        <textarea formControlName="notes" rows="3"
                                  placeholder="Type any instructions for the supplier or internal reminders here..."
                                  class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 text-sm font-medium focus:border-[var(--primary-color)] outline-none transition-all resize-none shadow-sm"></textarea>
                    </div>

                    <!-- Order Total Summary -->
                    <div class="flex justify-end pt-6 border-t border-slate-200 dark:border-slate-700">
                      <div class="w-80 p-6 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                         <div class="flex justify-between text-slate-500 font-bold text-xs uppercase tracking-widest">
                           <span>Estimated Subtotal</span>
                           <span>{{ calculateTotal() | currency: storeService.currency() }}</span>
                         </div>
                         <div class="h-px bg-slate-200 dark:bg-slate-700 my-2"></div>
                         <div class="flex justify-between items-center">
                           <span class="font-black text-slate-800 dark:text-slate-200 text-sm">TOTAL PAYABLE</span>
                           <span class="text-2xl font-black text-[var(--primary-color)]">{{ calculateTotal() | currency: storeService.currency() }}</span>
                         </div>
                      </div>
                    </div>

                </form>
            </div>

            <!-- Form Footer Actions -->
            <div class="px-8 py-6 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-4 flex-shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
                <button type="button" (click)="discardForm()"
                        class="px-6 py-3 text-sm font-black text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors uppercase tracking-widest">
                  Cancel
                </button>
                <button type="button" (click)="savePO()"
                        [disabled]="poForm.invalid || items.length === 0 || isSaving()"
                        class="px-10 py-3 bg-[var(--primary-color)] text-white text-sm font-black rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 uppercase tracking-widest">
                    <span class="material-symbols-rounded text-sm animate-spin" *ngIf="isSaving()">progress_activity</span>
                    <span class="material-symbols-rounded text-sm" *ngIf="!isSaving()">save</span>
                    {{ isSaving() ? 'Processing...' : (editMode() ? 'Update Order' : 'Commit Order') }}
                </button>
            </div>
          </div>
        }

        @if (viewState() === 'LIST' && !selectedPO() && !editMode()) {
           <div class="flex-1 flex flex-col items-center justify-center text-slate-400 gap-6 animate-in fade-in zoom-in duration-500 max-w-sm mx-auto text-center px-10">
              <div class="w-40 h-40 rounded-[3.5rem] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none mb-4">
                <span class="material-symbols-rounded text-7xl opacity-20 text-[var(--primary-color)]">fact_check</span>
              </div>
              <div>
                <div class="text-2xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter">Procurement Hub</div>
                <p class="text-sm mt-3 text-slate-500 dark:text-slate-400 leading-relaxed font-medium">Select a purchase order from the side list to review its status, or start a new requisition to replenish stock levels across your organization.</p>
              </div>
              <button (click)="startNewPO()" class="mt-4 px-10 py-4 bg-[var(--primary-color)] text-white text-xs font-black rounded-2xl shadow-2xl hover:brightness-110 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">
                 <span class="material-symbols-rounded text-sm">add_circle</span>
                 New Procurement Request
              </button>
           </div>
        }

      </div>
    </div>
  `
})
export class PurchaseOrderComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  fb = inject(FormBuilder);

  /** Static gradient palettes for the KPI tiles */
  readonly kpiStyles = {
    items: {
      background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
      'box-shadow': '0 8px 20px rgba(139, 92, 246, 0.35)'
    },
    value: {
      background: 'linear-gradient(135deg, #10b981, #0d9488)',
      'box-shadow': '0 8px 20px rgba(16, 185, 129, 0.35)'
    },
    delivery: {
      background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
      'box-shadow': '0 8px 20px rgba(14, 165, 233, 0.35)'
    }
  };

  // ── View State ──────────────────────────────────────────────────────────
  viewState = signal<'LIST' | 'CREATE' | 'EDIT' | 'DETAIL'>('LIST');
  selectedPO = signal<PurchaseOrder | null>(null);
  currentDate = new Date();
  isSaving = signal(false);
  isReceiving = signal(false);

  // ── Edit Mode State ──────────────────────────────────────────────────────
  editMode = signal(false);
  editingPoId = signal<string | null>(null);

  // ── List Filtering ───────────────────────────────────────────────────────
  statusFilter = signal<string>('ALL');
  searchQuery = signal<string>('');

  // ── Receive Dialog State ─────────────────────────────────────────────────
  showReceiveDialog = signal(false);
  selectedPOToReceive = signal<PurchaseOrder | null>(null);
  receiveItems = signal<any[]>([]);
  receiveError = signal<string | null>(null);

  // ── P2: Duplicate product warning ────────────────────────────────────────
  duplicateWarning = signal<string | null>(null);

  // ── Detail / Selection State ─────────────────────────────────────────────
  selectedPOItems = signal<any[]>([]);
  isLoadingItems = signal(false);

  // ── P3: Reorder suggestions ───────────────────────────────────────────────
  showSuggestions = signal(true); // Open by default so users notice it

  // ── Data Signals ─────────────────────────────────────────────────────────
  store = this.storeService.currentStore;

  purchaseOrders = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap(store => store ? this.supabase.getPurchaseOrders(store.id) : of([]))
    ),
    { initialValue: [] }
  );

  filteredPOs = computed(() => {
    let pos = this.purchaseOrders();
    if (this.statusFilter() !== 'ALL') {
      pos = pos.filter(po => po.status === this.statusFilter());
    }
    const query = (this.searchQuery() || '').toLowerCase().trim();
    if (query) {
      pos = pos.filter(po =>
        (po.id || '').toLowerCase().includes(query) ||
        (po.supplier?.name || '').toLowerCase().includes(query)
      );
    }
    return pos;
  });

  suppliers = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap(store => store ? this.supabase.getSuppliers(store.id) : of([]))
    ),
    { initialValue: [] }
  );

  products = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
    ),
    { initialValue: [] }
  );

  /** P3: Products at or below the low-stock threshold, sorted most-critical first */
  lowStockProducts = computed(() =>
    this.products()
      .filter(p => (p.stock_quantity ?? Infinity) <= 5)
      .sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0))
  );

  /** P3: Count of products that are completely out of stock */
  outOfStockCount = computed(() =>
    this.lowStockProducts().filter(p => (p.stock_quantity ?? 0) === 0).length
  );

  /** P3: Count of products that are low but not yet zero */
  criticallyLowCount = computed(() =>
    this.lowStockProducts().filter(p => (p.stock_quantity ?? 0) > 0).length
  );

  // filteredProductsForSupplier is defined after poForm so it can reactively bind to supplier_id valueChanges

  // ── Form ─────────────────────────────────────────────────────────────────
  poForm: FormGroup = this.fb.group({
    supplier_id: [null, Validators.required],
    expected_arrival: [null],   // P1: now a real editable field
    notes: [null],              // P1: new field
    items: this.fb.array([])
  });

  get items() {
    return this.poForm.get('items') as FormArray;
  }

  // ── Reactive supplier_id signal (must come AFTER poForm is initialised) ────
  private _selectedSupplierId = toSignal(
    this.poForm.get('supplier_id')!.valueChanges,
    { initialValue: null as string | null }
  );

  // ── Catalogue UI state ───────────────────────────────────────────────────
  catalogSearchQuery = signal<string>('');
  /** Tracks the desired qty on each product card before adding to the order */
  cardQties = signal<Record<string, number>>({});

  /** Products belonging to the selected supplier (or all if none tagged). Fully reactive. */
  filteredProductsForSupplier = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return this.products();
    const supplierProducts = this.products().filter(p => p.supplier_id === supplierId);
    return supplierProducts.length > 0 ? supplierProducts : this.products();
  });

  /** True when the selected supplier has at least one product tagged to them */
  hasSupplierProducts = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return true;
    return this.products().some(p => p.supplier_id === supplierId);
  });

  /** Supplier's products further filtered by the catalogue search bar */
  catalogueProducts = computed(() => {
    const q = this.catalogSearchQuery().toLowerCase().trim();
    const base = this.filteredProductsForSupplier();
    if (!q) return base;
    return base.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  });

  /**
   * Sprint 2: Products from the selected supplier that are at or below their
   * reorder_point AND have a reorder_quantity set. These are the candidates for
   * one-click pre-fill. Only surfaces when a supplier is selected.
   */
  restockSuggestions = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return [] as Product[];
    return this.filteredProductsForSupplier().filter(p =>
      (p.stock_quantity ?? Infinity) <= (p.reorder_point ?? 0) &&
      (p.reorder_quantity ?? 0) > 0
    );
  });

  /** Total units that would be ordered if pre-fill runs */
  restockTotalUnits = computed(() =>
    this.restockSuggestions().reduce((sum, p) => sum + (p.reorder_quantity ?? 0), 0)
  );

  /**
   * Sprint 5: The most recent non-cancelled PO from the selected supplier.
   * Used to power the "Repeat Last Order" button.
   */
  lastSupplierPO = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return null;
    const supplierPOs = this.purchaseOrders()
      .filter(po => po.supplier_id === supplierId && po.status !== 'CANCELLED')
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    return supplierPOs[0] ?? null;
  });

  /** True while repeatLastOrder() is fetching items from the service */
  isRepeatLoading = signal(false);

  /**
   * Sprint 4: Supplier Price Memory.
   * Caches the items from the last supplier PO so we can read historical
   * unit costs without an extra user-triggered network call.
   * Cleared immediately when the supplier changes.
   */
  lastPOItems = signal<any[]>([]);

  private _priceMemoryEffect = effect(() => {
    const po = this.lastSupplierPO();
    if (!po) {
      this.lastPOItems.set([]);
      return;
    }
    // Load items for the last PO silently in the background
    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => this.lastPOItems.set(items),
      error: () => this.lastPOItems.set([])
    });
  }, { allowSignalWrites: true });

  // ── Status helper ─────────────────────────────────────────────────────────
  getStatusClass(status: POStatus | string): Record<string, boolean> {
    return {
      'bg-slate-100 text-slate-600': status === 'DRAFT',
      'bg-blue-100 text-blue-800': status === 'SENT',
      'bg-purple-100 text-purple-800': status === 'ORDERED',
      'bg-orange-100 text-orange-800': status === 'PARTIAL',
      'bg-green-100 text-green-800': status === 'RECEIVED',
      'bg-red-100 text-red-800': status === 'CANCELLED',
    };
  }

  // ── Create / Edit helpers ─────────────────────────────────────────────────

  startNewPO() {
    this.editMode.set(false);
    this.editingPoId.set(null);
    this.catalogSearchQuery.set('');
    this.cardQties.set({});
    this.poForm.reset({ supplier_id: null, expected_arrival: null, notes: null });
    this.items.clear();
    this.viewState.set('CREATE');
  }

  startEditPO(po: PurchaseOrder) {
    if (po.status !== 'DRAFT') return; // Guard: only DRAFT POs can be edited

    this.editMode.set(true);
    this.editingPoId.set(po.id);
    this.isSaving.set(false);

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        this.poForm.reset();
        this.items.clear();

        // Restore header values
        this.poForm.patchValue({
          supplier_id: po.supplier_id,
          expected_arrival: po.expected_arrival ?? null,
          notes: po.notes ?? null
        });

        // Re-build items FormArray from existing PO items
        items.forEach(item => {
          this.items.push(this.fb.group({
            product_id: [item.product_id, Validators.required],
            quantity: [item.quantity_ordered, [Validators.required, Validators.min(1)]],
            cost: [item.unit_cost, [Validators.required, Validators.min(0)]]
          }));
        });

        this.viewState.set('EDIT');
      },
      error: (err) => console.error('Failed to load PO for editing', err)
    });
  }

  discardForm() {
    this.editMode.set(false);
    this.editingPoId.set(null);
    this.viewState.set('LIST');
  }

  addItem() {
    this.items.push(this.fb.group({
      product_id: [null, Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      cost: [0, [Validators.required, Validators.min(0)]]
    }));
  }

  removeItem(index: number) {
    this.items.removeAt(index);
  }

  /** P1: When a supplier is selected, auto-fill expected_arrival + reset catalogue state */
  onSupplierChange() {
    const supplierId = this.poForm.get('supplier_id')?.value;
    // Reset catalogue state whenever supplier changes
    this.catalogSearchQuery.set('');
    this.cardQties.set({});
    this.items.clear(); // Clear existing order items when supplier changes
    if (!supplierId) return;
    const supplier = this.suppliers().find(s => s.id === supplierId);
    if (supplier?.lead_time_days) {
      const arrivalDate = new Date();
      arrivalDate.setDate(arrivalDate.getDate() + supplier.lead_time_days);
      this.poForm.patchValue({
        expected_arrival: arrivalDate.toISOString().split('T')[0]
      });
    }
  }

  // ── Catalogue Grid helpers ────────────────────────────────────────────────

  /** Returns the qty shown on a product card's stepper (default 1) */
  getCardQty(productId: string): number {
    return this.cardQties()[productId] ?? 1;
  }

  /** Updates the card stepper qty, clamping to a minimum of 1 */
  setCardQty(productId: string, qty: number) {
    this.cardQties.update(q => ({ ...q, [productId]: Math.max(1, Number(qty) || 1) }));
  }

  /** True if the product already has a row in the order */
  isInOrder(productId: string): boolean {
    return this.items.controls.some(c => c.get('product_id')?.value === productId);
  }

  /** Returns the ordered quantity for a product already in the FormArray */
  getOrderQty(productId: string): number {
    const ctrl = this.items.controls.find(c => c.get('product_id')?.value === productId);
    return ctrl ? (Number(ctrl.get('quantity')?.value) || 0) : 0;
  }

  /**
   * Adds a product to the order using the card's stepper qty.
   * If the product is already in the order, increments its qty instead.
   */
  /** Sprint 4: Returns the last known supplier-specific unit cost, or null if unknown */
  getHistoricalCost(productId: string): number | null {
    const item = this.lastPOItems().find(i => i.product_id === productId);
    return item != null ? item.unit_cost : null;
  }

  addProductToOrder(product: Product) {
    const qty = this.getCardQty(product.id);
    // Sprint 4: prefer supplier's historical price over catalogue cost_price
    const historicalCost = this.getHistoricalCost(product.id);
    const cost = historicalCost ?? product.cost_price ?? 0;
    const existing = this.items.controls.find(c => c.get('product_id')?.value === product.id);
    if (existing) {
      const currentQty = Number(existing.get('quantity')?.value) || 0;
      existing.patchValue({ quantity: currentQty + qty });
    } else {
      this.items.push(this.fb.group({
        product_id: [product.id, Validators.required],
        quantity: [qty, [Validators.required, Validators.min(1)]],
        cost: [cost, [Validators.required, Validators.min(0)]]
      }));
    }
  }

  /** Removes a product from the order by its product_id */
  removeFromOrder(productId: string) {
    const idx = this.items.controls.findIndex(c => c.get('product_id')?.value === productId);
    if (idx !== -1) this.items.removeAt(idx);
  }

  /**
   * Sprint 2: One-click restock pre-fill.
   * Adds all restockSuggestions to the FormArray using each product's
   * reorder_quantity as the qty and cost_price as the unit cost.
   * Products already in the order are skipped (not double-added).
   */
  preloadLowStockItems() {
    const suggestions = this.restockSuggestions();
    suggestions.forEach(product => {
      const alreadyIn = this.items.controls.some(
        c => c.get('product_id')?.value === product.id
      );
      if (!alreadyIn) {
        // Sprint 4: use supplier's historical price if available
        const historicalCost = this.getHistoricalCost(product.id);
        const cost = historicalCost ?? product.cost_price ?? 0;
        this.items.push(this.fb.group({
          product_id: [product.id, Validators.required],
          quantity: [product.reorder_quantity ?? 1, [Validators.required, Validators.min(1)]],
          cost: [cost, [Validators.required, Validators.min(0)]]
        }));
      }
    });
  }

  /**
   * Sprint 5: Repeat Last Order.
   * Loads all items from the supplier's most recent PO and pre-populates
   * the FormArray with the same products, quantities, and unit costs.
   * Products already in the order are skipped to avoid duplication.
   */
  repeatLastOrder() {
    const lastPO = this.lastSupplierPO();
    if (!lastPO) return;

    this.isRepeatLoading.set(true);
    this.supabase.getPurchaseOrderItems(lastPO.id).subscribe({
      next: (items) => {
        items.forEach(item => {
          const alreadyIn = this.items.controls.some(
            c => c.get('product_id')?.value === item.product_id
          );
          if (!alreadyIn) {
            this.items.push(this.fb.group({
              product_id: [item.product_id, Validators.required],
              quantity: [item.quantity_ordered, [Validators.required, Validators.min(1)]],
              cost: [item.unit_cost, [Validators.required, Validators.min(0)]]
            }));
          }
        });
        this.isRepeatLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load last PO items:', err);
        this.isRepeatLoading.set(false);
      }
    });
  }

  onProductSelect(index: number) {
    const control = this.items.at(index);
    const productId = control.get('product_id')?.value;
    if (!productId) return;

    // P2: Duplicate guard — check if this product already exists in another row
    const duplicateIndex = this.items.controls.findIndex(
      (c, i) => i !== index && c.get('product_id')?.value === productId
    );

    if (duplicateIndex !== -1) {
      // Auto-merge: add 1 to the existing row's quantity and delete the duplicate row
      const existingControl = this.items.at(duplicateIndex);
      const existingQty = Number(existingControl.get('quantity')?.value) || 0;
      existingControl.patchValue({ quantity: existingQty + 1 });
      this.items.removeAt(index);

      const productName = this.getProductName(productId);
      this.duplicateWarning.set(`"${productName}" was already in the list — quantities merged.`);
      // Auto-clear the warning after 5 seconds
      setTimeout(() => this.duplicateWarning.set(null), 5000);
      return;
    }

    // Normal path: auto-fill the cost price from the product catalogue
    const product = this.products().find(p => p.id === productId);
    if (product) {
      const costPrice = product.cost_price ?? 0;
      control.patchValue({ cost: costPrice });
    }
  }

  /**
   * Returns true when a product is selected on a line item but its cost is $0,
   * indicating no cost_price is on file in the product catalogue.
   * Used by the template to show the amber "no cost on file" hint.
   */
  getItemCostMissing(index: number): boolean {
    const control = this.items.at(index);
    const hasProduct = !!(control.get('product_id')?.value);
    const cost = Number(control.get('cost')?.value ?? 0);
    return hasProduct && cost === 0;
  }

  calculateTotal(): number {
    return this.items.controls.reduce((acc, control) => {
      const qty = control.get('quantity')?.value || 0;
      const cost = control.get('cost')?.value || 0;
      return acc + (qty * cost);
    }, 0);
  }

  savePO() {
    if (this.poForm.invalid) return;

    const storeId = this.store()?.id;
    if (!storeId) return;

    this.isSaving.set(true);
    const formVal = this.poForm.value;

    const poItems = formVal.items.map((item: any) => ({
      product_id: item.product_id,
      quantity_ordered: item.quantity,
      unit_cost: item.cost
    }));

    const totalAmount = this.calculateTotal();

    if (this.editMode() && this.editingPoId()) {
      // ── P1: UPDATE existing DRAFT PO ────────────────────────────────
      const updates: Partial<PurchaseOrder> = {
        supplier_id: formVal.supplier_id,
        total_amount: totalAmount,
        expected_arrival: formVal.expected_arrival || null,
        notes: formVal.notes || null
      };
      this.supabase.updatePurchaseOrder(this.editingPoId()!, updates, poItems).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.editMode.set(false);
          this.editingPoId.set(null);
          this.viewState.set('LIST');
        },
        error: (err) => {
          console.error('Failed to update PO', err);
          this.isSaving.set(false);
        }
      });

    } else {
      // ── CREATE new PO ────────────────────────────────────────────────
      const poData: Partial<PurchaseOrder> = {
        store_id: storeId,
        supplier_id: formVal.supplier_id,
        status: 'DRAFT',
        total_amount: totalAmount,
        expected_arrival: formVal.expected_arrival ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: formVal.notes || null
      };
      this.supabase.createPurchaseOrder(poData as any, poItems).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.viewState.set('LIST');
        },
        error: (err) => {
          console.error('Failed to create PO', err);
          this.isSaving.set(false);
        }
      });
    }
  }

  // ── P1: Status Lifecycle ──────────────────────────────────────────────────

  advanceStatus(po: PurchaseOrder, newStatus: POStatus) {
    this.supabase.updatePOStatus(po.id, newStatus).subscribe({
      next: () => {
        // Update the detail view immediately if open
        if (this.selectedPO()?.id === po.id) {
          this.selectedPO.set({ ...po, status: newStatus });
        }
        // List auto-updates via BehaviorSubject (P0 fix)
      },
      error: (err) => console.error(`Failed to advance PO to ${newStatus}`, err)
    });
  }

  cancelPO(po: PurchaseOrder) {
    if (!confirm(`Cancel Purchase Order #${po.id.substring(0, 8)}?\n\nThis will mark the order as cancelled and cannot be undone.`)) return;
    this.advanceStatus(po, 'CANCELLED');
  }

  // ── Receive Dialog ────────────────────────────────────────────────────────

  openReceiveDialog(po: PurchaseOrder) {
    this.selectedPOToReceive.set(po);
    this.isReceiving.set(true);

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        const dialogItems = items.map(item => ({
          ...item,
          receiving_now: (item.quantity_ordered - (item.quantity_received || 0)) > 0
            ? (item.quantity_ordered - (item.quantity_received || 0))
            : 0,
          serial_numbers_input: ''
        }));
        this.receiveItems.set(dialogItems);
        this.isReceiving.set(false);
        this.showReceiveDialog.set(true);
      },
      error: (err) => {
        console.error('Failed to fetch PO items for receiving', err);
        this.isReceiving.set(false);
      }
    });
  }

  closeReceiveDialog() {
    this.showReceiveDialog.set(false);
    this.selectedPOToReceive.set(null);
    this.receiveItems.set([]);
    this.receiveError.set(null);
  }

  hasValidReceiveQuantities(): boolean {
    const items = this.receiveItems();
    const hasReceiving = items.some(item => item.receiving_now > 0);
    if (!hasReceiving) return false;
    for (const item of items) {
      if (item.receiving_now > 0 && this.isProductSerialized(item.product_id)) {
        const serials = (item.serial_numbers_input || '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (serials.length !== item.receiving_now) return false;
      }
    }
    return true;
  }

  submitReceivePO() {
    const po = this.selectedPOToReceive();
    if (!po) return;

    const itemsToReceive = this.receiveItems()
      .filter(item => item.receiving_now > 0)
      .map(item => {
        const serials = this.isProductSerialized(item.product_id)
          ? (item.serial_numbers_input || '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
          : undefined;
        return {
          item_id: item.id,
          product_id: item.product_id,
          received_amount: item.receiving_now,
          unit_cost: item.unit_cost,
          serial_numbers: serials
        };
      });

    if (itemsToReceive.length === 0) return;

    // P2: Overage confirmation gate — require explicit acknowledgment before
    // accepting more stock than was originally ordered
    const overageItems = this.receiveItems().filter(item =>
      item.receiving_now > 0 &&
      item.receiving_now > (item.quantity_ordered - (item.quantity_received || 0))
    );
    if (overageItems.length > 0) {
      const names = overageItems.map(i => this.getProductName(i.product_id)).join(', ');
      const confirmed = confirm(
        `Overage detected on: ${names}\n\n` +
        `You are receiving more units than originally ordered.\n` +
        `This may indicate a billing discrepancy with your supplier.\n\n` +
        `Continue anyway?`
      );
      if (!confirmed) return;
    }

    this.isReceiving.set(true);
    this.receiveError.set(null);
    this.supabase.receivePO(po.id, itemsToReceive).subscribe({
      next: (result) => {
        if (this.selectedPO()?.id === po.id) {
          this.supabase.getPurchaseOrderItems(po.id).subscribe(items => {
            this.selectedPO.set({ ...po, status: result.newStatus as any, items });
          });
        }
        this.isReceiving.set(false);
        this.closeReceiveDialog();
      },
      error: (err) => {
        console.error('Failed to receive PO', err);
        this.isReceiving.set(false);
        this.receiveError.set(
          typeof err?.message === 'string'
            ? `Receipt failed: ${err.message}`
            : 'An unexpected error occurred. Please try again.'
        );
      }
    });
  }

  viewPODetail(po: PurchaseOrder) {
    this.selectedPO.set(po);
    this.viewState.set('DETAIL');
    this.isLoadingItems.set(true);
    this.selectedPOItems.set([]);

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        this.selectedPOItems.set(items);
        this.selectedPO.set({ ...po, items });
        this.isLoadingItems.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch PO items', err);
        this.isLoadingItems.set(false);
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getProductName(productId: string): string {
    return this.products().find(p => p.id === productId)?.name || 'Unknown Product';
  }

  getSupplierName(supplierId: string | null | undefined): string {
    if (!supplierId) return 'No supplier set';
    return this.suppliers().find(s => s.id === supplierId)?.name || 'Unknown Supplier';
  }

  /** P3: One-click reorder — pre-fills the PO form from a low-stock product */
  quickCreatePO(product: Product) {
    this.startNewPO(); // Resets form and switches to CREATE view

    // Pre-fill supplier if the product has one configured
    if (product.supplier_id) {
      this.poForm.patchValue({ supplier_id: product.supplier_id });
      this.onSupplierChange(); // Triggers lead-time auto-fill
    }

    // Pre-fill the first item row with this product and its cost price
    if (this.items.length > 0) {
      this.items.at(0).patchValue({
        product_id: product.id,
        quantity: 10, // Sensible default — user can adjust
        cost: (product as any).cost_price || 0
      });
    }
  }

  isProductSerialized(productId: string): boolean {
    return this.products().find(p => p.id === productId)?.is_serialized || false;
  }

  getValidSerialCount(input: string | undefined | null): number {
    if (!input) return 0;
    return input.split(',').filter(s => s.trim().length > 0).length;
  }
  // ── P2: Calculate Open Value ───────────────────────────────────────────
  calculateOpenValue(): number {
    return this.purchaseOrders()
      .filter(po => ['DRAFT', 'SENT', 'ORDERED', 'PARTIAL'].includes(po.status))
      .reduce((sum, po) => sum + (po.total_amount || 0), 0);
  }
}
