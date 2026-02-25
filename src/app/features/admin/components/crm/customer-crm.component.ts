import { Component, inject, signal, Signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { BehaviorSubject, combineLatest, of, firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import {
    MockSupabaseService,
    Customer,
    CustomerLedger,
    Transaction,
    TransactionItem,
    PaymentMethod
} from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';

@Component({
    selector: 'app-customer-crm',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe],
    template: `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      <!-- Left: Customer List -->
      <div class="lg:col-span-4 bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">Customers</h2>
            <button (click)="crmViewMode.set('CREATE')" class="p-2 bg-[var(--primary-color)] text-white rounded-lg hover:brightness-110 active:scale-95 transition-all">
              <span class="material-symbols-rounded">person_add</span>
            </button>
          </div>
          <div class="relative">
            <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input 
              [formControl]="customerSearchControl"
              type="text" 
              placeholder="Search by name or phone..." 
              class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors">
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          @for (customer of filteredCustomerList(); track customer.id) {
            <button 
              (click)="selectCustomer(customer)"
              [ngClass]="{
                'bg-blue-50': selectedCustomer()?.id === customer.id,
                'dark:bg-blue-900/20': selectedCustomer()?.id === customer.id,
                'border-blue-200': selectedCustomer()?.id === customer.id,
                'dark:border-blue-800': selectedCustomer()?.id === customer.id
              }"
              class="w-full text-left p-3 rounded-lg border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex justify-between items-center group"
            >
              <div>
                <div class="font-bold text-sm">{{ customer.full_name }}</div>
                <div class="text-xs opacity-60">{{ customer.phone || 'No phone' }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs font-bold" [class.text-red-500]="customer.current_balance < 0" [class.text-green-600]="customer.current_balance >= 0">
                  {{ customer.current_balance | currency:storeService.currency() }}
                </div>
                @if (customer.is_vip) {
                  <span class="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold uppercase tracking-tighter">VIP</span>
                }
              </div>
            </button>
          } @empty {
            <div class="p-8 text-center opacity-50 italic text-sm">No customers found.</div>
          }
        </div>
      </div>

      <!-- Right: Form or Details -->
      <div class="lg:col-span-8 bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        @if (crmViewMode() === 'CREATE') {
          <div class="p-8 max-w-2xl mx-auto w-full">
            <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
              <span class="material-symbols-rounded text-[var(--primary-color)]">person_add</span>
              Register New Customer
            </h2>
            <form [formGroup]="customerForm" (ngSubmit)="addCustomer()" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                  <label class="block text-sm font-medium mb-1">Full Name</label>
                  <input formControlName="full_name" type="text" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Phone Number</label>
                  <input formControlName="phone" type="tel" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Credit Limit</label>
                  <input formControlName="credit_limit" type="number" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
                </div>
              </div>
              <div class="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <input formControlName="is_vip" type="checkbox" id="is_vip" class="w-4 h-4 text-[var(--primary-color)] rounded">
                <label for="is_vip" class="text-sm font-medium">Mark as VIP Customer</label>
              </div>
              <button type="submit" [disabled]="customerForm.invalid" class="w-full py-3 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 mt-4">
                Register Customer
              </button>
            </form>
          </div>
        } @else {
          @if (selectedCustomer(); as customer) {
            <!-- Customer Details Header -->
            <div class="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start bg-slate-50 dark:bg-slate-800/50">
              <div class="flex gap-4 items-center">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-blue-500/20">
                  {{ customer.full_name[0] }}
                </div>
                <div>
                  @if (isEditingCustomer()) {
                      <div class="flex flex-col gap-2">
                           <input [formControl]="customerForm.controls.full_name" type="text" class="text-2xl font-bold bg-white dark:bg-slate-800 border rounded px-2 py-1 outline-none ring-2 ring-blue-500">
                           <input [formControl]="customerForm.controls.phone" type="text" class="text-sm opacity-70 bg-white dark:bg-slate-800 border rounded px-2 py-0.5 outline-none">
                      </div>
                  } @else {
                      <h2 class="text-2xl font-bold flex items-center gap-2">
                          {{ customer.full_name }}
                          @if (customer.is_vip) {
                              <span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold uppercase">VIP</span>
                          }
                      </h2>
                      <p class="text-sm opacity-60 flex items-center gap-1 group">
                          <span class="material-symbols-rounded text-base">call</span>
                          {{ customer.phone || 'No phone provided' }}
                          @if (customer.phone) {
                              <a [href]="getWhatsAppLink(customer.phone)" target="_blank" class="opacity-0 group-hover:opacity-100 transition-opacity text-green-600 font-bold ml-2">WhatsApp</a>
                          }
                      </p>
                  }
                </div>
              </div>
              
              <div class="flex gap-2">
                 @if (isEditingCustomer()) {
                     <button (click)="saveCustomerChanges()" class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm shadow hover:bg-green-700 transition-colors">Save</button>
                     <button (click)="cancelEditingCustomer()" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg font-bold text-sm hover:bg-slate-300 transition-colors">Cancel</button>
                 } @else {
                     <button (click)="startEditingCustomer()" class="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400">
                       <span class="material-symbols-rounded">edit</span>
                     </button>
                     <button (click)="deleteCustomer(customer.id)" class="p-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                       <span class="material-symbols-rounded">delete</span>
                     </button>
                 }
              </div>
            </div>

            <!-- Master Detail Grid for Financials -->
            <div class="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
              <!-- Left: Ledger & Payments -->
              <div class="border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
                  <div class="p-4 bg-slate-100 dark:bg-slate-900/30 flex justify-between items-center">
                      <h3 class="font-bold text-sm flex items-center gap-2">
                          <span class="material-symbols-rounded text-base text-blue-500">account_balance_wallet</span>
                          Balance Summary
                      </h3>
                      <div class="text-right">
                          <div class="text-xs opacity-60 uppercase font-bold tracking-tighter">Current Debt</div>
                          <div class="text-xl font-mono font-bold" [class.text-red-500]="customer.current_balance < 0" [class.text-green-600]="customer.current_balance >= 0">
                              {{ customer.current_balance | currency:storeService.currency() }}
                          </div>
                      </div>
                  </div>

                  <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-900/5">
                      <h4 class="text-xs font-bold uppercase text-blue-600 dark:text-blue-400 mb-3 tracking-widest">Post Ledger Entry</h4>
                      <form [formGroup]="paymentForm" (ngSubmit)="submitLedgerEntry()" class="space-y-3">
                          <div class="grid grid-cols-2 gap-2">
                              <select formControlName="type" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-sm outline-none">
                                  <option value="PAYMENT">Customer Payment (+)</option>
                                  <option value="SALE">Manual Charge (-)</option>
                                  <option value="ADJUSTMENT">Balance Correction</option>
                              </select>
                              <input formControlName="amount" type="number" step="0.01" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-sm font-mono outline-none" placeholder="Amount">
                          </div>
                          <div class="flex gap-2">
                              <input formControlName="notes" type="text" placeholder="Note (e.g. Bank Transfer Ref...)" class="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-sm outline-none">
                              <button type="submit" [disabled]="paymentForm.invalid" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm shadow hover:bg-blue-700 transition-all active:scale-95">Post</button>
                          </div>
                      </form>
                  </div>

                  <div class="flex-1 overflow-y-auto p-0">
                      <table class="w-full text-xs text-left">
                          <thead class="bg-slate-50 dark:bg-slate-800 sticky top-0 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                  <th class="p-3">Date</th>
                                  <th class="p-3">Activity</th>
                                  <th class="p-3 text-right">Amount</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                              @for (entry of currentLedger(); track entry.id) {
                                  <tr>
                                      <td class="p-3 opacity-60">{{ entry.created_at | date:'MMM d, HH:mm' }}</td>
                                      <td class="p-3">
                                          <div class="font-bold">{{ entry.type }}</div>
                                          @if(entry.notes){ <div class="opacity-50 text-[10px] italic">{{ entry.notes }}</div> }
                                      </td>
                                      <td class="p-3 text-right font-mono font-bold" [class.text-green-600]="entry.amount > 0" [class.text-red-500]="entry.amount < 0">
                                          {{ entry.amount | currency:storeService.currency() }}
                                      </td>
                                  </tr>
                              } @empty {
                                  <tr><td colspan="3" class="p-10 text-center opacity-40 italic">No ledger history.</td></tr>
                              }
                          </tbody>
                      </table>
                  </div>
              </div>

              <!-- Right: Sales History -->
              <div class="flex flex-col overflow-hidden bg-slate-50/50 dark:bg-black/10">
                  <div class="p-4 bg-slate-100 dark:bg-slate-900/30 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
                      <h3 class="font-bold text-sm flex items-center gap-2">
                          <span class="material-symbols-rounded text-base text-orange-500">history</span>
                          Purchase History
                      </h3>
                      <div class="text-right">
                          <div class="text-xs opacity-60 uppercase font-bold tracking-tighter">Total Lifetime Spend</div>
                          <div class="text-lg font-mono font-bold text-[var(--primary-color)]">
                              {{ customerTotalSpend() | currency:storeService.currency() }}
                          </div>
                      </div>
                  </div>

                  <div class="p-4 border-b border-slate-200 dark:border-slate-700">
                      <div class="relative">
                          <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                          <input 
                              [formControl]="transactionSearchControl"
                              type="text" 
                              placeholder="Filter orders..." 
                              class="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/50">
                      </div>
                  </div>

                  <div class="flex-1 overflow-y-auto">
                      <table class="w-full text-xs text-left">
                          <thead class="bg-slate-50 dark:bg-slate-800 sticky top-0 text-slate-500 font-bold">
                              <tr>
                                  <th class="p-3">Order ID</th>
                                  <th class="p-3 text-right">Total</th>
                                  <th class="p-3 text-right">Pay Method</th>
                              </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                              @for (tx of filteredTransactions(); track tx.id) {
                                  <tr (click)="viewTransactionDetails(tx)" class="hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors group">
                                      <td class="p-3">
                                          <div class="font-mono text-[var(--primary-color)] group-hover:underline">#{{ tx.id.substring(0,8) }}</div>
                                          <div class="opacity-50 text-[10px]">{{ tx.created_at | date:'short' }}</div>
                                      </td>
                                      <td class="p-3 text-right font-bold">{{ tx.total_amount | currency:storeService.currency() }}</td>
                                      <td class="p-3 text-right">
                                          <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                                              {{ tx.payment_method }}
                                          </span>
                                          @if (tx.metadata?.status === 'VOID') {
                                              <span class="block text-red-500 font-bold text-[9px] uppercase mt-1">VOIDED</span>
                                          }
                                      </td>
                                  </tr>
                              } @empty {
                                  <tr><td colspan="3" class="p-10 text-center opacity-40 italic">No transactions recorded.</td></tr>
                              }
                          </tbody>
                      </table>
                  </div>
              </div>
            </div>
          } @else {
             <div class="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-50">
               <span class="material-symbols-rounded text-6xl mb-4">group</span>
               <h3 class="text-xl font-bold">Customer CRM</h3>
               <p class="max-w-xs">Select a customer from the sidebar to view their balance, history, and debt details.</p>
             </div>
          }
        }
      </div>
    </div>

    <!-- Transaction Details modal -->
      @if (showTransactionDetailModal()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:p-0 print:bg-white print:fixed print:inset-0">
              <div class="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 print:shadow-none print:w-full print:max-w-none print:h-full print:rounded-none">
                  
                  <!-- Printable Area -->
                  <div id="receipt-printable" class="p-8 pb-4 text-black bg-white dark:bg-white dark:text-black">
                      <div class="text-center mb-6">
                          <h2 class="text-2xl font-bold uppercase tracking-wide">{{ storeService.currentStore()?.name }}</h2>
                          <p class="text-sm opacity-60">Receipt #{{ editingTransaction()?.id?.substring(0,8) }}</p>
                          <p class="text-xs opacity-60">{{ editingTransaction()?.created_at | date:'medium' }}</p>
                          @if (editingTransaction()?.metadata?.status === 'VOID') {
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
                                  @for (item of selectedTransactionItems(); track item.id) {
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
                           <div class="flex justify-between">
                               <span>Subtotal</span>
                               <span>{{ (editingTransaction()?.total_amount || 0) - (editingTransaction()?.tax_amount || 0) | currency:storeService.currency() }}</span>
                           </div>
                           <div class="flex justify-between">
                               <span>Tax</span>
                               <span>{{ editingTransaction()?.tax_amount | currency:storeService.currency() }}</span>
                           </div>
                           <div class="flex justify-between font-bold text-lg border-t border-slate-300 pt-1 mt-1">
                               <span>Total</span>
                               <span>{{ editingTransaction()?.total_amount | currency:storeService.currency() }}</span>
                           </div>
                           <div class="flex justify-between text-xs pt-1 uppercase">
                               <span>Payment Method</span>
                               <span class="font-bold">{{ editingTransaction()?.payment_method }}</span>
                           </div>
                      </div>

                      <div class="text-center text-xs opacity-50">
                          <p>Thank you for shopping with us!</p>
                      </div>
                  </div>

                  <!-- Action Buttons (Hidden on Print) -->
                  <div class="p-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-2 no-print">
                      <div class="grid grid-cols-2 gap-2">
                        <button (click)="printReceipt()" class="flex items-center justify-center gap-2 py-2.5 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 rounded-lg font-bold hover:opacity-90 transition-opacity">
                            <span class="material-symbols-rounded">print</span> Print
                        </button>
                        <button (click)="openPaymentCorrection(editingTransaction()!)" [disabled]="editingTransaction()?.metadata?.status === 'VOID'" class="flex items-center justify-center gap-2 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                            <span class="material-symbols-rounded">edit</span> Correct Pay
                        </button>
                      </div>
                      
                      @if (editingTransaction()?.metadata?.status !== 'VOID') {
                        <button (click)="voidTransaction()" class="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20 active:scale-95">
                            <span class="material-symbols-rounded">block</span> Void Transaction
                        </button>
                      }
                      
                      <button (click)="showTransactionDetailModal.set(false)" class="mt-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Close</button>
                  </div>
              </div>
          </div>
      }

      <!-- Payment Correction Modal -->
      @if (showPaymentCorrectionModal()) {
          <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
                  <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                     <span class="material-symbols-rounded text-orange-500">edit_note</span>
                     Correct Payment
                  </h3>
                  
                  <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-sm mb-4 border border-slate-100 dark:border-slate-700">
                      <div class="flex justify-between mb-1">
                          <span class="opacity-70">Transaction:</span>
                          <span class="font-mono">{{ editingTransaction()?.id?.substring(0,8) }}</span>
                      </div>
                      <div class="flex justify-between mb-1">
                          <span class="opacity-70">Current Method:</span>
                          <span class="font-bold">{{ editingTransaction()?.payment_method }}</span>
                      </div>
                      <div class="flex justify-between">
                          <span class="opacity-70">Amount:</span>
                          <span class="font-bold">{{ editingTransaction()?.total_amount | currency:storeService.currency() }}</span>
                      </div>
                  </div>

                  <p class="text-xs opacity-70 mb-2">Change payment method to:</p>
                  <div class="grid grid-cols-1 gap-2 mb-6">
                      <button (click)="submitPaymentCorrection('CASH')" 
                        [disabled]="editingTransaction()?.payment_method === 'CASH'"
                        class="p-2 border rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-200 text-left flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <span class="material-symbols-rounded text-green-600">payments</span> CASH
                      </button>
                      
                      <button (click)="submitPaymentCorrection('CARD')" 
                        [disabled]="editingTransaction()?.payment_method === 'CARD'"
                        class="p-2 border rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 text-left flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <span class="material-symbols-rounded text-blue-600">credit_card</span> CARD
                      </button>

                      <button (click)="submitPaymentCorrection('ON_ACCOUNT')" 
                        [disabled]="editingTransaction()?.payment_method === 'ON_ACCOUNT'"
                        class="p-2 border rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-200 text-left flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold">
                         <span class="material-symbols-rounded text-orange-600">account_balance_wallet</span> 
                         ON ACCOUNT
                      </button>
                  </div>

                  <button (click)="showPaymentCorrectionModal.set(false)" class="w-full py-2 text-sm opacity-50 hover:opacity-100">Cancel</button>
             </div>
          </div>
      }
  `,
    styleUrls: []
})
export class CustomerCRMComponent {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    dialog = inject(DialogService);
    fb = inject(FormBuilder);

    customerSearchControl = this.fb.control('');
    transactionSearchControl = this.fb.control('');

    refreshCustomersTrigger = new BehaviorSubject<void>(undefined);

    private customers$ = combineLatest([
        this.storeService.currentStore$,
        this.refreshCustomersTrigger
    ]).pipe(
        switchMap(([store]) => store ? this.supabase.getCustomers(store.id) : of([]))
    );

    customersSignal: Signal<Customer[]> = toSignal(this.customers$, { initialValue: [] as Customer[] });

    customerSearchQuery = toSignal(this.customerSearchControl.valueChanges, { initialValue: '' });
    transactionSearchQuery = toSignal(this.transactionSearchControl.valueChanges, { initialValue: '' });

    filteredCustomerList = computed(() => {
        const all = this.customersSignal();
        const query = String(this.customerSearchQuery() ?? '').toLowerCase().trim();
        if (!query) return all;
        return all.filter(c => c.full_name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)));
    });

    filteredTransactions = computed(() => {
        const all = this.customerTransactions();
        const query = String(this.transactionSearchQuery() ?? '').toLowerCase().trim();
        if (!query) return all;
        return all.filter(tx =>
            tx.id.toLowerCase().includes(query) ||
            tx.total_amount.toString().includes(query) ||
            (tx.payment_method && String(tx.payment_method).toLowerCase().includes(query)) ||
            (tx.created_at && String(tx.created_at).includes(query))
        );
    });

    selectedCustomer = signal<Customer | null>(null);
    isEditingCustomer = signal(false);
    currentLedger = signal<CustomerLedger[]>([]);
    customerTransactions = signal<Transaction[]>([]);
    customerTotalSpend = signal(0);
    crmViewMode = signal<'DETAILS' | 'CREATE'>('CREATE');

    showTransactionDetailModal = signal(false);
    selectedTransactionItems = signal<TransactionItem[]>([]);
    editingTransaction = signal<Transaction | null>(null);
    showPaymentCorrectionModal = signal(false);

    customerForm: FormGroup;
    paymentForm: FormGroup;

    constructor() {
        this.crmViewMode.set('CREATE');

        this.customerForm = this.fb.group({
            full_name: ['', Validators.required],
            phone: [''],
            credit_limit: [0, [Validators.min(0)]],
            is_vip: [false]
        });

        this.paymentForm = this.fb.group({
            type: ['PAYMENT', Validators.required],
            amount: [0.01, [Validators.required, Validators.min(0.01)]],
            notes: ['']
        });

        // Effect to reset when store changes
        effect(() => {
            this.storeService.currentStore();
            this.selectedCustomer.set(null);
            this.crmViewMode.set('CREATE');
        }, { allowSignalWrites: true });
    }

    addCustomer() {
        const currentStore = this.storeService.currentStore();
        if (this.customerForm.invalid || !currentStore) return;

        const newCust = { store_id: currentStore.id, ...this.customerForm.value } as Omit<Customer, 'id' | 'created_at' | 'current_balance'>;

        this.supabase.addCustomer(newCust).subscribe({
            next: (createdCust) => {
                this.dialog.alert('Success', 'Customer registered.');
                this.customerForm.reset({ full_name: '', phone: '', credit_limit: 0, is_vip: false });
                this.refreshCustomersTrigger.next();
                this.selectCustomer(createdCust);
            },
            error: (err) => this.dialog.alert('Error', 'Failed to add customer.')
        });
    }

    startEditingCustomer() {
        const cust = this.selectedCustomer();
        if (!cust) return;

        this.customerForm.patchValue({
            full_name: cust.full_name,
            phone: cust.phone,
            credit_limit: cust.credit_limit,
            is_vip: cust.is_vip
        });
        this.isEditingCustomer.set(true);
    }

    cancelEditingCustomer() {
        this.isEditingCustomer.set(false);
        this.customerForm.reset();
    }

    saveCustomerChanges() {
        const cust = this.selectedCustomer();
        if (this.customerForm.invalid || !cust) return;

        this.supabase.updateCustomer(cust.id, this.customerForm.value).subscribe({
            next: (updatedCust) => {
                this.dialog.alert('Success', 'Customer details updated.');
                this.isEditingCustomer.set(false);
                this.selectCustomer(updatedCust);
                this.refreshCustomersTrigger.next();
            },
            error: (err) => this.dialog.alert('Error', 'Failed to update customer.')
        });
    }

    async deleteCustomer(id: string) {
        if (await this.dialog.confirm('Delete Customer', 'Are you sure? This will delete all history.')) {
            this.supabase.deleteCustomer(id).subscribe({
                next: () => {
                    this.dialog.alert('Success', 'Customer deleted.');
                    this.selectedCustomer.set(null);
                    this.crmViewMode.set('CREATE');
                    this.refreshCustomersTrigger.next();
                },
                error: (err) => this.dialog.alert('Error', 'Failed to delete customer.')
            });
        }
    }

    selectCustomer(customer: Customer) {
        this.selectedCustomer.set(customer);
        this.crmViewMode.set('DETAILS');
        this.isEditingCustomer.set(false);
        this.currentLedger.set([]);
        this.customerTransactions.set([]);
        this.customerTotalSpend.set(0);
        this.transactionSearchControl.setValue('');

        this.supabase.getCustomerLedger(customer.id).subscribe(ledger => this.currentLedger.set(ledger));
        this.supabase.getCustomerTransactions(customer.id).subscribe(txs => {
            this.customerTransactions.set(txs);
        });
        this.supabase.getCustomerTotalSpend(customer.id).subscribe(total => {
            this.customerTotalSpend.set(total);
        });
        this.paymentForm.reset({ type: 'PAYMENT', amount: 0.01, notes: '' });
    }

    submitLedgerEntry() {
        const cust = this.selectedCustomer();
        const store = this.storeService.currentStore();
        if (this.paymentForm.invalid || !cust || !store) return;

        const { type, amount, notes } = this.paymentForm.value;

        let finalAmount = amount;
        if (type === 'SALE') finalAmount = -Math.abs(amount);
        else if (type === 'PAYMENT') finalAmount = Math.abs(amount);
        else if (type === 'ADJUSTMENT') finalAmount = Math.abs(amount);

        const entry = {
            store_id: store.id,
            customer_id: cust.id,
            type: type,
            amount: finalAmount,
            notes: notes
        };

        this.supabase.addLedgerEntry(entry).subscribe({
            next: () => {
                this.dialog.alert('Success', 'Ledger updated successfully.');
                this.refreshCustomersTrigger.next();
                this.supabase.getCustomer(cust.id).subscribe({
                    next: (updatedCustomer) => {
                        this.selectCustomer(updatedCustomer);
                    }
                });
            },
            error: (err) => this.dialog.alert('Error', 'Failed to update ledger.')
        });
    }

    viewTransactionDetails(tx: Transaction) {
        this.editingTransaction.set(tx);
        this.selectedTransactionItems.set([]);
        this.showTransactionDetailModal.set(true);

        this.supabase.getTransactionItems(tx.id).subscribe({
            next: (items) => this.selectedTransactionItems.set(items),
            error: (err) => console.error('Failed to load transaction items', err)
        });
    }

    printReceipt() {
        window.print();
    }

    async voidTransaction() {
        const tx = this.editingTransaction();
        if (!tx) return;

        const confirmed = await this.dialog.confirm(
            'Void Transaction',
            'Are you sure you want to void this transaction? \n\nThis will:\n1. Return all items to stock\n2. Reverse any customer debt\n3. Mark order as void in reports'
        );

        if (confirmed) {
            const reason = await this.dialog.prompt('Void Reason', 'Please enter a reason for voiding this transaction:', 'Customer Request');
            if (reason === null) return; // User cancelled prompt

            this.supabase.voidTransaction(tx.id, reason).subscribe({
                next: () => {
                    this.dialog.alert('Void Successful', 'Transaction voided and stock restored.');
                    this.showTransactionDetailModal.set(false);
                    const cust = this.selectedCustomer();
                    if (cust) {
                        this.selectCustomer(cust);
                        this.refreshCustomersTrigger.next();
                    }
                },
                error: (err) => {
                    this.dialog.alert('Error', 'Failed to void transaction: ' + err.message);
                }
            });
        }
    }

    openPaymentCorrection(tx: Transaction) {
        this.editingTransaction.set(tx);
        this.showPaymentCorrectionModal.set(true);
    }

    submitPaymentCorrection(newMethod: PaymentMethod) {
        const tx = this.editingTransaction();
        const cust = this.selectedCustomer();

        if (!tx || !cust) return;
        if (tx.payment_method === newMethod) return;

        this.supabase.updateTransactionPaymentMethod(
            tx.id,
            tx.payment_method,
            newMethod,
            cust.id,
            tx.total_amount
        ).subscribe({
            next: () => {
                this.dialog.alert('Updated', 'Payment method corrected successfully.');
                this.showPaymentCorrectionModal.set(false);
                this.selectCustomer(cust);
            },
            error: (err) => {
                this.dialog.alert('Error', 'Failed to update payment method.');
                console.error(err);
            }
        });
    }

    getWhatsAppLink(phone: string | undefined): string {
        if (!phone) return '#';
        const number = phone.replace(/[^0-9]/g, '');
        return `https://wa.me/${number}`;
    }
}
