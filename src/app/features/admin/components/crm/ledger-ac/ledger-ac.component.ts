import { Component, input, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { StoreConfigService } from '../../../../../core/services/store-config.service';
import { MockSupabaseService, CustomerLedger, Customer } from '../../../../../core/services/mock-supabase.service';
import { DialogService } from '../../../../../core/services/dialog.service';
import { DateRangePickerComponent, DateRange } from '../../../../../shared/components/date-range-picker.component';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-ledger-ac',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, DateRangePickerComponent],
  template: `
    <div class="p-6">
       <!-- Controls Header -->
       <div class="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 flex items-center justify-center">
                 <span class="material-symbols-rounded">menu_book</span>
             </div>
             <div>
                 <h3 class="text-lg font-bold">Ledger Account</h3>
                 <p class="text-xs text-slate-500">Chronological transaction history with running balance</p>
             </div>
          </div>
          
          <div class="flex items-center gap-3">
             <app-date-range-picker 
               [initialPreset]="'THIS_YEAR'"
               (rangeSelected)="onRangeSelected($event)">
             </app-date-range-picker>
             
             <button (click)="printLedger()" class="h-10 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
                 <span class="material-symbols-rounded text-[18px]">print</span> Print
             </button>
          </div>
       </div>

       <!-- Summary Cards -->
       <div class="grid grid-cols-3 gap-4 mb-6">
           <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
               <div class="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Opening Balance</div>
               <div class="text-xl font-mono font-bold" [class.text-red-500]="openingBalance() < 0" [class.text-green-600]="openingBalance() > 0">{{ openingBalance() | currency:storeService.currency() }}</div>
               <div class="text-xs text-slate-400 mt-1">{{ selectedDateRange().start ? (selectedDateRange().start | date:'mediumDate') : 'Beginning of Time' }}</div>
           </div>
           
           <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
               <div class="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Period Movement</div>
               <div class="flex justify-center items-center gap-4 mt-1">
                   <div class="text-green-600">
                       <span class="text-xs block">Credits/Payments</span>
                       <span class="font-mono font-bold">{{ periodCredits() | currency:storeService.currency() }}</span>
                   </div>
                   <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                   <div class="text-red-500">
                       <span class="text-xs block">Debits/Charges</span>
                       <span class="font-mono font-bold">{{ periodDebits() | currency:storeService.currency() }}</span>
                   </div>
               </div>
           </div>

           <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
               <div class="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Closing Balance</div>
               <div class="text-3xl font-mono font-black" [class.text-red-500]="closingBalance() < 0" [class.text-blue-600]="closingBalance() >= 0" [class.font-black]="true">
                   {{ closingBalance() | currency:storeService.currency() }}
               </div>
               <div class="text-xs text-slate-400 mt-1">As of {{ (selectedDateRange().end || today) | date:'mediumDate' }}</div>
           </div>
       </div>

       <!-- The Ledger Table -->
       <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm" id="ledger-printable-area">
           <table class="w-full text-sm text-left">
               <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                   <tr>
                       <th class="px-5 py-4 font-black uppercase text-[10px] tracking-widest border-b border-slate-200 dark:border-slate-700">Date</th>
                       <th class="px-5 py-4 font-black uppercase text-[10px] tracking-widest border-b border-slate-200 dark:border-slate-700 w-1/3">Description / Reference</th>
                       <th class="px-5 py-4 font-black uppercase text-[10px] tracking-widest border-b border-slate-200 dark:border-slate-700 text-right">Debit (Charge)</th>
                       <th class="px-5 py-4 font-black uppercase text-[10px] tracking-widest border-b border-slate-200 dark:border-slate-700 text-right">Credit (Payment)</th>
                       <th class="px-5 py-4 font-black uppercase text-[10px] tracking-widest border-b border-slate-200 dark:border-slate-700 text-right">Balance</th>
                   </tr>
               </thead>
               <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
                   <!-- Opening Balance Row -->
                   <tr class="bg-slate-50/50 dark:bg-slate-900/20 italic">
                       <td class="px-5 py-3 text-slate-500">{{ selectedDateRange().start ? (selectedDateRange().start | date:'dd MMM yyyy') : '—' }}</td>
                       <td class="px-5 py-3 font-medium text-slate-600 dark:text-slate-400">Opening Balance</td>
                       <td class="px-5 py-3 text-right"></td>
                       <td class="px-5 py-3 text-right"></td>
                       <td class="px-5 py-3 text-right font-mono font-bold">{{ openingBalance() | currency:storeService.currency() }}</td>
                   </tr>

                   @for (row of ledgerRows(); track row.entry.id) {
                       <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                           <td class="px-5 py-3 align-top">
                               <div class="font-medium text-slate-800 dark:text-slate-200">{{ row.entry.created_at | date:'dd MMM yyyy' }}</div>
                               <div class="text-[10px] text-slate-400">{{ row.entry.created_at | date:'HH:mm' }}</div>
                           </td>
                           <td class="px-5 py-3 align-top">
                               <div class="flex items-center gap-2">
                                   <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
                                       [class.bg-blue-100]="row.entry.type === 'SALE'" [class.text-blue-700]="row.entry.type === 'SALE'"
                                       [class.bg-green-100]="row.entry.type === 'PAYMENT'" [class.text-green-700]="row.entry.type === 'PAYMENT'"
                                       [class.bg-orange-100]="row.entry.type === 'ADJUSTMENT' || row.entry.type === 'REFUND'" [class.text-orange-700]="row.entry.type === 'ADJUSTMENT' || row.entry.type === 'REFUND'">
                                       {{ row.entry.type }}
                                   </span>
                                   @if(row.entry.transaction_id) {
                                       <span class="text-xs font-mono text-slate-400">Ref: {{ row.entry.transaction_id.substring(0,8) }}</span>
                                   }
                               </div>
                               <div class="text-sm mt-1 text-slate-600 dark:text-slate-300 line-clamp-2" [title]="row.entry.notes || ''">
                                   {{ row.entry.notes || 'No description provided' }}
                               </div>
                           </td>
                           
                           <!-- Debits (Negative amounts in our DB) -->
                           <td class="px-5 py-3 align-top text-right text-red-500 font-mono">
                               {{ row.entry.amount < 0 ? (row.debitAmount | currency:storeService.currency()) : '' }}
                           </td>
                           
                           <!-- Credits (Positive amounts in our DB) -->
                           <td class="px-5 py-3 align-top text-right text-green-600 font-mono">
                               {{ row.entry.amount > 0 ? (row.creditAmount | currency:storeService.currency()) : '' }}
                           </td>
                           
                           <!-- Running Balance -->
                           <td class="px-5 py-3 align-top text-right font-mono font-bold"
                               [class.text-red-500]="row.runningBalance < 0"
                               [class.text-slate-800]="row.runningBalance >= 0"
                               [class.dark:text-slate-200]="row.runningBalance >= 0">
                               {{ row.runningBalance | currency:storeService.currency() }}
                           </td>
                       </tr>
                   } @empty {
                       <tr>
                           <td colspan="5" class="px-5 py-12 text-center text-slate-500">
                               <span class="material-symbols-rounded block text-4xl mb-2 text-slate-300">receipt_long</span>
                               No ledger entries found for the selected period.
                           </td>
                       </tr>
                   }
                   
                   <!-- Closing Balance Row -->
                   <tr class="bg-indigo-50/50 dark:bg-indigo-900/20 border-t-2 border-slate-200 dark:border-slate-700">
                       <td class="px-5 py-4 font-black uppercase text-[10px] tracking-widest text-slate-500" colspan="2">Closing Balance as of {{ (selectedDateRange().end || today) | date:'dd MMM yyyy' }}</td>
                       <td class="px-5 py-4 text-right font-mono font-bold text-red-500">{{ periodDebits() | currency:storeService.currency() }}</td>
                       <td class="px-5 py-4 text-right font-mono font-bold text-green-600">{{ periodCredits() | currency:storeService.currency() }}</td>
                       <td class="px-5 py-4 text-right font-mono font-black text-lg" [class.text-red-500]="closingBalance() < 0" [class.text-blue-600]="closingBalance() >= 0">
                           {{ closingBalance() | currency:storeService.currency() }}
                       </td>
                   </tr>
               </tbody>
           </table>
       </div>
    </div>
  `,
  styleUrls: []
})
export class LedgerAcComponent {
  customer = input.required<Customer>();

  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  dialog = inject(DialogService);

