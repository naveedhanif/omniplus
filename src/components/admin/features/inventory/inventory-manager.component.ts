import { Component, inject, signal, Signal, computed, effect, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, firstValueFrom, of } from 'rxjs';
import {
    MockSupabaseService,
    Product,
    Category,
    CompositeProduct,
    StockLog,
    SerialNumber,
    StockReason
} from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';
import { DialogService } from '../../../../services/dialog.service';
import { LabelPrintComponent } from '../../../shared/label-print.component';
import { ImageUploadComponent } from '../../../shared/image-upload.component';

// Declare PapaParse from CDN
declare var Papa: any;

@Component({
    selector: 'app-inventory-manager',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, LabelPrintComponent, ImageUploadComponent],
    template: `
    <div class="space-y-6">
      <!-- Inventory Summary Ribbon -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Value (Cost)</div>
              <div class="text-xl font-bold font-mono">{{ inventoryStats().totalValue | currency:storeService.currency() }}</div>
          </div>
          <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Out of Stock</div>
              <div class="text-xl font-bold text-red-500">{{ inventoryStats().outOfStock }} <span class="text-xs font-normal opacity-50">Items</span></div>
          </div>
          <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Low Stock Alerts</div>
              <div class="text-xl font-bold text-orange-500">{{ inventoryStats().lowStock }} <span class="text-xs font-normal opacity-50">Items</span></div>
          </div>
          <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-blue-500">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Near Expiry</div>
              <div class="text-xl font-bold text-blue-500">{{ inventoryStats().nearExpiry }} <span class="text-xs font-normal opacity-50">Items</span></div>
          </div>
      </div>

      <!-- Inventory Header & Controls -->
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-30">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-4 flex-1">
             <div class="relative flex-1 max-w-md">
                <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  [formControl]="inventorySearchControl"
                  type="text" 
                  placeholder="Search products, SKU or barcode..." 
                  class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors">
             </div>
             
             <select [formControl]="inventoryCategoryFilterControl" class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="ALL">All Categories</option>
                @for(group of hierarchicalCategories(); track group.parent.id) {
                    <option [value]="group.parent.id" class="font-bold">{{ group.parent.name }}</option>
                    @for(child of group.children; track child.id) {
                        <option [value]="child.id">&nbsp;&nbsp;∟ {{ child.name }}</option>
                    }
                }
             </select>

             <select [formControl]="inventoryStockFilterControl" class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="ALL">All Stock Levels</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock (< 5)</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
             </select>
          </div>

          <div class="flex items-center gap-2">
             <div class="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex gap-1 mr-2">
                <button (click)="inventoryViewMode.set('LIST')" [class.bg-white]="inventoryViewMode() === 'LIST'" [class.dark:bg-slate-700]="inventoryViewMode() === 'LIST'" [class.shadow-sm]="inventoryViewMode() === 'LIST'" class="p-1.5 rounded-md transition-all">
                    <span class="material-symbols-rounded text-base">list</span>
                </button>
                <button (click)="inventoryViewMode.set('GRID')" [class.bg-white]="inventoryViewMode() === 'GRID'" [class.dark:bg-slate-700]="inventoryViewMode() === 'GRID'" [class.shadow-sm]="inventoryViewMode() === 'GRID'" class="p-1.5 rounded-md transition-all">
                    <span class="material-symbols-rounded text-base">grid_view</span>
                </button>
                <button (click)="loadProducts()" class="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm hover:brightness-95 transition-all text-slate-500 hover:text-[var(--primary-color)]" title="Refresh">
                    <span class="material-symbols-rounded text-base">refresh</span>
                </button>
             </div>

             <button (click)="showAddProductModal.set(true)" class="flex items-center gap-2 px-4 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all">
                <span class="material-symbols-rounded">add</span>
                Add Product
             </button>
          </div>
        </div>
      </div>

      <!-- Inventory Grid/List -->
      @if (inventoryViewMode() === 'LIST') {
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th class="p-4">Product</th>
                <th class="p-4">Category</th>
                <th class="p-4 text-right">Price</th>
                <th class="p-4 text-center">Warehouse</th>
                <th class="p-4 text-center">Shop</th>
                <th class="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (product of paginatedProducts(); track product.id) {
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group">
                  <td class="p-4">
                    <div class="flex items-center gap-3">
                       <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                          @if(product.image_url){
                              <img [src]="product.image_url" class="w-full h-full object-cover">
                          } @else {
                              <span class="material-symbols-rounded opacity-20 text-xl">image</span>
                          }
                       </div>
                       <div>
                          <div class="font-bold">{{ product.name }}</div>
                          <div class="text-[10px] opacity-50 font-mono tracking-tighter">{{ product.barcode || 'No Barcode' }}</div>
                       </div>
                    </div>
                  </td>
                  <td class="p-4">
                     <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider">
                        {{ product.category?.name || 'Uncategorized' }}
                     </span>
                  </td>
                  <td class="p-4 text-right font-mono font-bold">{{ product.price | currency:storeService.currency() }}</td>
                  <td class="p-4 text-center">
                    <span class="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {{ product.stock_warehouse || 0 }}
                    </span>
                  </td>
                  <td class="p-4 text-center">
                    <span class="px-2 py-1 rounded-lg text-xs font-bold" 
                      [class.bg-green-100]="product.stock_shop >= 5" [class.text-green-700]="product.stock_shop >= 5"
                      [class.bg-orange-100]="product.stock_shop > 0 && product.stock_shop < 5" [class.text-orange-700]="product.stock_shop > 0 && product.stock_shop < 5"
                      [class.bg-red-100]="product.stock_shop === 0" [class.text-red-700]="product.stock_shop === 0">
                      {{ product.stock_shop || 0 }} {{ product.unit_type || 'PCS' }}
                    </span>
                  </td>
                  <td class="p-4 text-right">
                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button (click)="openEditProductModal(product)" class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-[var(--primary-color)] shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Edit">
                        <span class="material-symbols-rounded text-lg">edit</span>
                      </button>
                      <button (click)="openAdjustStock(product)" class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-green-600 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Adjust Stock">
                        <span class="material-symbols-rounded text-lg">exposure</span>
                      </button>
                       <button (click)="viewStockLogs(product)" class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-blue-600 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Stock History">
                        <span class="material-symbols-rounded text-lg">history</span>
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="p-12 text-center opacity-50 italic">No products match your search.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          @for (product of paginatedProducts(); track product.id) {
            <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:scale-[1.02] transition-transform group flex flex-col">
               <div class="aspect-square bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 overflow-hidden relative">
                  @if(product.image_url){
                      <img [src]="product.image_url" class="w-full h-full object-cover">
                  } @else {
                      <div class="w-full h-full flex flex-col items-center justify-center text-slate-200 dark:text-slate-800">
                          <span class="material-symbols-rounded text-6xl">image</span>
                      </div>
                  }
                  <div class="absolute top-2 right-2 flex flex-col gap-1">
                      <span class="px-2 py-1 rounded bg-black/60 backdrop-blur-md text-white text-[10px] font-bold">{{ product.price | currency:storeService.currency() }}</span>
                  </div>
               </div>
               <div class="p-3 flex-1">
                  <div class="text-[10px] opacity-40 font-bold uppercase tracking-widest mb-1">{{ product.category?.name || 'Uncategorized' }}</div>
                  <h3 class="font-bold text-sm line-clamp-2 leading-tight h-10 mb-2">{{ product.name }}</h3>
                  <div class="flex items-center justify-between mt-auto">
                     <div class="flex flex-col">
                        <span class="text-[10px] font-bold uppercase opacity-60">Shop: {{ product.stock_shop || 0 }}</span>
                        <span class="text-[10px] font-bold uppercase opacity-60">Whse: {{ product.stock_warehouse || 0 }}</span>
                     </div>
                     <button (click)="openAdjustStock(product)" class="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-[var(--primary-color)] hover:text-white rounded-lg transition-colors">
                        <span class="material-symbols-rounded text-base">exposure</span>
                     </button>
                  </div>
               </div>
               <div class="p-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button (click)="openEditProductModal(product)" class="py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 rounded hover:brightness-95 transition-all">Details</button>
                  <button (click)="openLabelPrint(product)" class="py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 rounded hover:brightness-95 transition-all">Label</button>
               </div>
            </div>
          }
        </div>
      }

    <!-- Detail Drawer (Slide-over) -->
    @if (showDetailDrawer()) {
        <div class="fixed inset-0 z-50 overflow-hidden">
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" (click)="showDetailDrawer.set(false)"></div>
            <div class="absolute inset-y-0 right-0 max-w-2xl w-full flex">
                <div class="relative w-full bg-[var(--card-bg)] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-500">
                    <div class="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                                @if(selectedProduct()?.image_url){
                                    <img [src]="selectedProduct()?.image_url" class="w-full h-full object-cover">
                                } @else {
                                    <span class="material-symbols-rounded text-slate-400">inventory_2</span>
                                }
                            </div>
                            <div>
                                <h2 class="text-xl font-bold leading-tight">{{ selectedProduct()?.name }}</h2>
                                <p class="text-[10px] font-mono opacity-50">{{ selectedProduct()?.barcode || 'No Barcode' }}</p>
                            </div>
                        </div>
                        <button (click)="showDetailDrawer.set(false)" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>

                    <div class="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6">
                        <button (click)="activeDrawerTab.set('GENERAL')" [class.border-[var(--primary-color)]]="activeDrawerTab() === 'GENERAL'" [class.text-[var(--primary-color)]]="activeDrawerTab() === 'GENERAL'" class="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent transition-all">General</button>
                        <button (click)="activeDrawerTab.set('STOCK')" [class.border-[var(--primary-color)]]="activeDrawerTab() === 'STOCK'" [class.text-[var(--primary-color)]]="activeDrawerTab() === 'STOCK'" class="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent transition-all">Stock & Batch</button>
                        <button (click)="activeDrawerTab.set('HISTORY')" [class.border-[var(--primary-color)]]="activeDrawerTab() === 'HISTORY'" [class.text-[var(--primary-color)]]="activeDrawerTab() === 'HISTORY'" class="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent transition-all">History</button>
                    </div>

                    <div class="flex-1 overflow-y-auto p-6">
                        <form [formGroup]="editProductForm" (ngSubmit)="saveProductChanges()">
                            @if(activeDrawerTab() === 'GENERAL'){
                                <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                   <div class="grid grid-cols-2 gap-4">
                                        <div class="col-span-2">
                                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Product Name</label>
                                            <input formControlName="name" type="text" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:ring-2 focus:ring-primary/50">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Category & Sub-category</label>
                                            <div class="relative group/cat">
                                                <select formControlName="category_id" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 appearance-none focus:ring-2 focus:ring-primary/50">
                                                    <option [value]="null">Uncategorized</option>
                                                    @for(group of hierarchicalCategories(); track group.parent.id){
                                                        <optgroup [label]="group.parent.name">
                                                            <option [value]="group.parent.id">{{ group.parent.name }} (Main)</option>
                                                            @for(child of group.children; track child.id) {
                                                                <option [value]="child.id">↳ {{ child.name }}</option>
                                                            }
                                                        </optgroup>
                                                    }
                                                </select>
                                                <span class="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">expand_more</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Unit Type</label>
                                            <select formControlName="unit_type" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                                                <option value="PIECE">Piece / PCS</option>
                                                <option value="METER">Meter</option>
                                                <option value="BOX">Box</option>
                                                <option value="KG">Kilogram</option>
                                                <option value="LITER">Liter</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                        <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Technical Specifications</h3>
                                        <div class="grid grid-cols-2 gap-4">
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Brand</label>
                                                <input formControlName="brand" type="text" placeholder="e.g. Samsung, LG" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">OEM / Aftermarket</label>
                                                <select formControlName="oem_aftermarket" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs">
                                                    <option [value]="null">Unknown</option>
                                                    <option value="OEM">OEM (Original)</option>
                                                    <option value="AFTERMARKET">Aftermarket</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Voltage</label>
                                                <select formControlName="voltage" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs">
                                                    <option [value]="null">N/A</option>
                                                    <option value="110V">110V</option>
                                                    <option value="220V">220V</option>
                                                    <option value="UNIVERSAL">Universal</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Warranty</label>
                                                <input formControlName="warranty_period" type="text" placeholder="e.g. 1 Year" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs">
                                            </div>
                                            <div class="col-span-2">
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Compatible Models (VERY IMPORTANT)</label>
                                                <textarea [value]="compatibleModelsString()" (input)="updateCompatibleModels($event)" placeholder="Enter models separated by commas..." class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs h-16 resize-none"></textarea>
                                                <p class="text-[9px] opacity-40 mt-1 italic">Separate multiple models with a comma (,)</p>
                                            </div>
                                        </div>
                                    </div>
                                            <div>
                                                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Barcode</label>
                                                <input formControlName="barcode" type="text" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono">
                                            </div>
                                            <div>
                                                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Internal SKU</label>
                                                <input formControlName="supplier_sku" type="text" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono">
                                            </div>

                                   <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                       <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Pricing Strategy</h3>
                                       <div class="grid grid-cols-3 gap-4">
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Cost Price</label>
                                                <input formControlName="cost_price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Selling Price</label>
                                                <input formControlName="price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Wholesale</label>
                                                <input formControlName="wholesale_price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono">
                                            </div>
                                       </div>
                                       <div class="flex items-center gap-2 pt-2">
                                            <div class="text-[10px] font-bold uppercase opacity-40">Margin:</div>
                                            <div class="text-xs font-bold text-green-600">
                                                {{ (editProductForm.get('price')?.value - editProductForm.get('cost_price')?.value) | currency:storeService.currency() }}
                                                ({{ (((editProductForm.get('price')?.value - editProductForm.get('cost_price')?.value) / (editProductForm.get('price')?.value || 1)) * 100) | number:'1.0-1' }}%)
                                            </div>
                                       </div>
                                   </div>
                                </div>                            }

                            @if(activeDrawerTab() === 'STOCK'){
                                <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div class="grid grid-cols-2 gap-4">
                                        <div class="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50 text-center">
                                            <div class="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Total Stock</div>
                                            <div class="text-2xl font-bold font-mono">{{ editProductForm.get('stock_shop')?.value + editProductForm.get('stock_warehouse')?.value }}</div>
                                        </div>
                                        <div class="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-800/50 text-center">
                                            <div class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Reorder Point</div>
                                            <input formControlName="reorder_point" type="number" class="w-16 bg-transparent text-center text-2xl font-bold font-mono outline-none">
                                        </div>
                                        
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Shop Floor</label>
                                            <input formControlName="stock_shop" type="number" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Warehouse</label>
                                            <input formControlName="stock_warehouse" type="number" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono">
                                        </div>
                                    </div>

                                    <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                        <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Batch & Expiry</h3>
                                        <div class="grid grid-cols-2 gap-4">
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Batch Number</label>
                                                <input formControlName="batch_number" type="text" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold uppercase opacity-60 mb-1">Expiry Date</label>
                                                <input formControlName="expiry_date" type="date" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                                            <label class="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" formControlName="alert_on_expiry" class="sr-only peer">
                                                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-color)]"></div>
                                            </label>
                                            <span class="text-xs font-bold opacity-70">Alert when nearing expiry</span>
                                        </div>
                                    </div>
                                </div>
                            }

                            @if(activeDrawerTab() === 'HISTORY'){
                                <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    @for (log of currentStockLogs(); track log.id) {
                                        <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                            <div>
                                                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{{ log.reason }}</div>
                                                <div class="text-xs font-bold">{{ log.note || 'No notes' }}</div>
                                                <div class="text-[10px] opacity-40">{{ log.created_at | date:'MMM d, yyyy HH:mm' }}</div>
                                            </div>
                                            <div class="text-lg font-bold font-mono" [class.text-green-600]="log.quantity_change > 0" [class.text-red-500]="log.quantity_change < 0">
                                                {{ log.quantity_change > 0 ? '+' : '' }}{{ log.quantity_change }}
                                            </div>
                                        </div>
                                    } @empty {
                                        <div class="py-12 text-center opacity-30 italic">No movement history found.</div>
                                    }
                                </div>
                            }
                        </form>
                    </div>

                    <div class="p-6 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-between items-center">
                        <button type="button" (click)="showDelete(selectedProduct()!)" class="text-red-500 text-xs font-bold uppercase hover:underline">Delete Product</button>
                        <div class="flex gap-2">
                            <button type="button" (click)="showDetailDrawer.set(false)" class="px-6 py-2 text-sm font-bold opacity-50">Cancel</button>
                            <button type="submit" (click)="saveProductChanges()" [disabled]="editProductForm.invalid" class="px-8 py-2 bg-[var(--primary-color)] text-white font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    }

    <!-- Add Product Modal -->
    @if (showAddProductModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
             <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-3xl p-6 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                 <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold flex items-center gap-2">
                      <span class="material-symbols-rounded text-[var(--primary-color)]">add_circle</span>
                      Add New Product
                    </h2>
                    <button (click)="showAddProductModal.set(false)" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                 </div>

                 <form [formGroup]="productForm" (ngSubmit)="addProduct(); showAddProductModal.set(false)" class="space-y-6 overflow-y-auto flex-1 pr-2">
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                      <label class="block text-sm font-bold mb-3 uppercase tracking-wider text-[var(--primary-color)]">Product Image</label>
                      <app-image-upload (imageSelected)="onImageSelected($event)"></app-image-upload>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <h3 class="font-bold text-sm border-b border-slate-200 dark:border-slate-700 pb-2 mb-4 text-slate-500">Core Identity</h3>
                            <div>
                                <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Product Name</label>
                                <input formControlName="name" type="text" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-primary/50">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="col-span-2">
                                    <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Category & Sub-category</label>
                                    <select formControlName="category_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                       <option [value]="null">Uncategorized</option>
                                       @for(group of hierarchicalCategories(); track group.parent.id) {
                                           <optgroup [label]="group.parent.name">
                                               <option [value]="group.parent.id">{{ group.parent.name }} (Main)</option>
                                               @for(child of group.children; track child.id) {
                                                   <option [value]="child.id">↳ {{ child.name }}</option>
                                               }
                                           </optgroup>
                                       }
                                    </select>
                                </div>
                                <div class="col-span-2">
                                    <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Brand</label>
                                    <input formControlName="brand" type="text" placeholder="e.g. Samsung" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                </div>
                                <div class="col-span-2 grid grid-cols-2 gap-4">
                                     <div>
                                         <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">SKU</label>
                                         <input formControlName="supplier_sku" type="text" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-primary/50 font-mono">
                                     </div>
                                     <div>
                                         <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Unit</label>
                                         <select formControlName="unit_type" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                            <option value="PIECE">Piece</option>
                                            <option value="METER">Meter</option>
                                            <option value="BOX">Box</option>
                                         </select>
                                     </div>
                                </div>
                                <div class="col-span-2">
                                    <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Compatible Models</label>
                                    <textarea [value]="compatibleModelsString()" (input)="updateCompatibleModels($event)" placeholder="Separated by commas..." class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3 h-20 resize-none"></textarea>
                                </div>
                                <div class="col-span-2 grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Voltage</label>
                                        <select formControlName="voltage" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                            <option [value]="null">N/A</option>
                                            <option value="110V">110V</option>
                                            <option value="220V">220V</option>
                                            <option value="UNIVERSAL">Universal</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Warranty</label>
                                        <input formControlName="warranty_period" type="text" placeholder="e.g. 1 Year" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                    </div>
                                </div>
                             </div>
                        </div>

                        <div class="space-y-6">
                            <div class="space-y-4">
                                <h3 class="font-bold text-sm border-b border-slate-200 dark:border-slate-700 pb-2 mb-4 text-slate-500">Pricing & Costing</h3>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Cost Price</label>
                                        <input formControlName="cost_price" type="number" step="0.01" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Selling Price</label>
                                        <input formControlName="price" type="number" step="0.01" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                    </div>
                                </div>
                            </div>
                            <div class="space-y-4">
                                <h3 class="font-bold text-sm border-b border-slate-200 dark:border-slate-700 pb-2 mb-4 text-slate-500">Initial Stock</h3>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Shop Floor</label>
                                        <input formControlName="stock_shop" type="number" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium mb-1 opacity-70 uppercase tracking-wider">Warehouse</label>
                                        <input formControlName="stock_warehouse" type="number" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-3">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-6">
                      <button type="button" (click)="openBulkUpload()" class="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 flex items-center gap-2 transition-colors">
                          <span class="material-symbols-rounded">upload_file</span>
                          Bulk Import
                      </button>
                      <div class="flex-1"></div>
                      <button type="button" (click)="showAddProductModal.set(false)" class="px-6 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium">Cancel</button>
                      <button type="submit" [disabled]="productForm.invalid" class="px-6 py-2 bg-[var(--primary-color)] text-white rounded-lg text-sm font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all">Add Product</button>
                    </div>
                 </form>
             </div>
        </div>
    }

    <!-- Bulk Upload Modal -->
    @if (showBulkUpload()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
            <div class="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 class="text-xl font-bold flex items-center gap-2">
                <span class="material-symbols-rounded text-blue-500">upload_file</span>
                Bulk Product Import
              </h3>
              <button (click)="showBulkUpload.set(false)" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <div class="p-6 overflow-y-auto flex-1">
              <div class="mb-8">
                <h4 class="font-bold mb-2 flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-[var(--primary-color)] text-white text-xs flex items-center justify-center">1</span>
                  Download Template
                </h4>
                <p class="text-sm opacity-70 mb-3 text-red-500 font-bold">Important: Category names must exist or will be created.</p>
                <button (click)="downloadTemplate()" class="text-[var(--primary-color)] text-sm font-medium hover:underline flex items-center gap-1">
                  <span class="material-symbols-rounded text-base">download</span>
                  Download CSV Template
                </button>
              </div>

              <div class="mb-8">
                <h4 class="font-bold mb-2 flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-[var(--primary-color)] text-white text-xs flex items-center justify-center">2</span>
                  Upload CSV
                </h4>
                <input type="file" (change)="onFileSelected($event)" accept=".csv" class="block w-full text-sm text-slate-500 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer bg-slate-50 dark:bg-slate-800/50 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-200 dark:file:bg-slate-700 file:text-slate-700 hover:file:bg-slate-300"/>
              </div>

              @if (parsedData().length > 0) {
                 <div>
                    <div class="flex justify-between items-center mb-4">
                       <h4 class="font-bold flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-[var(--primary-color)] text-white text-xs flex items-center justify-center">3</span>
                        Preview & Validate
                      </h4>
                      <div class="text-xs font-medium">Valid: <span class="text-green-600">{{ validCount() }}</span> | Errors: <span class="text-red-600">{{ errorCount() }}</span></div>
                    </div>
                    <div class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                        <table class="w-full text-xs text-left">
                            <thead class="bg-slate-50 dark:bg-slate-800 sticky top-0">
                                <tr><th class="p-2">Name</th><th class="p-2">Price</th><th class="p-2">Status</th></tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                @for (row of parsedData(); track $index) {
                                    <tr [ngClass]="{'bg-red-50': !row.isValid, 'dark:bg-red-900/10': !row.isValid}">
                                        <td class="p-2">{{ row.data.name }}</td>
                                        <td class="p-2">{{ row.data.price }}</td>
                                        <td class="p-2">
                                            @if (row.isValid) { <span class="text-green-600">Valid</span> }
                                            @else { <span class="text-red-600" [title]="row.error">Error</span> }
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                 </div>
              }
            </div>

            <div class="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/30">
               <button (click)="showBulkUpload.set(false)" class="px-4 py-2 text-sm font-medium">Cancel</button>
               <button (click)="confirmImport()" [disabled]="validCount() === 0 || isImporting()" class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
                  @if(isImporting()){ Importing... } @else { Import {{ validCount() }} Products }
               </button>
            </div>
          </div>
        </div>
    }

    <!-- Adjust Stock Modal -->
    @if (showAdjustStock()) {
         <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
             <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
                 <h3 class="text-xl font-bold mb-4">Adjust Stock: {{ selectedProduct()?.name }}</h3>
                 <p class="text-sm opacity-70 mb-4 font-mono">Current Stock: {{ selectedProduct()?.stock_quantity }}</p>
                 <form [formGroup]="adjustStockForm" (ngSubmit)="submitStockAdjustment()" class="space-y-4">
                     <div class="grid grid-cols-2 gap-2">
                         <button type="button" (click)="adjustStockForm.patchValue({type: 'ADD'})" [class.bg-green-600]="adjustStockForm.get('type')?.value === 'ADD'" [class.text-white]="adjustStockForm.get('type')?.value === 'ADD'" class="py-2 border rounded-lg font-bold">Add (+)</button>
                         <button type="button" (click)="adjustStockForm.patchValue({type: 'REMOVE'})" [class.bg-red-600]="adjustStockForm.get('type')?.value === 'REMOVE'" [class.text-white]="adjustStockForm.get('type')?.value === 'REMOVE'" class="py-2 border rounded-lg font-bold">Remove (-)</button>
                     </div>
                     <div>
                         <label class="block text-xs font-bold uppercase tracking-wider mb-1">Quantity</label>
                         <input formControlName="quantity" type="number" min="1" class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/50">
                     </div>
                     <div>
                         <label class="block text-xs font-bold uppercase tracking-wider mb-1">Reason</label>
                         <select formControlName="reason" class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg p-3 outline-none">
                             <option value="RESTOCK">Restock</option>
                             <option value="RETURN">Return</option>
                             <option value="DAMAGE">Damage</option>
                             <option value="CORRECTION">Correction</option>
                         </select>
                     </div>
                     <div class="flex justify-end gap-3 mt-6">
                         <button type="button" (click)="showAdjustStock.set(false)" class="px-4 py-2 opacity-50 font-bold">Cancel</button>
                         <button type="submit" [disabled]="adjustStockForm.invalid" class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all">Apply Adjustment</button>
                     </div>
                 </form>
             </div>
         </div>
    }

     <!-- Stock Logs Sidebar -->
    @if (showStockLogs()) {
        <div class="fixed inset-0 z-50 flex justify-end">
             <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="showStockLogs.set(false)"></div>
             <div class="relative w-full max-w-sm bg-[var(--card-bg)] shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">
                <div class="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <h3 class="text-xl font-bold flex flex-col">
                        <span>Stock History</span>
                        <span class="text-sm font-normal opacity-60">{{ selectedProduct()?.name }}</span>
                    </h3>
                    <button (click)="showStockLogs.set(false)" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-4 space-y-4">
                    @for (log of currentStockLogs(); track log.id) {
                        <div class="relative pl-6 pb-6 border-l border-slate-200 dark:border-slate-700 last:border-0">
                            <div class="absolute -left-1.5 top-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 shadow-sm" [class.bg-green-500]="log.quantity_change > 0" [class.bg-red-500]="log.quantity_change < 0"></div>
                            <div class="flex justify-between items-start mb-1 leading-none">
                                <span class="text-xs font-bold uppercase tracking-wider">{{ log.reason }}</span>
                                <span class="text-[10px] opacity-40">{{ log.created_at | date:'MMM d, h:mm a' }}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="font-mono text-lg font-bold" [class.text-green-600]="log.quantity_change > 0" [class.text-red-500]="log.quantity_change < 0">
                                    {{ log.quantity_change > 0 ? '+' : '' }}{{ log.quantity_change }}
                                </span>
                                @if(log.note){ <div class="text-[10px] px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded font-bold">{{ log.note }}</div> }
                            </div>
                        </div>
                    } @empty {
                        <div class="p-20 text-center opacity-30 italic">No history found for this product.</div>
                    }
                </div>
             </div>
        </div>
    }

    <!-- Label Print Modal -->
    @if (showLabelPrintModal() && selectedProduct()) {
        <app-label-print 
            [product]="selectedProduct()!"
            (close)="showLabelPrintModal.set(false)"
            (saveBarcode)="handleSaveBarcode($event)"
            [currency]="storeService.currency()"
        />
    }
  `,
    styleUrls: []
})
export class InventoryManagerComponent {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    dialog = inject(DialogService);
    fb = inject(FormBuilder);

