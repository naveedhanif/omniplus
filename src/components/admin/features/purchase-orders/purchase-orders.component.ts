import { Component, inject, signal, computed, Signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup, FormArray, FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, tap } from 'rxjs';
import { MockSupabaseService, PurchaseOrder, Supplier, Store, Product } from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';

@Component({
    selector: 'app-purchase-orders',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, DatePipe],
    template: `
    <div class="space-y-6 relative">
      
      <!-- Receive PO Dialog Overlay -->
      <div *ngIf="showReceiveDialog()" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          
          <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
            <div>
              <h2 class="font-bold text-lg text-slate-800 dark:text-slate-100 mb-1">Receive Purchase Order</h2>
              <p class="text-xs text-slate-500">PO #{{ selectedPOToReceive()?.id?.substring(0,8) }}</p>
            </div>
            <button (click)="closeReceiveDialog()" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>

          <div class="flex-1 overflow-auto p-6">
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-6">Enter the actual quantities received for each item. This will immediately update your Warehouse stock levels.</p>
            
            <div class="space-y-4">
              <!-- Item Row Header -->
              <div class="grid grid-cols-12 gap-4 px-4 pb-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500">
                <div class="col-span-6">Product</div>
                <div class="col-span-2 text-center">Ordered</div>
                <div class="col-span-4 text-right">Rcv'd Qty</div>
              </div>

              <!-- Item Rows -->
              <ng-container *ngFor="let item of receiveItems(); let i = index">
                <div class="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg items-center border border-slate-100 dark:border-slate-700">
                  <div class="col-span-6 flex flex-col">
                    <span class="font-medium text-sm text-slate-800 dark:text-slate-200">{{ getProductName(item.product_id) }}</span>
                    <span class="text-xs text-slate-500">{{ item.unit_cost | currency: storeService.currency() }} each</span>
                  </div>
                  <div class="col-span-2 text-center">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 font-bold text-sm text-slate-700 dark:text-slate-300">
                      {{ item.quantity_ordered }}
                    </span>
                  </div>
                  <div class="col-span-4 flex flex-col justify-end items-end gap-2">
                     <div class="flex items-center gap-2">
                         <span class="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded uppercase" *ngIf="item.receiving_now > (item.quantity_ordered - (item.quantity_received || 0))">Overage</span>
                         <span class="text-xs text-slate-400" *ngIf="item.quantity_received > 0">Prev: {{ item.quantity_received }}</span>
                         <input type="number" 
                                [(ngModel)]="item.receiving_now" 
                                min="0"
                                class="w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-1.5 text-sm text-center font-bold focus:ring-2 focus:ring-primary/50 outline-none">
                     </div>
                     <div *ngIf="isProductSerialized(item.product_id) && item.receiving_now > 0" class="w-full mt-1">
                         <input type="text" [(ngModel)]="item.serial_numbers_input" placeholder="Enter {{item.receiving_now}} serial numbers (comma separated)" class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-1.5 text-xs focus:ring-2 focus:ring-primary/50 outline-none">
                         <p class="text-[9px] text-red-500 text-right mt-1" *ngIf="getValidSerialCount(item.serial_numbers_input) !== item.receiving_now">
                           Requires exactly {{item.receiving_now}} serial(s).
                         </p>
                     </div>
                  </div>
                </div>
              </ng-container>
            </div>
          </div>

          <div class="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
             <button (click)="closeReceiveDialog()" class="px-5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
               Cancel
             </button>
             <button (click)="submitReceivePO()" 
                     [disabled]="isReceiving() || !hasValidReceiveQuantities()"
                     class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                 <span class="material-symbols-rounded text-sm" *ngIf="isReceiving()">sync</span>
                 {{ isReceiving() ? 'Processing...' : 'Confirm Receipt' }}
             </button>
          </div>

        </div>
      </div>

      <!-- List View -->
      @if (viewState() === 'LIST') {
        <!-- Header & Controls -->
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 class="text-xl font-bold flex items-center gap-2">
                <span class="material-symbols-rounded text-[var(--primary-color)]">shopping_cart</span>
                Purchase Orders
            </h2>
            <div class="flex items-center gap-3">
                 <!-- Filters -->
                 <div class="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                    <button *ngFor="let filter of ['ALL', 'DRAFT', 'SENT', 'PARTIAL', 'RECEIVED']" 
                            (click)="statusFilter.set(filter)"
                            [class.bg-white]="statusFilter() === filter"
                            [class.dark:bg-slate-700]="statusFilter() === filter"
                            [class.shadow-sm]="statusFilter() === filter"
                            [class.text-slate-800]="statusFilter() === filter"
                            [class.dark:text-white]="statusFilter() === filter"
                            [class.text-slate-500]="statusFilter() !== filter"
                            class="px-3 py-1.5 text-xs font-bold rounded-md transition-all">
                        {{ filter }}
                    </button>
                 </div>
                 
                 <div class="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

                 <div class="relative max-w-xs">
                    <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                    <input type="text" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" placeholder="Search POs..." class="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm w-full outline-none focus:border-primary">
                 </div>
                 <button (click)="startNewPO()" class="flex items-center gap-2 px-4 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all w-max whitespace-nowrap">
                    <span class="material-symbols-rounded">add</span>
                    New Order
                 </button>
            </div>
            </div>
        </div>

        <!-- PO List -->
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                        <th class="p-4">PO #</th>
                        <th class="p-4">Supplier</th>
                        <th class="p-4">Status</th>
                        <th class="p-4 text-right">Total</th>
                        <th class="p-4">Expected</th>
                        <th class="p-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    @for (po of filteredPOs(); track po.id) {
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                            <td class="p-4 font-mono font-bold">{{ po.id.substring(0,8) }}</td>
                            <td class="p-4">{{ po.supplier?.name || 'Unknown' }}</td>
                            <td class="p-4">
                                <span class="px-2 py-1 rounded-full text-xs font-bold" 
                                    [ngClass]="{
                                        'bg-slate-100 text-slate-600': po.status === 'DRAFT',
                                        'bg-blue-100 text-blue-800': po.status === 'SENT',
                                        'bg-purple-100 text-purple-800': po.status === 'ORDERED',
                                        'bg-orange-100 text-orange-800': po.status === 'PARTIAL',
                                        'bg-green-100 text-green-800': po.status === 'RECEIVED',
                                        'bg-red-100 text-red-800': po.status === 'CANCELLED'
                                    }">
                                    {{ po.status }}
                                </span>
                            </td>
                            <td class="p-4 text-right font-bold">{{ po.total_amount | currency: storeService.currency() }}</td>
                            <td class="p-4 text-slate-500">{{ po.expected_arrival ? (po.expected_arrival | date:'mediumDate') : '-' }}</td>
                            <td class="p-4 text-right">
                                @if (po.status !== 'RECEIVED' && po.status !== 'CANCELLED') {
                                    <button (click)="openReceiveDialog(po)" class="text-sm text-green-600 hover:text-green-800 font-bold mr-2">Receive</button>
                                }
                                <button (click)="viewPODetail(po)" class="text-slate-400 hover:text-[var(--primary-color)]">
                                    <span class="material-symbols-rounded">visibility</span>
                                </button>
                            </td>
                        </tr>
                    } @empty {
                         <tr><td colspan="6" class="p-12 text-center opacity-50 italic">No purchase orders found.</td></tr>
                    }
                </tbody>
            </table>
        </div>
      }

      <!-- Create Form -->
      @if (viewState() === 'CREATE') {
        <div class="bg-[var(--card-bg)] rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[calc(100vh-140px)]">
            
            <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h2 class="font-bold text-lg">New Purchase Order</h2>
                <button (click)="viewState.set('LIST')" class="text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
            </div>

            <div class="flex-1 overflow-auto p-6">
                <form [formGroup]="poForm" class="space-y-8">
                    
                    <!-- Supplier Selection -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Select Supplier</label>
                            <select formControlName="supplier_id" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:ring-2 focus:ring-primary/50 outline-none">
                                <option [ngValue]="null">Select a Supplier...</option>
                                @for (supplier of suppliers(); track supplier.id) {
                                    <option [value]="supplier.id">{{ supplier.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                             <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Order Date</label>
                             <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 border border-transparent">
                                {{ currentDate | date:'fullDate' }}
                             </div>
                        </div>
                    </div>

                    <!-- Line Items -->
                    <div>
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-slate-700 dark:text-slate-300">Order Items</h3>
                             <button type="button" (click)="addItem()" class="text-sm text-[var(--primary-color)] font-bold flex items-center gap-1 hover:underline">
                                <span class="material-symbols-rounded text-lg">add_circle</span> Add Product
                             </button>
                        </div>
                        
                        <div formArrayName="items" class="space-y-2">
                             @for (item of items.controls; track i; let i = $index) {
                                <div [formGroupName]="i" class="flex gap-4 items-start p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 group">
                                    <div class="flex-1">
                                        <select formControlName="product_id" (change)="onProductSelect(i)" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm">
                                            <option [value]="null">Select Product...</option>
                                            <!-- Optimally create a filtered list based on supplier if needed -->
                                            @for (prod of products() || []; track prod.id) {
                                                <option [value]="prod.id">{{ prod.name }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div class="w-24">
                                        <input type="number" formControlName="quantity" placeholder="Qty" min="1" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-center">
                                    </div>
                                    <div class="w-32 relative">
                                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{{ storeService.currency() }}</span>
                                        <input type="number" formControlName="cost" placeholder="Cost" min="0" class="w-full pl-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-right">
                                    </div>
                                    <div class="w-24 p-2 text-right font-bold text-sm">
                                        {{ (item.get('quantity')?.value || 0) * (item.get('cost')?.value || 0) | currency: storeService.currency() }}
                                    </div>
                                    <button type="button" (click)="removeItem(i)" class="p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span class="material-symbols-rounded">delete</span>
                                    </button>
                                </div>
                             }
                        </div>
                    </div>

                    <!-- Totals -->
                    <div class="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div class="w-64 space-y-2">
                            <div class="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span>{{ calculateTotal() | currency: storeService.currency() }}</span>
                            </div>
                        </div>
                    </div>

                </form>
            </div>

            <div class="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                <button (click)="viewState.set('LIST')" class="px-4 py-2 text-slate-500 font-bold hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors">Discard</button>
                <button (click)="savePO()" [disabled]="poForm.invalid || items.length === 0 || isSaving()" class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    @if(isSaving()) { Saving... } @else { Create Order }
                </button>
            </div>
        </div>
      }

      <!-- Detail View -->
      @if (viewState() === 'DETAIL' && selectedPO(); as po) {
        <div class="bg-[var(--card-bg)] rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div class="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <div>
                    <div class="flex items-center gap-3 mb-1">
                        <button (click)="viewState.set('LIST')" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                            <span class="material-symbols-rounded block">arrow_back</span>
                        </button>
                        <h2 class="font-bold text-xl">Purchase Order #{{ po.id.substring(0,8) }}</h2>
                    </div>
                    <p class="text-sm text-slate-500 ml-9">Created on {{ po.created_at | date:'fullDate' }}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="px-3 py-1 rounded-full text-xs font-bold" 
                        [ngClass]="{
                            'bg-slate-100 text-slate-600': po.status === 'DRAFT',
                            'bg-blue-100 text-blue-800': po.status === 'SENT',
                            'bg-purple-100 text-purple-800': po.status === 'ORDERED',
                            'bg-orange-100 text-orange-800': po.status === 'PARTIAL',
                            'bg-green-100 text-green-800': po.status === 'RECEIVED',
                            'bg-red-100 text-red-800': po.status === 'CANCELLED'
                        }">
                        {{ po.status }}
                    </span>
                    @if (po.status !== 'RECEIVED' && po.status !== 'CANCELLED') {
                        <button (click)="openReceiveDialog(po)" class="px-4 py-2 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 transition-colors">
                            Receive Order
                        </button>
                    }
                </div>
            </div>

            <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                <!-- Summary Info -->
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-1">Supplier</label>
                        <div class="font-medium">{{ po.supplier?.name || 'Unknown Supplier' }}</div>
                        <div class="text-sm text-slate-500">{{ po.supplier?.email || '' }}</div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-1">Expected Arrival</label>
                        <div class="font-medium">{{ po.expected_arrival ? (po.expected_arrival | date:'mediumDate') : 'Not specified' }}</div>
                    </div>
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Order Total</label>
                        <div class="text-2xl font-black text-[var(--primary-color)]">
                            {{ po.total_amount | currency: storeService.currency() }}
                        </div>
                    </div>
                </div>

                <!-- Items Table -->
                <div class="md:col-span-2">
                    <h3 class="font-bold mb-4 flex items-center gap-2">
                        <span class="material-symbols-rounded text-sm">list_alt</span>
                        Ordered Items
                    </h3>
                    <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold">
                                <tr>
                                    <th class="p-3">Product</th>
                                    <th class="p-3 text-center">Ordered</th>
                                    <th class="p-3 text-center">Rcv'd</th>
                                    <th class="p-3 text-right">Unit Cost</th>
                                    <th class="p-3 text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                @for (item of po.items; track item.id) {
                                    <tr>
                                        <td class="p-3 font-medium">{{ getProductName(item.product_id) }}</td>
                                        <td class="p-3 text-center text-slate-500">{{ item.quantity_ordered }}</td>
                                        <td class="p-3 text-center font-bold" [ngClass]="{'text-green-600': item.quantity_received === item.quantity_ordered, 'text-orange-500': item.quantity_received > 0 && item.quantity_received < item.quantity_ordered}">
                                            {{ item.quantity_received || 0 }}
                                        </td>
                                        <td class="p-3 text-right">{{ item.unit_cost | currency: storeService.currency() }}</td>
                                        <td class="p-3 text-right font-bold">{{ (item.quantity_ordered * item.unit_cost) | currency: storeService.currency() }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
      }
  `
})
export class PurchaseOrderComponent {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    fb = inject(FormBuilder);