  today = new Date();
  selectedDateRange = signal<{ start: Date | null, end: Date | null }>({ start: null, end: null });

  // Store the raw ledger data internally
  private rawLedger = signal<CustomerLedger[]>([]);
  private rawAllTimeLedgerForOpeningBalance = signal<CustomerLedger[]>([]);

  // Derived state
  openingBalance = computed(() => {
    // If no start date, opening balance is 0
    if (!this.selectedDateRange().start) return 0;

    // Otherwise, it's the sum of all entries BEFORE the start date
    const start = this.selectedDateRange().start!;
    let bal = 0;
    for (const entry of this.rawAllTimeLedgerForOpeningBalance()) {
      if (new Date(entry.created_at) < start) {
        bal += entry.amount;
      }
    }
    return bal;
  });

  ledgerRows = computed(() => {
    let currentBal = this.openingBalance();
    const rows = [];

    for (const entry of this.rawLedger()) {
      currentBal += entry.amount;
      rows.push({
        entry: entry,
        debitAmount: entry.amount < 0 ? Math.abs(entry.amount) : 0,
        creditAmount: entry.amount > 0 ? entry.amount : 0,
        runningBalance: currentBal
      });
    }
    return rows;
  });

  periodCredits = computed(() => {
    return this.rawLedger().reduce((sum, entry) => sum + (entry.amount > 0 ? entry.amount : 0), 0);
  });

