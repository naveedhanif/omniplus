import { Component, inject, signal, Signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, combineLatest, BehaviorSubject } from 'rxjs';
import {
  MockSupabaseService,
  Transaction,
  TransactionItem,
  PaymentMethod
} from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';
import { DialogService } from '../../../../services/dialog.service';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe],
  template: `
    <div class="space-y-6">
      <!-- Search & Filters -->
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
        <div class="flex flex-col md:flex-row md:items-center gap-4">
           <div class="relative flex-1">
              <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input 
                [formControl]="historySearchControl"
                type="text" 
                placeholder="Search by Transaction ID or Customer..." 
                class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-colors">
           </div>
           <select [formControl]="methodFilterControl" class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm outline-none">
              <option value="ALL">All Payments</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="ON_ACCOUNT">On Account (Debt)</option>
           </select>
        </div>
      </div>

      <!-- Transactions Table -->
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">
            <tr>
              <th class="p-4">Time</th>
              <th class="p-4">Reference</th>
              <th class="p-4">Customer</th>
              <th class="p-4 text-right">Total</th>
              <th class="p-4 text-center">Method</th>
              <th class="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (tx of filteredTransactions(); track tx.id) {
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group">
                <td class="p-4 opacity-60 font-medium">{{ tx.created_at | date:'MMM d, HH:mm' }}</td>
                <td class="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">#{{ tx.id.substring(0,8) }}</td>
                <td class="p-4">
                  @if(tx.customer) {
                    <div class="font-bold">{{ tx.customer.full_name }}</div>
                  } @else {
                    <span class="opacity-30 italic">Walk-in Customer</span>
                  }
                </td>
                <td class="p-4 text-right font-mono font-bold">{{ tx.total_amount | currency:storeService.currency() }}</td>
                <td class="p-4 text-center">
                  <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                    {{ tx.payment_method }}
                  </span>
                  @if (tx.metadata?.status === 'VOID') {
                    <span class="block text-red-500 font-bold text-[9px] uppercase mt-1">VOIDED</span>
                  }
                </td>
                <td class="p-4 text-right">
                  <button (click)="viewTransactionDetail(tx)" class="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors">
                    <span class="material-symbols-rounded text-lg">visibility</span>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="p-12 text-center opacity-50 italic">No transactions found in history.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Transaction Detail Overlay (Copy-pasted logic from dashboard) -->
    @if (showDetailModal()) {
       <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:p-0 print:bg-white print:fixed print:inset-0">
          <div class="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 print:shadow-none print:w-full print:max-w-none print:h-full print:rounded-none">
            <!-- Receipt Content (Same as in CRM) -->
            <div id="receipt-printable" class="p-8 pb-4 text-black bg-white dark:bg-white dark:text-black">
                <div class="text-center mb-6">
                    <h2 class="text-2xl font-bold uppercase tracking-wide">{{ storeService.currentStore()?.name }}</h2>
                    <p class="text-sm opacity-60">Receipt #{{ selectedTx()?.id?.substring(0,8) }}</p>
                    <p class="text-xs opacity-60">{{ selectedTx()?.created_at | date:'medium' }}</p>
                    @if (selectedTx()?.metadata?.status === 'VOID') {
                        <div class="mt-2 border-2 border-red-500 text-red-500 font-bold text-xl uppercase -rotate-6 inline-block px-4 py-1 rounded">VOID</div>
                    }
                </div>

                <div class="border-t border-b border-slate-300 py-2 mb-4">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="text-xs uppercase opacity-60">
                                <th class="text-left py-1">Item</th>
                                <th class="text-right py-1">Qty</th>
                                <th class="text-right py-1">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (item of selectedTxItems(); track item.id) {
                                <tr>
                                    <td class="py-1 pr-2">
                                      {{ item.product?.name || 'Unknown Item' }}
                                      @if(item.serial_number) {
                                          <span class="block text-[10px] font-mono text-slate-500">SN: {{ item.serial_number.serial_number }}</span>
                                      }
                                    </td>
                                    <td class="py-1 text-right">{{ item.quantity }}</td>
                                    <td class="py-1 text-right">{{ (item.price_at_sale * item.quantity) | currency:storeService.currency() }}</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>

                <div class="space-y-1 text-sm mb-6">
                     <div class="flex justify-between font-bold text-lg border-t border-slate-300 pt-1 mt-1">
                         <span>Total</span>
                         <span>{{ selectedTx()?.total_amount | currency:storeService.currency() }}</span>
                     </div>
                     <div class="border-t border-slate-200 mt-2 pt-2 space-y-1">
                         <div class="text-[10px] font-bold uppercase opacity-40 mb-1">Payment Breakdown</div>
                         @if (selectedTx()?.payments) {
                             @for (p of selectedTx()?.payments; track $index) {
                                 <div class="flex justify-between text-xs">
                                     <span>{{ p.method }}</span>
                                     <span class="font-mono font-bold">{{ p.amount | currency:storeService.currency() }}</span>
                                 </div>
                             }
                         } @else {
                             <div class="flex justify-between text-xs">
                                 <span>{{ selectedTx()?.payment_method }}</span>
                                 <span class="font-mono font-bold">{{ selectedTx()?.total_amount | currency:storeService.currency() }}</span>
                             </div>
                         }
                     </div>

                     @if (selectedTx()?.metadata?.void_reason) {
                        <div class="mt-4 p-3 bg-red-50 border border-red-100 rounded text-[10px]">
                            <div class="font-bold text-red-600 uppercase mb-1">Void Reason</div>
                            <div class="text-red-700 italic">"{{ selectedTx()?.metadata?.void_reason }}"</div>
                            <div class="mt-1 opacity-50">Voided at: {{ selectedTx()?.metadata?.voided_at | date:'medium' }}</div>
                        </div>
                     }
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="p-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-2 no-print">
                <div class="grid grid-cols-2 gap-2">
                    <button (click)="printReceipt()" class="flex items-center justify-center gap-2 py-2.5 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 rounded-lg font-bold hover:opacity-90 transition-opacity">
                        <span class="material-symbols-rounded">print</span> Print
                    </button>
                    <button (click)="openPaymentCorrection()" [disabled]="selectedTx()?.metadata?.status === 'VOID'" class="flex items-center justify-center gap-2 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                        <span class="material-symbols-rounded">edit</span> Correct Pay
                    </button>
                </div>
                
                @if (selectedTx()?.metadata?.status !== 'VOID') {
                  <button (click)="voidTransaction()" class="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors">
                      <span class="material-symbols-rounded">block</span> Void Transaction
                  </button>
                }
                
                <button (click)="showDetailModal.set(false)" class="mt-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Close</button>
            </div>
          </div>
       </div>
    }

    <!-- Payment Correction Modal (Same as in CRM) -->
    @if (showCorrectionModal()) {
       <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 dark:border-slate-700">
               <h3 class="text-lg font-bold mb-4">Correct Payment</h3>
               <div class="grid grid-cols-1 gap-2 mb-6">
                   <button (click)="submitPaymentCorrection('CASH')" class="p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left flex items-center gap-2">
                     <span class="material-symbols-rounded text-green-600">payments</span> CASH
                   </button>
                   <button (click)="submitPaymentCorrection('CARD')" class="p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left flex items-center gap-2">
                     <span class="material-symbols-rounded text-blue-600">credit_card</span> CARD
                   </button>
                   <button (click)="submitPaymentCorrection('ON_ACCOUNT')" class="p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left flex items-center gap-2">
                     <span class="material-symbols-rounded text-orange-600">account_balance_wallet</span> ON ACCOUNT
                   </button>
               </div>
               <button (click)="showCorrectionModal.set(false)" class="w-full py-2 opacity-50">Cancel</button>
          </div>
       </div>
    }
  `,
  styleUrls: []
})
export class SalesHistoryComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  dialog = inject(DialogService);
  fb = inject(FormBuilder);
  historySearchControl = this.fb.control('');
  methodFilterControl = this.fb.control('ALL');

  historySearchQuery = toSignal(this.historySearchControl.valueChanges, { initialValue: '' });
  methodFilter = toSignal(this.methodFilterControl.valueChanges, { initialValue: 'ALL' });

  private refreshTrigger = new BehaviorSubject<void>(undefined);

  private transactions$ = combineLatest([
    this.storeService.currentStore$,
    this.refreshTrigger
  ]).pipe(
    switchMap(([store]) => store ? this.supabase.getTransactions(store.id) : of([]))
  );

  transactionsSignal: Signal<Transaction[]> = toSignal(this.transactions$, { initialValue: [] as Transaction[] });

  filteredTransactions = computed(() => {
    const all = this.transactionsSignal();
    const query = String(this.historySearchQuery() ?? '').toLowerCase().trim();
    const method = this.methodFilter();

    return all.filter(tx => {
      const matchesQuery = query ? (
        tx.id.toLowerCase().includes(query) ||
        (tx.customer?.full_name || '').toLowerCase().includes(query)
      ) : true;
      const matchesMethod = method !== 'ALL' ? tx.payment_method === method : true;
      return matchesQuery && matchesMethod;
    });
  });

  showDetailModal = signal(false);
  showCorrectionModal = signal(false);
  selectedTx = signal<Transaction | null>(null);
  selectedTxItems = signal<TransactionItem[]>([]);

  viewTransactionDetail(tx: Transaction) {
    this.selectedTx.set(tx);
    this.selectedTxItems.set([]);
    this.showDetailModal.set(true);

    this.supabase.getTransactionItems(tx.id).subscribe({
      next: (items) => this.selectedTxItems.set(items),
      error: (err) => console.error('Failed to load transaction items', err)
    });
  }

  printReceipt() {
    window.print();
  }

  async voidTransaction() {
    const tx = this.selectedTx();
    if (!tx) return;

    const confirmed = await this.dialog.confirm(
      'Void Transaction',
      'Are you sure you want to void this transaction? \n\nThis will:\n1. Return all items to stock\n2. Reverse any customer debt\n3. Mark order as void in reports'
    );

    if (confirmed) {
      const reason = await this.dialog.prompt('Void Reason', 'Please enter a reason for voiding this transaction:', 'Customer Request');
      if (reason === null) return; // Cancelled

      this.supabase.voidTransaction(tx.id, reason).subscribe({
        next: () => {
          this.dialog.alert('Void Successful', 'Transaction voided and stock restored.');
          this.showDetailModal.set(false);
          // Refresh list by emitting on our trigger
          this.refreshTrigger.next();
        },
        error: (err: any) => this.dialog.alert('Error', 'Failed to void: ' + err.message)
      });
    }
  }

  openPaymentCorrection() {
    this.showCorrectionModal.set(true);
  }

  submitPaymentCorrection(newMethod: PaymentMethod) {
    const tx = this.selectedTx();
    if (!tx) return;

    this.supabase.updateTransactionPaymentMethod(
      tx.id,
      tx.payment_method,
      newMethod,
      tx.customer_id!,
      tx.total_amount
    ).subscribe({
      next: () => {
        this.dialog.alert('Updated', 'Payment method corrected.');
        this.showCorrectionModal.set(false);
        this.showDetailModal.set(false);
      },
      error: (err) => this.dialog.alert('Error', 'Failed to update.')
    });
  }
}