    Math = Math; // For template usage

    // Form Controls
    inventorySearchControl = this.fb.control('');
    inventoryCategoryFilterControl = this.fb.control('ALL');
    inventoryStockFilterControl = this.fb.control('ALL');
    itemsPerPageControl = this.fb.control(10);

    // Signals for state
    inventoryViewMode = signal<'LIST' | 'GRID'>('LIST');
    currentPage = signal(1);
    showAddProductModal = signal(false);
    showDetailDrawer = signal(false);
    activeDrawerTab = signal<'GENERAL' | 'STOCK' | 'HISTORY'>('GENERAL');
    showAdjustStock = signal(false);
    showStockLogs = signal(false);
    showBulkUpload = signal(false);
    showLabelPrintModal = signal(false);
    showRecipeModal = signal(false); // Add later
    showManageSerialsModal = signal(false); // Add later

    isImporting = signal(false);
    selectedProduct = signal<Product | null>(null);
    currentStockLogs = signal<StockLog[]>([]);
    parsedData = signal<{ data: any, isValid: boolean, error?: string, isNewCategory?: boolean }[]>([]);
    selectedImageFile = signal<File | null>(null);

    // Derived signals
    inventorySearchQuery = toSignal(this.inventorySearchControl.valueChanges, { initialValue: '' });
    inventoryCategoryFilter = toSignal(this.inventoryCategoryFilterControl.valueChanges, { initialValue: 'ALL' });
    inventoryStockFilter = toSignal(this.inventoryStockFilterControl.valueChanges, { initialValue: 'ALL' });
    itemsPerPage = toSignal(this.itemsPerPageControl.valueChanges, { initialValue: 10 });

