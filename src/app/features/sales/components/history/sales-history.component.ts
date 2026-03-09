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
} from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { CustomerInvoicePrintComponent } from '../../../../shared/components/customer-invoice-print.component';
import { DateRangePickerComponent, DateRange } from '../../../../shared/components/date-range-picker.component';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, CustomerInvoicePrintComponent, DateRangePickerComponent],
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
           <div class="relative w-full md:w-auto z-20">
              <app-date-range-picker 
                [initialPreset]="'THIS_MONTH'"
                (rangeSelected)="onRangeSelected($event)">
              </app-date-range-picker>
           </div>

           <div class="relative w-full md:w-auto">
              <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10 text-[18px]">payments</span>
              <select [formControl]="methodFilterControl" class="w-full md:w-auto bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-8 py-2 text-sm outline-none appearance-none font-medium text-slate-700 dark:text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow">
                 <option value="ALL">All Payments</option>
                 <option value="CASH">Cash</option>
                 <option value="CARD">Card</option>
                 <option value="ON_ACCOUNT">On Account</option>
              </select>
              <span class="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
           </div>
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
                  <div class="flex items-center justify-end gap-2">
                    <button (click)="openPrintModal(tx)" tooltip="Print Invoice" class="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-indigo-600 dark:text-indigo-400">
                      <span class="material-symbols-rounded text-lg">print</span>
                    </button>
                    <button (click)="viewTransactionDetail(tx)" tooltip="View Details" class="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors">
                      <span class="material-symbols-rounded text-lg">visibility</span>
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="p-12 text-center opacity-50 italic">No transactions found in history.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Transaction Detail Overlay (FinTech Redesign) -->
    @if (showDetailModal()) {
       <div (click)="showDetailModal.set(false)" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:p-0 print:bg-white print:fixed print:inset-0 cursor-zoom-out">
          
          <div (click)="$event.stopPropagation()" class="bg-slate-50 dark:bg-slate-900 w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:w-full print:max-w-none print:h-full print:rounded-none border border-white/20 cursor-default relative flex flex-col max-h-[90vh]">
            
            <!-- Close Button (Absolute Top Right) -->
            <button (click)="showDetailModal.set(false)" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors z-10 no-print">
               <span class="material-symbols-rounded text-[18px]">close</span>
            </button>

            <!-- Zone 1: Digital Paper Receipt -->
            <div class="flex-1 overflow-y-auto no-scrollbar p-2 no-print">
              <div id="receipt-printable" class="bg-white dark:bg-slate-800 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-700/50 p-6 print:rounded-none print:shadow-none print:border-none print:p-0 relative overflow-hidden">
                  
                  <!-- Status Pill -->
                  <div class="absolute top-6 left-6 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                       [class.bg-emerald-100]="selectedTx()?.metadata?.status !== 'VOID'"
                       [class.text-emerald-700]="selectedTx()?.metadata?.status !== 'VOID'"
                       [class.bg-red-100]="selectedTx()?.metadata?.status === 'VOID'"
                       [class.text-red-700]="selectedTx()?.metadata?.status === 'VOID'">
                      @if (selectedTx()?.metadata?.status === 'VOID') {
                         <span class="material-symbols-rounded text-[12px]">block</span> VOIDED
                      } @else {
                         <div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> PAID IN FULL
                      }
                  </div>

                  <div class="text-center mt-10 mb-8">
                      <h2 class="text-3xl font-black tracking-tighter text-slate-900 dark:text-white">{{ storeService.currentStore()?.name }}</h2>
                      <p class="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Receipt #{{ selectedTx()?.id?.substring(0,8) }}</p>
                      <p class="text-[10px] font-medium text-slate-400 mt-0.5">{{ selectedTx()?.created_at | date:'medium' }}</p>
                  </div>

                  <!-- Line Items -->
                  <div class="mb-6">
                      <table class="w-full text-sm">
                          <thead>
                              <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b-2 border-slate-100 dark:border-slate-700">
                                  <th class="text-left pb-2 w-full">Item Description</th>
                                  <th class="text-center pb-2 px-4">Qty</th>
                                  <th class="text-right pb-2">Price</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-50 dark:divide-slate-700/50">
                              @for (item of selectedTxItems(); track item.id) {
                                  <tr class="group">
                                      <td class="py-3 pr-2">
                                        <div class="font-bold text-slate-800 dark:text-slate-200 text-sm tracking-tight">{{ item.product?.name || 'Line Item' }}</div>
                                        @if(item.serial_number) {
                                            <span class="block text-[10px] font-mono text-slate-400 mt-0.5">SN: {{ item.serial_number.serial_number }}</span>
                                        }
                                      </td>
                                      <td class="py-3 text-center font-bold text-slate-600 dark:text-slate-400">{{ item.quantity }}</td>
                                      <td class="py-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">{{ (item.price_at_sale * item.quantity) | currency:storeService.currency() }}</td>
                                  </tr>
                              }
                          </tbody>
                      </table>
                  </div>

                  <!-- Summary Box -->
                  <div class="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
                       <div class="flex justify-between items-center text-[10px] font-bold uppercase text-slate-500">
                           <span>Payment Breakdown</span>
                           <span>Type</span>
                       </div>
                       
                       @if (selectedTx()?.payments) {
                           @for (p of selectedTx()?.payments; track $index) {
                               <div class="flex justify-between items-center bg-white dark:bg-slate-800 py-1.5 px-3 rounded-md shadow-sm border border-slate-100 dark:border-slate-700">
                                   <span class="text-xs font-bold text-slate-600 dark:text-slate-300">{{ p.method }}</span>
                                   <span class="font-mono font-bold">{{ p.amount | currency:storeService.currency() }}</span>
                               </div>
                           }
                       } @else {
                           <div class="flex justify-between items-center bg-white dark:bg-slate-800 py-1.5 px-3 rounded-md shadow-sm border border-slate-100 dark:border-slate-700">
                               <span class="text-xs font-bold text-slate-600 dark:text-slate-300">{{ selectedTx()?.payment_method }}</span>
                               <span class="font-mono font-bold">{{ selectedTx()?.total_amount | currency:storeService.currency() }}</span>
                           </div>
                       }

                       <div class="h-px bg-slate-200 dark:bg-slate-700/50 my-2"></div>
                       
                       <div class="flex justify-between items-end pt-1">
                           <span class="text-xs font-black uppercase text-slate-400 tracking-widest mb-1">Total Settled</span>
                           <span class="text-3xl font-black tracking-tighter text-slate-900 dark:text-white tabular-nums">{{ selectedTx()?.total_amount | currency:storeService.currency() }}</span>
                       </div>
                  </div>

                  @if (selectedTx()?.metadata?.void_reason) {
                     <div class="mt-4 p-4 bg-red-50/50 dark:bg-red-900/10 border-l-4 border-red-500 rounded-r-xl text-xs">
                         <div class="font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-1 text-[9px]">Void Reason Logged</div>
                         <div class="text-red-800 dark:text-red-300 font-medium italic mb-1">"{{ selectedTx()?.metadata?.void_reason }}"</div>
                         <div class="text-[9px] font-bold text-red-500/50 uppercase tracking-widest">{{ selectedTx()?.metadata?.voided_at | date:'medium' }}</div>
                     </div>
                  }
              </div>
            </div>

            <!-- Zone 2: Action Bar -->
            <div class="p-4 bg-transparent shrink-0 no-print">
                <div class="flex gap-2 mb-3">
                    <button (click)="printReceipt()" class="flex-1 flex items-center justify-center gap-2 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[0.98] transition-all">
                        <span class="material-symbols-rounded text-[18px]">print</span> Print
                    </button>
                    <button (click)="openPaymentCorrection()" [disabled]="selectedTx()?.metadata?.status === 'VOID'" class="flex-none w-[60px] flex items-center justify-center bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-2xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Correct Payment Method">
                        <span class="material-symbols-rounded text-[20px]">edit_note</span>
                    </button>
                </div>
                
                <div class="flex justify-center items-center h-6">
                  @if (selectedTx()?.metadata?.status !== 'VOID') {
                    <button (click)="voidTransaction()" class="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1 group">
                        <span class="material-symbols-rounded text-[12px] opacity-0 group-hover:opacity-100 transition-opacity -ml-4">warning</span>
                        Void / Reverse Order
                    </button>
                  }
                </div>
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

     <!-- Invoice Print Overlay -->
     @if (showPrintModal() && selectedTx()) {
        <app-customer-invoice-print 
          [transaction]="selectedTx()!"
          [items]="selectedTxItems()"
          [store]="storeService.currentStore()!"
          [currency]="storeService.currency()"
          (close)="showPrintModal.set(false)">
        </app-customer-invoice-print>
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

  // Custom Date Range Signal from DateRangePicker
  selectedDateRange = signal<{ start: Date | null, end: Date | null }>({ start: null, end: null });

  // Compute the ISO Date Range server-side args based on the DateRange
  dateRangeArgs = computed(() => {
    const range = this.selectedDateRange();

    if (!range.start && !range.end) return undefined;

    return {
      start: range.start?.toISOString(),
      end: range.end?.toISOString()
    };
  });

  onRangeSelected(range: DateRange) {
    this.selectedDateRange.set({ start: range.start, end: range.end });
  }

  private refreshTrigger = new BehaviorSubject<void>(undefined);

  private transactions$ = combineLatest({
    store: this.storeService.currentStore$,
    refresh: this.refreshTrigger.asObservable(),
    // We implicitly react to the dateRangeArgs via the switchMap below
  }).pipe(
    switchMap(({ store }) => {
      if (!store) return of([]);
      // Ensure we subscribe to changes in the signal by reading it inside switchMap (which isn't reactive on its own to signals unless inside an effect or computed). 
      // To fix this gracefully in standard RxJS:
      return this.supabase.getTransactions(store.id, this.dateRangeArgs());
    })
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
  showPrintModal = signal(false);
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

  openPrintModal(tx: Transaction) {
    this.selectedTx.set(tx);
    this.selectedTxItems.set([]);
    this.showPrintModal.set(true);

    // Fetch items specifically for the print invoice
    this.supabase.getTransactionItems(tx.id).subscribe({
      next: (items) => {
        this.selectedTxItems.set(items);
        // We wait slightly to allow angular to render the component before user clicks print
      },
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
