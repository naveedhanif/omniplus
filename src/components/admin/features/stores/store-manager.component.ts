import { Component, inject, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { MockSupabaseService, Store, StoreType } from '../../../../services/mock-supabase.service';
import { DialogService } from '../../../../services/dialog.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-store-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="space-y-6">
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
          <span class="material-symbols-rounded text-[var(--primary-color)]">add_business</span>
          Create New Store
        </h2>
        <form [formGroup]="storeForm" (ngSubmit)="createStore()" class="flex items-end gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium mb-1 opacity-80">Store Name</label>
            <input formControlName="name" type="text" placeholder="e.g., Downtown Pharmacy" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors">
          </div>
           <div>
            <label class="block text-sm font-medium mb-1 opacity-80">Store Type</label>
            <select formControlName="type" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors">
              <option value="MEDICAL">Medical</option>
              <option value="RESTAURANT">Restaurant</option>
              <option value="HARDWARE">Hardware</option>
            </select>
          </div>
          <button type="submit" [disabled]="storeForm.invalid" class="px-6 py-2.5 bg-[var(--primary-color)] text-white font-medium rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
            Create Store
          </button>
        </form>
      </div>

      @if (allStores().length > 0) {
         <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 class="text-xl font-bold mb-4">Existing Stores</h2>
            <ul class="space-y-2">
              @for(store of allStores(); track store.id) {
                <li class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex justify-between items-center">
                  <span class="font-medium">{{store.name}}</span>
                  <span class="font-mono text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">{{store.type}}</span>
                </li>
              }
            </ul>
         </div>
      }
    </div>
  `
})
export class StoreManagerComponent {
  private supabase = inject(MockSupabaseService);
  private dialog = inject(DialogService);
  private fb = inject(FormBuilder);

  allStores: Signal<Store[]> = toSignal(this.supabase.getAllStores(), { initialValue: [] as Store[] });

  storeForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    type: ['MEDICAL' as StoreType, Validators.required]
  });

  createStore() {
    if (this.storeForm.invalid) return;

    const { name, type } = this.storeForm.value;
    this.supabase.addStore(name, type).subscribe({
      next: () => {
        this.dialog.alert('Success', 'Store created.');
        this.storeForm.reset({
          name: '',
          type: 'MEDICAL'
        });
      }
    });
  }
}