    viewState = signal<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
    selectedPO = signal<PurchaseOrder | null>(null);
    currentDate = new Date();
    isSaving = signal(false);
    isReceiving = signal(false);

    // List Filtering
    statusFilter = signal<string>('ALL');
    searchQuery = signal<string>('');

    // Receive Dialog State
    showReceiveDialog = signal(false);
    selectedPOToReceive = signal<PurchaseOrder | null>(null);
    receiveItems = signal<any[]>([]);

    // Data Signals
    store = this.storeService.currentStore; // Signal<Store | null>

    purchaseOrders = toSignal(
        this.storeService.currentStore$.pipe(
            switchMap(store => store ? this.supabase.getPurchaseOrders(store.id) : of([]))
        ),
        { initialValue: [] }
    );

    filteredPOs = computed(() => {
        let pos = this.purchaseOrders();

        // Status Filter
        if (this.statusFilter() !== 'ALL') {
            pos = pos.filter(po => po.status === this.statusFilter());
        }

        // Search Filter
        const query = (this.searchQuery() || '').toLowerCase().trim();
        if (query) {
            pos = pos.filter(po =>
                (po.id || '').toLowerCase().includes(query) ||
                (po.supplier?.name || '').toLowerCase().includes(query)
            );
        }

        return pos;
    });