    // Data Signals
    private products$ = this.storeService.currentStore$.pipe(
        switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
    );
    productsSignal: Signal<Product[]> = toSignal(this.products$, { initialValue: [] as Product[] });

    private categories$ = this.storeService.currentStore$.pipe(
        switchMap(store => store ? this.supabase.getCategories(store.id) : of([]))
    );
    categoriesSignal: Signal<Category[]> = toSignal(this.categories$, { initialValue: [] as Category[] });

    filteredProducts = computed(() => {
        const all = this.productsSignal();
        const query = String(this.inventorySearchQuery() ?? '').toLowerCase().trim();
        const catId = this.inventoryCategoryFilter();
        const stockStatus = this.inventoryStockFilter();

        return all.filter(p => {
            const matchesQuery = query ? (p.name.toLowerCase().includes(query) || (p.barcode || '').toLowerCase().includes(query) || (p.supplier_sku || '').toLowerCase().includes(query)) : true;
            const matchesCategory = catId !== 'ALL' ? p.category_id === catId : true;

            const stock = p.stock_quantity;
            let matchesStock = true;
            if (stockStatus === 'OUT_OF_STOCK') matchesStock = stock === 0;
            else if (stockStatus === 'LOW_STOCK') matchesStock = stock > 0 && stock < (p.reorder_point || 5);
            else if (stockStatus === 'IN_STOCK') matchesStock = stock >= (p.reorder_point || 5);

            return matchesQuery && matchesCategory && matchesStock;
        });
    });

