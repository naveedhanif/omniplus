import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockSupabaseService, Transaction, TransactionItem, Product } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { switchMap } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-analytics-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, DecimalPipe],
    template: `
    <div class="h-full flex flex-col space-y-6">
      
      <!-- Premium Header & Time Controls -->
      <div class="flex justify-between items-end">
        <div>
          <h2 class="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3">
             <span class="material-symbols-rounded text-blue-600 dark:text-blue-400 text-[32px]">insights</span>
             Business Analytics & P&L
          </h2>
          <p class="text-sm font-bold opacity-60 mt-1 uppercase tracking-widest">Financial & Stock Performance</p>
        </div>
        
        <div class="flex flex-wrap gap-2 items-center justify-end">
            <!-- Custom Date Range Picker (Visible when CUSTOM is selected or always available as a tiny button) -->
            <div *ngIf="timeframe() === 'CUSTOM'" class="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-right-4">
                <input type="date" [ngModel]="customStart()" (ngModelChange)="customStart.set($event); loadData()" class="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-lg text-xs font-bold shadow-sm outline-none focus:border-blue-500 text-slate-700 dark:text-slate-300">
                <span class="text-slate-400 font-bold text-xs">to</span>
                <input type="date" [ngModel]="customEnd()" (ngModelChange)="customEnd.set($event); loadData()" class="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-lg text-xs font-bold shadow-sm outline-none focus:border-blue-500 text-slate-700 dark:text-slate-300">
            </div>

            <!-- Functional Timeframe Filters -->
            <button (click)="setTimeframe('TODAY')" 
                [ngClass]="{'bg-blue-50 dark:bg-blue-900 border-blue-300 text-blue-700 dark:text-blue-300': timeframe() === 'TODAY'}" 
                class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-600 dark:text-slate-300">
                Daily
            </button>
            <button (click)="setTimeframe('WEEK')" 
                [ngClass]="{'bg-blue-50 dark:bg-blue-900 border-blue-300 text-blue-700 dark:text-blue-300': timeframe() === 'WEEK'}" 
                class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-600 dark:text-slate-300">
                Weekly
            </button>
            <button (click)="setTimeframe('MONTH')" 
                [ngClass]="{'bg-blue-50 dark:bg-blue-900 border-blue-300 text-blue-700 dark:text-blue-300': timeframe() === 'MONTH'}" 
                class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-600 dark:text-slate-300">
                Monthly
            </button>
            <button (click)="setTimeframe('ALL')" 
                [ngClass]="{'bg-blue-50 dark:bg-blue-900 border-blue-300 text-blue-700 dark:text-blue-300': timeframe() === 'ALL'}"
                class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-600 dark:text-slate-300">
                All Time
            </button>
            <button (click)="setTimeframe('CUSTOM')" 
                [ngClass]="{'bg-blue-50 dark:bg-blue-900 border-blue-300 text-blue-700 dark:text-blue-300': timeframe() === 'CUSTOM'}"
                class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <span class="material-symbols-rounded text-[16px]">calendar_month</span> Custom
            </button>
        </div>
      </div>

      <!-- Live Financial Command Center (KPI Cards) -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-500">
        
        <!-- Gross Revenue -->
        <div class="relative overflow-hidden bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl shadow-md p-5 text-white group transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/10 blur-2xl rounded-full"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-inner backdrop-blur-sm">
                    <span class="material-symbols-rounded">payments</span>
                </div>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-indigo-100 mb-1">Gross Revenue</div>
                <div class="text-3xl font-extrabold tracking-tight">
                    {{ metrics().revenue | currency:storeService.currency() }}
                </div>
            </div>
        </div>

        <!-- Net Profit -->
        <div class="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl shadow-md p-5 text-white group transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/10 blur-2xl rounded-full"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-inner backdrop-blur-sm">
                    <span class="material-symbols-rounded">trending_up</span>
                </div>
                <!-- Dynamic display based on positive profit -->
                <span *ngIf="metrics().profit > 0" class="flex items-center gap-1 text-[11px] font-bold bg-white/20 px-2 py-1 rounded-full"><span class="material-symbols-rounded text-[14px]">arrow_upward</span></span>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-emerald-100 mb-1">True Net Profit</div>
                <div class="text-3xl font-extrabold tracking-tight">
                    {{ metrics().profit | currency:storeService.currency() }}
                </div>
            </div>
        </div>

        <!-- Cost of Goods Sold (COGS) -->
        <div class="relative overflow-hidden bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl shadow-md p-5 text-white group transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/10 blur-2xl rounded-full"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-inner backdrop-blur-sm">
                    <span class="material-symbols-rounded">inventory</span>
                </div>
                <span class="px-2 py-1 bg-white/20 text-white text-[10px] font-bold rounded-full shadow-sm" title="Moving Average Cost">MAC Sourced</span>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-orange-100 mb-1">Cost of Goods (COGS)</div>
                <div class="text-3xl font-extrabold tracking-tight">
                    {{ metrics().cogs | currency:storeService.currency() }}
                </div>
            </div>
        </div>

        <!-- Profit Margin % -->
        <div class="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl shadow-md p-5 text-white group transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
            <div class="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 blur-2xl rounded-full"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform backdrop-blur-sm">
                    <span class="material-symbols-rounded">pie_chart</span>
                </div>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-purple-100 mb-1">Avg Profit Margin</div>
                <div class="text-3xl font-extrabold tracking-tight" [class.text-red-300]="metrics().margin < 15">
                    {{ metrics().margin | number:'1.1-2' }}%
                </div>
                <div class="mt-2 h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                    <div class="h-full bg-white rounded-full transition-all duration-1000" [style.width.%]="metrics().margin"></div>
                </div>
            </div>
        </div>
      </div>

      <!-- Advanced Reports Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 animate-in slide-in-from-bottom-4 duration-500 delay-150">
          
          <!-- Master Ledger Area -->
          <div class="col-span-1 lg:col-span-3 bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden h-[600px]">
              
              <!-- Tabs Header -->
              <div class="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center bg-slate-50/50 dark:bg-slate-800/30">
                  <div class="flex items-center gap-2 bg-slate-200/50 dark:bg-slate-900 rounded-lg p-1">
                      <button (click)="activeTab.set('LEDGER')" [class.bg-white]="activeTab() === 'LEDGER'" [class.shadow-sm]="activeTab() === 'LEDGER'" [ngClass]="{'dark:bg-slate-700': activeTab() === 'LEDGER'}" class="px-5 py-1.5 rounded-md text-sm font-bold transition-all text-slate-700 dark:text-slate-300">
                          <div class="flex items-center gap-2"><span class="material-symbols-rounded text-[18px]">receipt_long</span> Transaction Ledger</div>
                      </button>
                      <button (click)="activeTab.set('PRODUCTS')" [class.bg-white]="activeTab() === 'PRODUCTS'" [class.shadow-sm]="activeTab() === 'PRODUCTS'" [ngClass]="{'dark:bg-slate-700': activeTab() === 'PRODUCTS'}" class="px-5 py-1.5 rounded-md text-sm font-bold transition-all text-slate-700 dark:text-slate-300">
                          <div class="flex items-center gap-2"><span class="material-symbols-rounded text-[18px]">star</span> Top Products</div>
                      </button>
                      <button (click)="activeTab.set('CUSTOMERS')" [class.bg-white]="activeTab() === 'CUSTOMERS'" [class.shadow-sm]="activeTab() === 'CUSTOMERS'" [ngClass]="{'dark:bg-slate-700': activeTab() === 'CUSTOMERS'}" class="px-5 py-1.5 rounded-md text-sm font-bold transition-all text-slate-700 dark:text-slate-300">
                          <div class="flex items-center gap-2"><span class="material-symbols-rounded text-[18px]">groups</span> Top Customers</div>
                      </button>
                      <button (click)="activeTab.set('SUPPLIERS')" [class.bg-white]="activeTab() === 'SUPPLIERS'" [class.shadow-sm]="activeTab() === 'SUPPLIERS'" [ngClass]="{'dark:bg-slate-700': activeTab() === 'SUPPLIERS'}" class="px-5 py-1.5 rounded-md text-sm font-bold transition-all text-slate-700 dark:text-slate-300">
                          <div class="flex items-center gap-2"><span class="material-symbols-rounded text-[18px]">factory</span> Top Suppliers</div>
                      </button>
                  </div>
              </div>

              <div class="flex-1 overflow-auto p-0 relative">
                  
                  <!-- LEDGER TAB -->
                  @if(activeTab() === 'LEDGER') {
                      <table class="w-full text-left text-sm">
                          <thead class="bg-white dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px] sticky top-0 z-10 shadow-sm">
                              <tr>
                                  <th class="px-4 py-3 w-10"></th>
                                  <th class="px-4 py-3">Date & Time</th>
                                  <th class="px-4 py-3">Receipt ID</th>
                                  <th class="px-4 py-3 text-right">Revenue</th>
                                  <th class="px-4 py-3 text-right">COGS (MAC)</th>
                                  <th class="px-4 py-3 text-right">True Profit</th>
                                  <th class="px-4 py-3 text-right">Margin</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
                              @for(tx of ledgerTxs(); track tx.id) {
                                  <ng-container>
                                      <!-- Main Row -->
                                      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer" 
                                          (click)="toggleExpanded(tx.id)"
                                          [ngClass]="{
                                              'bg-blue-50 dark:bg-slate-800/60': expandedTxId() === tx.id,
                                              'opacity-50': tx.isVoid
                                          }">
                                          
                                          <td class="px-4 py-3 text-center">
                                              <span class="material-symbols-rounded text-slate-400 transition-transform duration-200" [class.rotate-90]="expandedTxId() === tx.id">chevron_right</span>
                                          </td>
                                          <td class="px-4 py-3 whitespace-nowrap">
                                              <div class="font-bold text-slate-900 dark:text-white">{{ tx.created_at | date:'MMM d, yyyy' }}</div>
                                              <div class="text-[10px] opacity-60">{{ tx.created_at | date:'shortTime' }}</div>
                                          </td>
                                          <td class="px-4 py-3 font-mono text-xs">
                                              {{ tx.id.substring(0, 8).toUpperCase() }}
                                              <span *ngIf="tx.isVoid" class="text-red-500 ml-2 font-bold px-2 bg-red-100 rounded">VOID</span>
                                          </td>
                                          <td class="px-4 py-3 text-right tracking-tight font-medium text-slate-900 dark:text-white">{{ tx.revenue | currency:storeService.currency() }}</td>
                                          <td class="px-4 py-3 text-right tracking-tight font-medium text-orange-600 dark:text-orange-400">{{ tx.cogs | currency:storeService.currency() }}</td>
                                          <td class="px-4 py-3 text-right font-black tracking-tight" [class.text-emerald-600]="tx.profit > 0">{{ tx.profit | currency:storeService.currency() }}</td>
                                          <td class="px-4 py-3 text-right">
                                              <span *ngIf="!tx.isVoid" class="px-2 py-1 rounded-md text-[10px] font-black border"
                                                    [class.bg-emerald-50]="tx.margin >= 30" [class.text-emerald-700]="tx.margin >= 30" [class.border-emerald-200]="tx.margin >= 30"
                                                    [class.bg-amber-50]="tx.margin < 30 && tx.margin >= 15" [class.text-amber-700]="tx.margin < 30 && tx.margin >= 15" [class.border-amber-200]="tx.margin < 30 && tx.margin >= 15"
                                                    [class.bg-red-50]="tx.margin < 15" [class.text-red-700]="tx.margin < 15" [class.border-red-200]="tx.margin < 15">
                                                  {{ tx.margin | number:'1.0-1' }}%
                                              </span>
                                          </td>
                                      </tr>
                                      
                                      <!-- Details Drill-down -->
                                      @if(expandedTxId() === tx.id) {
                                          <tr class="bg-indigo-50/40 dark:bg-indigo-900/10">
                                              <td colspan="7" class="p-0 border-b-2 border-indigo-200 dark:border-indigo-900/50">
                                                  <div class="px-16 py-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                      <div class="flex items-center gap-2 mb-3">
                                                          <span class="material-symbols-rounded text-indigo-500 text-[18px]">search</span>
                                                          <span class="text-[11px] uppercase tracking-widest font-bold text-indigo-700 dark:text-indigo-400">Line Item Forensics</span>
                                                      </div>
                                                      <table class="w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-800/30 overflow-hidden">
                                                          <thead class="bg-indigo-50/50 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-800/30 font-bold uppercase tracking-wider text-[9px] text-indigo-900 dark:text-indigo-300">
                                                              <tr>
                                                                  <th class="px-4 py-2 text-left">Product Name</th>
                                                                  <th class="px-4 py-2 text-center">Qty</th>
                                                                  <th class="px-4 py-2 text-right">Sale Price</th>
                                                                  <th class="px-4 py-2 text-right">Frozen MAC (Cost)</th>
                                                                  <th class="px-4 py-2 text-right text-emerald-600">Net Profit</th>
                                                              </tr>
                                                          </thead>
                                                          <tbody class="divide-y divide-indigo-50 dark:divide-indigo-800/20">
                                                              @for(item of tx.details; track $index) {
                                                                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                                      <td class="px-4 py-2 font-bold">{{ item.name }}</td>
                                                                      <td class="px-4 py-2 text-center">x{{ item.quantity }}</td>
                                                                      <td class="px-4 py-2 text-right font-mono">{{ item.price | currency:storeService.currency() }}</td>
                                                                      <td class="px-4 py-2 text-right font-mono text-orange-600/90">{{ item.cost | currency:storeService.currency() }}</td>
                                                                      <td class="px-4 py-2 text-right font-mono font-black text-emerald-600">{{ item.profit | currency:storeService.currency() }}</td>
                                                                  </tr>
                                                              }
                                                          </tbody>
                                                      </table>
                                                  </div>
                                              </td>
                                          </tr>
                                      }
                                  </ng-container>
                              } @empty {
                                  <tr><td colspan="7" class="p-16 flex flex-col items-center justify-center opacity-40">
                                      <span class="material-symbols-rounded text-5xl mb-3">history_toggle_off</span>
                                      <span class="font-bold text-lg">No Transactions</span>
                                      <span class="text-sm">There are no sales for the selected timeframe.</span>
                                  </td></tr>
                              }
                          </tbody>
                      </table>
                  }

                  <!-- TOP PRODUCTS TAB -->
                  @if(activeTab() === 'PRODUCTS') {
                      <table class="w-full text-left text-sm">
                          <thead class="bg-white dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px] sticky top-0 z-10 shadow-sm">
                              <tr>
                                  <th class="px-5 py-4">Product Name</th>
                                  <th class="px-5 py-4 text-right">Units Sold</th>
                                  <th class="px-5 py-4 text-right">Revenue Generated</th>
                                  <th class="px-5 py-4 text-right">True Net Profit</th>
                                  <th class="px-5 py-4 text-right">Blended Margin</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
                              @for(item of topProducts(); track item.productId) {
                                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                      <td class="px-5 py-4">
                                          <div class="font-bold text-base drop-shadow-sm" style="color: var(--text-color, #1e293b);">{{ item.name }}</div>
                                      </td>
                                      <td class="px-5 py-4 text-right font-bold">{{ item.qty }}</td>
                                      <td class="px-5 py-4 text-right font-mono">{{ item.revenue | currency:storeService.currency() }}</td>
                                      <td class="px-5 py-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                                          {{ item.profit | currency:storeService.currency() }}
                                      </td>
                                      <td class="px-5 py-4 text-right">
                                          <span class="px-2 py-1 rounded-md text-[10px] font-black border"
                                                [class.bg-emerald-50]="item.margin >= 30" [class.text-emerald-700]="item.margin >= 30" [class.border-emerald-200]="item.margin >= 30"
                                                [class.bg-amber-50]="item.margin < 30 && item.margin >= 15" [class.text-amber-700]="item.margin < 30 && item.margin >= 15" [class.border-amber-200]="item.margin < 30 && item.margin >= 15"
                                                [class.bg-red-50]="item.margin < 15" [class.text-red-700]="item.margin < 15" [class.border-red-200]="item.margin < 15">
                                              {{ item.margin | number:'1.0-1' }}%
                                          </span>
                                      </td>
                                  </tr>
                              } @empty {
                                  <tr><td colspan="5" class="p-16 flex flex-col items-center justify-center opacity-40">
                                      <span class="material-symbols-rounded text-5xl mb-3">production_quantity_limits</span>
                                      <span class="font-bold text-lg">Not Enough Data</span>
                                      <span class="text-sm">No positive profit records found for this period.</span>
                                  </td></tr>
                              }
                          </tbody>
                      </table>
                  }

                  <!-- TOP CUSTOMERS TAB -->
                  @if(activeTab() === 'CUSTOMERS') {
                      <table class="w-full text-left text-sm">
                          <thead class="bg-white dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px] sticky top-0 z-10 shadow-sm">
                              <tr>
                                  <th class="px-5 py-4 w-12"></th>
                                  <th class="px-5 py-4">Customer Name</th>
                                  <th class="px-5 py-4 text-right">Orders</th>
                                  <th class="px-5 py-4 text-right">Total Revenue Generated</th>
                                  <th class="px-5 py-4 text-right">Profit Contribution</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
                              @for(item of topCustomers(); track item.customerId; let i = $index) {
                                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                      <td class="px-5 py-4 text-center">
                                         <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                                             #{{ i + 1 }}
                                         </div>
                                      </td>
                                      <td class="px-5 py-4">
                                          <div class="font-bold text-base drop-shadow-sm" style="color: var(--primary-color);">{{ item.name }}</div>
                                          <span class="px-2 py-0.5 mt-1 inline-block bg-slate-100 text-slate-600 rounded text-[10px] font-bold" *ngIf="item.phone">{{ item.phone }}</span>
                                      </td>
                                      <td class="px-5 py-4 text-right font-bold">{{ item.orders }}</td>
                                      <td class="px-5 py-4 text-right font-mono">{{ item.revenue | currency:storeService.currency() }}</td>
                                      <td class="px-5 py-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                                          {{ item.profit | currency:storeService.currency() }}
                                      </td>
                                  </tr>
                              } @empty {
                                  <tr><td colspan="5" class="p-16 flex flex-col items-center justify-center opacity-40">
                                      <span class="material-symbols-rounded text-5xl mb-3">group_off</span>
                                      <span class="font-bold text-lg">No Customer Sales</span>
                                      <span class="text-sm">No positive profit transactions attached to customers found.</span>
                                  </td></tr>
                              }
                          </tbody>
                      </table>
                  }

                  <!-- TOP SUPPLIERS TAB -->
                  @if(activeTab() === 'SUPPLIERS') {
                      <table class="w-full text-left text-sm">
                          <thead class="bg-white dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px] sticky top-0 z-10 shadow-sm">
                              <tr>
                                  <th class="px-5 py-4">Supplier Name</th>
                                  <th class="px-5 py-4 text-right">Products Sold</th>
                                  <th class="px-5 py-4 text-right">Sales Margin Contribution</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
                              @for(item of topSuppliers(); track item.supplierId) {
                                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                      <td class="px-5 py-4">
                                          <div class="font-bold text-base drop-shadow-sm" style="color: var(--text-color, #1e293b);">{{ item.name }}</div>
                                      </td>
                                      <td class="px-5 py-4 text-right font-bold">{{ item.qty }} units</td>
                                      <td class="px-5 py-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                                          {{ item.profit | currency:storeService.currency() }}
                                      </td>
                                  </tr>
                              } @empty {
                                  <tr><td colspan="3" class="p-16 flex flex-col items-center justify-center opacity-40">
                                      <span class="material-symbols-rounded text-5xl mb-3">factory</span>
                                      <span class="font-bold text-lg">No Supplier Data</span>
                                      <span class="text-sm">No products attached to suppliers were sold in this period.</span>
                                  </td></tr>
                              }
                          </tbody>
                      </table>
                  }

              </div>
          </div>

          <!-- Quick Report Actions -->
          <div class="col-span-1 flex flex-col gap-6">
              
              <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                  <div class="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                     <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                         <span class="material-symbols-rounded text-[var(--primary-color)]">download</span> 
                         Export Tools
                     </h3>
                  </div>
                  <div class="p-5 space-y-4">
                      
                      <!-- Functional Export Ledger button -->
                      <button (click)="exportLedgerToCSV()" class="w-full relative overflow-hidden group flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors bg-white dark:bg-slate-800 text-left active:scale-95">
                          <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex flex-shrink-0 items-center justify-center transition-transform group-hover:scale-110">
                              <span class="material-symbols-rounded text-[20px]">table_chart</span>
                          </div>
                          <div>
                              <div class="font-bold text-slate-900 dark:text-white mb-0.5">Download P&L CSV</div>
                              <div class="text-xs opacity-60">Complete ledger of {{ timeframe().toLowerCase() }}'s transactions with associated COGS.</div>
                          </div>
                      </button>

                      <button class="w-full relative overflow-hidden group flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors bg-white dark:bg-slate-800 text-left opacity-70">
                          <div class="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex flex-shrink-0 items-center justify-center">
                              <span class="material-symbols-rounded text-[20px]">inventory_2</span>
                          </div>
                          <div>
                              <div class="font-bold text-slate-900 dark:text-white mb-0.5">Supplier Spend</div>
                              <div class="text-[10px] text-purple-600 font-bold uppercase tracking-wider mt-1">Coming Soon</div>
                          </div>
                      </button>

                  </div>
              </div>

          </div>
      </div>
    </div>
  `
})
export class AnalyticsDashboardComponent implements OnInit {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);

    // Primitive local state for the demo
    transactions = signal<Transaction[]>([]);
    items = signal<TransactionItem[]>([]);
    products = signal<Product[]>([]);
    customers = signal<any[]>([]); // To hold all customers for quick lookup
    suppliers = signal<any[]>([]); // To hold all suppliers for quick lookup

    // UI State
    timeframe = signal<'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM'>('MONTH');
    customStart = signal<string>('');
    customEnd = signal<string>('');
    activeTab = signal<'LEDGER' | 'PRODUCTS' | 'CUSTOMERS' | 'SUPPLIERS'>('LEDGER');
    expandedTxId = signal<string | null>(null);

    constructor() {
        // Listen to store changes
        effect(() => {
            const store = this.storeService.currentStore();
            if (store) this.loadData();
        });
    }

    ngOnInit() {
        // Set default custom dates to today
        const now = new Date();
        const yyyymmdd = now.toISOString().split('T')[0];
        this.customStart.set(yyyymmdd);
        this.customEnd.set(yyyymmdd);

        this.loadData();
    }

    async loadData() {
        const store = this.storeService.currentStore();
        if (!store) return;

        this.supabase.getTransactions(store.id).pipe(
            switchMap(txs => {
                this.transactions.set(txs);
                return this.supabase.getProducts(store.id);
            }),
            switchMap(prods => {
                this.products.set(prods);
                return this.supabase.getCustomers(store.id);
            }),
            switchMap(custs => {
                this.customers.set(custs);
                return this.supabase.getSuppliers(store.id);
            })
        ).subscribe(async supps => {
            this.suppliers.set(supps);

            // Fetch items for the loaded transactions
            const txs = this.transactions();
            let allItems: TransactionItem[] = [];

            const tClient = (this.supabase as any).supabase;
            if (tClient && txs.length > 0) {
                const { data } = await tClient
                    .from('transaction_items')
                    .select('*')
                    .in('transaction_id', txs.map(t => t.id));
                if (data) allItems = data;
            }

            this.items.set(allItems);
        });
    }

    setTimeframe(tf: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM') {
        this.timeframe.set(tf);
        this.expandedTxId.set(null);
    }

    toggleExpanded(id: string) {
        if (this.expandedTxId() === id) {
            this.expandedTxId.set(null);
        } else {
            this.expandedTxId.set(id);
        }
    }

    // Advanced Data Pipeline specific to Timeframe
    filteredData = computed(() => {
        const tf = this.timeframe();
        const txs = this.transactions() || [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const monthStr = now.toISOString().slice(0, 7);

        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const okTxs = txs.filter(t => {
            if (tf === 'ALL') return true;
            const txDate = new Date(t.created_at || '');

            if (tf === 'TODAY') {
                return txDate.toISOString().split('T')[0] === todayStr;
            }
            if (tf === 'WEEK') {
                return txDate >= weekAgo && txDate <= now;
            }
            if (tf === 'MONTH') {
                return txDate.toISOString().slice(0, 7) === monthStr;
            }
            if (tf === 'CUSTOM') {
                const sDate = this.customStart() ? new Date(this.customStart() + 'T00:00:00') : null;
                const eDate = this.customEnd() ? new Date(this.customEnd() + 'T23:59:59') : null;

                if (sDate && eDate) {
                    return txDate >= sDate && txDate <= eDate;
                } else if (sDate) {
                    return txDate >= sDate;
                } else if (eDate) {
                    return txDate <= eDate;
                }
                return true;
            }
            return true;
        });

        // Sort latest first
        okTxs.sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
        return okTxs;
    });

    // Calculates all detailed ledger lines and exact P&L
    ledgerTxs = computed(() => {
        const items = this.items();
        const prods = this.products();
        return this.filteredData().map(tx => {
            const isVoid = tx.metadata?.status === 'VOID';
            const myItems = items.filter(i => i.transaction_id === tx.id);

            let revenue = 0;
            let cogs = 0;

            const details = myItems.map(ti => {
                let saleCost = ti.cost_at_sale;
                if (saleCost === null || saleCost === undefined) {
                    const p = prods.find(pr => pr.id === ti.product_id);
                    saleCost = p?.metadata?.mac ?? p?.cost_price ?? (ti.price_at_sale * 0.6);
                }
                const rev = Number(ti.price_at_sale) * ti.quantity;
                const lineCogs = saleCost * ti.quantity;
                revenue += rev;
                cogs += lineCogs;

                const pName = prods.find(pr => pr.id === ti.product_id)?.name || 'Unknown Item';
                return { name: pName, quantity: ti.quantity, price: ti.price_at_sale, cost: saleCost, rev, profit: rev - lineCogs };
            });

            // If voided, we show zero profit/revenue so it doesn't skew numbers
            if (isVoid) {
                return { ...tx, isVoid, revenue: 0, cogs: 0, profit: 0, margin: 0, details };
            }

            const profit = revenue - cogs;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            return { ...tx, isVoid, revenue, cogs, profit, margin, details };
        });
    });

    metrics = computed(() => {
        const ledger = this.ledgerTxs();
        let revenue = 0;
        let cogs = 0;
        let profit = 0;

        ledger.forEach(l => {
            revenue += l.revenue;
            cogs += l.cogs;
            profit += l.profit;
        });

        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { revenue, cogs, profit, margin };
    });

    topProducts = computed(() => {
        const txItems = this.items();
        const prods = this.products();

        // Only include non-voided transactions mapped from the currently filtered timeframe
        const validTxIds = new Set(this.ledgerTxs().filter(t => !t.isVoid).map(t => t.id));

        const stats: Record<string, any> = {};

        txItems.forEach(ti => {
            if (validTxIds.has(ti.transaction_id)) {
                if (!stats[ti.product_id]) {
                    const p = prods.find(pr => pr.id === ti.product_id);
                    stats[ti.product_id] = {
                        productId: ti.product_id,
                        name: p?.name || 'Unknown',
                        qty: 0,
                        revenue: 0,
                        cogs: 0
                    };
                }

                stats[ti.product_id].qty += ti.quantity;
                stats[ti.product_id].revenue += Number(ti.price_at_sale) * ti.quantity;

                let saleCost = ti.cost_at_sale;
                if (saleCost === null || saleCost === undefined) {
                    const p = prods.find(pr => pr.id === ti.product_id);
                    saleCost = p?.metadata?.mac ?? p?.cost_price ?? (ti.price_at_sale * 0.6);
                }
                stats[ti.product_id].cogs += (saleCost * ti.quantity);
            }
        });

        let arr = Object.values(stats).map(s => {
            s.profit = s.revenue - s.cogs;
            s.margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
            return s;
        });

        arr.sort((a, b) => b.profit - a.profit);
        return arr.slice(0, 15); // Top 15 
    });

    topCustomers = computed(() => {
        const ledger = this.ledgerTxs().filter(t => !t.isVoid);
        const custs = this.customers();
        const stats: Record<string, any> = {};

        ledger.forEach(tx => {
            if (tx.customer_id) {
                if (!stats[tx.customer_id]) {
                    const c = custs.find(cu => cu.id === tx.customer_id);
                    stats[tx.customer_id] = {
                        customerId: tx.customer_id,
                        name: c?.full_name || 'Unknown Customer',
                        phone: c?.phone || '',
                        orders: 0,
                        revenue: 0,
                        profit: 0
                    };
                }
                stats[tx.customer_id].orders += 1;
                stats[tx.customer_id].revenue += tx.revenue;
                stats[tx.customer_id].profit += tx.profit;
            }
        });

        const arr = Object.values(stats);
        arr.sort((a, b) => b.profit - a.profit);
        return arr.slice(0, 15);
    });

    topSuppliers = computed(() => {
        const txItems = this.items();
        const prods = this.products();
        const supps = this.suppliers();

        const validTxIds = new Set(this.ledgerTxs().filter(t => !t.isVoid).map(t => t.id));
        const stats: Record<string, any> = {};

        txItems.forEach(ti => {
            if (validTxIds.has(ti.transaction_id)) {
                const product = prods.find(pr => pr.id === ti.product_id);
                const supplierId = product?.supplier_id;

                if (supplierId) {
                    if (!stats[supplierId]) {
                        const s = supps.find(sup => sup.id === supplierId);
                        stats[supplierId] = {
                            supplierId: supplierId,
                            name: s?.name || 'Unknown Supplier',
                            revenue: 0,
                            cogs: 0,
                            qty: 0,
                            profit: 0
                        };
                    }

                    stats[supplierId].qty += ti.quantity;

                    const rev = Number(ti.price_at_sale) * ti.quantity;
                    stats[supplierId].revenue += rev;

                    let saleCost = ti.cost_at_sale;
                    if (saleCost === null || saleCost === undefined) {
                        saleCost = product?.metadata?.mac ?? product?.cost_price ?? (ti.price_at_sale * 0.6);
                    }
                    const cogs = saleCost * ti.quantity;
                    stats[supplierId].cogs += cogs;
                    stats[supplierId].profit += (rev - cogs);
                }
            }
        });

        const arr = Object.values(stats);
        arr.sort((a, b) => b.profit - a.profit);
        return arr.slice(0, 15);
    });

    exportLedgerToCSV() {
        const rows = this.ledgerTxs();
        let csv = 'Date,Receipt ID,Status,Revenue,MAC COGS,True Profit,Margin (%)\n';
        rows.forEach(r => {
            const date = r.created_at ? new Date(r.created_at).toLocaleString().replace(/,/g, '') : '';
            const status = r.isVoid ? 'VOID' : 'COMPLETED';
            csv += `${date},${r.id},${status},${r.revenue.toFixed(2)},${r.cogs.toFixed(2)},${r.profit.toFixed(2)},${(r.margin || 0).toFixed(2)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `profit_loss_ledger_${this.timeframe().toLowerCase()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
}