    suppliers = toSignal(
        this.storeService.currentStore$.pipe(
            switchMap(store => store ? this.supabase.getSuppliers(store.id) : of([]))
        ),
        { initialValue: [] }
    );

    products = toSignal(
        this.storeService.currentStore$.pipe(
            switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
        ),
        { initialValue: [] }
    );

    // Forms
    poForm: FormGroup = this.fb.group({
        supplier_id: [null, Validators.required],
        items: this.fb.array([])
    });

    get items() {
        return this.poForm.get('items') as FormArray;
    }

    startNewPO() {
        this.poForm.reset();
        this.items.clear();
        this.addItem(); // Start with one row
        this.viewState.set('CREATE');
    }

    addItem() {
        const item = this.fb.group({
            product_id: [null, Validators.required],
            quantity: [1, [Validators.required, Validators.min(1)]],
            cost: [0, [Validators.required, Validators.min(0)]]
        });
        this.items.push(item);
    }

    removeItem(index: number) {
        this.items.removeAt(index);
    }

    onProductSelect(index: number) {
        const control = this.items.at(index);
        const productId = control.get('product_id')?.value;
        if (productId) {
            const product = this.products().find(p => p.id === productId);
            if (product) {
                // Auto-fill cost (using cost_price if exists, or just 0)
                // Assuming Product interface might have cost_price now, or we default to 0
                control.patchValue({ cost: (product as any).cost_price || 0 });
            }
        }
    }