    compatibleModelsString = computed(() => {
        const prod = this.selectedProduct();
        const models = this.showAddProductModal()
            ? this.productForm.get('compatible_models')?.value
            : this.editProductForm.get('compatible_models')?.value;
        return (models || []).join(', ');
    });

    updateCompatibleModels(event: any) {
        const val = event.target.value;
        const models = val.split(',').map((m: string) => m.trim()).filter((m: string) => m !== '');
        if (this.showAddProductModal()) {
            this.productForm.patchValue({ compatible_models: models });
        } else {
            this.editProductForm.patchValue({ compatible_models: models });
        }
    }

    hierarchicalCategories = computed(() => {
        const all = this.categoriesSignal();
        const parents = all.filter(c => !c.parent_id);
        return parents.map(p => ({
            parent: p,
            children: all.filter(c => c.parent_id === p.id)
        }));
    });

    inventoryStats = computed(() => {
        const products = this.productsSignal();
        const totalValue = products.reduce((acc, p) => acc + (p.stock_quantity * (p.cost_price || 0)), 0);
        const retailValue = products.reduce((acc, p) => acc + (p.stock_quantity * p.price), 0);
        const lowStock = products.filter(p => p.stock_quantity > 0 && p.stock_quantity < (p.reorder_point || 5)).length;
        const outOfStock = products.filter(p => p.stock_quantity === 0).length;
        const nearExpiry = products.filter(p => {
            if (!p.expiry_date) return false;
            const expiry = new Date(p.expiry_date);
            const today = new Date();
            const diffTime = expiry.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays > 0 && diffDays <= 30;
        }).length;

        return {
            totalValue,
            retailValue,
            lowStock,
            outOfStock,
            nearExpiry
        };
    });

