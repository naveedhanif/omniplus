import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MockSupabaseService, Product, StockLocation } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';

export interface StockTransfer {
    id: string;
    store_id: string;
    from_location_id: string; // 'WAREHOUSE'
    to_location_id: string;   // 'SHOP'
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    notes?: string;
    created_at: string;
    items?: StockTransferItem[];
}

export interface StockTransferItem {
    id: string;
    transfer_id: string;
    product_id: string;
    product?: Product;
    quantity_requested: number;
    quantity_shipped?: number;
    quantity_received?: number;
}

@Component({
    selector: 'app-stock-transfer',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, DatePipe],
    template: `
    <div class="space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold">Stock Transfers</h2>
                <p class="text-slate-500 text-sm">Manage inventory movement between Warehouse and Shop Floor.</p>
            </div>
            <button (click)="showNewTransferModal.set(true)" class="flex items-center gap-2 px-4 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all">
                <span class="material-symbols-rounded">move_up</span>
                New Transfer
            </button>
        </div>

        <!-- Transfer List -->
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                        <th class="p-4">ID</th>
                        <th class="p-4">From -> To</th>
                        <th class="p-4">Date</th>
                        <th class="p-4">Status</th>
                        <th class="p-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    @for (transfer of transfers(); track transfer.id) {
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                            <td class="p-4 font-mono text-xs opacity-60">#{{ transfer.id.substring(0, 8) }}</td>
                            <td class="p-4">
                                <span class="font-bold">Warehouse</span> 
                                <span class="mx-2 text-slate-400">-></span> 
                                <span class="font-bold">Shop Floor</span>
                            </td>
                            <td class="p-4">{{ transfer.created_at | date:'medium' }}</td>
                            <td class="p-4">
                                <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                    [class.bg-yellow-100]="transfer.status === 'PENDING'" [class.text-yellow-700]="transfer.status === 'PENDING'"
                                    [class.bg-green-100]="transfer.status === 'COMPLETED'" [class.text-green-700]="transfer.status === 'COMPLETED'"
                                    [class.bg-red-100]="transfer.status === 'CANCELLED'" [class.text-red-700]="transfer.status === 'CANCELLED'">
                                    {{ transfer.status }}
                                </span>
                            </td>
                            <td class="p-4 text-right">
                                @if (transfer.status === 'PENDING') {
                                    <button (click)="completeTransfer(transfer)" class="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 transition-colors shadow-sm">
                                        Receive Stock
                                    </button>
                                } @else {
                                    <button class="px-3 py-1 text-slate-400 text-xs font-bold hover:text-[var(--primary-color)] transition-colors">
                                        View Details
                                    </button>
                                }
                            </td>
                        </tr>
                    } @empty {
                        <tr><td colspan="5" class="p-12 text-center opacity-50 italic">No transfers found.</td></tr>
                    }
                </tbody>
            </table>
        </div>

        <!-- New Transfer Modal -->
        @if (showNewTransferModal()) {
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span class="material-symbols-rounded text-[var(--primary-color)]">move_up</span>
                            New Stock Transfer
                        </h2>
                        <button (click)="showNewTransferModal.set(false)" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>

                    <form [formGroup]="transferForm" (ngSubmit)="createTransfer()" class="space-y-6 overflow-y-auto flex-1 pr-2">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-1">From</label>
                                <div class="font-bold flex items-center gap-2">
                                    <span class="material-symbols-rounded text-slate-400">warehouse</span>
                                    Warehouse
                                </div>
                            </div>
                            <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-1">To</label>
                                <div class="font-bold flex items-center gap-2">
                                    <span class="material-symbols-rounded text-[var(--primary-color)]">storefront</span>
                                    Shop Floor
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="flex justify-between items-center mb-2">
                                <label class="text-sm font-bold uppercase tracking-wider">Items to Transfer</label>
                                <button type="button" (click)="addItem()" class="text-xs font-bold text-[var(--primary-color)] hover:underline flex items-center gap-1">
                                    <span class="material-symbols-rounded text-sm">add</span> Add Item
                                </button>
                            </div>
                            
                            <div formArrayName="items" class="space-y-3">
                                @for (item of itemsArray.controls; track $index) {
                                    <div [formGroupName]="$index" class="flex gap-3 items-end p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 animate-in slide-in-from-left duration-300">
                                        <div class="flex-1">
                                            <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Product</label>
                                            <select formControlName="product_id" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm">
                                                <option [value]="null" disabled>Select Product</option>
                                                @for (prod of products(); track prod.id) {
                                                    <option [value]="prod.id">{{ prod.name }} (Whse: {{ prod.stock_warehouse }})</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="w-24">
                                            <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Qty</label>
                                            <input formControlName="quantity" type="number" min="1" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-center font-bold">
                                        </div>
                                        <button type="button" (click)="removeItem($index)" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mb-0.5">
                                            <span class="material-symbols-rounded">delete</span>
                                        </button>
                                    </div>
                                }
                            </div>
                        </div>

                        <div>
                             <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Notes (Optional)</label>
                             <textarea formControlName="notes" placeholder="Reason for transfer..." class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 h-20 resize-none text-sm"></textarea>
                        </div>
                    </form>

                    <div class="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-auto">
                        <button (click)="showNewTransferModal.set(false)" class="px-4 py-2 text-sm font-bold opacity-50 hover:opacity-100 transition-opacity">Cancel</button>
                        <button (click)="createTransfer()" [disabled]="transferForm.invalid || itemsArray.length === 0" class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            Create Transfer
                        </button>
                    </div>
                </div>
            </div>
        }
    </div>
    `
})
export class StockTransferComponent {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    dialog = inject(DialogService);
    fb = inject(FormBuilder);