    calculateTotal(): number {
        return this.items.controls.reduce((acc, control) => {
            const qty = control.get('quantity')?.value || 0;
            const cost = control.get('cost')?.value || 0;
            return acc + (qty * cost);
        }, 0);
    }

    savePO() {
        if (this.poForm.invalid) return;

        const storeId = this.store()?.id;
        if (!storeId) return;

        this.isSaving.set(true);
        const formVal = this.poForm.value;

        const poData: Partial<PurchaseOrder> = {
            store_id: storeId,
            supplier_id: formVal.supplier_id,
            status: 'DRAFT',
            total_amount: this.calculateTotal(),
            expected_arrival: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Default 7 days
        };

        const poItems = formVal.items.map((item: any) => ({
            product_id: item.product_id,
            quantity_ordered: item.quantity,
            unit_cost: item.cost
        }));

        this.supabase.createPurchaseOrder(poData as any, poItems).subscribe({
            next: () => {
                this.isSaving.set(false);
                this.viewState.set('LIST');
                // Ideally refresh list
            },
            error: (err) => {
                console.error('Failed to create PO', err);
                this.isSaving.set(false);
            }
        });
    }

    openReceiveDialog(po: PurchaseOrder) {
        this.selectedPOToReceive.set(po);
        this.isReceiving.set(true); // Temporarily set true while fetching, acts as loading state

        // Always fetch latest items to ensure we have quantity_received
        this.supabase.getPurchaseOrderItems(po.id).subscribe({
            next: (items) => {
                const dialogItems = items.map(item => ({
                    ...item,
                    receiving_now: (item.quantity_ordered - (item.quantity_received || 0)) > 0
                        ? (item.quantity_ordered - (item.quantity_received || 0))
                        : 0,
                    serial_numbers_input: ''
                }));
                this.receiveItems.set(dialogItems);
                this.isReceiving.set(false);
                this.showReceiveDialog.set(true);
            },
            error: (err) => {
                console.error('Failed to fetch PO items for receiving', err);
                this.isReceiving.set(false);
            }
        });
    }