    totalPages = computed(() => {
        const perPage = Number(this.itemsPerPage() ?? 10);
        return Math.ceil(this.filteredProducts().length / (perPage || 1));
    });

    paginatedProducts = computed(() => {
        const prods = this.filteredProducts();
        const page = this.currentPage();
        const perPage = Number(this.itemsPerPage() ?? 10);
        const start = (page - 1) * perPage;
        return prods.slice(start, start + perPage);
    });

    validCount = computed(() => this.parsedData().filter(r => r.isValid).length);
    errorCount = computed(() => this.parsedData().filter(r => !r.isValid).length);

    productForm: FormGroup;
    editProductForm: FormGroup;
    adjustStockForm: FormGroup;

    constructor() {
        const commonProductForm = {
            name: ['', Validators.required],
            price: [0, [Validators.required, Validators.min(0)]],
            cost_price: [0, [Validators.required, Validators.min(0)]],
            tax_rate: [0],
            stock_quantity: [0],
            stock_shop: [0, [Validators.required, Validators.min(0)]],
            stock_warehouse: [0, [Validators.required, Validators.min(0)]],
            category_id: [null],
            barcode: [''],
            supplier_sku: [''],
            reorder_point: [5, [Validators.required, Validators.min(0)]],
            unit_type: ['PIECE', Validators.required],
            is_serialized: [false],
            wholesale_price: [0],
            tax_profile_id: [null],
            tags: [[]],
            batch_number: [''],
            expiry_date: [''],
            alert_on_expiry: [false],
            brand: [''],
            compatible_models: [[]],
            voltage: [null],
            oem_aftermarket: [null],
            warranty_period: [''],
            metadata: this.fb.group({
                prescriptionRequired: [false],
                ingredients: [''],
                aisle: ['']
            })
        };

        this.productForm = this.fb.group(commonProductForm);
        this.editProductForm = this.fb.group(commonProductForm);

        this.adjustStockForm = this.fb.group({
            type: ['ADD', Validators.required],
            quantity: [1, [Validators.required, Validators.min(1)]],
            reason: ['RESTOCK', Validators.required],
            note: ['']
        });

        // Reset pagination when filters change
        effect(() => {
            this.inventorySearchQuery();
            this.inventoryCategoryFilter();
            this.inventoryStockFilter();
            this.currentPage.set(1);
        }, { allowSignalWrites: true });
    }

