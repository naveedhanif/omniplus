import { Component, inject, signal, Signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, BehaviorSubject, combineLatest } from 'rxjs';
import { MockSupabaseService, Category } from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';
import { DialogService } from '../../../../services/dialog.service';

@Component({
  selector: 'app-categories-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Add Category Form -->
      <div class="lg:col-span-4">
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sticky top-6">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <span class="material-symbols-rounded text-[var(--primary-color)]">category_customize</span>
            New Category
          </h2>
          <form [formGroup]="categoryForm" (ngSubmit)="addCategory()" class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Category Name</label>
              <input formControlName="name" type="text" placeholder="e.g. Beverages, Tools..." class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Color Theme</label>
              <div class="grid grid-cols-6 gap-2">
                @for(color of categoryColors; track color) {
                  <button type="button" (click)="categoryForm.patchValue({color: color})" [style.backgroundColor]="color" class="aspect-square rounded-lg border-2 transition-all hover:scale-110" [class.border-black]="categoryForm.get('color')?.value === color" [class.dark:border-white]="categoryForm.get('color')?.value === color" [class.border-transparent]="categoryForm.get('color')?.value !== color"></button>
                }
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Parent Category (Optional)</label>
              <select formControlName="parent_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary/50">
                <option [value]="null">No Parent (Top Level)</option>
                @for(cat of topLevelCategories(); track cat.id) {
                  <option [value]="cat.id">{{ cat.name }}</option>
                }
              </select>
            </div>
            <button type="submit" [disabled]="categoryForm.invalid" class="w-full py-3 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 mt-4">
              Create Category
            </button>
          </form>
        </div>
      </div>

      <!-- Categories List -->
      <div class="lg:col-span-8">
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div class="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
             <h2 class="text-xl font-bold">Existing Categories</h2>
             <p class="text-sm opacity-60">Manage your product organization labels</p>
          </div>
          <div class="p-6">
             <div class="space-y-4">
               @for (group of hierarchicalCategories(); track group.parent.id) {
                 <div class="space-y-2">
                   <!-- Parent Category -->
                   <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center group/parent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                     <div class="flex items-center gap-3">
                       <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shadow-lg" [style.backgroundColor]="group.parent.color || '#3b82f6'">
                          {{ group.parent.name[0] }}
                       </div>
                       <div>
                          <div class="font-bold">{{ group.parent.name }}</div>
                          <div class="text-[10px] opacity-50 uppercase tracking-widest font-bold font-mono">Top Level</div>
                       </div>
                     </div>
                     <button (click)="deleteCategory(group.parent.id)" class="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-all opacity-0 group-hover/parent:opacity-100">
                       <span class="material-symbols-rounded">delete</span>
                     </button>
                   </div>

                   <!-- Children -->
                   @if(group.children.length > 0){
                     <div class="ml-10 space-y-2 border-l-2 border-slate-100 dark:border-slate-800 pl-4">
                       @for(child of group.children; track child.id){
                         <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/30 flex justify-between items-center group/child hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                            <div class="flex items-center gap-3">
                               <div class="w-2 h-2 rounded-full" [style.backgroundColor]="child.color || group.parent.color"></div>
                               <div class="text-sm font-medium">{{ child.name }}</div>
                            </div>
                            <button (click)="deleteCategory(child.id)" class="p-1 px-2 text-slate-400 hover:text-red-500 rounded transition-all opacity-0 group-hover/child:opacity-100">
                               <span class="material-symbols-rounded text-base">delete</span>
                            </button>
                         </div>
                       }
                     </div>
                   }
                 </div>
               } @empty {
                 <div class="text-center py-12 opacity-40 italic">No categories created for this store yet.</div>
               }
             </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: []
})
export class CategoriesManagerComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  dialog = inject(DialogService);
  fb = inject(FormBuilder);

  refreshCategoriesTrigger = new BehaviorSubject<void>(undefined);

  categoryColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#6366f1', '#14b8a6', '#f97316', '#06b6d4', '#4b5563', '#000000'
  ];

  private categories$ = combineLatest([
    this.storeService.currentStore$,
    this.refreshCategoriesTrigger
  ]).pipe(
    switchMap(([store]) => store ? this.supabase.getCategories(store.id) : of([]))
  );

  categoriesSignal: Signal<Category[]> = toSignal(this.categories$, { initialValue: [] as Category[] });

  categoryForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    color: ['#3b82f6'],
    parent_id: [null]
  });

  topLevelCategories = computed(() =>
    this.categoriesSignal().filter(c => !c.parent_id)
  );

  hierarchicalCategories = computed(() => {
    const all = this.categoriesSignal();
    const parents = all.filter(c => !c.parent_id);
    return parents.map(p => ({
      parent: p,
      children: all.filter(c => c.parent_id === p.id)
    }));
  });

  addCategory() {
    const currentStore = this.storeService.currentStore();
    if (this.categoryForm.invalid || !currentStore) return;

    const { name, color, parent_id } = this.categoryForm.value;
    const newCategory: Omit<Category, 'id' | 'created_at'> = {
      store_id: currentStore.id,
      name,
      color,
      parent_id,
      sort_order: this.categoriesSignal().length
    };

    this.supabase.addCategory(newCategory).subscribe({
      next: () => {
        this.categoryForm.reset({ name: '', color: '#3b82f6', parent_id: null });
        this.refreshCategoriesTrigger.next();
        this.dialog.alert('Success', 'Category added successfully.');
      },
      error: (err) => this.dialog.alert('Error', 'Failed to add category.')
    });
  }

  async deleteCategory(id: string) {
    if (await this.dialog.confirm('Delete Category', 'Are you sure? Products in this category will become uncategorized.')) {
      this.supabase.deleteCategory(id).subscribe({
        next: () => {
          this.refreshCategoriesTrigger.next();
          this.dialog.alert('Success', 'Category deleted.');
        },
        error: (err) => this.dialog.alert('Error', 'Failed to delete category.')
      });
    }
  }
}
