
import { Component, inject, signal, Signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, throwError, catchError } from 'rxjs';
import { MockSupabaseService, Supplier } from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';

@Component({
    selector: 'app-supplier-manager',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, DatePipe],
    template: `
    <div class="space-y-6">
      
      <!-- Suppliers Ribbon -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Suppliers</div>
              <div class="text-xl font-bold font-mono">{{ suppliersSignal().length }}</div>
          </div>
          <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-blue-500">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Purchase Orders</div>
              <div class="text-xl font-bold text-blue-500">0 <span class="text-xs font-normal opacity-50">Pending</span></div>
          </div>
      </div>

      <!-- Header & Controls -->
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-30">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-4 flex-1">
             <div class="relative flex-1 max-w-md">
                <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  [formControl]="searchControl"
                  type="text" 
                  placeholder="Search suppliers..." 
                  class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors">
             </div>
          </div>

          <button (click)="openAddModal()" class="flex items-center gap-2 px-4 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all">
             <span class="material-symbols-rounded">add_business</span>
             Add User
          </button>
        </div>
      </div>

       <!-- Suppliers List -->
       <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
         <table class="w-full text-left text-sm">
           <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
             <tr>
               <th class="p-4 w-12"></th>
               <th class="p-4">Name</th>
               <th class="p-4">Contact Person</th>
               <th class="p-4">Phone / Email</th>
               <th class="p-4 text-center">Lead Time</th>
               <th class="p-4 text-right">Actions</th>
             </tr>
           </thead>
           <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
             @for (supplier of filteredSuppliers(); track supplier.id) {
               <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group">
                 <td class="p-4 text-center">
                    <div class="w-8 h-8 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center font-bold text-xs">
                        {{ supplier.name.substring(0,2) | uppercase }}
                    </div>
                 </td>
                 <td class="p-4 font-bold">{{ supplier.name }}</td>
                 <td class="p-4 text-slate-500">{{ supplier.contact_person || '-' }}</td>
                 <td class="p-4">
                    <div class="flex flex-col text-xs space-y-1">
                        @if(supplier.phone) { <div class="flex items-center gap-1"><span class="material-symbols-rounded text-[10px] opacity-50">call</span>{{ supplier.phone }}</div> }
                        @if(supplier.email) { <div class="flex items-center gap-1"><span class="material-symbols-rounded text-[10px] opacity-50">mail</span>{{ supplier.email }}</div> }
                    </div>
                 </td>
                 <td class="p-4 text-center">
                    <span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400">
                        {{ supplier.lead_time_days }} Days
                    </span>
                 </td>
                 <td class="p-4 text-right">
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
                        <button (click)="openEditModal(supplier)" class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-[var(--primary-color)] shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Edit">
                            <span class="material-symbols-rounded text-lg">edit</span>
                        </button>
                         <button (click)="deleteSupplier(supplier)" class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-red-600 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Delete">
                            <span class="material-symbols-rounded text-lg">delete</span>
                        </button>
                    </div>
                 </td>
               </tr>
             } @empty {
               <tr><td colspan="6" class="p-12 text-center opacity-50 italic">No suppliers found. Add one to get started.</td></tr>
             }
           </tbody>
         </table>
       </div>

    </div>

    <!-- Add/Edit Modal -->
    @if (showModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
             <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                 <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold flex items-center gap-2">
                      <span class="material-symbols-rounded text-[var(--primary-color)]">storefront</span>
                      {{ isEditing() ? 'Edit Supplier' : 'Add New Supplier' }}
                    </h2>
                    <button (click)="showModal.set(false)" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                 </div>

                 <form [formGroup]="supplierForm" (ngSubmit)="saveSupplier()" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Supplier Name</label>
                        <input formControlName="name" type="text" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:ring-2 focus:ring-primary/50">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Contact Person</label>
                            <input formControlName="contact_person" type="text" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Phone</label>
                            <input formControlName="phone" type="text" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Email</label>
                        <input formControlName="email" type="email" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                    </div>

                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Address</label>
                        <textarea formControlName="address" rows="2" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 resize-none"></textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Lead Time (Days)</label>
                            <input formControlName="lead_time_days" type="number" min="0" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
                        <button type="button" (click)="showModal.set(false)" class="px-4 py-2 text-sm font-bold opacity-50 hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" [disabled]="supplierForm.invalid || isSaving()" class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                            @if(isSaving()) {
                                <span class="material-symbols-rounded animate-spin text-sm">progress_activity</span> Saving...
                            } @else {
                                Save Supplier
                            }
                        </button>
                    </div>
                 </form>
             </div>
        </div>
    }
  `
})
export class SupplierManagerComponent {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    fb = inject(FormBuilder);