    nextPage() { this.currentPage.update(p => Math.min(p + 1, this.totalPages())); }
    prevPage() { this.currentPage.update(p => Math.max(1, p - 1)); }

    addProduct() {
        if (this.productForm.invalid) return;

        const currentStore = this.storeService.currentStore();
        if (!currentStore) return;

        const formVal = this.productForm.getRawValue();
        const stock_shop = parseInt(formVal.stock_shop || '0');
        const stock_warehouse = parseInt(formVal.stock_warehouse || '0');
        const totalStock = stock_shop + stock_warehouse;

        // Clean up data before sending
        const productData: any = {
            ...formVal,
            store_id: currentStore.id,
            // Ensure compat models is an array
            compatible_models: typeof formVal.compatible_models === 'string'
                ? formVal.compatible_models.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
                : (formVal.compatible_models || []),
            // Handle empty date strings - Postgres hates "" for dates
            expiry_date: formVal.expiry_date ? formVal.expiry_date : null,
            // Ensure numbers are numbers
            price: parseFloat(formVal.price || '0'),
            cost_price: parseFloat(formVal.cost_price || '0'),
            stock_shop: stock_shop,
            stock_warehouse: stock_warehouse,
            stock_quantity: totalStock
        };

        // Explicitly fix date issue: DELETE key if invalid
        if (!productData.expiry_date || productData.expiry_date === '') {
            delete productData.expiry_date;
        }

        // Just in case, ensure compatible_models is an array
        if (typeof productData.compatible_models === 'string') {
            productData.compatible_models = productData.compatible_models.split(',').map((s: any) => s.trim()).filter((s: any) => s.length > 0);
        }

        console.log('Final Product Data to Send:', productData); // DEBUG LOG

        this.supabase.addProduct(productData).subscribe({
            next: (product) => {
                const imageFile = this.selectedImageFile();
                if (imageFile) {
                    this.supabase.uploadProductImage(product.id, imageFile).subscribe({
                        next: () => {
                            this.dialog.alert('Success', 'Product and image added.');
                            this.selectedImageFile.set(null);
                        },
                        error: () => this.dialog.alert('Partial Success', 'Product added but image upload failed.')
                    });
                } else {
                    this.dialog.alert('Success', 'Product added.');
                }
                this.productForm.reset({
                    name: '', price: 0, cost_price: 0, stock_shop: 0, stock_warehouse: 0,
                    category_id: null, barcode: '', reorder_point: 5, unit_type: 'PIECE',
                    brand: '', compatible_models: [], voltage: null, oem_aftermarket: null, warranty_period: ''
                });
                this.showAddProductModal.set(false);
            },
            error: err => {
                console.error('Add Product Error:', err);
                this.dialog.alert('Error', `Failed to add product: ${err.message}`);
            }
        });
    }

