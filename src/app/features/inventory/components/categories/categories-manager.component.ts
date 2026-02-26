import { Component, inject, signal, Signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup, FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs';
import { MockSupabaseService, Category, Product, AttributeDefinition } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';

@Component({
  selector: 'app-categories-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe],
  template: `
    <div class="h-[calc(100vh-180px)] flex bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative">
      
      <!-- ══ COLUMN 1: CATEGORY TREE & NAVIGATION ════════════════════════ -->
      <div class="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50">
        
        <!-- Search & Control -->
        <div class="p-6 space-y-4 border-b border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <h2 class="text-xs font-black uppercase tracking-widest text-slate-400">Classifications</h2>
            <button (click)="openAddMode()" 
                    class="w-8 h-8 flex items-center justify-center bg-[var(--primary-color)] text-white rounded-lg shadow-lg hover:scale-110 active:scale-95 transition-all">
              <span class="material-symbols-rounded text-lg">add</span>
            </button>
          </div>
          <div class="relative">
            <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input type="text" [(ngModel)]="searchQuery" 
                   placeholder="Search categories..."
                   class="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
          </div>
        </div>

        <!-- Scrollable Tree -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          @for (group of hierarchicalCategories(); track group.parent.id) {
            <div class="space-y-1">
              <!-- Parent Item -->
              <button (click)="selectCategory(group.parent)"
                      class="w-full text-left p-3 rounded-xl flex items-center justify-between group transition-all border-2"
                      [ngClass]="{
                        'bg-white dark:bg-slate-800 border-[var(--primary-color)] shadow-md': selectedCategoryId() === group.parent.id,
                        'border-transparent hover:bg-white dark:hover:bg-slate-800/50 hover:border-slate-100 dark:hover:border-slate-700': selectedCategoryId() !== group.parent.id
                      }">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shadow-sm" [style.backgroundColor]="group.parent.color || '#3b82f6'">
                    {{ group.parent.name[0] }}
                  </div>
                  <span class="text-sm font-black text-slate-700 dark:text-slate-200">{{ group.parent.name }}</span>
                </div>
                @if (group.children.length > 0) {
                  <span class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px] font-black text-slate-400 uppercase">{{ group.children.length }}</span>
                }
              </button>

              <!-- Child Items -->
              <div class="ml-6 space-y-1 relative before:absolute before:left-[-14px] before:top-0 before:bottom-3 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800">
                @for (child of group.children; track child.id) {
                  <button (click)="selectCategory(child)"
                          class="w-full text-left p-2.5 pl-4 rounded-xl flex items-center gap-3 transition-all border-2 hover:translate-x-1"
                          [ngClass]="{
                            'bg-white dark:bg-slate-800 border-[var(--primary-color)] shadow-sm': selectedCategoryId() === child.id,
                            'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100': selectedCategoryId() !== child.id
                          }">
                    <div class="w-1.5 h-1.5 rounded-full" [style.backgroundColor]="child.color || group.parent.color"></div>
                    <span class="text-xs font-bold">{{ child.name }}</span>
                  </button>
                }
              </div>
            </div>
          } @empty {
            <div class="py-20 flex flex-col items-center opacity-30 text-center px-6">
              <span class="material-symbols-rounded text-5xl mb-2">grid_view</span>
              <p class="text-xs font-bold uppercase tracking-widest">No Categories Found</p>
            </div>
          }
        </div>
      </div>

      <!-- ══ COLUMN 2: COMMAND CENTER (DETAILS & SMART TEMPLATES) ══════ -->
      <div class="flex-1 flex flex-col bg-white dark:bg-slate-900">
        
        @if (panelMode() === 'EMPTY') {
          <div class="flex-1 flex flex-col items-center justify-center text-center px-12 animate-in fade-in zoom-in duration-500">
             <div class="w-24 h-24 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 mb-6 group cursor-pointer hover:scale-110 transition-transform shadow-xl shadow-slate-100 dark:shadow-none">
                <span class="material-symbols-rounded text-6xl text-slate-200 group-hover:text-[var(--primary-color)] transition-colors">category</span>
             </div>
             <h3 class="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Category Architecture</h3>
             <p class="mt-3 text-sm text-slate-400 leading-relaxed max-w-sm">Select a category to manage its hierarchy, color identity, and smart technical templates.</p>
             <button (click)="openAddMode()" class="mt-8 px-8 py-3.5 bg-[var(--primary-color)] text-white text-xs font-black rounded-2xl shadow-xl hover:-translate-y-1 transition-all flex items-center gap-2 uppercase tracking-widest">
               <span class="material-symbols-rounded text-sm">add_circle</span>
               Initialize Category
             </button>
          </div>
        } @else {
          
          <!-- Detail Header -->
          <div class="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg shadow-blue-500/20" 
                   [style.backgroundColor]="panelMode() === 'ADD' ? '#3b82f6' : (selectedCategory()?.color || '#3b82f6')">
                {{ panelMode() === 'ADD' ? '+' : (selectedCategory()?.name?.[0] || 'C') }}
              </div>
              <div>
                <h2 class="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                  {{ panelMode() === 'ADD' ? 'Initialize Topology' : selectedCategory()?.name }}
                </h2>
                <div class="flex items-center gap-2 mt-0.5">
                   <div class="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                   <span class="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                     {{ panelMode() === 'ADD' ? 'New classification node' : 'Category Node Manager' }}
                   </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              @if (panelMode() === 'DETAIL') {
                <button (click)="showDeleteConfirm()" class="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              }
              <button (click)="cancelPanel()" class="px-4 py-2 text-xs font-black text-slate-400 hover:text-slate-700 transition-colors">Discard</button>
              <button (click)="saveCategory()" 
                      [disabled]="categoryForm.invalid"
                      class="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl shadow-lg hover:scale-105 transition-all disabled:opacity-50">
                {{ panelMode() === 'ADD' ? 'Commit Node' : 'Update Architecture' }}
              </button>
            </div>
          </div>

          <!-- Detail Body -->
          <div class="flex-1 flex overflow-hidden">
            
            <!-- Left Sub-Column: Configuration -->
            <div class="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              
              <!-- Identity Configuration -->
              <div class="space-y-6">
                <div class="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                  <span class="material-symbols-rounded text-sm">settings_input_component</span>
                  Core Configuration
                </div>
                <form [formGroup]="categoryForm" class="grid grid-cols-2 gap-6">
                  <div class="col-span-2">
                    <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Internal Title</label>
                    <input formControlName="name" type="text" 
                           class="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                  </div>
                  <div>
                    <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Relational Parent</label>
                    <select formControlName="parent_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                      <option [value]="null">No Parent (Master Category)</option>
                      @for (cat of topLevelCategories(); track cat.id) {
                        <option [value]="cat.id">{{ cat.name }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Visual Branding</label>
                    <div class="flex gap-2">
                       <input type="color" formControlName="color" class="w-14 h-14 p-1 rounded-xl bg-white border-2 border-slate-100 outline-none cursor-pointer">
                       <div class="flex-1 grid grid-cols-6 gap-1.5 p-1 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                          @for (color of categoryColors; track color) {
                            <button type="button" (click)="categoryForm.patchValue({color: color})" 
                                    class="w-full aspect-square rounded-md transition-all hover:scale-110" 
                                    [style.backgroundColor]="color"
                                    [class.ring-2]="categoryForm.get('color')?.value === color"
                                    [class.ring-slate-400]="categoryForm.get('color')?.value === color"></button>
                          }
                       </div>
                    </div>
                  </div>
                </form>
              </div>

              <!-- SMART TEMPLATE DESIGNER -->
              @if (panelMode() === 'DETAIL') {
                <div class="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                      <span class="material-symbols-rounded text-sm">psychology</span>
                      Smart Input Logic (Templates)
                    </div>
                    <button (click)="showNewAttributeForm = true" 
                            class="text-[10px] font-black text-[var(--primary-color)] hover:underline flex items-center gap-1">
                      <span class="material-symbols-rounded text-sm">add</span> Add Field
                    </button>
                  </div>

                  <!-- List of existing Smart Fields -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    @for (attr of activeAttributes(); track attr.id) {
                      <div class="p-4 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between group">
                        <div class="flex items-center gap-3">
                           <div class="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                              <span class="material-symbols-rounded text-sm text-[var(--primary-color)]">
                                {{ attr.data_type === 'NUMBER' ? 'numbers' : (attr.data_type === 'BOOLEAN' ? 'toggle_on' : 'text_fields') }}
                              </span>
                           </div>
                           <div>
                              <div class="font-bold text-xs text-slate-700 dark:text-slate-200">{{ attr.name }}</div>
                              <div class="text-[9px] font-mono text-slate-400">{{ attr.json_key }} · {{ attr.data_type }}</div>
                           </div>
                        </div>
                        <button (click)="removeAttribute(attr.id)" class="p-1.5 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                          <span class="material-symbols-rounded text-sm">close</span>
                        </button>
                      </div>
                    } @empty {
                       <div class="col-span-2 py-8 text-center bg-slate-50 dark:bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800">
                          <span class="material-symbols-rounded text-slate-200 text-3xl mb-2">dynamic_form</span>
                          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No smart attributes defined</p>
                       </div>
                    }

                    <!-- New Attribute Inline Form -->
                    @if (showNewAttributeForm) {
                      <div class="col-span-2 p-6 bg-blue-50/30 dark:bg-blue-900/10 border-2 border-blue-200 dark:border-blue-700/50 rounded-2xl animate-in slide-in-from-top-2">
                         <div class="grid grid-cols-3 gap-4">
                            <div class="col-span-2">
                               <label class="block text-[9px] font-black uppercase text-blue-800 dark:text-blue-300 mb-1">Display Label</label>
                               <input #attrName type="text" placeholder="e.g., Voltage Rating" class="w-full p-2.5 rounded-xl border-2 border-blue-100 outline-none focus:border-blue-400 text-sm font-bold">
                            </div>
                            <div>
                               <label class="block text-[9px] font-black uppercase text-blue-800 dark:text-blue-300 mb-1">Data Type</label>
                               <select #attrType class="w-full p-2.5 rounded-xl border-2 border-blue-100 outline-none focus:border-blue-400 text-sm font-bold">
                                  <option value="STRING">Text</option>
                                  <option value="NUMBER">Number</option>
                                  <option value="BOOLEAN">Yes/No</option>
                               </select>
                            </div>
                         </div>
                         <div class="flex justify-end gap-2 mt-4">
                            <button (click)="showNewAttributeForm = false" class="px-4 py-2 text-[10px] font-bold text-slate-400">Cancel</button>
                            <button (click)="addNewAttribute(attrName.value, attrType.value)" class="px-6 py-2 bg-blue-600 text-white text-[10px] font-black rounded-lg shadow-lg">Register Field</button>
                         </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Right Sub-Column: Summary & Intelligence -->
            <div class="w-80 flex-shrink-0 border-l border-slate-100 dark:border-slate-800 p-8 space-y-8 bg-slate-50/20 dark:bg-slate-900/30">
               
               <div class="text-xs font-black text-slate-400 uppercase tracking-widest">Global Insights</div>
               
               <!-- KPI Cards -->
               <div class="space-y-4">
                  <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                     <div class="text-[10px] font-black text-slate-400 uppercase mb-1">Asset Volume</div>
                     <div class="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{{ categoryStats().productCount }}</div>
                     <div class="text-[9px] font-bold text-green-500 mt-1">Unique SKUs in Category</div>
                  </div>
                  
                  <div class="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                     <div class="text-[10px] font-black text-slate-400 uppercase mb-1">Warehouse Value</div>
                     <div class="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{{ categoryStats().totalValue | currency:storeService.currency() }}</div>
                     <div class="text-[9px] font-bold text-blue-500 mt-1">At Current Average Cost</div>
                  </div>

                  <div class="p-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/20">
                     <div class="text-[10px] font-black uppercase opacity-80 mb-1">Smart Coverage</div>
                     <div class="text-3xl font-black tracking-tighter">{{ activeAttributes().length }}</div>
                     <div class="text-[9px] font-bold opacity-80 mt-1">Technical Template Fields</div>
                  </div>
               </div>

               @if (selectedCategory()) {
                  <div class="pt-6 space-y-4">
                     <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category Ecosystem</h4>
                     <ul class="space-y-3">
                        <li class="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                           <span class="material-symbols-rounded text-sm text-green-500">check_circle</span>
                           Automatic Barcode Routing
                        </li>
                        <li class="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                           <span class="material-symbols-rounded text-sm text-green-500">check_circle</span>
                           Dynamic Search Filtering
                        </li>
                        <li class="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
                           <span class="material-symbols-rounded text-sm text-green-500">check_circle</span>
                           Custom Export Definition
                        </li>
                     </ul>
                  </div>
               }
            </div>
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
  `]
})
export class CategoriesManagerComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  dialog = inject(DialogService);
  fb = inject(FormBuilder);

  // Identity State
  searchQuery = '';
  panelMode = signal<'EMPTY' | 'DETAIL' | 'ADD'>('EMPTY');
  selectedCategoryId = signal<string | null>(null);
  showNewAttributeForm = false;
  activeAttributes = signal<AttributeDefinition[]>([]);

  categoryColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#6366f1', '#14b8a6', '#f97316', '#06b6d4', '#4b5563', '#000000'
  ];

  // Form
  categoryForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    color: ['#3b82f6'],
    parent_id: [null]
  });

  // Data Loading
  private refreshTrigger = new BehaviorSubject<void>(undefined);

  private categories$ = this.storeService.currentStore$.pipe(
    switchMap(store => {
      if (!store) return of([]);
      return this.refreshTrigger.pipe(switchMap(() => this.supabase.getCategories(store.id)));
    })
  );
  categories = toSignal(this.categories$, { initialValue: [] as Category[] });

  private products$ = this.storeService.currentStore$.pipe(
    switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
  );
  products = toSignal(this.products$, { initialValue: [] as Product[] });

  // Computed signals
  hierarchicalCategories = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    const all = this.categories();

    // Simple filter
    const filtered = q ? all.filter(c => c.name.toLowerCase().includes(q)) : all;

    const parents = filtered.filter(c => !c.parent_id);
    return parents.map(p => ({
      parent: p,
      children: all.filter(c => c.parent_id === p.id)
    }));
  });

  topLevelCategories = computed(() => this.categories().filter(c => !c.parent_id));

  selectedCategory = computed(() => this.categories().find(c => c.id === this.selectedCategoryId()) || null);

  categoryStats = computed(() => {
    const catId = this.selectedCategoryId();
    const prods = this.products().filter(p => p.category_id === catId);
    return {
      productCount: prods.length,
      totalValue: prods.reduce((acc, p) => acc + (p.stock_quantity * (p.cost_price || 0)), 0)
    };
  });

  // ── Handlers ──────────────────────────────────────────────────────────

  selectCategory(cat: Category) {
    this.selectedCategoryId.set(cat.id);
    this.categoryForm.patchValue({
      name: cat.name,
      color: cat.color || '#3b82f6',
      parent_id: cat.parent_id
    });
    this.panelMode.set('DETAIL');
    this.loadAttributes(cat.id);
  }

  openAddMode() {
    this.selectedCategoryId.set(null);
    this.categoryForm.reset({ name: '', color: '#3b82f6', parent_id: null });
    this.panelMode.set('ADD');
    this.activeAttributes.set([]);
  }

  cancelPanel() {
    this.panelMode.set('EMPTY');
    this.selectedCategoryId.set(null);
  }

  async loadAttributes(catId: string) {
    const store = this.storeService.currentStore();
    if (!store) return;
    this.supabase.getAttributeDefinitions(store.id, catId).subscribe(defs => {
      this.activeAttributes.set(defs);
    });
  }

  saveCategory() {
    const store = this.storeService.currentStore();
    if (!store || this.categoryForm.invalid) return;

    const val = this.categoryForm.getRawValue();
    const payload = { ...val, store_id: store.id };

    if (this.panelMode() === 'ADD') {
      this.supabase.addCategory(payload).subscribe(() => {
        this.refreshTrigger.next();
        this.panelMode.set('EMPTY');
        this.dialog.alert('Success', 'Node initialized in category topology.');
      });
    } else {
      const id = this.selectedCategoryId()!;
      this.supabase.updateCategory(id, payload).subscribe(() => {
        this.refreshTrigger.next();
        this.dialog.alert('Success', 'Architecture updated.');
      });
    }
  }

  async showDeleteConfirm() {
    const id = this.selectedCategoryId();
    if (!id) return;

    if (await this.dialog.confirm('Critical Deletion', 'Removing this node will detach all linked assets and templates. Proceed?')) {
      this.supabase.deleteCategory(id).subscribe(() => {
        this.refreshTrigger.next();
        this.panelMode.set('EMPTY');
        this.dialog.alert('Success', 'Classification node removed.');
      });
    }
  }

  // Smart Template Methods
  addNewAttribute(name: string, type: string) {
    const store = this.storeService.currentStore();
    const catId = this.selectedCategoryId();
    if (!store || !catId || !name) return;

    // Create a snake_case key
    const json_key = name.toLowerCase().replace(/\\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const payload = {
      store_id: store.id,
      category_id: catId,
      name,
      json_key,
      data_type: type,
      is_required: false
    };

    this.supabase.addAttributeDefinition(payload).subscribe(() => {
      this.loadAttributes(catId);
      this.showNewAttributeForm = false;
    });
  }

  removeAttribute(attrId: string) {
    this.supabase.deleteAttributeDefinition(attrId).subscribe(() => {
      const catId = this.selectedCategoryId();
      if (catId) this.loadAttributes(catId);
    });
  }
}
