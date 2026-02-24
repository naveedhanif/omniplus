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
  StockReason,
  Supplier
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
    <div class="flex gap-0 h-[calc(100vh-180px)] bg-[var(--card-bg)] rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden relative">

      <!-- ══ COLUMN 2 — Product List ════════════════════════════════════ -->
      <div class="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">

        <!-- Header -->
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-[var(--primary-color)]">inventory_2</span>
              Products
              <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full text-[10px] font-black text-slate-600 dark:text-slate-400">{{ filteredProducts().length }}</span>
            </h2>
            <button (click)="openAddProductPanel()"
                    class="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary-color)] text-white text-xs font-bold rounded-lg shadow hover:brightness-110 active:scale-95 transition-all">
              <span class="material-symbols-rounded text-sm">add</span>
              New
            </button>
          </div>

          <!-- Stock Filter Tabs -->
          <div class="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1 overflow-x-auto no-scrollbar">
            @for (f of stockFilters; track f.value) {
              <button (click)="inventoryStockFilterControl.setValue(f.value)"
                      [class.bg-white]="inventoryStockFilter() === f.value"
                      [class.dark:bg-slate-600]="inventoryStockFilter() === f.value"
                      [class.shadow-sm]="inventoryStockFilter() === f.value"
                      class="flex-1 px-2 py-1.5 text-[10px] font-black rounded-md transition-all whitespace-nowrap">
                {{ f.label }}
              </button>
            }
          </div>

          <!-- Search -->
          <div class="relative">
            <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
            <input type="text" [formControl]="inventorySearchControl"
                   placeholder="Search name, SKU, barcode..."
                   class="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 transition-all">
          </div>
        </div>

        <!-- Scrollable Product List -->
        <div class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          @for (product of filteredProducts(); track product.id) {
            <button type="button" (click)="selectProduct(product)"
                    class="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all group border-l-4"
                    [ngClass]="{
                      'bg-blue-50 dark:bg-blue-900/10 border-l-[var(--primary-color)]': selectedProduct()?.id === product.id,
                      'border-l-transparent': selectedProduct()?.id !== product.id
                    }">
              <div class="flex items-center gap-3">
                <!-- Thumbnail -->
                <div class="w-10 h-10 flex-shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                  @if (product.image_url) {
                    <img [src]="product.image_url" class="w-full h-full object-cover">
                  } @else {
                    <span class="material-symbols-rounded text-slate-300 dark:text-slate-600 text-lg">inventory_2</span>
                  }
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-slate-800 dark:text-slate-100 truncate text-sm">{{ product.name }}</div>
                  <div class="text-[10px] font-mono text-slate-400 truncate">{{ product.barcode || product.supplier_sku || 'No SKU' }}</div>
                  <div class="flex items-center justify-between mt-1">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-full"
                          [ngClass]="{
                            'bg-green-100 text-green-700': product.stock_quantity > (product.reorder_point || 5),
                            'bg-orange-100 text-orange-700': product.stock_quantity > 0 && product.stock_quantity <= (product.reorder_point || 5),
                            'bg-red-100 text-red-700': product.stock_quantity === 0
                          }">
                      {{ product.stock_quantity === 0 ? 'Out' : product.stock_quantity + ' ' + (product.unit_type || 'PCS') }}
                    </span>
                    <span class="text-[10px] font-black text-slate-500">{{ product.price | currency: storeService.currency() }}</span>
                  </div>
                </div>
              </div>
            </button>
          } @empty {
            <div class="flex flex-col items-center py-20 text-slate-400 text-sm gap-2 opacity-50 px-6 text-center">
              <span class="material-symbols-rounded text-4xl">inventory_2</span>
              <span>No products match filters</span>
            </div>
          }
        </div>

        <!-- Footer Stats (clickable filters) -->
        <div class="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 grid grid-cols-3 gap-2 text-[10px]">
          <button type="button" (click)="inventoryStockFilterControl.setValue('OUT_OF_STOCK')" class="text-center rounded-lg py-1 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer">
            <div class="font-black text-red-500">{{ inventoryStats().outOfStock }}</div>
            <div class="text-slate-400 uppercase font-black">Out</div>
          </button>
          <button type="button" (click)="inventoryStockFilterControl.setValue('LOW_STOCK')" class="text-center rounded-lg py-1 border-x border-slate-200 dark:border-slate-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors cursor-pointer">
            <div class="font-black text-orange-500">{{ inventoryStats().lowStock }}</div>
            <div class="text-slate-400 uppercase font-black">Low</div>
          </button>
          <button type="button" (click)="inventoryStockFilterControl.setValue('ALL')" class="text-center rounded-lg py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer">
            <div class="font-black text-blue-500">{{ inventoryStats().totalValue | currency: storeService.currency() : 'symbol' : '1.0-0' }}</div>
            <div class="text-slate-400 uppercase font-black">Value</div>
          </button>
        </div>
      </div>

      <!-- ══ COLUMN 3 — Detail / Form / Empty State ═════════════════════ -->
      <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">

        <!-- ── State A: DETAIL VIEW ─────────────────────────────────────── -->
        @if (panelState() === 'DETAIL' && selectedProduct()) {
          @if (selectedProduct(); as p) {
            <div class="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">

              <!-- Detail Header -->
              <div class="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 flex-shrink-0">
                <div class="flex items-center gap-4">
                  <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0 shadow-sm">
                    @if (p.image_url) {
                      <img [src]="p.image_url" class="w-full h-full object-cover">
                    } @else {
                      <span class="material-symbols-rounded text-slate-300 dark:text-slate-600 text-3xl">inventory_2</span>
                    }
                  </div>
                  <div>
                    <h1 class="text-xl font-black text-slate-800 dark:text-slate-100 leading-tight">{{ p.name }}</h1>
                    <p class="text-xs text-slate-400 font-bold font-mono mt-0.5">
                      {{ p.barcode || p.supplier_sku || 'No SKU' }}
                      @if (p.category?.name) { <span class="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full not-italic font-black capitalize">{{ p.category?.name }}</span> }
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  @if (p.stock_quantity <= (p.reorder_point || 5)) {
                    <button (click)="quickReorder(p)" class="px-4 py-2 bg-orange-500 text-white font-bold text-xs rounded-lg shadow hover:brightness-110 active:scale-95 transition-all flex items-center gap-2" title="Create Purchase Order to restock">
                      <span class="material-symbols-rounded text-sm">shopping_cart</span> Reorder
                    </button>
                  }
                  <button (click)="openAdjustStock(p)" class="px-4 py-2 bg-green-600 text-white font-bold text-xs rounded-lg shadow hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
                    <span class="material-symbols-rounded text-sm">exposure</span> Adjust
                  </button>
                  <button (click)="openEditProductPanel(p)" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-2">
                    <span class="material-symbols-rounded text-sm">edit</span> Edit
                  </button>
                  <button (click)="openLabelPrint(p)" class="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-all" title="Print Label">
                    <span class="material-symbols-rounded text-lg">label</span>
                  </button>
                  <button (click)="showDelete(p)" class="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-400 hover:text-red-600 transition-all" title="Delete">
                    <span class="material-symbols-rounded text-lg">delete</span>
                  </button>
                </div>
              </div>

              <!-- Low Stock Alert Banner -->
              @if (p.stock_quantity <= (p.reorder_point || 5)) {
                <div class="mx-6 mt-4 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/50 rounded-xl flex items-center justify-between gap-4 flex-shrink-0 animate-in fade-in duration-200">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-rounded text-orange-500 text-xl">warning</span>
                    <div>
                      <div class="text-xs font-black text-orange-700 dark:text-orange-400">
                        {{ p.stock_quantity === 0 ? 'Out of Stock' : 'Low Stock Alert' }}
                      </div>
                      <div class="text-[10px] text-orange-500 font-medium">
                        {{ p.stock_quantity }} units remaining · reorder point is {{ p.reorder_point || 5 }}
                      </div>
                    </div>
                  </div>
                  <button (click)="quickReorder(p)" class="px-4 py-2 bg-orange-500 text-white text-xs font-black rounded-lg shadow hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 flex-shrink-0">
                    <span class="material-symbols-rounded text-sm">add_shopping_cart</span>
                    Create Reorder
                  </button>
                </div>
              }

              <!-- KPI Gradient Cards -->
              <div class="grid grid-cols-4 gap-4 px-6 py-4 flex-shrink-0">
                <div class="rounded-xl p-4" [ngStyle]="kpiStyles.stock">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">inventory</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Total Stock</span>
                  </div>
                  <div class="text-2xl font-black text-white">{{ p.stock_quantity || 0 }}</div>
                  <div class="text-[10px] text-white/60 mt-1">{{ p.unit_type || 'PCS' }}</div>
                </div>
                <div class="rounded-xl p-4" [ngStyle]="kpiStyles.value">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">payments</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Stock Value</span>
                  </div>
                  <div class="text-2xl font-black text-white">{{ ((p.stock_quantity || 0) * (p.cost_price || 0)) | currency: storeService.currency() : 'symbol' : '1.0-0' }}</div>
                  <div class="text-[10px] text-white/60 mt-1">at cost price</div>
                </div>
                <div class="rounded-xl p-4" [ngStyle]="kpiStyles.sell">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">sell</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Sell Price</span>
                  </div>
                  <div class="text-2xl font-black text-white">{{ p.price | currency: storeService.currency() }}</div>
                  <div class="text-[10px] text-white/60 mt-1">Cost: {{ p.cost_price | currency: storeService.currency() }}</div>
                </div>
                <div class="rounded-xl p-4" [ngStyle]="kpiStyles.margin">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-rounded text-base text-white/80">trending_up</span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Margin</span>
                  </div>
                  <div class="text-2xl font-black text-white">
                    {{ p.price && p.cost_price ? ((( p.price - p.cost_price) / p.price) * 100 | number:'1.0-1') : 0 }}%
                  </div>
                  <div class="text-[10px] text-white/60 mt-1">{{ (p.price - (p.cost_price||0)) | currency: storeService.currency() }} profit</div>
                </div>
              </div>

              <!-- Tabbed Content -->
              <div class="flex-1 overflow-auto px-6 pb-6">
                <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">

                  <!-- Tabs -->
                  <div class="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                    @for (tab of detailTabs; track tab.id) {
                      <button (click)="activeDetailTab.set(tab.id)"
                              class="px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all"
                              [ngClass]="activeDetailTab() === tab.id ? 'border-[var(--primary-color)] text-[var(--primary-color)]' : 'border-transparent text-slate-400 hover:text-slate-600'">
                        {{ tab.label }}
                      </button>
                    }
                  </div>

                  <!-- General Tab -->
                  @if (activeDetailTab() === 'GENERAL') {
                    <div class="p-6 grid grid-cols-2 md:grid-cols-3 gap-6 animate-in fade-in duration-200">
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Brand</div><div class="font-bold text-slate-700 dark:text-slate-300">{{ p.brand || '—' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Barcode</div><div class="font-bold font-mono text-slate-700 dark:text-slate-300">{{ p.barcode || '—' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">SKU</div><div class="font-bold font-mono text-slate-700 dark:text-slate-300">{{ p.supplier_sku || '—' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit Type</div><div class="font-bold text-slate-700 dark:text-slate-300">{{ p.unit_type || 'PIECE' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reorder Point</div><div class="font-bold text-slate-700 dark:text-slate-300">{{ p.reorder_point || 5 }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Voltage</div><div class="font-bold text-slate-700 dark:text-slate-300">{{ p.voltage || '—' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Warranty</div><div class="font-bold text-slate-700 dark:text-slate-300">{{ p.warranty_period || '—' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">OEM / Aftermarket</div><div class="font-bold text-slate-700 dark:text-slate-300">{{ p.oem_aftermarket || '—' }}</div></div>
                      <div><div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expiry Date</div>
                        <div class="font-bold" [ngClass]="p.expiry_date ? 'text-orange-500' : 'text-slate-700 dark:text-slate-300'">{{ p.expiry_date ? (p.expiry_date | date:'mediumDate') : 'N/A' }}</div>
                      </div>
                      @if ((p.compatible_models || []).length > 0) {
                        <div class="col-span-3">
                          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Compatible Models</div>
                          <div class="flex flex-wrap gap-2">
                            @for (m of p.compatible_models || []; track m) {
                              <span class="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-bold">{{ m }}</span>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }

                  <!-- Stock Tab -->
                  @if (activeDetailTab() === 'STOCK') {
                    <div class="p-6 space-y-6 animate-in fade-in duration-200">
                      <div class="grid grid-cols-2 gap-4">
                        <div class="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50 text-center">
                          <div class="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Shop Floor</div>
                          <div class="text-3xl font-black font-mono text-blue-600">{{ p.stock_shop || 0 }}</div>
                        </div>
                        <div class="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/50 text-center">
                          <div class="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1">Warehouse</div>
                          <div class="text-3xl font-black font-mono text-purple-600">{{ p.stock_warehouse || 0 }}</div>
                        </div>
                      </div>
                      <div class="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <div class="text-sm font-black text-slate-500 uppercase tracking-widest">Reorder Point</div>
                        <div class="text-2xl font-black" [ngClass]="(p.stock_quantity||0) <= (p.reorder_point||5) ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'">{{ p.reorder_point || 5 }}</div>
                      </div>
                    </div>
                  }

                  <!-- History Tab -->
                  @if (activeDetailTab() === 'HISTORY') {
                    <div class="p-6 space-y-3 animate-in fade-in duration-200">
                      @for (log of currentStockLogs(); track log.id) {
                        <div class="relative pl-6 pb-4 border-l-2 border-slate-100 dark:border-slate-700 last:border-0">
                          <div class="absolute -left-[7px] top-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 shadow-sm"
                               [ngClass]="log.quantity_change > 0 ? 'bg-green-500' : 'bg-red-500'"></div>
                          <div class="flex justify-between items-start">
                            <div>
                              <div class="text-xs font-black uppercase tracking-wider">{{ log.reason }}</div>
                              <div class="text-[10px] text-slate-400 mt-0.5">{{ log.created_at | date:'MMM d, yyyy · h:mm a' }}</div>
                              @if (log.note) { <div class="text-xs italic text-slate-500 mt-1">{{ log.note }}</div> }
                            </div>
                            <span class="text-lg font-black font-mono ml-4"
                                  [ngClass]="log.quantity_change > 0 ? 'text-green-600' : 'text-red-500'">
                              {{ log.quantity_change > 0 ? '+' : '' }}{{ log.quantity_change }}
                            </span>
                          </div>
                        </div>
                      } @empty {
                        <div class="py-16 text-center opacity-40 italic text-sm">No stock history found for this product.</div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        }

        <!-- ── State B: ADD / EDIT FORM ─────────────────────────────────── -->
        @if (panelState() === 'ADD' || panelState() === 'EDIT') {
          <div class="flex-1 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            <!-- Form Header -->
            <div class="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-between items-center flex-shrink-0">
              <div>
                <h2 class="text-xl font-black">{{ panelState() === 'EDIT' ? 'Edit Product' : 'Add New Product' }}</h2>
                <p class="text-xs text-slate-400 mt-0.5 font-medium">{{ panelState() === 'EDIT' ? (selectedProduct()?.name || '') : 'Fill in product details below' }}</p>
              </div>
              <button (click)="cancelPanel()" class="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all">
                Discard
              </button>
            </div>

            <!-- Form Body -->
            <div class="flex-1 overflow-auto p-8">

              <!-- === ADD FORM === -->
              @if (panelState() === 'ADD') {
                <form [formGroup]="productForm" class="max-w-4xl space-y-8">
                  <!-- Image -->
                  <div class="flex items-center gap-6">
                    <div class="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                      <span class="material-symbols-rounded text-slate-300 text-4xl">image</span>
                    </div>
                    <app-image-upload (imageSelected)="onImageSelected($event)"></app-image-upload>
                  </div>

                  <!-- Core Identity -->
                  <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded text-sm text-[var(--primary-color)]">badge</span>Core Identity</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="md:col-span-2">
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Product Name *</label>
                        <input formControlName="name" type="text" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Category</label>
                        <select formControlName="category_id" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                          <option [value]="null">Uncategorized</option>
                          @for (g of hierarchicalCategories(); track g.parent.id) {
                            <optgroup [label]="g.parent.name">
                              <option [value]="g.parent.id">{{ g.parent.name }} (Main)</option>
                              @for (c of g.children; track c.id) { <option [value]="c.id">↳ {{ c.name }}</option> }
                            </optgroup>
                          }
                        </select>
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Brand</label>
                        <input formControlName="brand" type="text" placeholder="e.g. Samsung" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Barcode</label>
                        <input formControlName="barcode" type="text" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">SKU</label>
                        <input formControlName="supplier_sku" type="text" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Unit Type</label>
                        <select formControlName="unit_type" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                          <option value="PIECE">Piece / PCS</option>
                          <option value="METER">Meter</option>
                          <option value="BOX">Box</option>
                          <option value="KG">Kilogram</option>
                          <option value="LITER">Liter</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Primary Supplier</label>
                        <select formControlName="supplier_id" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                          <option [value]="null">— No primary supplier —</option>
                          @for (s of suppliersSignal(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- Pricing -->
                  <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded text-sm text-[var(--primary-color)]">payments</span>Pricing Strategy</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Cost Price</label>
                        <input formControlName="cost_price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Selling Price *</label>
                        <input formControlName="price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Wholesale Price</label>
                        <input formControlName="wholesale_price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                    </div>
                  </div>

                  <!-- Stock -->
                  <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded text-sm text-[var(--primary-color)]">inventory</span>Stock Levels</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Shop Floor</label>
                        <input formControlName="stock_shop" type="number" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Warehouse</label>
                        <input formControlName="stock_warehouse" type="number" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Reorder Point</label>
                        <input formControlName="reorder_point" type="number" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                    </div>
                  </div>
                </form>
              }

              <!-- === EDIT FORM === -->
              @if (panelState() === 'EDIT') {
                <form [formGroup]="editProductForm" class="max-w-4xl space-y-8">
                  <!-- Image -->
                  <div class="flex items-center gap-6">
                    <div class="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                      @if (selectedProduct()?.image_url) {
                        <img [src]="selectedProduct()?.image_url" class="w-full h-full object-cover">
                      } @else {
                        <span class="material-symbols-rounded text-slate-300 text-4xl">image</span>
                      }
                    </div>
                    <app-image-upload (imageSelected)="onImageSelected($event)"></app-image-upload>
                  </div>

                  <!-- Core Identity -->
                  <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded text-sm text-[var(--primary-color)]">badge</span>Core Identity</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="md:col-span-2">
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Product Name *</label>
                        <input formControlName="name" type="text" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Category</label>
                        <select formControlName="category_id" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                          <option [value]="null">Uncategorized</option>
                          @for (g of hierarchicalCategories(); track g.parent.id) {
                            <optgroup [label]="g.parent.name">
                              <option [value]="g.parent.id">{{ g.parent.name }} (Main)</option>
                              @for (c of g.children; track c.id) { <option [value]="c.id">↳ {{ c.name }}</option> }
                            </optgroup>
                          }
                        </select>
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Brand</label>
                        <input formControlName="brand" type="text" placeholder="e.g. Samsung" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Barcode</label>
                        <input formControlName="barcode" type="text" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">SKU</label>
                        <input formControlName="supplier_sku" type="text" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Unit Type</label>
                        <select formControlName="unit_type" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                          <option value="PIECE">Piece / PCS</option>
                          <option value="METER">Meter</option>
                          <option value="BOX">Box</option>
                          <option value="KG">Kilogram</option>
                          <option value="LITER">Liter</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Primary Supplier</label>
                        <select formControlName="supplier_id" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-bold focus:border-[var(--primary-color)] outline-none transition-all appearance-none">
                          <option [value]="null">— No primary supplier —</option>
                          @for (s of suppliersSignal(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- Pricing -->
                  <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded text-sm text-[var(--primary-color)]">payments</span>Pricing Strategy</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Cost Price</label>
                        <input formControlName="cost_price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Selling Price *</label>
                        <input formControlName="price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Wholesale Price</label>
                        <input formControlName="wholesale_price" type="number" step="0.01" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                    </div>
                  </div>

                  <!-- Stock -->
                  <div class="space-y-4">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded text-sm text-[var(--primary-color)]">inventory</span>Stock Levels</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Shop Floor</label>
                        <input formControlName="stock_shop" type="number" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Warehouse</label>
                        <input formControlName="stock_warehouse" type="number" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                      <div>
                        <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Reorder Point</label>
                        <input formControlName="reorder_point" type="number" class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm font-mono font-bold focus:border-[var(--primary-color)] outline-none transition-all">
                      </div>
                    </div>
                  </div>
                </form>
              }

            </div>

            <!-- Form Footer -->
            <div class="px-8 py-5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-between items-center flex-shrink-0 shadow-[0_-8px_24px_rgba(0,0,0,0.03)]">
              @if (panelState() === 'EDIT') {
                <button type="button" (click)="showDelete(selectedProduct()!)" class="text-red-400 hover:text-red-600 text-xs font-black uppercase hover:underline transition-colors flex items-center gap-1">
                  <span class="material-symbols-rounded text-sm">delete</span> Delete Product
                </button>
              } @else {
                <button type="button" (click)="openBulkUpload()" class="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-black rounded-lg hover:bg-slate-200 transition-all">
                  <span class="material-symbols-rounded text-sm">upload_file</span> Bulk Import
                </button>
              }
              <div class="flex gap-3">
                <button type="button" (click)="cancelPanel()" class="px-6 py-2.5 text-sm font-black text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors">Cancel</button>
                @if (panelState() === 'EDIT') {
                  <button type="button" (click)="saveProductChanges()" [disabled]="editProductForm.invalid"
                          class="px-10 py-2.5 bg-[var(--primary-color)] text-white text-sm font-black rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 uppercase tracking-widest">
                    <span class="material-symbols-rounded text-sm">save</span> Save Changes
                  </button>
                } @else {
                  <button type="button" (click)="addProduct()" [disabled]="productForm.invalid"
                          class="px-10 py-2.5 bg-[var(--primary-color)] text-white text-sm font-black rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 uppercase tracking-widest">
                    <span class="material-symbols-rounded text-sm">add_circle</span> Add Product
                  </button>
                }
              </div>
            </div>
          </div>
        }

        <!-- ── State C: EMPTY ────────────────────────────────────────────── -->
        @if (panelState() === 'EMPTY') {
          <div class="flex-1 flex flex-col items-center justify-center text-slate-400 gap-6 animate-in fade-in zoom-in duration-500 max-w-sm mx-auto text-center px-10">
            <div class="w-40 h-40 rounded-[3.5rem] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none mb-4">
              <span class="material-symbols-rounded text-7xl opacity-20 text-[var(--primary-color)]">inventory_2</span>
            </div>
            <div>
              <div class="text-2xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter">Inventory Hub</div>
              <p class="text-sm mt-3 text-slate-500 dark:text-slate-400 leading-relaxed font-medium">Select a product from the left to review its details, adjust stock, and track history — or add a new product to your catalogue.</p>
            </div>
            <button (click)="openAddProductPanel()" class="mt-4 px-10 py-4 bg-[var(--primary-color)] text-white text-xs font-black rounded-2xl shadow-2xl hover:brightness-110 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">
              <span class="material-symbols-rounded text-sm">add_circle</span>
              Add First Product
            </button>
          </div>
        }
      </div>
    </div>

    <!-- ══ OVERLAYS ══════════════════════════════════════════════════════ -->

    <!-- Adjust Stock Modal -->
    @if (showAdjustStock()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div class="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
          <h3 class="text-xl font-black mb-1">Adjust Stock</h3>
          <p class="text-sm text-slate-400 font-bold mb-6">{{ selectedProduct()?.name }}</p>
          <form [formGroup]="adjustStockForm" (ngSubmit)="submitStockAdjustment()" class="space-y-4">
            <div class="grid grid-cols-2 gap-2">
              <button type="button" (click)="adjustStockForm.patchValue({type: 'ADD'})"
                      [ngClass]="adjustStockForm.get('type')?.value === 'ADD' ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                      class="py-3 rounded-xl font-black text-sm transition-all">Add (+)</button>
              <button type="button" (click)="adjustStockForm.patchValue({type: 'REMOVE'})"
                      [ngClass]="adjustStockForm.get('type')?.value === 'REMOVE' ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                      class="py-3 rounded-xl font-black text-sm transition-all">Remove (-)</button>
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Quantity</label>
              <input formControlName="quantity" type="number" min="1" class="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono font-bold text-lg outline-none focus:border-[var(--primary-color)] transition-all">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Reason</label>
              <select formControlName="reason" class="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-3 font-bold outline-none focus:border-[var(--primary-color)] transition-all">
                <option value="RESTOCK">Restock</option>
                <option value="RETURN">Customer Return</option>
                <option value="DAMAGE">Damaged / Written Off</option>
                <option value="CORRECTION">Manual Correction</option>
              </select>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" (click)="showAdjustStock.set(false)" class="px-6 py-2.5 font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
              <button type="submit" [disabled]="adjustStockForm.invalid" class="px-8 py-2.5 bg-[var(--primary-color)] text-white font-black rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">Apply</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Bulk Upload Modal -->
    @if (showBulkUpload()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div class="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
          <div class="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 class="text-xl font-black flex items-center gap-2"><span class="material-symbols-rounded text-blue-500">upload_file</span>Bulk Product Import</h3>
            <button (click)="showBulkUpload.set(false)" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="p-6 overflow-y-auto flex-1 space-y-6">
            <div>
              <h4 class="font-black mb-2 flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-[var(--primary-color)] text-white text-xs flex items-center justify-center font-black">1</span>Download Template</h4>
              <button (click)="downloadTemplate()" class="text-[var(--primary-color)] text-sm font-bold hover:underline flex items-center gap-1"><span class="material-symbols-rounded text-base">download</span>Download CSV Template</button>
            </div>
            <div>
              <h4 class="font-black mb-2 flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-[var(--primary-color)] text-white text-xs flex items-center justify-center font-black">2</span>Upload CSV</h4>
              <input type="file" (change)="onFileSelected($event)" accept=".csv" class="block w-full text-sm border border-slate-300 dark:border-slate-700 rounded-xl p-3 cursor-pointer bg-slate-50 dark:bg-slate-800"/>
            </div>
            @if (parsedData().length > 0) {
              <div>
                <h4 class="font-black mb-2 flex items-center justify-between"><span class="flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-[var(--primary-color)] text-white text-xs flex items-center justify-center font-black">3</span>Preview</span><span class="text-xs font-medium">Valid: <span class="text-green-600">{{ validCount() }}</span> | Errors: <span class="text-red-600">{{ errorCount() }}</span></span></h4>
                <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50 dark:bg-slate-800 sticky top-0"><tr><th class="p-2">Name</th><th class="p-2">Price</th><th class="p-2">Status</th></tr></thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      @for (row of parsedData(); track $index) {
                        <tr [ngClass]="{'bg-red-50 dark:bg-red-900/10': !row.isValid}">
                          <td class="p-2">{{ row.data.name }}</td><td class="p-2">{{ row.data.price }}</td>
                          <td class="p-2">@if (row.isValid) { <span class="text-green-600 font-bold">Valid</span> } @else { <span class="text-red-600 font-bold">Error</span> }</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
          <div class="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
            <button (click)="showBulkUpload.set(false)" class="px-4 py-2 text-sm font-medium">Cancel</button>
            <button (click)="confirmImport()" [disabled]="validCount() === 0 || isImporting()" class="px-6 py-2.5 bg-[var(--primary-color)] text-white font-black rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
              @if (isImporting()) { Importing... } @else { Import {{ validCount() }} Products }
            </button>
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

  // ── NEW 3-column panel state ──────────────────────────────────────────
  panelState = signal<'EMPTY' | 'DETAIL' | 'ADD' | 'EDIT'>('EMPTY');
  activeDetailTab = signal<'GENERAL' | 'STOCK' | 'HISTORY'>('GENERAL');

  stockFilters = [
    { value: 'ALL', label: 'All' },
    { value: 'IN_STOCK', label: 'In Stock' },
    { value: 'LOW_STOCK', label: 'Low' },
    { value: 'OUT_OF_STOCK', label: 'Out' },
  ];

  detailTabs = [
    { id: 'GENERAL', label: 'General' },
    { id: 'STOCK', label: 'Stock' },
    { id: 'HISTORY', label: 'History' },
  ];

  kpiStyles = {
    stock: { background: 'linear-gradient(135deg, #667eea, #764ba2)', 'border-radius': '16px', padding: '16px' },
    value: { background: 'linear-gradient(135deg, #f093fb, #f5576c)', 'border-radius': '16px', padding: '16px' },
    sell: { background: 'linear-gradient(135deg, #4facfe, #00f2fe)', 'border-radius': '16px', padding: '16px' },
    margin: { background: 'linear-gradient(135deg, #43e97b, #38f9d7)', 'border-radius': '16px', padding: '16px' },
  };

  // ── Panel navigation helpers ──────────────────────────────────────────
  selectProduct(product: Product) {
    this.selectedProduct.set(product);
    this.activeDetailTab.set('GENERAL');
    this.fetchStockLogs(product);
    this.panelState.set('DETAIL');
  }

  openAddProductPanel() {
    this.productForm.reset({
      name: '', price: 0, cost_price: 0, stock_shop: 0, stock_warehouse: 0,
      category_id: null, barcode: '', reorder_point: 5, unit_type: 'PIECE',
      brand: '', compatible_models: [], voltage: null, oem_aftermarket: null,
      warranty_period: '', supplier_id: null, tax_rate: 0, wholesale_price: 0,
      is_serialized: false, metadata: { prescriptionRequired: false, ingredients: '', aisle: '' }
    });
    this.panelState.set('ADD');
  }

  openEditProductPanel(product: Product) {
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
    this.panelState.set('EDIT');
  }

  cancelPanel() {
    if (this.selectedProduct()) {
      this.panelState.set('DETAIL');
    } else {
      this.panelState.set('EMPTY');
    }
  }

  quickReorder(product: Product) {
    this.dialog.alert(
      'Create Reorder — ' + product.name,
      `This product has only ${product.stock_quantity} unit(s) in stock (reorder point: ${product.reorder_point || 5}). ` +
      `Go to Purchase Orders to create a restock PO and add "${product.name}" as a line item.`
    );
  }

  getControl(name: string) {
    const form = this.panelState() === 'EDIT' ? this.editProductForm : this.productForm;
    return form.get(name) as any;
  }


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

  // Suppliers — for Primary Supplier dropdown (Approach A tagging)
  private suppliers$ = this.storeService.currentStore$.pipe(
    switchMap(store => store ? this.supabase.getSuppliers(store.id) : of([]))
  );
  suppliersSignal: Signal<Supplier[]> = toSignal(this.suppliers$, { initialValue: [] as Supplier[] });

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
      supplier_id: [null],       // Approach A: tag a Primary Supplier directly on the product
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
        this.panelState.set('EMPTY');
      },
      error: err => {
        console.error('Add Product Error:', err);
        this.dialog.alert('Error', `Failed to add product: ${err.message} `);
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

    const raw = this.editProductForm.getRawValue();
    const stock_shop = parseInt(raw.stock_shop ?? '0', 10) || 0;
    const stock_warehouse = parseInt(raw.stock_warehouse ?? '0', 10) || 0;
    const totalStock = stock_shop + stock_warehouse;

    const updates: any = {
      ...raw,
      stock_quantity: totalStock,
      stock_shop,
      stock_warehouse,
      price: parseFloat(raw.price ?? '0') || 0,
      cost_price: parseFloat(raw.cost_price ?? '0') || 0,
      wholesale_price: parseFloat(raw.wholesale_price ?? '0') || 0,
      reorder_point: parseInt(raw.reorder_point ?? '5', 10) || 5,
      compatible_models: typeof raw.compatible_models === 'string'
        ? raw.compatible_models.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : (raw.compatible_models || []),
    };

    // Postgres rejects empty strings for date columns
    if (!updates.expiry_date || updates.expiry_date === '') {
      delete updates.expiry_date;
    }

    this.supabase.updateProduct(product.id, updates).subscribe({
      next: () => {
        const imageFile = this.selectedImageFile();
        if (imageFile) {
          this.supabase.uploadProductImage(product.id, imageFile).subscribe({
            next: () => {
              this.dialog.alert('Success', 'Product updated with new image.');
              this.selectedImageFile.set(null);
              this.panelState.set('DETAIL');
            },
            error: () => this.dialog.alert('Partial Success', 'Product updated but image upload failed.')
          });
        } else {
          this.dialog.alert('Success', 'Product updated.');
          this.panelState.set('DETAIL');
        }
      },
      error: err => this.dialog.alert('Error', `Failed to update product: ${err.message} `)
    });
  }

  async showDelete(product: Product) {
    if (await this.dialog.confirm('Delete Product', `Are you sure you want to delete ${product.name}?`)) {
      this.supabase.deleteProduct(product.id).subscribe({
        next: () => {
          this.dialog.alert('Success', 'Product deleted.');
          this.selectedProduct.set(null);
          this.panelState.set('EMPTY');
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
      error: err => this.dialog.alert('Error', `Failed to adjust stock: ${err.message} `)
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
    const csv = `name, barcode, category, price, stock\n"Sample Screwdriver", "123456789", "Hand Tools", 9.99, 50`;
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