  periodDebits = computed(() => {
    return this.rawLedger().reduce((sum, entry) => sum + (entry.amount < 0 ? Math.abs(entry.amount) : 0), 0);
  });

  closingBalance = computed(() => {
    if (this.ledgerRows().length === 0) return this.openingBalance();
    return this.ledgerRows()[this.ledgerRows().length - 1].runningBalance;
  });

  constructor() {
    // Effect to fetch data whenever customer or date range changes
    effect(() => {
      const cust = this.customer();
      const range = this.selectedDateRange();

      if (cust) {
        // 1. Fetch entries for the specific period
        const dateArgs = (range.start || range.end) ? {
          start: range.start?.toISOString(),
          end: range.end?.toISOString()
        } : undefined;

        this.supabase.getCustomerLedger(cust.id, dateArgs).subscribe(data => {
          this.rawLedger.set(data);
        });

        // 2. If a start date is selected, we need to calculate opening balance
        // To do this, we fetch ALL entries up to the start date
        if (range.start) {
          this.supabase.getCustomerLedger(cust.id, { end: range.start.toISOString() }).subscribe(data => {
            // Filter out anything exactly on or after the start time just in case
            const beforeStart = data.filter(d => new Date(d.created_at) < range.start!);
            this.rawAllTimeLedgerForOpeningBalance.set(beforeStart);
          });
        } else {
          this.rawAllTimeLedgerForOpeningBalance.set([]);
        }
      }
    }, { allowSignalWrites: true });
  }

  onRangeSelected(range: DateRange) {
    // Small timeout to allow UI to settle if it animates
    setTimeout(() => {
      this.selectedDateRange.set({ start: range.start, end: range.end });
    }, 50);
  }

  printLedger() {
    window.print();
  }
}
