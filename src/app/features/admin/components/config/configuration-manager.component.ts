import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { MockSupabaseService, Store, StoreConfig } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';

@Component({
   selector: 'app-configuration-manager',
   standalone: true,
   imports: [CommonModule, ReactiveFormsModule],
   template: `
    <div class="max-w-4xl">
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
           <div>
              <h2 class="text-xl font-bold">Store Configuration</h2>
              <p class="text-sm opacity-60">Global settings for {{ storeService.currentStore()?.name }}</p>
           </div>
           <button (click)="saveStoreConfig()" [disabled]="configForm.invalid" class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
             Save Changes
           </button>
        </div>

        <form [formGroup]="configForm" class="p-8 space-y-8">
           <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <!-- Basic Info -->
              <div class="space-y-4">
                 <h3 class="font-bold text-sm uppercase tracking-widest text-[var(--primary-color)]">General Identity</h3>
                 <div>
                    <label class="block text-sm font-medium mb-1">Display Name</label>
                    <input formControlName="name" type="text" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
                 </div>
                 <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Currency Code</label>
                        <input formControlName="currency" type="text" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50 font-mono">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Primary Color</label>
                        <div class="flex gap-2">
                           <input formControlName="primary_color" type="color" class="w-10 h-10 border-none bg-transparent cursor-pointer">
                           <input [value]="configForm.get('primary_color')?.value" (input)="configForm.patchValue({primary_color: $any($event.target).value})" type="text" class="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono">
                        </div>
                    </div>
                 </div>
              </div>

              <!-- Financials -->
              <div class="space-y-4">
                 <h3 class="font-bold text-sm uppercase tracking-widest text-[var(--primary-color)]">Financial Settings</h3>
                 <div>
                    <label class="block text-sm font-medium mb-1">Default Tax Rate (%)</label>
                    <input formControlName="tax_rate" type="number" step="0.01" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
                 </div>
                 <div class="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <input formControlName="enable_low_stock_alerts" type="checkbox" id="alerts" class="w-5 h-5 rounded text-[var(--primary-color)]">
                    <label for="alerts" class="text-sm font-medium cursor-pointer">Enable Low Stock Notifications</label>
                 </div>
              </div>

              <!-- Business Hours -->
              <div class="md:col-span-2 space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                 <div class="flex justify-between items-center">
                    <h3 class="font-bold text-sm uppercase tracking-widest text-[var(--primary-color)]">Business Hours</h3>
                    <div class="flex items-center gap-2">
                        <label class="text-xs font-bold opacity-50">ADDRESS</label>
                        <input formControlName="address" type="text" placeholder="Store Address" class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/50 w-64">
                    </div>
                 </div>
                 <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    @for(day of days; track day) {
                       <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700" [class.opacity-50]="getBusinessDayForm(day).get('closed')?.value">
                          <div class="flex justify-between items-center mb-2">
                             <div class="text-[10px] font-bold uppercase opacity-50">{{ day }}</div>
                             <input type="checkbox" [formControl]="$any(getBusinessDayForm(day).get('closed'))" class="w-3 h-3 rounded" title="Closed">
                          </div>
                          @if(!getBusinessDayForm(day).get('closed')?.value) {
                             <div class="flex flex-col gap-1.5">
                                <label class="text-[8px] uppercase font-bold opacity-40">Open</label>
                                <input type="time" [formControl]="$any(getBusinessDayForm(day).get('open'))" class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded p-1 text-[10px] outline-none">
                                <label class="text-[8px] uppercase font-bold opacity-40">Close</label>
                                <input type="time" [formControl]="$any(getBusinessDayForm(day).get('close'))" class="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded p-1 text-[10px] outline-none">
                             </div>
                          } @else {
                             <div class="h-16 flex items-center justify-center text-[10px] font-bold text-red-500/50 italic">Closed</div>
                          }
                       </div>
                    }
                 </div>
              </div>
           </div>
        </form>
      </div>
    </div>
  `,
   styleUrls: []
})
export class ConfigurationManagerComponent {
   supabase = inject(MockSupabaseService);
   storeService = inject(StoreConfigService);
   dialog = inject(DialogService);
   fb = inject(FormBuilder);

   days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
   storeProfile = signal<any>(null);

   configForm: FormGroup = this.fb.group({
      name: ['', Validators.required],
      currency: ['USD', Validators.required],
      primary_color: ['#3b82f6', Validators.required],
      tax_rate: [0, [Validators.required, Validators.min(0)]],
      enable_low_stock_alerts: [true],
      address: [''],
      business_hours: this.fb.group({
         ...this.days.reduce((acc, day) => ({
            ...acc,
            [day]: this.fb.group({
               open: ['09:00'],
               close: ['18:00'],
               closed: [false]
            })
         }), {})
      })
   });

   constructor() {
      // Sync form with current store config
      effect(() => {
         const store = this.storeService.currentStore();
         if (store) {
            this.configForm.patchValue({
               name: store.name || '',
               currency: store.config?.currency || 'USD',
               primary_color: store.config?.primaryColor || '#3b82f6',
               tax_rate: store.metadata?.tax_rate || 0,
               enable_low_stock_alerts: store.metadata?.low_stock_alerts !== false
            });

            // Load Store Profile
            this.supabase.getStoreProfile(store.id).subscribe(profile => {
               this.storeProfile.set(profile);
               if (profile) {
                  this.configForm.patchValue({
                     address: profile.address || '',
                     business_hours: profile.business_hours || {}
                  });
               }
            });
         }
      }, { allowSignalWrites: true });
   }

   getBusinessDayForm(day: string): FormGroup {
      return this.configForm.get('business_hours')?.get(day) as FormGroup;
   }

   saveStoreConfig() {
      const store = this.storeService.currentStore();
      if (this.configForm.invalid || !store) return;

      const { name, currency, primary_color, tax_rate, enable_low_stock_alerts, address, business_hours } = this.configForm.value;

      const updates: Partial<Store> = {
         name,
         config: {
            ...store.config,
            currency,
            primaryColor: primary_color
         },
         metadata: {
            ...store.metadata,
            tax_rate,
            low_stock_alerts: enable_low_stock_alerts
         }
      };

      // Save Store Config and Profile
      this.supabase.updateStore(store.id, updates).subscribe({
         next: () => {
            this.supabase.upsertStoreProfile({
               store_id: store.id,
               address,
               business_hours
            }).subscribe({
               next: () => {
                  this.dialog.alert('Success', 'Configuration and Business Hours saved.');
               },
               error: () => this.dialog.alert('Partial Success', 'Store name updated but failed to save profile.')
            });
         },
         error: (err) => this.dialog.alert('Error', 'Failed to save configuration.')
      });
   }
}