    openEditProductModal(product: Product) {
        this.selectedProduct.set(product);
        this.editProductForm.patchValue({
            ...product,
            wholesale_price: product.wholesale_price || 0,
            batch_number: product.batch_number || '',
            expiry_date: product.expiry_date || '',
            alert_on_expiry: product.alert_on_expiry || false,
            brand: product.brand || '',
            compatible_models: product.compatible_models || [],
            voltage: product.voltage || null,
            oem_aftermarket: product.oem_aftermarket || null,
            warranty_period: product.warranty_period || ''
        });
        this.activeDrawerTab.set('GENERAL');
        this.showDetailDrawer.set(true);
        this.fetchStockLogs(product);
    }

    fetchStockLogs(product: Product) {
        this.supabase.getStockLogs(product.id).subscribe(logs => this.currentStockLogs.set(logs));
    }

    saveProductChanges() {
        const product = this.selectedProduct();
        if (this.editProductForm.invalid || !product) return;

        const { stock_shop, stock_warehouse } = this.editProductForm.getRawValue();
        const totalStock = (stock_shop || 0) + (stock_warehouse || 0);

        const updates = {
            ...this.editProductForm.getRawValue(),
            stock_quantity: totalStock,
            stock_shop: stock_shop || 0,
            stock_warehouse: stock_warehouse || 0
        };

        this.supabase.updateProduct(product.id, updates).subscribe({
            next: () => {
                const imageFile = this.selectedImageFile();
                if (imageFile) {
                    this.supabase.uploadProductImage(product.id, imageFile).subscribe({
                        next: () => {
                            this.dialog.alert('Success', 'Product updated with new image.');
                            this.selectedImageFile.set(null);
                            this.showDetailDrawer.set(false);
                        },
                        error: () => this.dialog.alert('Partial Success', 'Product updated but image upload failed.')
                    });
                } else {
                    this.dialog.alert('Success', 'Product updated.');
                    this.showDetailDrawer.set(false);
                }
            },
            error: err => this.dialog.alert('Error', `Failed to update product: ${err.message}`)
        });
    }

