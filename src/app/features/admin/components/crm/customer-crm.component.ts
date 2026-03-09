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
import { LedgerAcComponent } from './ledger-ac/ledger-ac.component';

@Component({
    selector: 'app-customer-crm',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, LedgerAcComponent],
    template: `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      <!-- Left: Customer List -->
      <div class="lg:col-span-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 flex flex-col overflow-hidden">
        <div class="p-5 border-b border-slate-200/50 dark:border-slate-700/50">
          <div class="flex justify-between items-center mb-5">
            <h2 class="text-xl font-bold flex items-center gap-2">
                <span class="material-symbols-rounded text-[var(--primary-color)]">groups</span>
                Customers
            </h2>
            <button (click)="crmViewMode.set('CREATE')" class="w-8 h-8 flex items-center justify-center bg-[var(--primary-color)] text-white rounded-full shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all">
              <span class="material-symbols-rounded text-sm">add</span>
            </button>
          </div>
          <div class="relative">
            <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input 
              [formControl]="customerSearchControl"
              type="text" 
              placeholder="Search customers..." 
              class="w-full bg-slate-100/50 dark:bg-slate-800/50 border-none rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--primary-color)] outline-none transition-all placeholder:text-slate-400">
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          @for (customer of filteredCustomerList(); track customer.id) {
            <button 
              (click)="selectCustomer(customer)"
              [ngClass]="{
                'bg-white dark:bg-slate-800 shadow-sm border-slate-200 dark:border-slate-700 ring-1 ring-[var(--primary-color)]/20': selectedCustomer()?.id === customer.id,
                'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50': selectedCustomer()?.id !== customer.id
              }"
              class="w-full text-left p-3.5 rounded-xl border transition-all flex justify-between items-center group"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 shadow-inner">
                    {{ customer.full_name[0] | uppercase }}
                </div>
                <div>
                  <div class="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1">
                      {{ customer.full_name }}
                      @if (customer.is_vip) {
                         <span class="material-symbols-rounded text-[14px] text-amber-500" title="VIP Customer">stars</span>
                      }
                  </div>
                  <div class="text-xs opacity-60 mt-0.5">{{ customer.phone || 'No phone' }}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-xs font-bold px-2 py-1 rounded-md" [ngClass]="getBalanceBadgeClass(customer.current_balance)">
                  {{ customer.current_balance | currency:storeService.currency() }}
                </div>
              </div>
            </button>
          } @empty {
            <div class="p-8 text-center flex flex-col items-center justify-center opacity-50">
                <span class="material-symbols-rounded text-4xl mb-2">person_off</span>
                <span class="text-sm font-medium">No customers found</span>
            </div>
          }
        </div>
      </div>

      <!-- Right: Form or Details -->
      <div class="lg:col-span-9 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden relative">
        @if (crmViewMode() === 'CREATE') {
          <div class="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10 pointer-events-none"></div>
          <div class="p-12 max-w-2xl mx-auto w-full relative z-10 flex flex-col h-full justify-center">
            
            <div class="text-center mb-10">
                <div class="w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-6 transform -rotate-3 border border-slate-100 dark:border-slate-700">
                    <span class="material-symbols-rounded text-4xl text-[var(--primary-color)] font-light">person_add</span>
                </div>
                <h2 class="text-3xl font-extrabold tracking-tight">New Customer</h2>
                <p class="text-slate-500 mt-2">Create a new profile to track loyalty, credit, and history.</p>
            </div>

            <form [formGroup]="customerForm" (ngSubmit)="addCustomer()" class="space-y-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700">
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input formControlName="full_name" type="text" class="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-xl p-4 font-medium outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all" placeholder="e.g. Jane Doe">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phone</label>
                      <input formControlName="phone" type="tel" class="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-xl p-4 font-medium outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all" placeholder="+1 (555) 000-0000">
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Credit Limit</label>
                      <div class="relative">
                          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{{ storeService.currency() }}</span>
                          <input formControlName="credit_limit" type="number" class="w-full bg-slate-50 dark:bg-slate-900/50 border-none rounded-xl py-4 pl-8 pr-4 font-medium outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all" placeholder="0.00">
                      </div>
                    </div>
                </div>
              </div>
              
              <div class="flex justify-between items-center p-4 bg-[var(--primary-color)]/5 rounded-xl border border-[var(--primary-color)]/20">
                <div>
                    <div class="font-bold text-[var(--primary-color)] text-sm">VIP Status</div>
                    <div class="text-xs text-slate-500">Enable special perks and discounts</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input formControlName="is_vip" type="checkbox" class="sr-only peer">
                  <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-color)]"></div>
                </label>
              </div>

              <button type="submit" [disabled]="customerForm.invalid" class="w-full py-4 text-sm bg-[var(--primary-color)] text-white font-bold rounded-xl shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none mt-4">
                Create Customer Profile
              </button>
            </form>
          </div>
        } @else {
          @if (selectedCustomer(); as customer) {
            
            <!-- 360 HERO HEADER -->
            <div class="relative p-8 pb-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <div class="flex justify-between items-start mb-8">
                    <div class="flex gap-6 items-center">
                        <div class="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-4xl font-extrabold shadow-xl shadow-blue-500/30 transform rotate-3">
                            {{ customer.full_name[0] | uppercase }}
                        </div>
                        <div class="flex flex-col justify-center">
                            <div class="flex items-center gap-3 mb-1">
                                <h2 class="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{{ customer.full_name }}</h2>
                                @if (customer.is_vip) {
                                    <span class="flex items-center gap-1 text-[11px] bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 px-2.5 py-1 rounded-full font-bold uppercase shadow-sm">
                                        <span class="material-symbols-rounded text-[14px]">stars</span> VIP
                                    </span>
                                }
                            </div>
                            <div class="flex items-center gap-4 text-sm font-medium text-slate-500">
                                <span class="flex items-center gap-1.5"><span class="material-symbols-rounded text-lg">call</span> {{ customer.phone || 'No phone' }}</span>
                                <span class="flex items-center gap-1.5"><span class="material-symbols-rounded text-lg">calendar_today</span> Joined {{ customer.created_at | date:'MMM yyyy' }}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                         <button (click)="openPaymentTab()" class="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                             <span class="material-symbols-rounded text-lg">payments</span> Log Payment
                         </button>
                         <button (click)="deleteCustomer(customer.id)" class="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-red-500 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors tooltip-trigger" title="Delete Profile">
                             <span class="material-symbols-rounded">delete</span>
                         </button>
                    </div>
                </div>

                <!-- FINANCIAL METRICS CARDS -->
                <div class="grid grid-cols-4 gap-4 mb-8">
                    <!-- Balance Card -->
                    <div class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/20 p-5 rounded-2xl shadow-lg shadow-blue-500/20 border border-blue-100 dark:border-blue-800/50 flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/30">
                        <div class="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-colors duration-500"></div>
                        <div class="flex justify-between items-start mb-2 relative z-10">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Balance</span>
                            <span class="w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-700">
                                <span class="material-symbols-rounded text-slate-400 text-sm">account_balance</span>
                            </span>
                        </div>
                        <div class="text-3xl font-mono font-bold tracking-tight" 
                             [class.text-red-500]="customer.current_balance < 0" 
                             [class.text-green-600]="customer.current_balance > 0">
                            {{ customer.current_balance | currency:storeService.currency() }}
                        </div>
                        <div class="text-xs mt-2 font-medium" [ngClass]="getBalanceTextClass(customer.current_balance)">
                            {{ getBalanceDescription(customer.current_balance) }}
                        </div>
                    </div>

                    <!-- Credit Limit Form/Card -->
                    <div class="bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-900/40 dark:to-fuchsia-900/20 p-5 rounded-2xl shadow-lg shadow-purple-500/20 border border-purple-100 dark:border-purple-800/50 flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/30">
                        <div class="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-colors duration-500"></div>
                        <div class="flex justify-between items-start mb-2 relative z-10">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Credit Limit</span>
                            <span class="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/20">
                                <span class="material-symbols-rounded text-blue-500 text-sm">credit_score</span>
                            </span>
                        </div>
                        
                        @if (isEditingCustomer()) {
                            <input [formControl]="customerForm.controls.credit_limit" type="number" class="text-2xl font-mono font-bold bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-1 outline-none ring-2 ring-blue-500 w-full mb-1">
                        } @else {
                            <div class="text-3xl font-mono font-bold tracking-tight text-slate-700 dark:text-slate-200 group flex items-center gap-2 cursor-pointer" (click)="startEditingCustomer()">
                                {{ customer.credit_limit | currency:storeService.currency() }}
                                <span class="material-symbols-rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity text-blue-500">edit</span>
                            </div>
                        }

                        <!-- Progress Bar -->
                        <div class="mt-2 text-xs font-medium text-slate-500 flex flex-col gap-1.5">
                            <div class="flex justify-between">
                                <span>Utilization</span>
                                <span>{{ getCreditUtilization(customer) }}%</span>
                            </div>
                            <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all duration-500"
                                     [ngClass]="getCreditBarColor(customer)"
                                     [style.width.%]="getCreditUtilization(customer)"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Lifetime Value -->
                    <div class="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/20 p-5 rounded-2xl shadow-lg shadow-emerald-500/20 border border-emerald-100 dark:border-emerald-800/50 flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/30">
                        <div class="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-colors duration-500"></div>
                        <div class="flex justify-between items-start mb-2 relative z-10">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Lifetime Value</span>
                            <span class="w-8 h-8 rounded-full flex items-center justify-center bg-green-50 dark:bg-green-900/20">
                                <span class="material-symbols-rounded text-green-500 text-sm">trending_up</span>
                            </span>
                        </div>
                        <div class="text-3xl font-mono font-bold tracking-tight text-slate-700 dark:text-slate-200 relative z-10">
                            {{ customerTotalSpend() | currency:storeService.currency() }}
                        </div>
                        <div class="text-xs mt-2 font-medium text-slate-400 flex items-center gap-1 relative z-10">
                             Total spend across {{ customerTransactions().length }} orders
                        </div>
                    </div>

                    <!-- Last Engagement -->
                    <div class="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/40 dark:to-amber-900/20 p-5 rounded-2xl shadow-lg shadow-orange-500/20 border border-orange-100 dark:border-orange-800/50 flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-500/30">
                        <div class="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full blur-xl group-hover:bg-orange-500/20 transition-colors duration-500"></div>
                        <div class="flex justify-between items-start mb-2 relative z-10">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Last Engagement</span>
                            <span class="w-8 h-8 rounded-full flex items-center justify-center bg-orange-50 dark:bg-orange-900/20">
                                <span class="material-symbols-rounded text-orange-500 text-sm">history</span>
                            </span>
                        </div>
                        <div class="text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200 relative z-10 pt-2 pb-1">
                            @if(customer.last_purchase_date) {
                                {{ customer.last_purchase_date | date:'mediumDate' }}
                            } @else {
                                No Purchases Yet
                            }
                        </div>
                        <div class="text-[10px] mt-1 font-medium text-slate-400 relative z-10 flex flex-col">
                             @if(customer.last_purchase_date) {
                                 <span>{{ getDaysSince(customer.last_purchase_date) }} days inactive</span>
                             }
                             @if(customer.engaged_date) {
                                 <span class="mt-1 flex items-center gap-1"><span class="material-symbols-rounded text-[12px] text-green-500">check_circle</span> Reachable</span>
                             }
                        </div>
                    </div>
                </div>

                <!-- TABS NAVIGATION -->
                <div class="flex gap-6 mt-4">
                    <button (click)="activeTab.set('ACTIVITY')" [class.border-[var(--primary-color)]]="activeTab() === 'ACTIVITY'" [class.text-[var(--primary-color)]]="activeTab() === 'ACTIVITY'" [class.border-transparent]="activeTab() !== 'ACTIVITY'" [class.text-slate-500]="activeTab() !== 'ACTIVITY'" class="pb-4 font-bold text-sm border-b-2 transition-colors hover:text-slate-800 dark:hover:text-slate-200">
                        Activity & Ledger
                    </button>
                    <button (click)="activeTab.set('DETAILS')" [class.border-[var(--primary-color)]]="activeTab() === 'DETAILS'" [class.text-[var(--primary-color)]]="activeTab() === 'DETAILS'" [class.border-transparent]="activeTab() !== 'DETAILS'" [class.text-slate-500]="activeTab() !== 'DETAILS'" class="pb-4 font-bold text-sm border-b-2 transition-colors hover:text-slate-800 dark:hover:text-slate-200">
                        Profile Details
                    </button>
                    <button (click)="activeTab.set('LEDGER')" [class.border-[var(--primary-color)]]="activeTab() === 'LEDGER'" [class.text-[var(--primary-color)]]="activeTab() === 'LEDGER'" [class.border-transparent]="activeTab() !== 'LEDGER'" [class.text-slate-500]="activeTab() !== 'LEDGER'" class="pb-4 font-bold text-sm border-b-2 transition-colors hover:text-slate-800 dark:hover:text-slate-200">
                        Ledger Account
                    </button>
                    <button (click)="activeTab.set('COLLECT')" [class.border-[var(--primary-color)]]="activeTab() === 'COLLECT'" [class.text-[var(--primary-color)]]="activeTab() === 'COLLECT'" [class.border-transparent]="activeTab() !== 'COLLECT'" [class.text-slate-500]="activeTab() !== 'COLLECT'" class="pb-4 font-bold text-sm border-b-2 transition-colors hover:text-slate-800 dark:hover:text-slate-200">
                        Collect Payment
                    </button>
                    <button (click)="activeTab.set('STATEMENT')" [class.border-[var(--primary-color)]]="activeTab() === 'STATEMENT'" [class.text-[var(--primary-color)]]="activeTab() === 'STATEMENT'" [class.border-transparent]="activeTab() !== 'STATEMENT'" [class.text-slate-500]="activeTab() !== 'STATEMENT'" class="pb-4 font-bold text-sm border-b-2 transition-colors hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5">
                        <span class="material-symbols-rounded text-[16px]">description</span>
                        Account Statement
                    </button>
                </div>
            </div>

            <!-- TAB CONTENT CONTAINER -->
            <div class="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-black/10">
                
                <!-- TAB 1: ACTIVITY & LEDGER -->
                @if (activeTab() === 'ACTIVITY') {
                    <div class="p-6">
                        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mt-2">
                            <!-- Timeline Feed -->
                            <div class="p-6">
                                <h3 class="text-lg font-bold mb-6 flex items-center gap-2">
                                    <span class="material-symbols-rounded text-slate-400">timeline</span> 
                                    Recent Activity
                                </h3>
                                
                                <div class="relative border-l-2 border-slate-100 dark:border-slate-700 ml-3 space-y-8 pb-4">
                                    <!-- Iterate through merged timeline of transactions and ledger entries -->
                                    @for (activity of getMergedTimeline(); track activity.id) {
                                        <div class="relative pl-6">
                                            <!-- Timeline Dot -->
                                            <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-800 shadow-sm"
                                                 [ngClass]="getActivityDotColor(activity)">
                                            </div>
                                            
                                            <!-- Content Card -->
                                            <div class="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:shadow-md transition-shadow group flex justify-between items-start"
                                                 [style.cursor]="activity.type === 'SALE_TX' ? 'pointer' : 'default'"
                                                 (click)="activity.type === 'SALE_TX' ? viewTransactionDetails(activity.raw) : null">
                                                
                                                <div>
                                                    <div class="flex items-center gap-2 mb-1">
                                                        <span class="font-bold text-sm" [ngClass]="getActivityTextColor(activity)">{{ activity.title }}</span>
                                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded text-slate-500 bg-slate-200 dark:bg-slate-700">
                                                            {{ activity.date | date:'shortTime' }}
                                                        </span>
                                                        @if (activity.type === 'SALE_TX') {
                                                            <span class="material-symbols-rounded text-[14px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
                                                        }
                                                    </div>
                                                    <p class="text-xs text-slate-500">{{ activity.subtitle }}</p>
                                                    <p class="text-[10px] text-slate-400 mt-2 font-mono">{{ activity.date | date:'mediumDate' }}</p>
                                                </div>
                                                
                                                <div class="text-right">
                                                    <div class="font-mono font-bold" [ngClass]="getActivityAmountColor(activity)">
                                                        {{ activity.amount > 0 ? '+' : '' }}{{ activity.amount | currency:storeService.currency() }}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    } @empty {
                                        <div class="pl-6 py-6 text-slate-400 italic text-sm">No activity recorded yet.</div>
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                }

                @if (activeTab() === 'LEDGER') {
                    <div class="h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
                        <app-ledger-ac [customer]="customer"></app-ledger-ac>
                    </div>
                }

                <!-- TAB 2: PROFILE DETAILS -->
                @if (activeTab() === 'DETAILS') {
                    <div class="p-6 max-w-2xl">
                        <form [formGroup]="customerForm" class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-bold">Personal Information</h3>
                                @if (isEditingCustomer()) {
                                    <div class="flex gap-2">
                                        <button (click)="cancelEditingCustomer()" type="button" class="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
                                        <button (click)="saveCustomerChanges()" type="button" class="px-3 py-1.5 text-xs font-bold bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition-colors">Save Changes</button>
                                    </div>
                                } @else {
                                    <button (click)="startEditingCustomer()" type="button" class="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1">
                                        <span class="material-symbols-rounded text-[14px]">edit</span> Edit
                                    </button>
                                }
                            </div>

                            <div class="grid grid-cols-2 gap-6">
                                <div>
                                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                                    @if(isEditingCustomer()) {
                                        <input formControlName="full_name" type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-medium outline-none focus:ring-2 focus:ring-blue-500">
                                    } @else {
                                        <div class="p-2.5 font-medium">{{ customer.full_name }}</div>
                                    }
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                                    @if(isEditingCustomer()) {
                                        <input formControlName="phone" type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-medium outline-none focus:ring-2 focus:ring-blue-500">
                                    } @else {
                                        <div class="p-2.5 font-medium flex items-center gap-2">
                                            {{ customer.phone || '—' }}
                                            @if (customer.phone) {
                                                <a [href]="getWhatsAppLink(customer.phone)" target="_blank" class="w-6 h-6 flex items-center justify-center bg-green-100 text-green-600 rounded-md hover:bg-green-200 transition-colors tooltip-trigger" title="Message on WhatsApp">
                                                    <span class="material-symbols-rounded text-[14px]">chat</span>
                                                </a>
                                            }
                                        </div>
                                    }
                                </div>
                            </div>
                            
                            <hr class="border-slate-100 dark:border-slate-700">
                            
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="font-bold text-sm">VIP Status</div>
                                    <div class="text-xs text-slate-500">VIPs may receive special reporting metrics.</div>
                                </div>
                                
                                @if(isEditingCustomer()) {
                                    <label class="relative inline-flex items-center cursor-pointer">
                                      <input formControlName="is_vip" type="checkbox" class="sr-only peer">
                                      <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-color)]"></div>
                                    </label>
                                } @else {
                                    <div class="px-3 py-1 rounded-full text-xs font-bold shadow-sm" [class.bg-gradient-to-r]="customer.is_vip" [class.from-amber-200]="customer.is_vip" [class.to-yellow-400]="customer.is_vip" [class.text-amber-900]="customer.is_vip" [class.bg-slate-100]="!customer.is_vip" [class.text-slate-500]="!customer.is_vip">
                                        {{ customer.is_vip ? 'Active VIP' : 'Standard' }}
                                    </div>
                                }
                            </div>
                        </form>
                    </div>
                }

                <!-- TAB 3: COLLECT PAYMENT -->
                @if (activeTab() === 'COLLECT') {
                    <div class="p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div class="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
                            
                            <!-- Left Side: Interactive Form -->
                            <div class="flex-1 space-y-8">
                                <div class="space-y-2">
                                    <h2 class="text-3xl font-black tracking-tight text-slate-800 dark:text-white flex items-center gap-3">
                                        <div class="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                                            <span class="material-symbols-rounded text-white text-2xl">account_balance_wallet</span>
                                        </div>
                                        Post Transaction
                                    </h2>
                                    <p class="text-slate-500 font-medium">Capture payments, issue store credit, or charge the customer's account ledger.</p>
                                </div>

                                <form [formGroup]="paymentForm" (ngSubmit)="submitLedgerEntry()" class="space-y-8">
                                    <!-- Segmented Control for Type -->
                                    <div class="space-y-3">
                                        <label class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Transaction Type</label>
                                        <div class="bg-slate-200/50 dark:bg-slate-800/50 p-1.5 rounded-2xl flex border border-slate-200 dark:border-slate-700 shadow-inner">
                                            <button type="button" (click)="paymentForm.patchValue({type: 'PAYMENT'})" 
                                                    [class.bg-white]="paymentForm.value.type === 'PAYMENT'"
                                                    [class.dark:bg-slate-700]="paymentForm.value.type === 'PAYMENT'"
                                                    [class.text-blue-600]="paymentForm.value.type === 'PAYMENT'"
                                                    [class.shadow-xl]="paymentForm.value.type === 'PAYMENT'"
                                                    [class.text-slate-500]="paymentForm.value.type !== 'PAYMENT'"
                                                    class="flex-1 py-4 text-sm font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group">
                                                <span class="material-symbols-rounded text-[18px]" [class.text-blue-500]="paymentForm.value.type === 'PAYMENT'">add_circle</span>
                                                Receive Money
                                            </button>
                                            <button type="button" (click)="paymentForm.patchValue({type: 'SALE'})" 
                                                    [class.bg-white]="paymentForm.value.type === 'SALE'"
                                                    [class.dark:bg-slate-700]="paymentForm.value.type === 'SALE'"
                                                    [class.text-orange-600]="paymentForm.value.type === 'SALE'"
                                                    [class.shadow-xl]="paymentForm.value.type === 'SALE'"
                                                    [class.text-slate-500]="paymentForm.value.type !== 'SALE'"
                                                    class="flex-1 py-4 text-sm font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-2">
                                                <span class="material-symbols-rounded text-[18px]" [class.text-orange-500]="paymentForm.value.type === 'SALE'">remove_circle</span>
                                                Charge Account
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Amount with Quick Chips -->
                                    <div class="space-y-4">
                                        <div class="flex justify-between items-end">
                                            <label class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Amount to Post</label>
                                            <div class="flex gap-2">
                                                @for (amt of [10, 50, 100, 500]; track amt) {
                                                    <button type="button" (click)="paymentForm.patchValue({amount: amt})"
                                                            class="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold rounded-lg transition-all text-slate-600 dark:text-slate-400">
                                                        +{{ amt }}
                                                    </button>
                                                }
                                                @if (customer.current_balance < 0) {
                                                    <button type="button" (click)="paymentForm.patchValue({amount: -customer.current_balance})"
                                                            class="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-[10px] font-black rounded-lg transition-all border border-blue-100 dark:border-blue-900/50">
                                                        SETTLE FULL
                                                    </button>
                                                }
                                            </div>
                                        </div>
                                        
                                        <div class="relative group">
                                            <span class="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 font-black text-3xl transition-colors font-mono">{{ storeService.currency() }}</span>
                                            <input formControlName="amount" type="number" step="0.01" 
                                                   class="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-800 rounded-3xl py-8 pl-16 pr-8 font-mono font-black text-5xl text-slate-800 dark:text-white outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 shadow-sm transition-all" 
                                                   placeholder="0.00">
                                        </div>
                                    </div>

                                    <!-- Internal Reference -->
                                    <div class="space-y-3">
                                        <label class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Internal Reference / Notes</label>
                                        <div class="relative">
                                            <span class="material-symbols-rounded absolute left-4 top-4 text-slate-300 font-semibold">notes</span>
                                            <textarea formControlName="notes" rows="3" placeholder="Describe the reason for this adjustment or record a manual receipt number..." 
                                                   class="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-4 pl-12 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-medium"></textarea>
                                        </div>
                                    </div>

                                    <!-- Submit Button -->
                                    <button type="submit" [disabled]="paymentForm.invalid || paymentForm.value.amount <= 0" 
                                            class="w-full py-6 text-lg rounded-3xl font-black uppercase tracking-widest shadow-2xl transition-all active:scale-[0.98] disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 overflow-hidden group relative"
                                            [ngClass]="paymentForm.value.type === 'PAYMENT' ? 'bg-blue-600 text-white shadow-blue-500/20 hover:shadow-blue-500/40' : 'bg-orange-500 text-white shadow-orange-500/20 hover:shadow-orange-500/40'">
                                        <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                        <span class="material-symbols-rounded text-2xl relative z-10">{{ paymentForm.value.type === 'PAYMENT' ? 'download_done' : 'upload_file' }}</span>
                                        <span class="relative z-10">Confirm & Record {{ paymentForm.value.type === 'PAYMENT' ? 'Payment' : 'Charge' }}</span>
                                    </button>
                                </form>
                            </div>

                            <!-- Right Side: Live Balance Preview Card -->
                            <div class="w-full lg:w-[400px] flex-shrink-0">
                                <div class="sticky top-8 space-y-4">
                                    <div class="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] p-8 text-white shadow-2xl border border-white/5 relative overflow-hidden group">
                                        <!-- Decorative Sparkles -->
                                        <div class="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] grayscale pointer-events-none"></div>
                                        
                                        <div class="relative z-10">
                                            <div class="flex justify-between items-center mb-10">
                                                <div class="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                                                    <span class="material-symbols-rounded text-white text-3xl">insights</span>
                                                </div>
                                                <div class="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Balance Projection</div>
                                            </div>

                                            <div class="space-y-10">
                                                <div>
                                                    <div class="text-white/50 text-[10px] font-bold uppercase mb-2">Current Standing</div>
                                                    <div class="text-3xl font-mono font-black" [class.text-green-400]="customer.current_balance > 0" [class.text-red-400]="customer.current_balance < 0">
                                                        {{ customer.current_balance | currency:storeService.currency() }}
                                                    </div>
                                                </div>

                                                <div class="flex items-center gap-4 py-6 border-y border-white/10">
                                                    <div class="w-10 h-10 rounded-full flex items-center justify-center"
                                                         [ngClass]="paymentForm.value.type === 'PAYMENT' ? 'bg-green-500' : 'bg-orange-500'">
                                                        <span class="material-symbols-rounded text-white text-base">
                                                            {{ paymentForm.value.type === 'PAYMENT' ? 'add' : 'remove' }}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div class="text-white/50 text-[10px] font-bold uppercase">Pending Movement</div>
                                                        <div class="text-2xl font-mono font-bold">
                                                            {{ (paymentFormValue().amount || 0) | currency:storeService.currency() }}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div class="text-white/50 text-[10px] font-bold uppercase mb-2">Resulting Balance</div>
                                                    <div class="text-5xl font-mono font-black tracking-tighter" [class.text-blue-400]="projectedBalance() > customer.current_balance" [class.text-orange-400]="projectedBalance() < customer.current_balance">
                                                        {{ projectedBalance() | currency:storeService.currency() }}
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="mt-12 flex items-start gap-3 p-4 bg-white/5 rounded-2xl border border-white/10 italic">
                                                <span class="material-symbols-rounded text-white/30 text-lg">info</span>
                                                <p class="text-[10px] text-white/60 leading-relaxed font-medium">
                                                    This adjustment will be logged in the permanent ledger and cannot be deleted. Balance updates are immediate.
                                                </p>
                                            </div>
                                        </div>

                                        <!-- Ambient Glow -->
                                        <div class="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-[80px]"></div>
                                        <div class="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-[80px]"></div>
                                    </div>

                                    <!-- Quick History Mini-View -->
                                    <div class="bg-white dark:bg-slate-800 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <h4 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 px-2">Recent ledger Events</h4>
                                        <div class="space-y-3">
                                            @for (entry of currentLedger().slice(0, 3); track entry.id) {
                                                <div class="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs"
                                                             [ngClass]="entry.type === 'PAYMENT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                                                            {{ entry.type === 'PAYMENT' ? 'IN' : 'OT' }}
                                                        </div>
                                                        <div>
                                                            <div class="text-xs font-bold">{{ entry.type }}</div>
                                                            <div class="text-[10px] opacity-40">{{ entry.created_at | date:'MMM d' }}</div>
                                                        </div>
                                                    </div>
                                                    <div class="text-xs font-mono font-bold" [class.text-green-600]="entry.amount > 0" [class.text-red-600]="entry.amount < 0">
                                                        {{ entry.amount | currency:storeService.currency() }}
                                                    </div>
                                                </div>
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                }

                <!-- TAB 4: ACCOUNT STATEMENT -->
                @if (activeTab() === 'STATEMENT') {
                  <div class="p-6 animate-in fade-in duration-300">

                    <!-- Statement Header -->
                    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
                      <div class="p-6 bg-gradient-to-r from-indigo-600 to-violet-600 flex items-center justify-between">
                        <div>
                          <p class="text-xs font-black uppercase tracking-widest text-indigo-200">Account Statement</p>
                          <p class="text-2xl font-black text-white mt-1">{{ customer.full_name }}</p>
                          <p class="text-indigo-200 text-sm mt-1">Delivery Notes &amp; Invoices — Order-to-Cash Summary</p>
                        </div>
                        <div class="flex flex-col items-end gap-2">
                          <button (click)="printStatement()"
                            class="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all border border-white/20">
                            <span class="material-symbols-rounded text-[16px]">print</span> Print Statement
                          </button>
                          <p class="text-indigo-200 text-xs">Generated: {{ today | date:'dd MMM yyyy' }}</p>
                        </div>
                      </div>

                      <!-- Summary Chips -->
                      <div class="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-700 border-t border-slate-100 dark:border-slate-700">
                        <div class="p-4 text-center">
                          <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Notes</p>
                          <p class="text-2xl font-black text-slate-800 dark:text-white mt-1">{{ customerDeliveryNotes().length }}</p>
                        </div>
                        <div class="p-4 text-center">
                          <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Invoiced</p>
                          <p class="text-2xl font-black text-emerald-600 mt-1">{{ customerInvoicedNotesCount() }}</p>
                        </div>
                        <div class="p-4 text-center">
                          <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Invoice Total</p>
                          <p class="text-2xl font-black text-slate-800 dark:text-white mt-1">{{ statementInvoiceTotal() | currency:storeService.currency() }}</p>
                        </div>
                        <div class="p-4 text-center">
                          <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding</p>
                          <p class="text-2xl font-black mt-1" [class]="customer.current_balance < 0 ? 'text-red-500' : 'text-emerald-600'">{{ customer.current_balance | currency:storeService.currency() }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Statement Table -->
                    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table class="w-full text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th class="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Note</th>
                            <th class="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            <th class="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th class="px-5 py-3.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice Amount</th>
                            <th class="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Terms</th>
                            <th class="px-5 py-3.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
                          @for (row of statementRows(); track row.note.id) {
                            <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                              <td class="px-5 py-4">
                                <span class="font-mono font-black text-indigo-600 dark:text-indigo-400 text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg">{{ row.note.note_number }}</span>
                              </td>
                              <td class="px-5 py-4 text-slate-500 text-xs">{{ row.note.created_at | date:'dd MMM yyyy' }}</td>
                              <td class="px-5 py-4">
                                <span class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                  [class]="row.note.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                                           row.note.status === 'PARTIAL_REJECTED' ? 'bg-red-100 text-red-700' :
                                           row.note.status === 'DISPATCHED' ? 'bg-indigo-100 text-indigo-700' :
                                           'bg-amber-100 text-amber-700'">
                                  {{ row.note.status.replace('_',' ') }}
                                </span>
                              </td>
                              <td class="px-5 py-4 text-right font-black">
                                @if (row.invoice) {
                                  <span class="text-slate-800 dark:text-white">{{ row.invoice.total_amount | currency:storeService.currency() }}</span>
                                } @else {
                                  <span class="text-slate-300">—</span>
                                }
                              </td>
                              <td class="px-5 py-4">
                                @if (row.invoice) {
                                  <span class="text-xs font-bold text-slate-600 dark:text-slate-300">{{ row.invoice.payment_method }}</span>
                                } @else {
                                  <span class="text-slate-300 text-xs">—</span>
                                }
                              </td>
                              <td class="px-5 py-4 text-center">
                                @if (row.note.invoiced_at) {
                                  <span class="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                                    <span class="material-symbols-rounded text-[12px]">check_circle</span> Invoiced
                                  </span>
                                } @else if (row.note.status === 'DELIVERED' || row.note.status === 'PARTIAL_REJECTED') {
                                  <span class="inline-flex items-center gap-1 text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                                    <span class="material-symbols-rounded text-[12px]">pending</span> Pending
                                  </span>
                                } @else {
                                  <span class="text-slate-300 text-xs">—</span>
                                }
                              </td>
                            </tr>
                          } @empty {
                            <tr>
                              <td colspan="6" class="py-16 text-center">
                                <span class="material-symbols-rounded text-4xl text-slate-200 block mb-3">receipt_long</span>
                                <p class="text-slate-400 font-semibold">No delivery notes found for this customer.</p>
                                <p class="text-slate-300 text-xs mt-1">Create delivery notes in the Delivery Notes module.</p>
                              </td>
                            </tr>
                          }
                        </tbody>
                        @if (statementRows().length > 0) {
                          <tfoot class="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                              <td colspan="3" class="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Totals</td>
                              <td class="px-5 py-3 text-right font-black text-slate-800 dark:text-white">{{ statementInvoiceTotal() | currency:storeService.currency() }}</td>
                              <td colspan="2"></td>
                            </tr>
                          </tfoot>
                        }
                      </table>
                    </div>

                  </div>
                }

            </div>
          } @else {
             <!-- Empty State for Details Panel -->
             <div class="absolute inset-0 bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-12 text-center">
               <div class="w-32 h-32 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center mb-6 transform -rotate-6 border border-slate-100 dark:border-slate-700">
                   <span class="material-symbols-rounded text-6xl text-slate-300 dark:text-slate-600">group</span>
               </div>
               <h3 class="text-2xl font-bold tracking-tight mb-2">Customer 360° Profile</h3>
               <p class="max-w-sm text-slate-500">Select a customer from the sidebar to view their balance, history, and debt details, or register a new one.</p>
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
    activeTab = signal<'ACTIVITY' | 'DETAILS' | 'COLLECT' | 'STATEMENT'>('ACTIVITY');
    today = new Date().toISOString();

    showTransactionDetailModal = signal(false);
    selectedTransactionItems = signal<TransactionItem[]>([]);
    editingTransaction = signal<Transaction | null>(null);
    showPaymentCorrectionModal = signal(false);

    customerForm: FormGroup;
    paymentForm: FormGroup;
    paymentFormValue!: Signal<any>;
    projectedBalance: Signal<number>;

    // ── Account Statement helpers ────────────────────────────────

    customerDeliveryNotes = computed(() => {
        const cust = this.selectedCustomer();
        if (!cust) return [];
        const storeId = this.storeService.currentStore()?.id ?? 'x';
        try {
            const all: any[] = JSON.parse(localStorage.getItem(`dn_notes_${storeId}`) ?? '[]');
            return all.filter((n: any) => n.customer_id === cust.id);
        } catch { return []; }
    });

    customerInvoicedNotesCount = computed(() => this.customerDeliveryNotes().filter((n: any) => n.invoiced_at).length);

    statementRows = computed(() => {
        const notes = this.customerDeliveryNotes();
        const txs = this.customerTransactions();
        return notes.map(note => ({
            note,
            invoice: txs.find(tx => tx.delivery_note_id === note.id) ?? null,
        }));
    });

    statementInvoiceTotal = computed(() =>
        this.statementRows().reduce((s, r) => s + (r.invoice?.total_amount ?? 0), 0)
    );

    printStatement() { window.print(); }

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
        // Track payment form value as a signal for real-time UI updates
        this.paymentFormValue = toSignal(this.paymentForm.valueChanges, {
            initialValue: { type: 'PAYMENT', amount: 0, notes: '' }
        });

        // Computed projected balance for the Payment Tab
        this.projectedBalance = computed(() => {
            const customer = this.selectedCustomer();
            const form = this.paymentFormValue();
            if (!customer) return 0;

            let amount = form.amount || 0;
            if (form.type === 'SALE') amount = -Math.abs(amount);
            else if (form.type === 'PAYMENT') amount = Math.abs(amount);

            return customer.current_balance + amount;
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
            error: (err) => {
                console.error('Add customer error:', err);
                this.dialog.alert('Registration Failed', err.message || 'Check your database connection or schema.');
            }
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
            error: (err) => {
                console.error('Update customer error:', err);
                this.dialog.alert('Update Failed', err.message || 'Check your database connection.');
            }
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

    // --- View Helpers ---

    getCreditUtilization(customer: Customer): number {
        if (!customer.credit_limit || customer.credit_limit <= 0) return 0;
        if (customer.current_balance >= 0) return 0; // No debt

        const debt = Math.abs(customer.current_balance);
        const ratio = (debt / customer.credit_limit) * 100;
        return Math.min(Math.round(ratio), 100);
    }

    getBalanceBadgeClass(balance: number): string {
        if (balance < 0) return 'bg-red-50 text-red-600 dark:bg-red-900/20';
        if (balance > 0) return 'bg-green-50 text-green-600 dark:bg-green-900/20';
        return 'text-slate-400';
    }

    getBalanceTextClass(balance: number): string {
        if (balance < 0) return 'text-red-400';
        if (balance > 0) return 'text-green-500';
        return 'text-slate-400';
    }

    getBalanceDescription(balance: number): string {
        if (balance < 0) return 'Customer owes you';
        if (balance > 0) return 'Store credit available';
        return 'Account settled';
    }

    getCreditBarColor(customer: Customer): string {
        const util = this.getCreditUtilization(customer);
        if (util < 50) return 'bg-blue-500';
        if (util < 85) return 'bg-orange-400';
        return 'bg-red-500';
    }

    openPaymentTab() {
        this.activeTab.set('COLLECT');
    }

    // --- Timeline Merger ---
    // Merges transactions and ledger items into a single sortable feed array
    getMergedTimeline() {
        const items: any[] = [];

        // Map Transactions
        this.customerTransactions().forEach(tx => {
            items.push({
                id: `TX-${tx.id}`,
                type: 'SALE_TX',
                date: new Date(tx.created_at),
                title: 'Purchase Made',
                subtitle: `Order #${tx.id.substring(0, 8)} • Paid via ${tx.payment_method}`,
                amount: tx.total_amount, // Positive conceptually as volume
                raw: tx
            });
        });

        // Map Ledger
        this.currentLedger().forEach(entry => {
            // Avoid double counting if a transaction automatically generated a ledger entry (if you do that)
            // But usually 'ON_ACCOUNT' sales generate negative ledger.
            items.push({
                id: `LED-${entry.id}`,
                type: `LEDGER_${entry.type}`,
                date: new Date(entry.created_at),
                title: entry.type === 'PAYMENT' ? 'Payment Received' : (entry.type === 'SALE' ? 'Manual Charge' : 'Balance Adjust'),
                subtitle: entry.notes || 'No description',
                amount: entry.amount, // Keep sign to show if it helped or hurt balance
                raw: entry
            });
        });

        // Sort by Date Descending
        return items.sort((a, b) => b.date.getTime() - a.date.getTime());
    }

    getActivityIcon(activity: any): string {
        if (activity.type === 'SALE_TX') return 'shopping_cart';
        if (activity.type === 'LEDGER_PAYMENT') return 'payments';
        return 'tune';
    }

    getActivityDotColor(activity: any): string {
        if (activity.type === 'SALE_TX') return 'bg-blue-500';
        if (activity.type === 'LEDGER_PAYMENT') return 'bg-green-500';
        if (activity.amount < 0) return 'bg-orange-500';
        return 'bg-slate-400';
    }

    getActivityTextColor(activity: any): string {
        if (activity.type === 'SALE_TX') return 'text-blue-600 dark:text-blue-400';
        if (activity.type === 'LEDGER_PAYMENT') return 'text-green-600 dark:text-green-400';
        return 'text-slate-700 dark:text-slate-300';
    }

    getActivityAmountColor(activity: any): string {
        if (activity.type === 'SALE_TX') return 'text-slate-600 dark:text-slate-300'; // Neutral for purchases
        if (activity.amount > 0) return 'text-green-600';
        return 'text-orange-500';
    }

    getDaysSince(dateString: string): number {
        const pastDate = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - pastDate.getTime());
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }
}

