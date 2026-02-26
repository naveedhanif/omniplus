import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockSupabaseService, Transaction, TransactionItem, Product } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { forkJoin, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
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
             Business Analytics
          </h2>
          <p class="text-sm font-bold opacity-60 mt-1 uppercase tracking-widest">Financial & Stock Performance</p>
        </div>
        
        <div class="flex gap-2">
            <!-- Simulated Filter Pills -->
            <button class="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-500 dark:text-slate-400">
                Today
            </button>
            <button class="px-5 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400 rounded-xl text-sm font-bold shadow-sm">
                This Month
            </button>
            <button class="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-sm font-bold shadow-sm hover:border-[var(--primary-color)] transition-colors text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span class="material-symbols-rounded text-[18px]">calendar_month</span> Custom
            </button>
        </div>
      </div>

      <!-- Live Financial Command Center (KPI Cards) -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-500">
        
        <!-- Gross Revenue -->
        <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700/60 p-5 group transition-all duration-300 hover:shadow-lg">
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full group-hover:bg-emerald-500/10 transition-colors"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                    <span class="material-symbols-rounded">payments</span>
                </div>
                <span class="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full shadow-sm">+12.5%</span>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Gross Revenue</div>
                <div class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {{ metrics().revenue | currency:storeService.currency() }}
                </div>
            </div>
        </div>

        <!-- Net Profit -->
        <div class="relative overflow-hidden bg-gradient-to-br from-blue-600 via-[var(--primary-color)] to-indigo-600 rounded-2xl shadow-md p-5 text-white group transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/10 blur-2xl rounded-full"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-inner backdrop-blur-sm">
                    <span class="material-symbols-rounded">trending_up</span>
                </div>
                <!-- Sparkline placeholder -->
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-white/80 mb-1">Net Profit</div>
                <div class="text-3xl font-extrabold tracking-tight">
                    {{ metrics().profit | currency:storeService.currency() }}
                </div>
            </div>
        </div>

        <!-- Cost of Goods Sold (COGS) -->
        <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700/60 p-5 group transition-all duration-300 hover:shadow-lg">
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-orange-500/5 blur-2xl rounded-full group-hover:bg-orange-500/10 transition-colors"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-inner">
                    <span class="material-symbols-rounded">inventory</span>
                </div>
                <span class="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full shadow-sm">Variable Cost</span>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Real COGS</div>
                <div class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {{ metrics().cogs | currency:storeService.currency() }}
                </div>
            </div>
        </div>

        <!-- Profit Margin % -->
        <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700/60 p-5 group transition-all duration-300 hover:shadow-lg">
            <div class="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500/5 blur-2xl rounded-full group-hover:bg-purple-500/10 transition-colors"></div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                    <span class="material-symbols-rounded">pie_chart</span>
                </div>
            </div>
            <div class="relative z-10">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Avg Profit Margin</div>
                <div class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight" [class.text-red-500]="metrics().margin < 15">
                    {{ metrics().margin | number:'1.1-2' }}%
                </div>
                <div class="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-1000" [style.width.%]="metrics().margin"></div>
                </div>
            </div>
        </div>
      </div>

      <!-- Advanced Reports Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 animate-in slide-in-from-bottom-4 duration-500 delay-150">
          
          <!-- Top Selling Products (Profit-based) -->
          <div class="col-span-1 lg:col-span-2 bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
              <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                  <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                      <span class="material-symbols-rounded text-indigo-500">star</span> 
                      Top Performing Items (By Profit)
                  </h3>
              </div>
              <div class="flex-1 overflow-auto p-0">
                  <table class="w-full text-left text-sm">
                      <thead class="bg-white dark:bg-slate-900 text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider text-[10px] sticky top-0 z-10 backdrop-blur-md">
                          <tr>
                              <th class="p-4">SKU / Product</th>
                              <th class="p-4 text-right">Units Sold</th>
                              <th class="p-4 text-right">Revenue</th>
                              <th class="p-4 text-right">True Profit</th>
                              <th class="p-4 text-right">Margin</th>
                          </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-50 dark:divide-slate-800/50">
                          @for(item of topProducts(); track item.productId) {
                              <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                  <td class="p-4">
                                      <div class="font-bold text-slate-900 dark:text-white">{{ item.name }}</div>
                                      <div class="text-[10px] opacity-60 font-mono">{{ item.category }}</div>
                                  </td>
                                  <td class="p-4 text-right font-bold">{{ item.qty }}</td>
                                  <td class="p-4 text-right font-mono">{{ item.revenue | currency:storeService.currency() }}</td>
                                  <td class="p-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                      {{ item.profit | currency:storeService.currency() }}
                                  </td>
                                  <td class="p-4 text-right">
                                      <span class="px-2 py-1 rounded-md text-[10px] font-bold"
                                            [class.bg-green-100]="item.margin >= 30"
                                            [class.text-green-700]="item.margin >= 30"
                                            [class.bg-amber-100]="item.margin < 30 && item.margin >= 15"
                                            [class.text-amber-700]="item.margin < 30 && item.margin >= 15"
                                            [class.bg-red-100]="item.margin < 15"
                                            [class.text-red-700]="item.margin < 15">
                                          {{ item.margin | number:'1.0-1' }}%
                                      </span>
                                  </td>
                              </tr>
                          } @empty {
                              <tr><td colspan="5" class="p-12 text-center opacity-50 italic">Insufficient data for this period.</td></tr>
                          }
                      </tbody>
                  </table>
              </div>
          </div>

          <!-- Quick Report Actions -->
          <div class="col-span-1 flex flex-col gap-6">
              
              <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex-1 flex flex-col overflow-hidden">
                  <div class="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                     <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                         <span class="material-symbols-rounded text-[var(--primary-color)]">download</span> 
                         Export Reports
                     </h3>
                  </div>
                  <div class="p-5 space-y-4">
                      
                      <button class="w-full relative overflow-hidden group flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors bg-white dark:bg-slate-800 text-left">
                          <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex flex-shrink-0 items-center justify-center">
                              <span class="material-symbols-rounded text-[20px]">table_chart</span>
                          </div>
                          <div>
                              <div class="font-bold text-slate-900 dark:text-white mb-0.5">Full Profit/Loss (Excel)</div>
                              <div class="text-xs opacity-60">Complete ledger of all transactions with associated COGS.</div>
                          </div>
                      </button>

                      <button class="w-full relative overflow-hidden group flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors bg-white dark:bg-slate-800 text-left">
                          <div class="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex flex-shrink-0 items-center justify-center">
                              <span class="material-symbols-rounded text-[20px]">inventory_2</span>
                          </div>
                          <div>
                              <div class="font-bold text-slate-900 dark:text-white mb-0.5">Supplier Spend Report</div>
                              <div class="text-xs opacity-60">Purchase price variance & total volume by vendor.</div>
                          </div>
                      </button>

                      <button class="w-full relative overflow-hidden group flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-white dark:bg-slate-800 text-left">
                          <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex flex-shrink-0 items-center justify-center">
                              <span class="material-symbols-rounded text-[20px]">groups</span>
                          </div>
                          <div>
                              <div class="font-bold text-slate-900 dark:text-white mb-0.5">Staff Performance</div>
                              <div class="text-xs opacity-60">Revenue generated and returns processed per employee.</div>
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

    ngOnInit() {
        this.loadData();
        // Listen to store changes
        effect(() => {
            const store = this.storeService.currentStore();
            if (store) this.loadData();
        });
    }

    async loadData() {
        const store = this.storeService.currentStore();
        if (!store) return;

        // Let's pretend we have a reporting RPC that aggregates this
        // but for now we calculate in-memory for the demo.
        this.supabase.getTransactions(store.id).pipe(
            switchMap(txs => {
                this.transactions.set(txs);
                return this.supabase.getProducts(store.id);
            })
        ).subscribe(async prods => {
            this.products.set(prods);

            // Fetch items for the loaded transactions
            const txs = this.transactions();
            let allItems: TransactionItem[] = [];

            // Note: highly inefficient strictly for demo purposes locally!
            // In reality, this would be computed quickly via Supabase DB View
            const tClient = (this.supabase as any).supabase;
            if (tClient) {
                const { data } = await tClient
                    .from('transaction_items')
                    .select('*')
                    .in('transaction_id', txs.map(t => t.id));
                if (data) allItems = data;
            }

            this.items.set(allItems);
        });
    }

    metrics = computed(() => {
        const txs = this.transactions();
        const txItems = this.items();
        const prods = this.products();

        let revenue = 0;
        let cogs = 0;

        txs.forEach(t => {
            if (t.metadata?.status !== 'VOID') {
                revenue += Number(t.total_amount);
            }
        });

        txItems.forEach(ti => {
            // Find parent tx to ensure it is not voided
            const pt = txs.find(t => t.id === ti.transaction_id);
            if (pt && pt.metadata?.status !== 'VOID') {
                // If no historic cost_at_sale, fallback to current base product cost
                let saleCost = ti.cost_at_sale || 0;
                if (!saleCost) {
                    const p = prods.find(pr => pr.id === ti.product_id);
                    saleCost = p?.cost_price || (ti.price_at_sale * 0.6); // Fallback: 40% margin estimate if no COGS logged
                }
                cogs += (saleCost * ti.quantity);
            }
        });

        const profit = revenue - cogs;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        return { revenue, cogs, profit, margin };
    });

    topProducts = computed(() => {
        const txItems = this.items();
        const prods = this.products();
        const txs = this.transactions();

        // Group by product
        const stats: Record<string, any> = {};

        txItems.forEach(ti => {
            const pt = txs.find(t => t.id === ti.transaction_id);
            if (pt && pt.metadata?.status !== 'VOID') {
                if (!stats[ti.product_id]) {
                    const p = prods.find(pr => pr.id === ti.product_id);
                    stats[ti.product_id] = {
                        productId: ti.product_id,
                        name: p?.name || 'Unknown',
                        category: p?.category_id || 'Retail', // Could lookup category name
                        qty: 0,
                        revenue: 0,
                        cogs: 0
                    };
                }

                stats[ti.product_id].qty += ti.quantity;
                stats[ti.product_id].revenue += Number(ti.price_at_sale) * ti.quantity;

                let saleCost = ti.cost_at_sale || 0;
                if (!saleCost) {
                    const p = prods.find(pr => pr.id === ti.product_id);
                    saleCost = p?.cost_price || (ti.price_at_sale * 0.6);
                }
                stats[ti.product_id].cogs += (saleCost * ti.quantity);
            }
        });

        // Compute profit & flatten
        let arr = Object.values(stats).map(s => {
            s.profit = s.revenue - s.cogs;
            s.margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
            return s;
        });

        // Sort by Profit DESC
        arr.sort((a, b) => b.profit - a.profit);
        return arr.slice(0, 5); // top 5
    });
}
