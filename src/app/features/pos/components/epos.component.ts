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
    <style>
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      .enactor-shadow { box-shadow: 0 0 40px rgba(0,0,0,0.1); }
      .enactor-btn { @apply border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 transition-all font-bold text-[10px] uppercase tracking-wider h-14; }
      .enactor-btn-black { @apply bg-black text-white hover:bg-slate-800 active:bg-black border-none; }
      .enactor-numpad-btn { @apply bg-slate-900 text-white hover:bg-slate-800 active:bg-black font-black text-lg h-14 rounded-lg flex items-center justify-center transition-all; }
    </style>

    @if (allStores().length > 0) {
      <div class="h-screen flex flex-col overflow-hidden bg-[#F2F4F7] text-slate-900 font-sans selection:bg-indigo-100">
        
        <!-- 1. Enactor-Style Top Navigation Bar -->
        <nav class="h-20 bg-black text-white px-2 flex items-center justify-between shrink-0 shadow-2xl relative z-50">
          <div class="flex items-center gap-2 pl-4">
             <div class="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span class="material-symbols-rounded text-2xl">point_of_sale</span>
             </div>
             <div class="leading-none">
                <span class="text-xl font-black tracking-tighter">omni<span class="text-indigo-400">POS</span></span>
                <p class="text-[8px] opacity-50 font-bold uppercase tracking-widest mt-0.5">{{ storeService.currentStore()?.name }}</p>
             </div>
          </div>

          <div class="flex-1 flex justify-center gap-1">
             <button (click)="goHome()" class="flex flex-col items-center justify-center w-20 h-20 hover:bg-white/10 transition-colors group">
                <span class="material-symbols-rounded text-2xl group-active:scale-90 transition-transform">home</span>
                <span class="text-[9px] font-black uppercase mt-1 tracking-widest">Home</span>
             </button>
             <button (click)="leftPanelMode.set('BAG')" [ngClass]="{ 'bg-white/10': leftPanelMode() === 'BAG' }" class="flex flex-col items-center justify-center w-20 h-20 hover:bg-white/10 transition-colors group border-b-4" [class.border-indigo-500]="leftPanelMode() === 'BAG'" [class.border-transparent]="leftPanelMode() !== 'BAG'">
                <span class="material-symbols-rounded text-2xl group-active:scale-90 transition-transform">shopping_basket</span>
                <span class="text-[9px] font-black uppercase mt-1 tracking-widest">Sell</span>
             </button>
             <button (click)="leftPanelMode.set('PRODUCTS')" [ngClass]="{ 'bg-white/10': leftPanelMode() === 'PRODUCTS' }" class="flex flex-col items-center justify-center w-20 h-20 hover:bg-white/10 transition-colors group border-b-4" [class.border-indigo-500]="leftPanelMode() === 'PRODUCTS'" [class.border-transparent]="leftPanelMode() !== 'PRODUCTS'">
                <span class="material-symbols-rounded text-2xl group-active:scale-90 transition-transform">inventory_2</span>
                <span class="text-[9px] font-black uppercase mt-1 tracking-widest">Products</span>
             </button>
             <button (click)="leftPanelMode.set('LEDGER')" [ngClass]="{ 'bg-white/10': leftPanelMode() === 'LEDGER' }" class="flex flex-col items-center justify-center w-20 h-20 hover:bg-white/10 transition-colors group border-b-4" [class.border-indigo-500]="leftPanelMode() === 'LEDGER'" [class.border-transparent]="leftPanelMode() !== 'LEDGER'">
                <span class="material-symbols-rounded text-2xl group-active:scale-90 transition-transform">groups</span>
                <span class="text-[9px] font-black uppercase mt-1 tracking-widest">CRM</span>
             </button>
             <button (click)="openOrderHistory()" class="flex flex-col items-center justify-center w-20 h-20 hover:bg-white/10 transition-colors group">
                <span class="material-symbols-rounded text-2xl group-active:scale-90 transition-transform">history_edu</span>
                <span class="text-[9px] font-black uppercase mt-1 tracking-widest">Admin</span>
             </button>
          </div>

          <div class="flex items-center gap-6 pr-6">
             <div class="text-right hidden xl:block">
                <p class="text-[10px] font-black uppercase tracking-widest text-indigo-400">{{ currentTime() | date: 'dd MMM yyyy' }}</p>
                <p class="text-xl font-mono tracking-tighter">{{ currentTime() | date: 'HH:mm:ss' }}</p>
             </div>
             <button class="flex flex-col items-center justify-center w-20 h-20 hover:bg-red-500/10 text-red-400 transition-colors">
                <span class="material-symbols-rounded text-2xl">logout</span>
                <span class="text-[9px] font-black uppercase mt-1 tracking-widest">Log Out</span>
             </button>
          </div>
        </nav>

        <!-- 2. Main Terminal Body -->
        <div class="flex-1 flex overflow-hidden p-3 gap-3">
           
           <!-- LEFT PANEL: YOUR SHOPPING BAG / LEDGER -->
           <div class="flex-[3] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col animate-in slide-in-from-left duration-500">
              
              <!-- Content Header -->
              <div class="h-20 border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
                 <h2 class="text-2xl font-black text-slate-500 uppercase tracking-tighter">
                    {{ leftPanelMode() === 'BAG' ? 'Your Shopping Bag' : leftPanelMode() === 'LEDGER' ? 'Customer Account Ledger' : 'Product Inventory' }}
                 </h2>
                 
                 <div class="flex items-center gap-4">
                   <!-- Unified Search Bar -->
                   <div class="relative group">
                      <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                         {{ leftPanelMode() === 'LEDGER' ? 'person_search' : 'search' }}
                      </span>
                      <input 
                        type="text" 
                        [ngModel]="leftPanelMode() === 'LEDGER' ? customerSearchQuery() : searchQuery()"
                        (ngModelChange)="leftPanelMode() === 'LEDGER' ? updateCustomerSearch($event) : searchQuery.set($event)"
                        (keyup.enter)="leftPanelMode() === 'PRODUCTS' || leftPanelMode() === 'BAG' ? onSearchEnter() : null"
                        [placeholder]="leftPanelMode() === 'LEDGER' ? 'Search Customer...' : 'Quick Search Item...'" 
                        class="pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 w-64 outline-none transition-all focus:bg-white focus:shadow-inner"
                        autofocus>
                   </div>
                   @if (showCustomerDropdown() && filteredCustomers().length > 0 && leftPanelMode() === 'LEDGER') {
                      <div class="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-[100]">
                         @for (customer of filteredCustomers(); track customer.id) {
                            <button (click)="selectCustomer(customer)" class="w-full text-left p-3 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-none">
                               <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">{{ customer.full_name?.charAt(0) }}</div>
                               <div>
                                  <div class="text-[10px] font-black uppercase">{{ customer.full_name }}</div>
                                  <div class="text-[9px] text-slate-400 font-mono">{{ customer.phone }}</div>
                               </div>
                            </button>
                         }
                      </div>
                   }
                 </div>
              </div>

              <!-- Content Area (Bag or Ledger) -->
              <div class="flex-1 overflow-y-auto no-scrollbar relative">
                 @if (leftPanelMode() === 'BAG') {
                    <table class="w-full border-collapse">
                       <thead class="bg-slate-50 sticky top-0 z-10 border-b border-slate-100 text-slate-400">
                          <tr class="text-[10px] font-black uppercase tracking-widest">
                             <th class="py-4 pl-8 text-left">Item</th>
                             <th class="py-4 text-center">Qty</th>
                             <th class="py-4 text-right">Price</th>
                             <th class="py-4 text-center w-20">Edit</th>
                             <th class="py-4 pr-8 text-right w-20">Remove</th>
                          </tr>
                       </thead>
                       <tbody class="divide-y divide-slate-50">
                          @if (cart().length === 0) {
                             <tr>
                                <td colspan="5" class="py-32 text-center opacity-20">
                                   <span class="material-symbols-rounded text-8xl block mb-4">barcode_reader</span>
                                   <p class="text-xl font-black uppercase tracking-[0.2em]">Ready to Sell</p>
                                </td>
                             </tr>
                          }
                          @for (item of cart(); track item.product.id) {
                             <tr class="hover:bg-indigo-50/30 transition-colors animate-in fade-in slide-in-from-top-4">
                                <td class="py-6 pl-8">
                                   <div class="flex items-center gap-4">
                                      <div class="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-slate-300 relative overflow-hidden">
                                         @if (item.product.image_url) {
                                            <img [src]="item.product.image_url" class="absolute inset-0 w-full h-full object-cover">
                                         } @else {
                                            <span class="material-symbols-rounded text-3xl">image</span>
                                         }
                                      </div>
                                      <div>
                                         <p class="text-sm font-black text-slate-900 mb-1 leading-none">{{ item.product.name }}</p>
                                         <p class="text-[10px] font-mono text-slate-400 tracking-wider">SKU: {{ item.product.barcode }}</p>
                                      </div>
                                   </div>
                                </td>
                                <td class="py-6 text-center">
                                   <div class="inline-flex flex-col items-center">
                                      <button (click)="updateQuantity(item, 1)" class="w-8 h-8 rounded-t-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><span class="material-symbols-rounded text-sm">expand_less</span></button>
                                      <div class="w-8 h-10 border-x border-slate-100 flex items-center justify-center bg-white font-black text-sm">{{ item.quantity }}</div>
                                      <button (click)="updateQuantity(item, -1)" class="w-8 h-8 rounded-b-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center disabled:opacity-30" [disabled]="item.quantity <= 1"><span class="material-symbols-rounded text-sm">expand_more</span></button>
                                   </div>
                                </td>
                                <td class="py-6 text-right font-black text-slate-900 font-mono text-base">
                                   {{ (item.product.price * item.quantity) | currency: storeService.currentStore()?.config?.currency }}
                                </td>
                                <td class="py-6 text-center">
                                   <button class="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 transition-all">
                                      <span class="material-symbols-rounded text-lg">edit</span>
                                   </button>
                                </td>
                                <td class="py-6 pr-8 text-right">
                                   <button (click)="updateQuantity(item, -item.quantity)" class="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white active:scale-95 transition-all">
                                      <span class="material-symbols-rounded text-lg">close</span>
                                   </button>
                                </td>
                             </tr>
                          }
                       </tbody>
                    </table>
                 } @else if (leftPanelMode() === 'PRODUCTS') {
                    <!-- PRODUCTS BROWSER -->
                    <div class="p-6 h-full flex flex-col animate-in fade-in zoom-in duration-300">
                       <div class="flex gap-2 pb-6 overflow-x-auto no-scrollbar shrink-0">
                          <button (click)="selectedCategory.set(null)" [class.bg-slate-900]="!selectedCategory()" [class.text-white]="!selectedCategory()" class="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:border-indigo-500 transition-all whitespace-nowrap">All Items</button>
                          @for (cat of categories(); track cat.id) {
                             <button (click)="selectedCategory.set(cat.id)" [class.bg-slate-900]="selectedCategory() === cat.id" [class.text-white]="selectedCategory() === cat.id" class="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:border-indigo-500 transition-all whitespace-nowrap">
                                {{ cat.name }}
                             </button>
                          }
                       </div>
                       
                       <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-8">
                          @for (product of filteredProducts(); track product.id) {
                             <button (click)="addToCart(product)" class="p-2 bg-white border border-slate-100 rounded-2xl hover:border-indigo-500 hover:shadow-xl hover:translate-y-[-2px] active:translate-y-0 transition-all flex flex-col group relative overflow-hidden">
                                <div class="w-full aspect-square bg-slate-50 rounded-xl mb-3 flex items-center justify-center text-slate-200 relative overflow-hidden shadow-inner">
                                   @if (product.image_url) {
                                      <img [src]="product.image_url" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                                   } @else {
                                      <span class="material-symbols-rounded text-4xl">inventory_2</span>
                                   }
                                   <div class="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors"></div>
                                </div>
                                <div class="text-left">
                                   <h4 class="text-[11px] font-black text-slate-900 uppercase leading-tight mb-1 line-clamp-2 h-8">{{ product.name }}</h4>
                                   <p class="text-[13px] font-black text-indigo-600 font-mono">{{ product.price | currency: storeService.currentStore()?.config?.currency }}</p>
                                </div>
                                <div class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-indigo-600 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all border border-slate-100">
                                   <span class="material-symbols-rounded text-sm">add</span>
                                </div>
                             </button>
                          }
                       </div>
                    </div>
                 } @else if (leftPanelMode() === 'LEDGER') {
                    <!-- LEDGER VIEW -->
                    <div class="p-8 animate-in zoom-in-95 duration-300">
                       @if (!sharedState.selectedCustomer()) {
                          <div class="py-32 text-center opacity-20">
                             <span class="material-symbols-rounded text-8xl block mb-4">person_off</span>
                             <p class="text-xl font-black uppercase tracking-[0.2em]">Select Customer to View Ledger</p>
                          </div>
                       } @else {
                          <div class="flex items-center justify-between mb-8 pb-8 border-b border-slate-100">
                             <div>
                                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Account Summary</p>
                                <h3 class="text-3xl font-black italic">{{ sharedState.selectedCustomer()?.full_name }}</h3>
                             </div>
                             <div class="text-right">
                                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Closing Balance</p>
                                <div class="text-4xl font-black font-mono tracking-tighter" [class.text-red-500]="ledgerBalance() < 0" [class.text-emerald-500]="ledgerBalance() >= 0">
                                   {{ Math.abs(ledgerBalance()) | currency: storeService.currentStore()?.config?.currency }}
                                   <span class="text-xs ml-1">{{ ledgerBalance() < 0 ? 'DR' : 'CR' }}</span>
                                </div>
                             </div>
                          </div>

                          <table class="w-full border-collapse rounded-3xl border border-slate-100 overflow-hidden shadow-sm bg-white">
                             <thead class="bg-slate-900 text-white">
                                <tr class="text-[9px] font-black uppercase tracking-[0.2em]">
                                   <th class="p-4 text-left">Voucher</th>
                                   <th class="p-4 text-left">Description</th>
                                   <th class="p-4 text-right">Debit (+)</th>
                                   <th class="p-4 text-right">Credit (-)</th>
                                   <th class="p-4 text-right">Balance</th>
                                </tr>
                             </thead>
                             <tbody class="text-[11px] font-bold font-mono divide-y divide-slate-50">
                                @for (entry of ledgerEntries(); track entry.id) {
                                   <tr class="hover:bg-slate-50">
                                      <td class="p-4 text-indigo-600 underline">#{{ entry.id.slice(0, 8) }}</td>
                                      <td class="p-4 text-slate-500">{{ entry.notes || entry.type }}</td>
                                      <td class="p-4 text-right text-red-500">{{ entry.debit | number:'1.2-2' }}</td>
                                      <td class="p-4 text-right text-emerald-500">{{ entry.credit | number:'1.2-2' }}</td>
                                      <td class="p-4 text-right" [class.text-red-500]="entry.running_balance < 0" [class.text-emerald-500]="entry.running_balance >= 0">
                                         {{ Math.abs(entry.running_balance) | number:'1.2-2' }} {{ entry.running_balance < 0 ? 'DR' : 'CR' }}
                                      </td>
                                   </tr>
                                }
                             </tbody>
                          </table>
                       }
                    </div>
                 }
              </div>

              <!-- Terminal Function Grid (Enactor Grid) -->
              <div class="h-40 bg-slate-50 border-t border-slate-100 p-3 shrink-0 grid grid-cols-4 gap-2">
                 <button (click)="leftPanelMode.set('BAG')" class="enactor-btn" [class.enactor-btn-black]="leftPanelMode() === 'BAG'">Sell Item</button>
                 <button (click)="applyGlobalDiscount()" class="enactor-btn enactor-btn-black">Discounts</button>
                 <button (click)="returnMode.set(!returnMode())" class="enactor-btn" [class.bg-red-600]="returnMode()" [class.text-white]="returnMode()" [class.enactor-btn-black]="!returnMode()">{{ returnMode() ? 'Cancel Return' : 'Returns' }}</button>
                 <button (click)="voidTransaction()" class="enactor-btn enactor-btn-black">Void Sale</button>
                 <button (click)="leftPanelMode.set('PRODUCTS')" class="enactor-btn border-2 border-slate-900 bg-white" [class.bg-slate-900]="leftPanelMode() === 'PRODUCTS'" [class.text-white]="leftPanelMode() === 'PRODUCTS'">Inventory Grid</button>
                 <button (click)="leftPanelMode.set('LEDGER')" class="enactor-btn border-2 border-indigo-600 bg-white text-indigo-600" [class.bg-indigo-600]="leftPanelMode() === 'LEDGER'" [class.text-white]="leftPanelMode() === 'LEDGER'">A/C Statement</button>
                 <button (click)="openCheckoutModal()" class="enactor-btn">Check Out</button>
                 <button (click)="clearCustomer()" class="enactor-btn text-red-600">Clear Customer</button>
              </div>
           </div>

           <!-- RIGHT PANEL: COMMAND CENTER -->
           <div class="flex-1 min-w-[360px] flex flex-col gap-3">
              <!-- Expanded Payment Summary -->
              <div class="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 flex-1 flex flex-col justify-between relative overflow-hidden">
                 <!-- Return Mode Indicator -->
                 @if (returnMode()) {
                    <div class="absolute top-0 right-0 bg-red-500 text-white px-8 py-2 rotate-45 translate-x-10 translate-y-2 text-[10px] font-black uppercase tracking-widest">Returns</div>
                 }
                 
                 <div>
                    <div class="flex justify-between items-center mb-6 text-slate-400">
                       <span class="text-sm font-black uppercase tracking-widest">Sub Total</span>
                       <span class="text-xl font-black font-mono">{{ subtotal() | currency: storeService.currentStore()?.config?.currency }}</span>
                    </div>
                    @if (tax() > 0) {
                       <div class="flex justify-between items-center mb-6 text-slate-400">
                          <span class="text-sm font-black uppercase tracking-widest">Tax (VAT)</span>
                          <span class="text-xl font-black font-mono">{{ tax() | currency: storeService.currentStore()?.config?.currency }}</span>
                       </div>
                    }
                    <div class="flex justify-between items-center mb-8 text-red-500">
                       <span class="text-sm font-black uppercase tracking-widest">Savings</span>
                       <span class="text-xl font-black font-mono">-{{ (sharedState.loyaltyDiscount() || 0) | currency: storeService.currentStore()?.config?.currency }}</span>
                    </div>
                    <div class="h-[2px] bg-slate-100 mb-8"></div>
                    <div class="flex justify-between items-end">
                       <div>
                          <p class="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-2">Total Outstanding</p>
                          <span class="text-6xl font-black text-slate-900 tracking-tighter font-mono" [class.text-red-600]="returnMode()">
                             {{ total() | currency: storeService.currentStore()?.config?.currency }}
                          </span>
                       </div>
                    </div>
                 </div>

                 <div class="mt-12">
                    @if (sharedState.selectedCustomer()) {
                       <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl mb-6 text-center animate-pulse">
                          <p class="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">On Account Processing</p>
                          <p class="text-xs font-bold text-indigo-700 leading-tight">{{ sharedState.selectedCustomer()?.full_name }}</p>
                       </div>
                    }
                    <button 
                      (click)="openCheckoutModal()" 
                      [disabled]="cart().length === 0"
                      class="w-full h-32 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:grayscale text-white rounded-[2rem] shadow-2xl shadow-emerald-500/30 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-all transform hover:-translate-y-1">
                       <span class="text-4xl font-black uppercase tracking-[0.3em] translate-x-2">Confirm</span>
                       <span class="text-[11px] font-black uppercase tracking-[0.5em] opacity-80">Finalize Transaction</span>
                    </button>
                 </div>
              </div>
           </div>
        </div>
     </div>
    }

    <!--Modals-->
    <!-- FULL SCREEN PAYMENT DASHBOARD -->
    @if (showCheckoutModal()) {
      <div class="fixed inset-0 z-[100] bg-[#F8FAFC] flex flex-col animate-in fade-in duration-300">
        
        <!-- Header -->
        <header class="h-24 bg-white border-b border-slate-200 px-12 flex items-center justify-between shrink-0">
           <div class="flex items-center gap-4">
              <button (click)="showCheckoutModal.set(false)" class="w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
                 <span class="material-symbols-rounded text-3xl">arrow_back</span>
              </button>
              <h2 class="text-3xl font-black tracking-tighter uppercase italic">Payment <span class="text-indigo-600">Dashboard</span></h2>
           </div>
           
           @if (sharedState.selectedCustomer()) {
              <div class="flex items-center gap-3 px-6 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl">
                 <div class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black">{{ sharedState.selectedCustomer()?.full_name?.charAt(0) }}</div>
                 <div>
                    <p class="text-[9px] font-black uppercase text-indigo-400 tracking-widest leading-none mb-1">Customer Account</p>
                    <p class="text-sm font-black text-slate-900 leading-none">{{ sharedState.selectedCustomer()?.full_name }}</p>
                 </div>
              </div>
           }
        </header>

        <main class="flex-1 flex overflow-hidden">
           
           <!-- Panel 1: Transaction Summary -->
           <div class="w-[400px] border-r border-slate-200 bg-white p-12 flex flex-col">
              <div class="mb-12">
                 <p class="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-4">Total Amount Due</p>
                 <div class="text-7xl font-black tracking-tighter font-mono text-slate-900 uppercase">
                    {{ total() | currency: storeService.currentStore()?.config?.currency }}
                 </div>
              </div>

              <div class="space-y-6 mb-12">
                 <div class="flex justify-between items-center">
                    <span class="text-xs font-black uppercase text-slate-400 tracking-widest">Processed</span>
                    <span class="text-xl font-black font-mono text-emerald-600">{{ (total() - paymentBalance()) | currency: storeService.currentStore()?.config?.currency }}</span>
                 </div>
                 <div class="flex justify-between items-center">
                    <span class="text-xs font-black uppercase text-slate-400 tracking-widest">Remaining</span>
                    <span class="text-xl font-black font-mono text-amber-500">{{ paymentBalance() | currency: storeService.currentStore()?.config?.currency }}</span>
                 </div>
              </div>

              <div class="mt-auto bg-slate-50 rounded-3xl p-8 border border-slate-100">
                 <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 text-center">Fulfillment Information</p>
                 <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                       <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Terminal</p>
                       <p class="text-xs font-black">POS-{{ storeService.currentStore()?.erp_identifier || '01' }}</p>
                    </div>
                    <div class="text-center">
                       <p class="text-[9px] font-black uppercase text-slate-400 mb-1">Operator</p>
                       <p class="text-xs font-black">Cashier 01</p>
                    </div>
                 </div>
              </div>
           </div>

           <!-- Panel 2: Payment Methods & Input -->
           <div class="flex-1 p-12 flex flex-col overflow-y-auto">
              
              <!-- Payment Method Selector -->
              <h3 class="text-sm font-black uppercase tracking-[0.3em] text-slate-400 mb-8">Select Payment Method</h3>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                 <button (click)="activePaymentMethod.set('cash')" [class.border-emerald-500]="activePaymentMethod() === 'cash'" [class.bg-emerald-50]="activePaymentMethod() === 'cash'" class="h-32 border-2 border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all group hover:border-emerald-500">
                    <span class="material-symbols-rounded text-4xl text-slate-400 group-hover:text-emerald-500" [class.text-emerald-500]="activePaymentMethod() === 'cash'">payments</span>
                    <span class="text-xs font-black uppercase tracking-widest" [class.text-emerald-700]="activePaymentMethod() === 'cash'">Cash</span>
                 </button>
                 <button (click)="activePaymentMethod.set('card')" [class.border-indigo-500]="activePaymentMethod() === 'card'" [class.bg-indigo-50]="activePaymentMethod() === 'card'" class="h-32 border-2 border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all group hover:border-indigo-500">
                    <span class="material-symbols-rounded text-4xl text-slate-400 group-hover:text-indigo-500" [class.text-indigo-500]="activePaymentMethod() === 'card'">credit_card</span>
                    <span class="text-xs font-black uppercase tracking-widest" [class.text-indigo-700]="activePaymentMethod() === 'card'">Visa / Debit</span>
                 </button>
                 <button [disabled]="!sharedState.selectedCustomer()" (click)="activePaymentMethod.set('split')" [class.border-amber-500]="activePaymentMethod() === 'split'" [class.bg-amber-50]="activePaymentMethod() === 'split'" class="h-32 border-2 border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all group hover:border-amber-500 disabled:opacity-30">
                    <span class="material-symbols-rounded text-4xl text-slate-400 group-hover:text-amber-500" [class.text-amber-500]="activePaymentMethod() === 'split'">account_balance_wallet</span>
                    <span class="text-xs font-black uppercase tracking-widest" [class.text-amber-700]="activePaymentMethod() === 'split'">On Account</span>
                 </button>
                 <button class="h-32 border-2 border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all group hover:border-cyan-500 opacity-40">
                    <span class="material-symbols-rounded text-4xl text-slate-400 group-hover:text-cyan-500">card_giftcard</span>
                    <span class="text-xs font-black uppercase tracking-widest">Gift Card</span>
                 </button>
              </div>

              <!-- Tender Input Display -->
              <div class="flex-1 flex flex-col lg:flex-row gap-8">
                 <div class="flex-1 flex flex-col gap-6">
                    <div class="bg-slate-900 rounded-[3rem] p-10 flex flex-col items-end justify-center shadow-2xl relative overflow-hidden group min-h-[160px]">
                       <div class="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                       <p class="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-2 relative z-10">Amount Tendered (Manual)</p>
                       <div class="text-[5rem] font-black font-mono text-emerald-400 relative z-10 tracking-tighter leading-none">
                          {{ paymentInputString() || '0.00' }}
                       </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                       <button (click)="setExactCash()" class="h-24 bg-white border-2 border-slate-900 text-slate-900 rounded-[2rem] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all transform hover:scale-[1.02] active:scale-[0.98]">Exact Amount</button>
                       <button (click)="completeSale()" [disabled]="paymentBalance() > 0 || isCompletingSale()" class="h-24 bg-emerald-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-emerald-500/30 disabled:opacity-30 disabled:hover:scale-100 flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all transform hover:scale-[1.02] active:scale-[0.98]">
                          @if (isCompletingSale()) {
                             <div class="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                          } @else {
                             <span class="material-symbols-rounded text-3xl">check_circle</span>
                             Finalize Sale
                          }
                       </button>
                    </div>
                 </div>

                 <!-- Large Payment Numpad -->
                 <div class="w-full lg:w-[400px] bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 grid grid-cols-3 gap-4 shrink-0">
                    @for (num of ['7','8','9','4','5','6','1','2','3','0','00','BACKSPACE']; track num) {
                       <button (click)="onNumpadClick(num)" class="h-20 flex items-center justify-center rounded-[1.5rem] text-2xl font-black hover:bg-slate-100 active:scale-90 transition-all border border-slate-100 shadow-sm bg-slate-50/50">
                          @if (num === 'BACKSPACE') {
                             <span class="material-symbols-rounded text-3xl">backspace</span>
                          } @else {
                             {{ num }}
                          }
                       </button>
                    }
                    <button (click)="paymentInputString.set('')" class="col-span-1 h-20 bg-slate-200 text-slate-900 rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-slate-300 transition-all">Clear</button>
                    <button (click)="applyPaymentPad()" class="col-span-2 h-20 bg-pink-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-lg hover:bg-pink-700 transition-all shadow-xl shadow-pink-500/20 transform active:scale-95">Enter</button>
                 </div>
              </div>
           </div>
        </main>
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
  leftPanelMode = signal<'BAG' | 'LEDGER' | 'PRODUCTS'>('BAG');
  selectedCategory = signal<string | null>(null);
  showCustomerInsights = signal(false);
  showCheckoutModal = signal(false);
  isCompletingSale = signal(false);
  returnMode = signal(false); // Global toggle for returns/refunds
  isOffline = signal(false);
  pendingSyncCount = signal(0);
  currentTime = signal(new Date());

  // Ledger Signals
  ledgerEntries = signal<any[]>([]);
  ledgerBalance = signal<number>(0);
  ledgerTotals = signal<{ debit: number, credit: number }>({ debit: 0, credit: 0 });
  allStores = toSignal(this.mockSupabase.getAllStores(), { initialValue: [] as Store[] });
  Math = Math;

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

    // FETCH LEDGER FOR NEWLY SELECTED CUSTOMER
    this.mockSupabase.getCustomerLedger(customer.id).subscribe(entries => {
      let running = 0;
      let totalDebit = 0;
      let totalCredit = 0;

      // Sort chronological to calculate running balance correctly
      const calculated = entries
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(e => {
          running += (e.amount || 0);

          // Database Standard: Negative = Debt (Sale), Positive = Credit (Payment)
          if (e.amount < 0) totalDebit += Math.abs(e.amount);
          else totalCredit += (e.amount || 0);

          return {
            ...e,
            running_balance: running,
            debit: e.amount < 0 ? Math.abs(e.amount) : 0,
            credit: e.amount > 0 ? e.amount : 0
          };
        });

      // Show most recent on top for the workbench view
      this.ledgerEntries.set(calculated.reverse());
      this.ledgerBalance.set(running);
      this.ledgerTotals.set({ debit: totalDebit, credit: totalCredit });
    });
  }

  clearCustomer() {
    this.sharedState.selectedCustomer.set(null);
    this.ledgerEntries.set([]);
    this.ledgerBalance.set(0);
    this.ledgerTotals.set({ debit: 0, credit: 0 });
  }

  constructor() {
    // Timer effect
    setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);
  }

  addToCart(product: Product) {
    if (product.stock_shop <= 0 && !this.returnMode()) return;

    // Check if we are in return mode
    if (this.returnMode()) {
      // Create a "return" version of the product with negative price
      const returnItem = { ...product, price: -Math.abs(product.price) };
      this.sharedState.addToCart(returnItem as any);
    } else {
      this.sharedState.addToCart(product);
    }
  }

  updateQuantity(item: any, delta: number) {
    this.sharedState.updateQuantity(item.product.id, item.quantity + delta);
  }

  goHome() {
    this.selectedCategory.set(null);
    this.searchQuery.set('');
    this.leftPanelMode.set('BAG');
  }

  onSearchEnter() {
    const q = this.searchQuery().trim();
    if (!q) return;

    const exactMatch = this.products().find(p => p.barcode === q || p.name.toLowerCase() === q.toLowerCase());
    if (exactMatch && exactMatch.stock_shop > 0) {
      this.addToCart(exactMatch);
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

      const customer = this.sharedState.selectedCustomer();
      const txData = {
        store_id: storeId,
        customer_id: customer?.id,
        subtotal_amount: this.subtotal(),
        total_discount: this.sharedState.loyaltyDiscount(),
        delivery_fee: this.sharedState.shippingFee(),
        total_amount: this.total(),
        tax_amount: this.tax(),
        payment_method: paymentMethod,
        payments: payments,
        metadata: { type: 'SALE' }
      } as any;

      if (this.connectivity.isOnline()) {
        const newTx = await firstValueFrom(this.mockSupabase.addTransaction(txData, items));

        // LEDGER INTEGRATION: Record Sale and Payment separately for audit transparency
        if (customer) {
          // 1. Record the Sale (Sale is a DEBT, so amount is negative in this system)
          await firstValueFrom(this.mockSupabase.addLedgerEntry({
            store_id: storeId,
            customer_id: customer.id,
            transaction_id: newTx.id,
            type: 'SALE',
            amount: -txData.total_amount,
            notes: `POS Sale #${newTx.id.slice(0, 8)}. Items: ${items.map(i => i.product.name).join(', ').slice(0, 50)}`
          }));

          // 2. Record the Payment (Payment is a CREDIT, so amount is positive in this system)
          const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          if (totalPaid > 0) {
            await firstValueFrom(this.mockSupabase.addLedgerEntry({
              store_id: storeId,
              customer_id: customer.id,
              transaction_id: newTx.id,
              type: 'PAYMENT',
              amount: totalPaid,
              notes: `Payment for #${newTx.id.slice(0, 8)} via ${payments.map(p => p.method).join(', ')}`
            }));
          }

          // Re-identify customer to refresh the workbench ledger view
          this.selectCustomer(customer);
        }

        const promo = this.sharedState.appliedPromotion();
        if (promo) {
          this.mockSupabase.markPromotionUsed(promo.id, newTx.id).subscribe();
        }

        this.dialogService.alert('Payment Successful', 'The transaction has been completed and inventory has been updated.', 'Finish');
      } else {
        await this.syncService.queueOperation('transactions', 'INSERT', {
          ...txData,
          items_snapshot: items,
          queued_at: new Date().toISOString()
        });

        this.dialogService.alert('✅ Sale Saved Offline', `kd${this.total().toFixed(2)} transaction saved. It will sync when online.`, 'Got it');
      }

      // Cleanup
      this.sharedState.clearCart();
      this.showCheckoutModal.set(false);
      this.selectedPaymentMethods.set([]);
      this.activePaymentMethod.set('cash');
      this.paymentAllocations.set({ cash: 0, card: 0 });
      this.sharedState.shippingFee.set(0);
      // NOTE: We do NOT clear the customer here anymore to keep the workbench context active for the next sale
      // if (customer) this.selectCustomer(customer); // already done above if successful

    } catch (error) {
      console.error('Sale failed', error);
      this.dialogService.alert('Transaction Failed', 'Error processing payment. Please try again.', 'Dismiss');
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

  // --- Function Grid Logic ---
  applyGlobalDiscount() {
    this.dialogService.prompt('Line Discount', 'Enter discount percentage for all items (e.g. 10):', '10')
      .then(val => {
        if (!val) return;
        const percent = parseFloat(val);
        if (isNaN(percent)) return;

        this.sharedState.manualDiscount.set({ type: 'PERCENTAGE', value: percent });
        this.dialogService.alert('Discount Applied', `${percent}% discount has been applied to the subtotal.`);
      });
  }

  voidTransaction() {
    this.dialogService.confirm('Void Transaction', 'Are you sure you want to clear the entire shopping bag? This cannot be undone.', 'Void All', 'Cancel')
      .then(ok => {
        if (ok) {
          this.sharedState.clearCart();
          this.paymentInputString.set('');
          this.paymentAllocations.set({ cash: 0, card: 0 });
          this.returnMode.set(false);
        }
      });
  }

  // --- Payment Pad Logic ---
  onNumpadClick(key: string) {
    if (key === 'BACKSPACE') {
      this.paymentInputString.update(s => s.slice(0, -1));
    } else {
      if (this.paymentInputString() === '' && (key === '00' || key === '0')) return;

      this.paymentInputString.update(s => {
        if (s === '0' && key !== '.') return key;
        if (key === '.' && s.includes('.')) return s;
        // Limit to 2 decimal places for currency
        if (s.includes('.') && s.split('.')[1].length >= 2) return s;
        return s + key;
      });
    }
  }

  applyPaymentPad() {
    if (this.paymentInputString() === '') return;

    const amt = parseFloat(this.paymentInputString()) || 0;

    if (this.activePaymentMethod() === 'split') {
      const remaining = Math.max(0, this.total() - amt);
      this.paymentAllocations.set({ cash: amt, card: remaining });
    } else {
      this.paymentAllocations.update(p => ({
        ...p,
        [this.activePaymentMethod()]: amt
      }));
    }
    this.paymentInputString.set('');
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