    async showDelete(product: Product) {
        if (await this.dialog.confirm('Delete Product', `Are you sure you want to delete ${product.name}?`)) {
            this.supabase.deleteProduct(product.id).subscribe({
                next: () => {
                    this.dialog.alert('Success', 'Product deleted.');
                    this.showDetailDrawer.set(false);
                },
                error: err => this.dialog.alert('Error', 'Failed to delete product.')
            });
        }
    }

    openAdjustStock(product: Product) {
        this.selectedProduct.set(product);
        this.adjustStockForm.reset({ type: 'ADD', quantity: 1, reason: 'RESTOCK', note: '' });
        this.showAdjustStock.set(true);
    }

    submitStockAdjustment() {
        const product = this.selectedProduct();
        const store = this.storeService.currentStore();
        if (this.adjustStockForm.invalid || !product || !store) return;

        const { type, quantity, reason, note } = this.adjustStockForm.value;
        const change = type === 'ADD' ? quantity! : -quantity!;

        this.supabase.adjustStock(store.id, product.id, change, reason as StockReason, note!).subscribe({
            next: () => {
                this.dialog.alert('Success', 'Stock adjusted.');
                this.showAdjustStock.set(false);
            },
            error: err => this.dialog.alert('Error', `Failed to adjust stock: ${err.message}`)
        });
    }

    loadProducts() {
        this.supabase.fetchAllData();
    }

    viewStockLogs(product: Product) {
        this.selectedProduct.set(product);
        this.supabase.getStockLogs(product.id).subscribe(logs => this.currentStockLogs.set(logs));
        this.showStockLogs.set(true);
    }

    openLabelPrint(product: Product) {
        this.selectedProduct.set(product);
        this.showLabelPrintModal.set(true);
    }

    handleSaveBarcode(productId: string) {
        this.supabase.updateProduct(productId, { barcode: productId }).subscribe({
            next: (updatedProduct) => {
                this.selectedProduct.set(updatedProduct);
            }
        });
    }

    onImageSelected(file: File | null) {
        this.selectedImageFile.set(file);
    }

    // --- Bulk Import Methods ---
    openBulkUpload() {
        this.parsedData.set([]);
        this.showBulkUpload.set(true);
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: any) => this.validateParsedData(results.data)
        });
    }

    validateParsedData(data: any[]) {
        const cats = this.categoriesSignal();
        this.parsedData.set(data.map(row => {
            const name = row.name?.trim();
            const price = parseFloat(row.price);
            let error = '';
            if (!name) error = 'Name is required.';
            else if (isNaN(price)) error = 'Invalid price.';
            const catName = row.category?.trim();
            const isNewCat = !!catName && !cats.some(c => c.name.toLowerCase() === catName.toLowerCase());
            return { data: row, isValid: !error, error, isNewCategory: isNewCat };
        }));
    }

    downloadTemplate() {
        const csv = `name,barcode,category,price,stock\n"Sample Screwdriver","123456789","Hand Tools",9.99,50`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "product_template.csv";
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async confirmImport() {
        const validRows = this.parsedData().filter(r => r.isValid);
        const storeId = this.storeService.currentStore()?.id;
        if (validRows.length === 0 || !storeId) return;

        this.isImporting.set(true);
        try {
            const existingCats = this.categoriesSignal();
            const newCatNames = [...new Set(validRows.filter(r => r.isNewCategory).map(r => String(r.data.category || '').trim()))];

            let allCats = [...existingCats];
            if (newCatNames.length > 0) {
                const newCats = await firstValueFrom(this.supabase.addBulkCategories(newCatNames.map((name, i) => ({
                    store_id: storeId, name, color: this.storeService.primaryColor(), sort_order: existingCats.length + i
                }))));
                allCats = [...allCats, ...newCats];
            }

            const products = validRows.map(r => {
                const catStr = String(r.data.category || '').trim();
                const matchedCat = allCats.find(c => c.name.toLowerCase() === catStr.toLowerCase());
                return {
                    store_id: storeId,
                    name: r.data.name,
                    barcode: r.data.barcode || null,
                    price: parseFloat(r.data.price),
                    stock_quantity: parseInt(r.data.stock || 0, 10),
                    stock_shop: 0,
                    stock_warehouse: parseInt(r.data.stock || 0, 10),
                    category_id: matchedCat?.id || null,
                    unit_type: 'PIECE' as const,
                    tax_rate: 0
                };
            });

            await firstValueFrom(this.supabase.addBulkProducts(products as any));
            this.dialog.alert('Success', 'Products imported.');
            this.showBulkUpload.set(false);
        } catch (err: any) {
            this.dialog.alert('Error', err.message);
        } finally {
            this.isImporting.set(true); // Wait, should be false
            this.isImporting.set(false);
        }
    }
}
