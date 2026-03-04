import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { MockSupabaseService, MarketingRule, Promotion, Customer } from '../../../../core/services/mock-supabase.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-marketing-automation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 overflow-hidden relative transition-colors duration-300">
      
      <!-- Premium Glass Header -->
      <div class="px-8 py-6 relative z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center">
        <div>
          <h2 class="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-green-500/20">
              <span class="material-symbols-rounded">campaign</span>
            </div>
            Marketing Automation
          </h2>
          <p class="text-slate-500 dark:text-slate-400 mt-1 font-medium text-[13px]">Reach inactive customers with personalised WhatsApp messages and automatically generated discount codes.</p>
        </div>
        
        <div class="flex items-center gap-3">
            <button 
              (click)="runCRONAndRefresh()"
              class="h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all duration-200 flex items-center gap-2">
              <span class="material-symbols-rounded text-[18px]">rocket_launch</span>
              Scan Inactive Customers
            </button>
            @if (activeTab() === 'campaigns') {
              <button 
                (click)="openForm()"
                class="h-11 px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2">
                <span class="material-symbols-rounded text-[18px]">add</span>
                New Campaign
              </button>
            }
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="border-b border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 px-8">
        <div class="flex gap-6">
          @for (tab of tabs; track tab.id) {
            <button
              (click)="activeTab.set(tab.id)"
              class="py-4 text-[13px] font-bold border-b-2 transition-all duration-200 flex items-center gap-2"
              [class.border-green-500]="activeTab() === tab.id"
              [class.text-green-600]="activeTab() === tab.id"
              [class.dark:text-green-400]="activeTab() === tab.id"
              [class.border-transparent]="activeTab() !== tab.id"
              [class.text-slate-500]="activeTab() !== tab.id">
              <span class="material-symbols-rounded text-[18px]">{{ tab.icon }}</span>
              {{ tab.label }}
              @if (tab.id === 'inactive' && inactiveCustomers().length > 0) {
                <span class="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{{ inactiveCustomers().length }}</span>
              }
              @if (tab.id === 'codes' && pendingPromoCodes().length > 0) {
                <span class="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{{ pendingPromoCodes().length }}</span>
              }
            </button>
          }
        </div>
      </div>

      <div class="flex-1 overflow-auto p-8 relative">
        @if (isLoading()) {
          <div class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10">
            <div class="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full shadow-lg"></div>
          </div>
        }

        <!-- ===== TAB 1: CAMPAIGNS ===== -->
        @if (activeTab() === 'campaigns') {
          @if (rules().length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div class="w-32 h-32 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <span class="material-symbols-rounded text-6xl text-slate-300 dark:text-slate-600">contactless</span>
              </div>
              <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200">No Automated Campaigns</h3>
              <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
                Set up a rule to automatically identify inactive customers and generate unique discount codes for them.
              </p>
              <button 
                (click)="openForm()"
                class="mt-8 px-6 py-3 rounded-full bg-green-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-green-500/30 hover:-translate-y-1 transition-all duration-300">
                Create Your First Campaign
              </button>
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              @for (rule of rules(); track rule.id) {
                <div class="group bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                  <div class="absolute top-0 left-0 w-full h-1" [ngClass]="rule.is_active ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'"></div>
                  
                  <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-3">
                      <div class="w-12 h-12 rounded-full flex items-center justify-center" [ngClass]="rule.is_active ? 'bg-green-50 dark:bg-green-500/10 text-green-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'">
                         <span class="material-symbols-rounded text-[24px]">mark_email_unread</span>
                      </div>
                      <div>
                        <h3 class="font-bold text-slate-800 dark:text-slate-100 text-lg">{{ rule.name }}</h3>
                        <span class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" [ngClass]="rule.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'">
                          {{ rule.is_active ? 'Active' : 'Paused' }}
                        </span>
                      </div>
                    </div>
                    <button class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors" (click)="openForm(rule)">
                      <span class="material-symbols-rounded text-lg">edit</span>
                    </button>
                  </div>
                  
                  <div class="space-y-3">
                    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                      <div class="flex items-center gap-2 text-slate-500">
                        <span class="material-symbols-rounded text-[18px]">history</span>
                        <span class="text-[13px] font-medium">Trigger</span>
                      </div>
                      <span class="font-bold text-slate-800 dark:text-slate-200 text-[14px]">{{ rule.trigger_days }}+ Days Inactive</span>
                    </div>
                    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                      <div class="flex items-center gap-2 text-slate-500">
                        <span class="material-symbols-rounded text-[18px]">local_offer</span>
                        <span class="text-[13px] font-medium">Discount</span>
                      </div>
                      <span class="font-bold text-emerald-600 text-[14px]">{{ rule.discount_percentage }}% OFF</span>
                    </div>
                    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                      <div class="flex items-center gap-2 text-slate-500">
                        <span class="material-symbols-rounded text-[18px]">calendar_clock</span>
                        <span class="text-[13px] font-medium">Code Valid For</span>
                      </div>
                      <span class="font-bold text-slate-800 dark:text-slate-200 text-[14px]">{{ rule.validity_days }} Days</span>
                    </div>
                  </div>

                  <button class="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600 hover:text-white"
                          (click)="deleteRule(rule.id, $event)">
                    <span class="material-symbols-rounded text-[18px]">delete</span>
                  </button>
                </div>
              }
            </div>
          }
        }

        <!-- ===== TAB 2: INACTIVE CUSTOMERS ===== -->
        @if (activeTab() === 'inactive') {
          @if (inactiveCustomers().length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div class="w-32 h-32 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6">
                <span class="material-symbols-rounded text-6xl text-green-400">check_circle</span>
              </div>
              <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200">All Customers Are Active!</h3>
              <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
                No customers match the inactive criteria right now. Click <strong>"Scan Inactive Customers"</strong> above to run a fresh check, or create a campaign rule first.
              </p>
            </div>
          } @else {
            <div class="space-y-4">
              <div class="flex items-center justify-between mb-2">
                <p class="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Found <strong class="text-rose-600">{{ inactiveCustomers().length }}</strong> customers who haven't visited recently. Review and send them a personalised WhatsApp message.
                </p>
              </div>
              @for (item of inactiveCustomers(); track item.customer.id) {
                <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-4">
                  <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 font-black text-lg">
                      {{ item.customer.full_name.charAt(0) }}
                    </div>
                    <div>
                      <p class="font-bold text-slate-800 dark:text-slate-100">{{ item.customer.full_name }}</p>
                      <p class="text-xs text-slate-400 mt-0.5">{{ item.customer.phone || 'No phone number' }}</p>
                    </div>
                  </div>
                  <div class="hidden md:flex items-center gap-8 text-center">
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Last Visit</p>
                      <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">{{ item.customer.last_purchase_date ? (item.customer.last_purchase_date | date:'d MMM y') : 'Never' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Days Inactive</p>
                      <p class="font-black text-rose-500 text-xl">{{ item.daysInactive }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Campaign</p>
                      <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">{{ item.rule.name }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Discount</p>
                      <p class="font-bold text-emerald-600 text-sm">{{ item.rule.discount_percentage }}% OFF</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    @if (item.promoCode) {
                      <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2 text-center">
                        <p class="text-[9px] font-black uppercase tracking-widest text-green-600 dark:text-green-400">Generated Code</p>
                        <p class="font-black text-green-700 dark:text-green-300 text-base tracking-widest">{{ item.promoCode }}</p>
                        <p class="text-[9px] text-green-500">Valid {{ item.rule.validity_days }} days</p>
                      </div>
                      <a [href]="buildWhatsAppLink(item)" target="_blank"
                         class="h-11 px-5 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 hover:shadow-lg transition-all flex items-center gap-2 no-underline">
                        <span class="material-symbols-rounded text-[18px]">chat</span>
                        Send via WhatsApp
                      </a>
                    } @else {
                      <button
                        (click)="generateAndSend(item)"
                        [disabled]="!item.customer.phone || generatingFor() === item.customer.id"
                        class="h-11 px-5 rounded-xl bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50">
                        @if (generatingFor() === item.customer.id) {
                          <span class="material-symbols-rounded animate-spin text-[18px]">hourglass_empty</span>
                          Generating...
                        } @else {
                          <span class="material-symbols-rounded text-[18px]">auto_awesome</span>
                          Generate & Send
                        }
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        }

        <!-- ===== TAB 3: PROMO CODES ===== -->
        @if (activeTab() === 'codes') {
          @if (allPromoCodes().length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div class="w-32 h-32 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mb-6">
                <span class="material-symbols-rounded text-6xl text-amber-400">confirmation_number</span>
              </div>
              <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200">No Promo Codes Yet</h3>
              <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
                Promo codes will appear here once you generate them from the <strong>Inactive Customers</strong> tab. Each code can be used once at the POS.
              </p>
            </div>
          } @else {
            <div class="space-y-1">
              <!-- Header Row -->
              <div class="grid grid-cols-6 gap-4 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Code</span>
                <span>Customer</span>
                <span>Discount</span>
                <span>Valid Until</span>
                <span>Status</span>
                <span>Transaction</span>
              </div>
              @for (promo of allPromoCodes(); track promo.id) {
                <div class="grid grid-cols-6 gap-4 items-center bg-white dark:bg-slate-800 rounded-2xl px-4 py-4 border shadow-sm"
                     [class.border-slate-200]="!promo.is_used && !isExpired(promo)"
                     [class.dark:border-slate-700]="!promo.is_used && !isExpired(promo)"
                     [class.border-green-200]="promo.is_used"
                     [class.dark:border-green-900]="promo.is_used"
                     [class.border-red-200]="isExpired(promo) && !promo.is_used"
                     [class.opacity-60]="isExpired(promo) && !promo.is_used">
                  
                  <span class="font-black tracking-widest text-indigo-600 dark:text-indigo-400 font-mono text-sm">{{ promo.code }}</span>
                  
                  <span class="font-medium text-slate-700 dark:text-slate-200 text-sm truncate">{{ getCustomerName(promo.customer_id) }}</span>
                  
                  <span class="font-black text-emerald-600 text-sm">{{ promo.discount_percentage }}% OFF</span>
                  
                  <div>
                    <p class="font-medium text-slate-700 dark:text-slate-300 text-sm">{{ promo.validity_end | date:'d MMM y' }}</p>
                    @if (isExpired(promo) && !promo.is_used) {
                      <p class="text-[10px] text-red-500 font-bold">Expired</p>
                    }
                  </div>
                  
                  <div>
                    @if (promo.is_used) {
                      <span class="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[11px] font-black px-3 py-1 rounded-full">
                        ✅ Used {{ promo.used_at | date:'d MMM' }}
                      </span>
                    } @else if (isExpired(promo)) {
                      <span class="bg-red-100 dark:bg-red-900/20 text-red-600 text-[11px] font-black px-3 py-1 rounded-full">Expired</span>
                    } @else {
                      <span class="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[11px] font-black px-3 py-1 rounded-full">⏳ Pending</span>
                    }
                  </div>

                  <span class="font-mono text-[11px] text-slate-400 truncate">{{ promo.transaction_id ? promo.transaction_id.substring(0,8) + '...' : '—' }}</span>
                </div>
              }
            </div>
          }
        }
      </div>

      <!-- Create/Edit Campaign Modal -->
      @if (isFormOpen()) {
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-full overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span class="material-symbols-rounded text-green-500">{{ editingRule() ? 'edit' : 'add_circle' }}</span>
                {{ editingRule() ? 'Edit Campaign' : 'Create New Campaign' }}
              </h3>
              <button (click)="closeForm()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
            
            <div class="p-6 overflow-auto flex-1 custom-scrollbar">
              <div class="space-y-6">
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Campaign Name</label>
                  <input type="text" [(ngModel)]="formData.name" placeholder="e.g., 30-Day Win-Back" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none transition-all dark:text-white">
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Days Inactive</label>
                    <div class="relative">
                      <input type="number" [(ngModel)]="formData.trigger_days" min="1" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none transition-all dark:text-white">
                      <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">history</span>
                    </div>
                  </div>
                  
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Discount %</label>
                    <div class="relative">
                      <input type="number" [(ngModel)]="formData.discount_percentage" min="0" max="100" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none transition-all dark:text-white">
                      <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">percent</span>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Code Valid For (Days)</label>
                    <div class="relative">
                      <input type="number" [(ngModel)]="formData.validity_days" min="1" max="365" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none transition-all dark:text-white">
                      <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">calendar_clock</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div class="flex justify-between items-end mb-2">
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider">WhatsApp Message Template</label>
                    <span class="text-[11px] text-slate-400">Use <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">[Name]</code> <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">[Code]</code> <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">[Discount]</code> <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">[Days]</code></span>
                  </div>
                  <textarea [(ngModel)]="formData.message_template" rows="4" placeholder="Hi [Name], we miss you! Use [Code] for [Discount]% off. Valid for [Days] days!" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none transition-all resize-none dark:text-white"></textarea>
                </div>

                <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <p class="font-bold text-slate-800 dark:text-slate-200 text-sm">Campaign Status</p>
                    <p class="text-[12px] text-slate-500">Is this automation currently active?</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" [(ngModel)]="formData.is_active" class="sr-only peer">
                    <div class="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-green-500"></div>
                  </label>
                </div>
              </div>
            </div>
            
            <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button (click)="closeForm()" class="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
              <button (click)="saveRule()" class="px-5 py-2.5 rounded-xl font-bold text-sm bg-green-500 text-white shadow-md hover:bg-green-600 hover:shadow-lg transition-all">
                {{ editingRule() ? 'Save Changes' : 'Create Campaign' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
  `]
})
export class MarketingAutomationComponent {
  supabase = inject(MockSupabaseService);
  storeConfig = inject(StoreConfigService);
  dialogService = inject(DialogService);

  // Tabs
  activeTab = signal<'campaigns' | 'inactive' | 'codes'>('campaigns');
  tabs = [
    { id: 'campaigns' as const, label: 'Campaign Rules', icon: 'rule' },
    { id: 'inactive' as const, label: 'Inactive Customers', icon: 'person_off' },
    { id: 'codes' as const, label: 'Promo Codes', icon: 'confirmation_number' }
  ];

  // Data
  rules = signal<MarketingRule[]>([]);
  allCustomers = signal<Customer[]>([]);
  allPromoCodes = signal<Promotion[]>([]);
  isLoading = signal<boolean>(false);
  generatingFor = signal<string | null>(null);

  // Form
  isFormOpen = signal<boolean>(false);
  editingRule = signal<MarketingRule | null>(null);
  formData = {
    name: '',
    trigger_days: 30,
    discount_percentage: 10,
    validity_days: 7,
    message_template: "Hi [Name], we haven't seen you in a while! Use code *[Code]* for *[Discount]%* off your next visit. Valid for [Days] days only! 🎁",
    is_active: true
  };

  /** Customers that match at least one active rule's inactivity threshold (computed, with promo state) */
  inactiveCustomers = signal<{ customer: Customer; rule: MarketingRule; daysInactive: number; promoCode: string | null; }[]>([]);

  /** Pending (unused, not expired) promo codes */
  pendingPromoCodes = computed(() => this.allPromoCodes().filter(p => !p.is_used && !this.isExpired(p)));

  constructor() {
    effect(() => {
      const storeId = this.storeConfig.currentStore()?.id;
      if (storeId) {
        this.loadAll(storeId);
      }
    }, { allowSignalWrites: true });
  }

  async loadAll(storeId: string) {
    this.isLoading.set(true);
    try {
      const [rules, customers, promos] = await Promise.all([
        firstValueFrom(this.supabase.getMarketingRules(storeId)),
        firstValueFrom(this.supabase.getCustomers(storeId)),
        firstValueFrom(this.supabase.getPromotions(storeId))
      ]);
      this.rules.set(rules);
      this.allCustomers.set(customers);
      this.allPromoCodes.set(promos);
      this.computeInactiveCustomers(rules, customers, promos);
    } catch (e) {
      console.error('Marketing load error', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  computeInactiveCustomers(rules: MarketingRule[], customers: Customer[], promos: Promotion[]) {
    const activeRules = rules.filter(r => r.is_active);
    const result: { customer: Customer; rule: MarketingRule; daysInactive: number; promoCode: string | null; }[] = [];
    const seen = new Set<string>();

    for (const rule of activeRules) {
      for (const customer of customers) {
        if (seen.has(customer.id)) continue;
        if (!customer.last_purchase_date) continue;
        const days = this.calcDays(customer.last_purchase_date);
        if (days >= rule.trigger_days) {
          // Check if they already have an active (unused, non-expired) promo code
          const existingPromo = promos.find(p => p.customer_id === customer.id && !p.is_used && !this.isExpired(p));
          result.push({ customer, rule, daysInactive: days, promoCode: existingPromo?.code ?? null });
          seen.add(customer.id);
        }
      }
    }
    this.inactiveCustomers.set(result);
  }

  async runCRONAndRefresh() {
    const storeId = this.storeConfig.currentStore()?.id;
    if (!storeId) return;
    this.isLoading.set(true);
    // Auto-generate codes for all inactive customers who don't have one
    const inactives = this.inactiveCustomers();
    for (const item of inactives) {
      if (!item.promoCode) {
        const code = `WIN${Math.floor(1000 + Math.random() * 9000)}`;
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + item.rule.validity_days);
        try {
          await firstValueFrom(this.supabase.createPromotion({
            store_id: storeId,
            customer_id: item.customer.id,
            code,
            discount_percentage: item.rule.discount_percentage,
            validity_start: start.toISOString(),
            validity_end: end.toISOString(),
            is_used: false,
            campaign_id: item.rule.id
          }));
        } catch (e) {
          console.error('Promo creation error', e);
        }
      }
    }
    await this.loadAll(storeId);
    this.activeTab.set('inactive');
    this.dialogService.alert('Scan Complete', `Found ${this.inactiveCustomers().length} inactive customers. New discount codes have been generated. Switch to the "Inactive Customers" tab to review and send WhatsApp messages!`);
  }

  async generateAndSend(item: { customer: Customer; rule: MarketingRule; daysInactive: number; promoCode: string | null }) {
    const storeId = this.storeConfig.currentStore()?.id;
    if (!storeId || !item.customer.phone) return;
    this.generatingFor.set(item.customer.id);
    const code = `WIN${Math.floor(1000 + Math.random() * 9000)}`;
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + item.rule.validity_days);
    try {
      await firstValueFrom(this.supabase.createPromotion({
        store_id: storeId,
        customer_id: item.customer.id,
        code,
        discount_percentage: item.rule.discount_percentage,
        validity_start: start.toISOString(),
        validity_end: end.toISOString(),
        is_used: false,
        campaign_id: item.rule.id
      }));
      await this.loadAll(storeId);
      // Immediately build the WhatsApp link and open it
      const updatedItem = this.inactiveCustomers().find(i => i.customer.id === item.customer.id);
      if (updatedItem) {
        window.open(this.buildWhatsAppLink(updatedItem), '_blank');
      }
    } catch (e) {
      this.dialogService.alert('Error', 'Failed to generate promo code. Please try again.');
    } finally {
      this.generatingFor.set(null);
    }
  }

  buildWhatsAppLink(item: { customer: Customer; rule: MarketingRule; daysInactive: number; promoCode: string | null }): string {
    const phone = (item.customer.phone || '').replace(/[\s+\-()]/g, '');
    const message = item.rule.message_template
      .replace(/\[Name\]/gi, item.customer.full_name.split(' ')[0])
      .replace(/\[Code\]/gi, item.promoCode || '')
      .replace(/\[Discount\]/gi, item.rule.discount_percentage.toString())
      .replace(/\[Days\]/gi, item.rule.validity_days.toString());
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  isExpired(promo: Promotion): boolean {
    return new Date(promo.validity_end) < new Date();
  }

  calcDays(dateISO: string): number {
    const last = new Date(dateISO);
    const today = new Date();
    last.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round(Math.abs(today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  }

  getCustomerName(customerId?: string): string {
    if (!customerId) return 'Walk-in';
    return this.allCustomers().find(c => c.id === customerId)?.full_name ?? customerId.substring(0, 8);
  }

  // Campaign CRUD
  loadRules(storeId: string) {
    this.supabase.getMarketingRules(storeId).subscribe(data => this.rules.set(data));
  }

  openForm(rule?: MarketingRule) {
    if (rule) {
      this.editingRule.set(rule);
      this.formData = { ...rule, validity_days: rule.validity_days || 7 };
    } else {
      this.editingRule.set(null);
      this.formData = {
        name: '',
        trigger_days: 30,
        discount_percentage: 10,
        validity_days: 7,
        message_template: "Hi [Name], we haven't seen you in a while! Use code *[Code]* for *[Discount]%* off your next visit. Valid for [Days] days only! 🎁",
        is_active: true
      };
    }
    this.isFormOpen.set(true);
  }

  closeForm() {
    this.isFormOpen.set(false);
    this.editingRule.set(null);
  }

  saveRule() {
    const storeId = this.storeConfig.currentStore()?.id;
    if (!storeId) return;
    if (!this.formData.name || !this.formData.message_template) {
      this.dialogService.alert('Validation Error', 'Please provide a campaign name and message template.');
      return;
    }
    this.isLoading.set(true);
    const ruleData = { ...this.formData, store_id: storeId };
    const req = this.editingRule()
      ? this.supabase.updateMarketingRule(this.editingRule()!.id, ruleData)
      : this.supabase.createMarketingRule(ruleData);
    req.subscribe({
      next: () => { this.loadAll(storeId); this.closeForm(); },
      error: () => { this.isLoading.set(false); this.dialogService.alert('Error', 'Failed to save campaign.'); }
    });
  }

  deleteRule(id: string, event: Event) {
    event.stopPropagation();
    this.dialogService.confirm('Delete Campaign', 'Are you sure you want to delete this campaign?', 'Delete', 'Cancel').then(confirmed => {
      if (confirmed) {
        const storeId = this.storeConfig.currentStore()?.id;
        this.supabase.deleteMarketingRule(id).subscribe({
          next: () => { if (storeId) this.loadAll(storeId); }
        });
      }
    });
  }
}