    showNewTransferModal = signal(false);
    transfers = signal<StockTransfer[]>([]); // Mock list for now
    products = toSignal(this.supabase.getProducts(this.storeService.currentStore()?.id || ''), { initialValue: [] });

    transferForm = this.fb.group({
        from_location: ['WAREHOUSE'],
        to_location: ['SHOP'],
        notes: [''],
        items: this.fb.array([])
    });

    get itemsArray() {
        return this.transferForm.get('items') as FormArray;
    }

    constructor() {
        // Load initial transfers mock
        this.loadTransfers();
    }

    loadTransfers() {
        // In a real app, fetch from Supabase inventory_transfers table
        // For now, we simulate
        this.supabase.getInventoryTransfers(this.storeService.currentStore()?.id || '').subscribe(
            data => this.transfers.set(data as any[])
        );
    }

    addItem() {
        const itemParams = this.fb.group({
            product_id: [null, Validators.required],
            quantity: [1, [Validators.required, Validators.min(1)]]
        });
        this.itemsArray.push(itemParams);
    }

    removeItem(index: number) {
        this.itemsArray.removeAt(index);
    }

    createTransfer() {
        if (this.transferForm.invalid) return;

        const val = this.transferForm.value;
        const items = val.items as { product_id: string, quantity: number }[];
        const storeId = this.storeService.currentStore()?.id;

        if (!storeId) return;

        // Call Service to create transfer
        this.supabase.createInventoryTransfer({
            store_id: storeId,
            from_location_id: 'WAREHOUSE', // Using string constants for simplicity as per schema
            to_location_id: 'SHOP',
            status: 'PENDING',
            notes: val.notes || ''
        }, items).subscribe({
            next: () => {
                this.dialog.alert('Success', 'Transfer request created.');
                this.showNewTransferModal.set(false);
                this.itemsArray.clear();
                this.transferForm.reset({ from_location: 'WAREHOUSE', to_location: 'SHOP', notes: '' });
                this.loadTransfers();
            },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }

    completeTransfer(transfer: StockTransfer) {
        this.supabase.completeInventoryTransfer(transfer.id).subscribe({
            next: () => {
                this.dialog.alert('Success', 'Stock received and inventory updated.');
                this.loadTransfers();
            },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }
}