    closeReceiveDialog() {
        this.showReceiveDialog.set(false);
        this.selectedPOToReceive.set(null);
        this.receiveItems.set([]);
    }

    hasValidReceiveQuantities(): boolean {
        // At least one item must have > 0 receiving_now to submit
        const items = this.receiveItems();
        const hasReceiving = items.some(item => item.receiving_now > 0);
        if (!hasReceiving) return false;

        // Check serial numbers match receiving_now for serialized items
        for (const item of items) {
            if (item.receiving_now > 0 && this.isProductSerialized(item.product_id)) {
                const serials = (item.serial_numbers_input || '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                if (serials.length !== item.receiving_now) {
                    return false;
                }
            }
        }

        return true;
    }

    submitReceivePO() {
        const po = this.selectedPOToReceive();
        if (!po) return;

        const itemsToReceive = this.receiveItems()
            .filter(item => item.receiving_now > 0)
            .map(item => {
                const serials = this.isProductSerialized(item.product_id)
                    ? (item.serial_numbers_input || '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
                    : undefined;

                return {
                    item_id: item.id,
                    product_id: item.product_id,
                    received_amount: item.receiving_now,
                    unit_cost: item.unit_cost,
                    serial_numbers: serials
                };
            });

        if (itemsToReceive.length === 0) return;

        this.isReceiving.set(true);
        this.supabase.receivePO(po.id, itemsToReceive).subscribe({
            next: (result) => {
                // The backend handled status logic. 
                // We'll update the local signal optimistically if we are viewing detail
                if (this.selectedPO()?.id === po.id) {
                    this.supabase.getPurchaseOrderItems(po.id).subscribe(items => {
                        this.selectedPO.set({ ...po, status: result.newStatus as any, items });
                    });
                }

                // Refetch the list to get updated statuses 
                // (Since we are using BehaviorSubjects in the mock, it should auto-update in a real app,
                // but we will force a manual refetch for safety in the mock environment)
                const storeId = this.store()?.id;
                if (storeId) {
                    this.supabase.getPurchaseOrders(storeId).subscribe(pos => {
                        // The mock service currently doesn't allow easy push-updates to the `toSignal` without reloading,
                        // so in a real app, the supabase realtime subscription handles this.
                        // For now, closing dialog is enough.
                    });
                }

                this.isReceiving.set(false);
                this.closeReceiveDialog();
            },
            error: (err) => {
                console.error('Failed to receive PO', err);
                this.isReceiving.set(false);
            }
        });
    }

    viewPODetail(po: PurchaseOrder) {
        this.selectedPO.set(po);
        this.viewState.set('DETAIL');

        // Fetch items if missing
        this.supabase.getPurchaseOrderItems(po.id).subscribe({
            next: (items) => {
                this.selectedPO.set({ ...po, items });
            },
            error: (err) => console.error('Failed to fetch PO items', err)
        });
    }

    getProductName(productId: string): string {
        return this.products().find(p => p.id === productId)?.name || 'Unknown Product';
    }

    isProductSerialized(productId: string): boolean {
        return this.products().find(p => p.id === productId)?.is_serialized || false;
    }

    getValidSerialCount(input: string | undefined | null): number {
        if (!input) return 0;
        return input.split(',').filter(s => s.trim().length > 0).length;
    }
}