    // Filter
    searchControl = this.fb.control('');
    searchQuery = toSignal(this.searchControl.valueChanges, { initialValue: '' });

    // Modal State
    showModal = signal(false);
    isEditing = signal(false);
    isSaving = signal(false);
    editingId: string | null = null;

    // Form
    supplierForm: FormGroup = this.fb.group({
        name: ['', Validators.required],
        contact_person: [''],
        email: ['', [Validators.email]],
        phone: [''],
        address: [''],
        lead_time_days: [7, [Validators.required, Validators.min(0)]],
        notes: ['']
    });

    // Data Load
    private suppliers$ = this.storeService.currentStore$.pipe(
        switchMap(store => store ? this.supabase.getSuppliers(store.id) : of([]))
    );
    suppliersSignal: Signal<Supplier[]> = toSignal(this.suppliers$, { initialValue: [] });

    // Computed
    filteredSuppliers = computed(() => {
        const query = (this.searchQuery() || '').toLowerCase();
        return this.suppliersSignal().filter(s =>
            s.name.toLowerCase().includes(query) ||
            (s.contact_person || '').toLowerCase().includes(query)
        );
    });

    openAddModal() {
        this.isEditing.set(false);
        this.editingId = null;
        this.supplierForm.reset({ lead_time_days: 7 });
        this.showModal.set(true);
    }

    openEditModal(supplier: Supplier) {
        this.isEditing.set(true);
        this.editingId = supplier.id;
        this.supplierForm.patchValue(supplier);
        this.showModal.set(true);
    }

    saveSupplier() {
        if (this.supplierForm.invalid) return;

        this.isSaving.set(true);
        const formVal = this.supplierForm.value;
        const storeId = this.storeService.currentStore()?.id;

        if (!storeId) {
            console.error('No Store ID');
            this.isSaving.set(false);
            return;
        }

        let obs$;
        if (this.isEditing() && this.editingId) {
            obs$ = this.supabase.updateSupplier(this.editingId, formVal);
        } else {
            obs$ = this.supabase.addSupplier({ ...formVal, store_id: storeId });
        }

        obs$.subscribe({
            next: (newSupplier: Supplier | Supplier[]) => {
                // Creating a new array reference to trigger change detection if needed, 
                // though `mock-supabase` might emit a whole new array via `getSuppliers` subscription.
                // Best practice with this architecture is to rely on real-time subscription or manual re-fetch.
                // Assuming we trigger a refetch or optimistic update mechanism.
                // In this mock service, adding updates the internal BehaviourSubject which emits new values.

                this.isSaving.set(false);
                this.showModal.set(false);
                this.supplierForm.reset();
            },
            error: (err: any) => {
                console.error('Error saving supplier', err);
                this.isSaving.set(false);
            }
        });
    }

    deleteSupplier(supplier: Supplier) {
        if (confirm(`Are you sure you want to delete ${supplier.name}?`)) {
            this.supabase.deleteSupplier(supplier.id).subscribe({
                next: () => {
                    // Success logic, list updates automatically via subscription
                },
                error: (err: any) => console.error('Delete failed', err)
            });
        }
    }
}
