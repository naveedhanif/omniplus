import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, BehaviorSubject, retry, catchError, tap, map } from 'rxjs';
import {
    StockManagementService,
    StockLevel,
    StockLocation,
    StockMovement,
    StockTransfer,
    MovementType,
    CreateMovementRequest,
    CreateTransferRequest,
} from '../../../../core/services/stock-management.service';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, CellClickedEvent, GridApi, GridReadyEvent, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);
import { MockSupabaseService, Product } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';

type ViewMode = 'DASHBOARD' | 'LEVELS' | 'MOVEMENTS' | 'TRANSFERS' | 'REORDER' | 'LOCATIONS';

@Component({
    selector: 'app-stock-manager',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, DatePipe, AgGridAngular],
    template: `
        <style>
            @keyframes slideProgress {
                to { background-position: 20px 0; }
            }
            .animate-progress-slide {
                animation: slideProgress 1s linear infinite;
            }
            /* Hide scrollbars for a cleaner UI if needed later */
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        </style>
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex justify-between items-center">
                <div>
                    <h2 class="text-2xl font-bold">Stock Management</h2>
                    <p class="text-sm opacity-60">Movement-based inventory tracking with full audit trail</p>
                </div>
                <div class="flex gap-2">
                    <button 
                        (click)="showLocationModal.set(true)"
                        class="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-rounded text-sm">add_location_alt</span> Location
                    </button>
                    <button 
                        (click)="openAdjustmentModal()"
                        class="px-4 py-2 bg-[var(--primary-color)] text-white rounded-lg font-bold hover:brightness-110 transition-all">
                        <span class="material-symbols-rounded text-sm">add</span> Adjustment
                    </button>
                    <button 
                        (click)="openTransferModal()"
                        class="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-rounded text-sm">swap_horiz</span> New Transfer
                    </button>
                    <button 
                        (click)="refreshAll()"
                        class="p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm hover:brightness-95 transition-all text-slate-500 hover:text-[var(--primary-color)]"
                        title="Refresh Data">
                        <span class="material-symbols-rounded">refresh</span>
                    </button>
                </div>
            </div>

            <!-- 🎨 COMMAND CENTER: Bento Box Dashboard -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                <!-- Card 1: Portfolio Value (Glassmorphism & Sparkline) -->
                <div class="relative overflow-hidden bg-gradient-to-br from-[var(--card-bg)] to-slate-50 dark:to-slate-800/50 rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 dark:border-slate-700/60 p-5 group cursor-pointer transition-all duration-300 hover:-translate-y-1"
                     (click)="viewMode.set('LEVELS')">
                    <!-- Glow effect -->
                    <div class="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 dark:bg-blue-400/10 blur-2xl rounded-full group-hover:bg-blue-500/20 transition-colors"></div>
                    
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-inner">
                            <span class="material-symbols-rounded">account_balance</span>
                        </div>
                        <span class="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full flex items-center gap-0.5 shadow-sm">
                            <span class="material-symbols-rounded text-[10px]">trending_up</span> Live
                        </span>
                    </div>
                    <div class="relative z-10">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Total Valuation</div>
                        <div class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{{ totalInventoryValue() | currency:storeService.currency() }}</div>
                    </div>
                    <!-- Fake mini sparkline -->
                    <div class="absolute bottom-0 left-0 w-full h-8 opacity-20 pointer-events-none flex items-end gap-0.5">
                        <div class="flex-1 h-2 bg-blue-500 rounded-tr-sm transition-all group-hover:h-3"></div>
                        <div class="flex-1 h-4 bg-blue-500 rounded-t-sm transition-all group-hover:h-5"></div>
                        <div class="flex-1 h-3 bg-blue-500 rounded-t-sm transition-all group-hover:h-4"></div>
                        <div class="flex-1 h-6 bg-blue-500 rounded-t-sm transition-all group-hover:h-7"></div>
                        <div class="flex-1 h-5 bg-blue-500 rounded-t-sm transition-all group-hover:h-8"></div>
                        <div class="flex-1 h-7 bg-blue-500 rounded-tl-sm transition-all group-hover:h-10"></div>
                    </div>
                </div>
                
                <!-- Card 2: Low Stock Alerts (Pulsing Animation) -->
                <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 dark:border-slate-700 p-5 group cursor-pointer transition-all duration-300 hover:-translate-y-1"
                     (click)="viewMode.set('REORDER')">
                    <!-- Danger Glow -->
                    <div class="absolute -top-10 -right-10 w-32 h-32 bg-red-500/5 dark:bg-red-500/10 blur-2xl rounded-full transition-colors group-hover:bg-red-500/20"
                         [class.animate-pulse]="lowStockAlerts().length > 0"></div>

                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shadow-inner"
                             [class.animate-pulse]="lowStockAlerts().length > 0">
                            <span class="material-symbols-rounded">warning</span>
                        </div>
                        @if (lowStockAlerts().length > 0) {
                            <span class="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold rounded-full animate-pulse shadow-sm shadow-red-500/20">Action Req</span>
                        }
                    </div>
                    <div class="relative z-10">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Critical Alerts</div>
                        <div class="text-3xl font-extrabold tracking-tight" [class.text-red-600]="lowStockAlerts().length > 0">{{ lowStockAlerts().length }}</div>
                        <div class="text-[10px] opacity-60 mt-1">Items below minimum threshold</div>
                    </div>
                </div>

                <!-- Card 3: Active Transfers (Dashed Loading State) -->
                <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 dark:border-slate-700 p-5 group cursor-pointer transition-all duration-300 hover:-translate-y-1"
                     (click)="viewMode.set('TRANSFERS')">
                    <div class="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-purple-500/5 to-transparent blur-xl pointer-events-none"></div>
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform">
                            <span class="material-symbols-rounded">local_shipping</span>
                        </div>
                    </div>
                    <div class="relative z-10">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">In Transit / Pending</div>
                        <div class="text-3xl font-extrabold tracking-tight">{{ activeTransfersCount() }}</div>
                        
                        <!-- Animated dashed border to show movement -->
                        @if (activeTransfersCount() > 0) {
                        <div class="mt-4 h-1 w-full bg-[size:20px_20px] bg-[linear-gradient(to_right,var(--primary-color)_50%,transparent_50%)] animate-progress-slide opacity-50 rounded-full"></div>
                        } @else {
                        <div class="mt-4 h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full"></div>
                        }
                    </div>
                </div>

                <!-- Card 4: Network Map (Visual Node Map feeling) -->
                <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 dark:border-slate-700 p-5 group cursor-pointer transition-all duration-300 hover:-translate-y-1"
                     (click)="viewMode.set('LOCATIONS')">
                     <!-- Dotted background -->
                     <div class="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(circle_at_center,theme(colors.slate.900)_1.5px,transparent_1.5px)] dark:bg-[radial-gradient(circle_at_center,theme(colors.slate.100)_1.5px,transparent_1.5px)]" style="background-size: 16px 16px;"></div>
                     
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                            <span class="material-symbols-rounded">hub</span>
                        </div>
                    </div>
                    <div class="relative z-10">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Active Nodes</div>
                        <div class="text-3xl font-extrabold tracking-tight">{{ locations().length }}</div>
                        <div class="text-[10px] opacity-80 mt-1 flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span> Network Synced
                        </div>
                    </div>
                </div>
            </div>

            <!-- View Navigation (Premium Pill Tabs) -->
            <div class="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-fit border border-slate-200 dark:border-slate-700/50">
                <button 
                    (click)="viewMode.set('DASHBOARD')"
                    [class]="viewMode() === 'DASHBOARD' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-5 py-2 text-sm rounded-lg transition-all flex items-center gap-2">
                    <span class="material-symbols-rounded text-[18px]">space_dashboard</span> Command Center
                </button>
                <div class="w-px bg-slate-200 dark:bg-slate-700 my-2 mx-1"></div>
                <button 
                    (click)="viewMode.set('LEVELS'); refreshStockLevels()"
                    [class]="viewMode() === 'LEVELS' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-4 py-2 text-sm rounded-lg transition-all">
                    Stock Levels
                </button>
                <button 
                    (click)="viewMode.set('MOVEMENTS')"
                    [class]="viewMode() === 'MOVEMENTS' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-4 py-2 text-sm rounded-lg transition-all">
                    Movement History
                </button>
                <button 
                    (click)="viewMode.set('TRANSFERS')"
                    [class]="viewMode() === 'TRANSFERS' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-4 py-2 text-sm rounded-lg transition-all">
                    Transfers
                </button>
                <button 
                    (click)="viewMode.set('REORDER'); refreshStockLevels()"
                    [class]="viewMode() === 'REORDER' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-4 py-2 text-sm rounded-lg transition-all">
                    Low Stock
                </button>
                <button 
                    (click)="viewMode.set('LOCATIONS')"
                    [class]="viewMode() === 'LOCATIONS' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-4 py-2 text-sm rounded-lg transition-all">
                    Locations
                </button>
            </div>

            <!-- DASHBOARD VIEW: The Advanced Split Screen -->
            @if (viewMode() === 'DASHBOARD') {
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-75">
                    
                    <!-- Left: Live Inventory Grid (2/3 width) -->
                    <div class="col-span-1 lg:col-span-2 bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden h-[600px] relative">
                        <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                            <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span class="material-symbols-rounded text-[var(--primary-color)]">inventory_2</span> 
                                Live Inventory Status
                            </h3>
                            <!-- Loading Skeleton Fake Effect -->
                            <div class="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Real-time Synced
                            </div>
                        </div>
                        <div class="flex-1 ag-theme-quartz" [class.dark]="isDarkMode()">
                            <ag-grid-angular
                                style="width: 100%; height: 100%;"
                                [rowData]="stockLevels()"
                                [columnDefs]="columnDefs"
                                [defaultColDef]="defaultColDef"
                                [pagination]="true"
                                [paginationPageSize]="20"
                                (gridReady)="onGridReady($event)"
                                (cellClicked)="onCellClicked($event)"
                                [rowClass]="'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/10'"
                            >
                            </ag-grid-angular>
                        </div>
                    </div>

                    <!-- Right Sidebar: AI Actions & Feed (1/3 width) -->
                    <div class="col-span-1 flex flex-col gap-6">
                        
                        <!-- Next-Gen Card: Smart Auto-Restock -->
                        <div class="bg-gradient-to-br from-blue-600 via-[var(--primary-color)] to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-300">
                            <div class="absolute inset-0 bg-black/10 transition-colors group-hover:bg-transparent"></div>
                            <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 blur-3xl rounded-full"></div>
                            
                            <div class="relative z-10">
                                <div class="flex items-center gap-2 text-white/80 text-xs font-bold uppercase tracking-widest mb-3">
                                    <span class="material-symbols-rounded text-[16px]">psychology</span> AI Restock Suggestion
                                </div>
                                <h3 class="text-2xl font-extrabold mb-1">Auto-Restock Shop</h3>
                                <p class="text-sm opacity-90 mb-6">Algorithm detected 4 items moving fast today.</p>
                                
                                <button class="w-full py-3 bg-white text-[var(--primary-color)] rounded-xl font-bold font-mono text-sm shadow-md hover:scale-[1.02] active:scale-95 transition-all flex justify-center items-center gap-2">
                                    Draft Transfer <span class="material-symbols-rounded text-sm">arrow_forward</span>
                                </button>
                            </div>
                        </div>

                        <!-- Live Alert Feed / Mini Transfers -->
                        <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex-1 flex flex-col overflow-hidden">
                            <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                                <h3 class="font-bold flex items-center gap-2 text-sm">
                                    <span class="material-symbols-rounded text-slate-400 text-[18px]">notifications_active</span>
                                    Action Feed
                                </h3>
                            </div>
                            
                            <div class="p-4 space-y-4 overflow-y-auto hide-scrollbar max-h-[350px]">
                                <!-- Alerts Loop -->
                                @for (alert of lowStockAlerts().slice(0, 5); track alert.product_id) {
                                    <div class="flex items-start gap-3 group relative cursor-pointer" (click)="viewMode.set('REORDER')">
                                        <div class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-rounded text-[16px]">warning</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-[var(--primary-color)] transition-colors">
                                                {{ getProductName(alert.product_id) }}
                                            </p>
                                            <p class="text-xs opacity-60">
                                                Only <span class="text-red-500 font-bold">{{ alert.available_quantity }}</span> left in {{ getLocationName(alert.location_id) }}
                                            </p>
                                        </div>
                                    </div>
                                } @empty {
                                    <div class="flex flex-col items-center justify-center pt-8 opacity-50 text-slate-500">
                                        <span class="material-symbols-rounded text-4xl mb-2">check_circle</span>
                                        <p class="text-sm font-medium">All stock levels healthy.</p>
                                    </div>
                                }

                                <!-- Transfers loop intermixed -->
                                @if (transfers().length > 0) {
                                    <div class="my-4 border-t border-slate-100 dark:border-slate-800"></div>
                                    @for (t of transfers().slice(0, 3); track t.id) {
                                        <div class="flex items-start gap-3 cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 rounded-lg -mx-2 transition-colors"
                                             (click)="viewMode.set('TRANSFERS')">
                                            <div class="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center shrink-0">
                                                <span class="material-symbols-rounded text-[16px]">local_shipping</span>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-xs font-mono font-bold text-slate-900 dark:text-white truncate">
                                                    {{ t.transfer_number }}
                                                </p>
                                                <div class="flex items-center gap-1 text-[10px] opacity-70 mt-0.5">
                                                    <span>{{ getLocationName(t.from_location_id) | slice:0:10 }}</span>
                                                    <span class="material-symbols-rounded text-[10px]">arrow_forward</span>
                                                    <span>{{ getLocationName(t.to_location_id) | slice:0:10 }}</span>
                                                </div>
                                            </div>
                                            <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                                {{ t.status }}
                                            </span>
                                        </div>
                                    }
                                }
                            </div>
                        </div>
                    </div>
                </div>
            }

            <!-- Stock Levels View -->
            @if (viewMode() === 'LEVELS') {
                <div class="h-[600px] bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    <div class="p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <span class="material-symbols-rounded text-[var(--primary-color)] text-[18px]">inventory_2</span> 
                                Master Stock Ledger
                            </h3>
                        </div>
                        <div class="flex gap-4">
                            <select 
                                [(ngModel)]="selectedLocationId"
                                (ngModelChange)="refreshStockLevels()"
                                class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white font-medium">
                                <option value="" class="text-slate-900 dark:text-white">All Locations</option>
                                @for (loc of locations(); track loc.id) {
                                    <option [value]="loc.id" class="text-slate-900 dark:text-white">{{ loc.name }}</option>
                                }
                            </select>
                            <div class="flex-1"></div>
                            <!-- Search/Filter could go here -->
                             <input 
                                type="text" 
                                placeholder="Quick Filter..." 
                                (input)="onQuickFilterChanged($event)"
                                class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm w-64"
                            >
                        </div>
                    </div>

                    <div class="flex-1 ag-theme-quartz" [class.dark]="isDarkMode()">
                        <ag-grid-angular
                            style="width: 100%; height: 100%;"
                            [rowData]="stockLevels()"
                            [columnDefs]="columnDefs"
                            [defaultColDef]="defaultColDef"
                            [pagination]="true"
                            [paginationPageSize]="20"
                            (gridReady)="onGridReady($event)"
                            (cellClicked)="onCellClicked($event)"
                            [rowClass]="'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/10'"
                        >
                        </ag-grid-angular>
                    </div>
                </div>
            }

            <!-- Movement History View -->
            @if (viewMode() === 'MOVEMENTS') {
                <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                        <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span class="material-symbols-rounded text-indigo-500 text-[18px]">history</span> 
                            Global Movement History
                        </h3>
                    </div>
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 flex-1 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                            <tr>
                                <th class="p-4">Time</th>
                                <th class="p-4">Type</th>
                                <th class="p-4">Product</th>
                                <th class="p-4">Location</th>
                                <th class="p-4 text-right">Quantity</th>
                                <th class="p-4">Reason</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            @for (movement of movements(); track movement.id) {
                                <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                                    <td class="p-4 opacity-60 text-xs">{{ movement.created_at | date:'MMM d, HH:mm' }}</td>
                                    <td class="p-4">
                                        <span class="px-2 py-1 rounded-full text-[10px] font-bold"
                                              [class]="getMovementTypeClass(movement.movement_type)">
                                            {{ movement.movement_type }}
                                        </span>
                                    </td>
                                    <td class="p-4 font-medium">{{ getProductName(movement.product_id) }}</td>
                                    <td class="p-4 opacity-60">{{ getLocationName(movement.location_id) }}</td>
                                    <td class="p-4 text-right font-mono font-bold"
                                        [class.text-green-600]="movement.quantity > 0"
                                        [class.text-red-600]="movement.quantity < 0">
                                        {{ movement.quantity > 0 ? '+' : '' }}{{ movement.quantity }}
                                    </td>
                                    <td class="p-4 opacity-60 text-xs">{{ movement.reason || movement.notes || '-' }}</td>
                                </tr>
                            } @empty {
                                <tr><td colspan="6" class="p-12 text-center opacity-50 italic">No movements found</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
            }

            <!-- Transfers View -->
            @if (viewMode() === 'TRANSFERS') {
                <div class="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    @for (transfer of transfers(); track transfer.id) {
                        <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 transition-all duration-300">
                             <!-- Subtle gradient background purely for styling -->
                             <div class="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none -mr-32 -mt-32"></div>
                            
                            <div class="flex justify-between items-start relative z-10">
                                <div>
                                    <h3 class="font-bold text-xl flex items-center gap-2">
                                        <span class="material-symbols-rounded text-slate-400">local_shipping</span>
                                        {{ transfer.transfer_number }}
                                    </h3>
                                    <div class="text-sm opacity-60 mt-2 flex items-center gap-2 font-medium">
                                        {{ getLocationName(transfer.from_location_id) }} 
                                        <span class="material-symbols-rounded text-sm text-[var(--primary-color)]">arrow_forward</span>
                                        {{ getLocationName(transfer.to_location_id) }}
                                    </div>
                                    <div class="text-xs opacity-40 mt-1 flex items-center gap-1">
                                        <span class="material-symbols-rounded text-[14px]">schedule</span> {{ transfer.created_at | date:'medium' }}
                                    </div>
                                    @if (transfer.notes) {
                                        <div class="mt-3 text-sm italic bg-slate-50 dark:bg-slate-800/30 p-2 rounded border border-slate-100 dark:border-slate-700">
                                            "{{ transfer.notes }}"
                                        </div>
                                    }
                                </div>
                                <div class="flex flex-col items-end gap-3">
                                    <span class="px-4 py-1.5 rounded-full text-sm font-bold shadow-sm"
                                          [class]="getTransferStatusClass(transfer.status)">
                                        {{ transfer.status }}
                                    </span>
                                    <div class="flex gap-2">
                                        @if (transfer.status === 'PENDING') {
                                            <button 
                                                (click)="approveTransfer(transfer.id)"
                                                class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm transition-all flex items-center gap-1">
                                                <span class="material-symbols-rounded text-[18px]">verified</span> Approve
                                            </button>
                                        }
                                        @if (transfer.status === 'APPROVED') {
                                            <button 
                                                (click)="shipTransfer(transfer.id)"
                                                class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 shadow-sm transition-all flex items-center gap-1">
                                                <span class="material-symbols-rounded text-[18px]">outbox</span> Ship
                                            </button>
                                        }
                                        @if (transfer.status === 'IN_TRANSIT') {
                                            <button 
                                                (click)="receiveTransfer(transfer.id)"
                                                class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-sm transition-all flex items-center gap-1">
                                                <span class="material-symbols-rounded text-[18px]">inbox</span> Receive
                                            </button>
                                        }
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Visual Status Stepper -->
                            <div class="border-t border-slate-200 dark:border-slate-700 pt-6 mt-2 relative">
                                <div class="absolute top-[38px] left-10 right-10 h-1 bg-slate-200 dark:bg-slate-700 -z-10 rounded-full"></div>
                                <div class="absolute top-[38px] left-10 h-1 bg-[var(--primary-color)] -z-10 transition-all duration-500 rounded-full"
                                     [style.width]="transfer.status === 'PENDING' ? '0%' : transfer.status === 'APPROVED' ? '33%' : transfer.status === 'IN_TRANSIT' ? '66%' : transfer.status === 'RECEIVED' ? '100%' : '0%'"></div>
                                
                                <div class="flex justify-between px-4">
                                    <!-- Pending Step -->
                                    <div class="flex flex-col items-center gap-2">
                                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
                                             [class.bg-[var(--primary-color)]]="transfer.status !== 'CANCELLED'"
                                             [class.text-white]="transfer.status !== 'CANCELLED'"
                                             [class.bg-slate-200]="transfer.status === 'CANCELLED'"
                                             [class.dark:bg-slate-700]="transfer.status === 'CANCELLED'">
                                            1
                                        </div>
                                        <span class="text-xs font-bold" [class.text-[var(--primary-color)]]="transfer.status !== 'CANCELLED'">Pending</span>
                                    </div>

                                    <!-- Approved Step -->
                                    <div class="flex flex-col items-center gap-2">
                                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
                                             [class.bg-[var(--primary-color)]]="transfer.status === 'APPROVED' || transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED'"
                                             [class.text-white]="transfer.status === 'APPROVED' || transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED'"
                                             [class.bg-slate-200]="transfer.status === 'PENDING' || transfer.status === 'CANCELLED'"
                                             [class.dark:bg-slate-700]="transfer.status === 'PENDING' || transfer.status === 'CANCELLED'">
                                            2
                                        </div>
                                        <span class="text-xs font-bold" [class.text-[var(--primary-color)]]="transfer.status === 'APPROVED' || transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED'">Approved</span>
                                    </div>

                                    <!-- Shipped Step -->
                                    <div class="flex flex-col items-center gap-2">
                                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
                                             [class.bg-[var(--primary-color)]]="transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED'"
                                             [class.text-white]="transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED'"
                                             [class.bg-slate-200]="transfer.status === 'PENDING' || transfer.status === 'APPROVED' || transfer.status === 'CANCELLED'"
                                             [class.dark:bg-slate-700]="transfer.status === 'PENDING' || transfer.status === 'APPROVED' || transfer.status === 'CANCELLED'">
                                            3
                                        </div>
                                        <span class="text-xs font-bold" [class.text-[var(--primary-color)]]="transfer.status === 'IN_TRANSIT' || transfer.status === 'RECEIVED'">In Transit</span>
                                    </div>

                                    <!-- Received Step -->
                                    <div class="flex flex-col items-center gap-2">
                                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
                                             [class.bg-[var(--primary-color)]]="transfer.status === 'RECEIVED'"
                                             [class.bg-red-500]="transfer.status === 'CANCELLED'"
                                             [class.text-white]="transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED'"
                                             [class.bg-slate-200]="transfer.status !== 'RECEIVED' && transfer.status !== 'CANCELLED'"
                                             [class.dark:bg-slate-700]="transfer.status !== 'RECEIVED' && transfer.status !== 'CANCELLED'">
                                            @if (transfer.status === 'CANCELLED') {
                                                <span class="material-symbols-rounded text-[16px]">close</span>
                                            } @else {
                                                4
                                            }
                                        </div>
                                        <span class="text-xs font-bold" 
                                              [class.text-red-500]="transfer.status === 'CANCELLED'"
                                              [class.text-[var(--primary-color)]]="transfer.status === 'RECEIVED'"
                                        >
                                            {{ transfer.status === 'CANCELLED' ? 'Cancelled' : 'Received' }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    } @empty {
                        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-16 flex flex-col items-center justify-center opacity-50 text-slate-500">
                            <span class="material-symbols-rounded text-6xl mb-4 opacity-50">swap_horiz</span>
                            <span class="text-lg font-medium">No transfers found</span>
                            <span class="text-sm">Create a new transfer to move stock between locations</span>
                        </div>
                    }
                </div>
            }

            <!-- Low Stock Alerts View -->
            @if (viewMode() === 'REORDER') {
                <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-red-50/50 dark:bg-red-900/10">
                        <h3 class="font-bold flex items-center gap-2 text-red-700 dark:text-red-400">
                            <span class="material-symbols-rounded text-[18px] animate-pulse">warning</span> 
                            Critical Shortages & Reorder Suggestions
                        </h3>
                    </div>
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                            <tr>
                                <th class="p-4">Product</th>
                                <th class="p-4">Location</th>
                                <th class="p-4 text-right">Current</th>
                                <th class="p-4 text-right">Minimum</th>
                                <th class="p-4 text-right">Shortage</th>
                                <th class="p-4 text-right">Suggested Order</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            @for (alert of lowStockAlerts(); track alert.product_id + alert.location_id) {
                                <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                                    <td class="p-4 font-medium">{{ getProductName(alert.product_id) }}</td>
                                    <td class="p-4 opacity-60">{{ getLocationName(alert.location_id) }}</td>
                                    <td class="p-4 text-right font-mono text-red-600 font-bold">{{ alert.available_quantity }}</td>
                                    <td class="p-4 text-right font-mono opacity-60">{{ alert.reorder_rule?.minimum_quantity }}</td>
                                    <td class="p-4 text-right font-mono text-orange-600">
                                        {{ (alert.reorder_rule?.minimum_quantity || 0) - alert.available_quantity }}
                                    </td>
                                    <td class="p-4 text-right font-mono font-bold text-green-600">
                                        {{ alert.reorder_rule?.reorder_quantity }}
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="6" class="p-12 text-center opacity-50 italic">No low stock alerts</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
            
            <!-- Locations View -->
            @if (viewMode() === 'LOCATIONS') {
                <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                        <h3 class="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                            <span class="material-symbols-rounded text-emerald-500 text-[18px]">hub</span> 
                            Network Map & Node Capabilities
                        </h3>
                    </div>
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                            <tr>
                                <th class="p-4">Name</th>
                                <th class="p-4">Type</th>
                                <th class="p-4">Capabilities</th>
                                <th class="p-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            @for (location of locations(); track location.id) {
                                <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                                    <td class="p-4 font-bold">{{ location.name }}</td>
                                    <td class="p-4">
                                        <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide"
                                            [class.bg-blue-100]="location.location_type === 'STORE'"
                                            [class.text-blue-700]="location.location_type === 'STORE'"
                                            [class.bg-amber-100]="location.location_type === 'WAREHOUSE'"
                                            [class.text-amber-700]="location.location_type === 'WAREHOUSE'">
                                            {{ location.location_type }}
                                        </span>
                                    </td>
                                    <td class="p-4 text-slate-500 text-xs">
                                        <div class="flex gap-2">
                                            @if (location.allows_sales) {
                                                <span class="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                                                    <span class="material-symbols-rounded text-[14px]">point_of_sale</span> Sales
                                                </span>
                                            }
                                            @if (location.allows_receiving) {
                                                <span class="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                                                    <span class="material-symbols-rounded text-[14px]">local_shipping</span> Receiving
                                                </span>
                                            }
                                        </div>
                                    </td>
                                    <td class="p-4 text-right">
                                        <div class="flex justify-end gap-2">
                                            <button (click)="openEditLocationModal(location)" title="Edit Location" class="text-slate-400 hover:text-[var(--primary-color)] transition-colors">
                                                <span class="material-symbols-rounded text-sm">edit</span>
                                            </button>
                                            <button (click)="deleteLocation(location.id)" title="Delete Location" class="text-slate-400 hover:text-red-500 transition-colors">
                                                <span class="material-symbols-rounded text-sm">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="4" class="p-12 text-center opacity-50 italic">No locations found</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
        </div>

        <!-- Stock Adjustment Modal -->
        @if (showAdjustmentModal()) {
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-md p-6">
                    <h3 class="text-lg font-bold mb-4">Stock Adjustment</h3>
                    <form [formGroup]="adjustmentForm" (ngSubmit)="submitAdjustment()" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Product</label>
                            <select formControlName="product_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white">
                                <option value="" class="text-slate-900 dark:text-white">Select product...</option>
                                @for (product of products(); track product.id) {
                                    <option [value]="product.id" class="text-slate-900 dark:text-white">{{ product.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Location</label>
                            <select formControlName="location_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white">
                                <option value="" class="text-slate-900 dark:text-white">Select location...</option>
                                @for (loc of locations(); track loc.id) {
                                    <option [value]="loc.id" class="text-slate-900 dark:text-white">{{ loc.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Adjustment Type</label>
                            <select formControlName="movement_type" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white">
                                <option value="ADJUSTMENT_IN" class="text-slate-900 dark:text-white">Add Stock (+)</option>
                                <option value="ADJUSTMENT_OUT" class="text-slate-900 dark:text-white">Remove Stock (-)</option>
                                <option value="DAMAGE_WRITE_OFF" class="text-slate-900 dark:text-white">Damage Write-Off</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Quantity</label>
                            <input type="number" formControlName="quantity" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Reason</label>
                            <textarea formControlName="reason" rows="3" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2"></textarea>
                        </div>
                        <div class="flex gap-2 pt-4">
                            <button type="button" (click)="showAdjustmentModal.set(false)" class="flex-1 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium">Cancel</button>
                            <button type="submit" [disabled]="!adjustmentForm.valid" class="flex-1 py-2 bg-[var(--primary-color)] text-white rounded-lg font-bold disabled:opacity-50">Submit</button>
                        </div>
                    </form>
                </div>
            </div>
        }

        <!-- Transfer Modal -->
        @if (showTransferModal()) {
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-md p-6">
                    <h3 class="text-lg font-bold mb-4">New Stock Transfer</h3>
                    <form [formGroup]="transferForm" (ngSubmit)="submitTransfer()" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">From Location</label>
                                <select formControlName="from_location_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2">
                                    <option value="">Select source...</option>
                                    @for (loc of locations(); track loc.id) {
                                        <option [value]="loc.id">{{ loc.name }}</option>
                                    }
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">To Location</label>
                                <select formControlName="to_location_id" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2">
                                    <option value="">Select destination...</option>
                                    @for (loc of locations(); track loc.id) {
                                        <option [value]="loc.id">{{ loc.name }}</option>
                                    }
                                </select>
                            </div>
                        </div>

                        <!-- Transfer Items FormArray -->
                        <div class="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-800/20">
                            <div class="flex justify-between items-center mb-3">
                                <label class="block text-sm font-bold">Transfer Items</label>
                                <button type="button" (click)="addTransferItem()" class="text-xs font-bold text-[var(--primary-color)] flex items-center hover:opacity-80">
                                    <span class="material-symbols-rounded text-sm mr-1">add_circle</span> Add Item
                                </button>
                            </div>
                            <div formArrayName="items" class="space-y-3">
                                @for (item of transferItems.controls; track item; let i = $index) {
                                    <div [formGroupName]="i" class="flex gap-2 items-end">
                                        <div class="flex-1">
                                            <label class="block text-xs font-medium mb-1 opacity-70">Product</label>
                                            <select formControlName="product_id" class="w-full bg-white dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm">
                                                <option value="">Select product...</option>
                                                @for (product of products(); track product.id) {
                                                    <option [value]="product.id">{{ product.name }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="w-24">
                                            <label class="block text-xs font-medium mb-1 opacity-70">Qty</label>
                                            <input type="number" formControlName="quantity" class="w-full bg-white dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-center">
                                        </div>
                                        @if (transferItems.length > 1) {
                                            <button type="button" (click)="removeTransferItem(i)" class="p-2 text-slate-400 hover:text-red-500 transition-colors mb-[2px]">
                                                <span class="material-symbols-rounded text-[20px]">delete</span>
                                            </button>
                                        }
                                    </div>
                                }
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-1 mt-2">Notes</label>
                            <textarea formControlName="notes" rows="2" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2"></textarea>
                        </div>
                        <div class="flex gap-2 pt-2">
                            <button type="button" (click)="showTransferModal.set(false)" class="flex-1 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium">Cancel</button>
                            <button type="submit" [disabled]="!transferForm.valid" class="flex-1 py-2 bg-[var(--primary-color)] text-white rounded-lg font-bold disabled:opacity-50">Create Transfer</button>
                        </div>
                    </form>
                </div>
            </div>
        }

        <!-- Add Location Modal -->
        @if (showLocationModal()) {
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div class="bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-md p-6">
                    <h3 class="text-lg font-bold mb-4">Add New Location</h3>
                    <form [formGroup]="locationForm" (ngSubmit)="submitLocation()" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Location Name</label>
                            <input type="text" formControlName="name" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2" placeholder="e.g. Downtown Store">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Type</label>
                            <select formControlName="location_type" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2">
                                <option value="STORE">Store (Sales Point)</option>
                                <option value="WAREHOUSE">Warehouse (Storage)</option>
                                <option value="TRANSIT">Transit</option>
                            </select>
                        </div>
                        <div class="space-y-2 pt-2">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" formControlName="allows_sales" class="w-4 h-4 rounded border-slate-300 text-[var(--primary-color)]">
                                <span class="text-sm">Allow Sales (POS)</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" formControlName="allows_receiving" class="w-4 h-4 rounded border-slate-300 text-[var(--primary-color)]">
                                <span class="text-sm">Allow Receiving Stock</span>
                            </label>
                        </div>

                        <div class="flex gap-2 pt-4">
                            <button type="button" (click)="showLocationModal.set(false)" class="flex-1 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium">Cancel</button>
                            <button type="submit" [disabled]="!locationForm.valid" class="flex-1 py-2 bg-[var(--primary-color)] text-white rounded-lg font-bold disabled:opacity-50">Create Location</button>
                        </div>
                    </form>
                </div>
            </div>
        }
        
        <!-- Drawer: Deep Dive Movement History -->
        @if (showDrawer()) {
            <div class="fixed inset-0 z-[100] flex justify-end" (click)="closeDrawer()">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm transition-opacity duration-300"></div>
                
                <!-- Drawer Panel -->
                <div class="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col animate-in slide-in-from-right duration-300" (click)="$event.stopPropagation()">
                    
                    <!-- Drawer Header -->
                    <div class="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start bg-slate-50 dark:bg-slate-900/50">
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wider text-[var(--primary-color)] flex items-center gap-1 mb-1">
                                <span class="material-symbols-rounded text-[14px]">history</span> Ledger History
                            </div>
                            <h2 class="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                {{ getProductName(selectedDrawerProduct()?.productId || '') }}
                            </h2>
                            <p class="text-sm opacity-60 mt-1 flex items-center gap-1">
                                <span class="material-symbols-rounded text-[16px]">location_on</span>
                                {{ getLocationName(selectedDrawerProduct()?.locationId || '') }}
                            </p>
                        </div>
                        <button (click)="closeDrawer()" class="p-2 bg-slate-200 dark:bg-slate-800 rounded-full hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>

                    <!-- Drawer Content (Timeline) -->
                    <div class="flex-1 overflow-y-auto p-6 hide-scrollbar relative">
                         @if (drawerMovements().length === 0) {
                            <div class="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                                <span class="material-symbols-rounded text-4xl mb-2">history_toggle_off</span>
                                <p>No movements recorded.</p>
                            </div>
                         } @else {
                             <!-- Timeline connecting line -->
                            <div class="absolute left-[39px] top-6 bottom-6 w-px bg-slate-200 dark:bg-slate-700"></div>

                            <div class="space-y-6 relative">
                                @for (movement of drawerMovements(); track movement.id; let i = $index) {
                                    <div class="flex gap-4 group">
                                        <!-- Timeline Dot -->
                                        <div class="relative z-10 w-10 shrink-0 flex flex-col items-center">
                                            <div class="w-8 h-8 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-sm"
                                                 [class.bg-green-100]="movement.quantity > 0"
                                                 [class.text-green-600]="movement.quantity > 0"
                                                 [class.bg-red-100]="movement.quantity < 0"
                                                 [class.text-red-500]="movement.quantity < 0"
                                                 [class.bg-slate-100]="movement.quantity === 0"
                                                 [class.text-slate-500]="movement.quantity === 0">
                                                    @if (movement.quantity > 0) { <span class="material-symbols-rounded text-[16px]">add</span> }
                                                    @if (movement.quantity < 0) { <span class="material-symbols-rounded text-[16px]">remove</span> }
                                            </div>
                                        </div>
                                        
                                        <!-- Timeline Content -->
                                        <div class="flex-1 pb-6 relative top-1">
                                            <div class="flex justify-between items-start mb-1">
                                                <div class="flex items-center gap-2">
                                                    <span class="font-bold text-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                                        {{ movement.movement_type }}
                                                    </span>
                                                </div>
                                                <div class="text-right">
                                                    <span class="text-lg font-bold font-mono tracking-tight"
                                                          [class.text-green-600]="movement.quantity > 0"
                                                          [class.text-red-500]="movement.quantity < 0">
                                                        {{ movement.quantity > 0 ? '+' : '' }}{{ movement.quantity }}
                                                    </span>
                                                </div>
                                            </div>
                                            <p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{{ movement.created_at | date:'MMM d, y, h:mm a' }}</p>
                                            @if (movement.reason || movement.notes) {
                                                <p class="text-sm opacity-80 italic border-l-2 border-slate-300 dark:border-slate-600 pl-3 mt-2 text-slate-600 dark:text-slate-400">
                                                    {{ movement.reason || movement.notes }}
                                                </p>
                                            }
                                        </div>
                                    </div>
                                }
                            </div>
                         }
                    </div>
                </div>
            </div>
        }
    `,
    styles: []
})
export class StockManagerComponent implements OnInit {
    stockService = inject(StockManagementService);
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    dialog = inject(DialogService);
    fb = inject(FormBuilder);

    constructor() {
        // Reactive Data Loading: Automatically load locations when Store works
        effect(() => {
            const store = this.storeService.currentStore();
            if (store) {
                console.log('StockManager (Effect): Store changed, loading locations...', store.name);
                // Use untracked just in case, though not strictly needed for methods
                this.loadLocations();
                this.refreshStockLevels();
            }
        }, { allowSignalWrites: true });
    }

    viewMode = signal<ViewMode>('DASHBOARD');
    showAdjustmentModal = signal(false);
    showTransferModal = signal(false);
    showLocationModal = signal(false);
    editingLocation = signal<StockLocation | null>(null);
    selectedLocationId = '';

    // Advanced Drawer State
    showDrawer = signal(false);
    selectedDrawerProduct = signal<{ productId: string, locationId: string } | null>(null);

    private refreshTrigger = new BehaviorSubject<void>(undefined);

    // Data streams
    locations = signal<StockLocation[]>([]);

    private stockLevels$ = this.refreshTrigger.pipe(
        switchMap(() => {
            return this.stockService.getStockLevels(
                this.selectedLocationId || undefined
            ).pipe(
                map(levels => levels.filter(l => l.physical_quantity > 0)), // Hide empty locations
                retry(3),
                catchError(err => {
                    console.error('Failed to load stock levels', err);
                    return of([]);
                })
            );
        })
    );
    stockLevels = toSignal(this.stockLevels$, { initialValue: [] as StockLevel[] });

    private movements$ = this.refreshTrigger.pipe(
        switchMap(() => this.stockService.getMovements().pipe(
            retry(3),
            catchError(err => of([]))
        ))
    );
    movements = toSignal(this.movements$, { initialValue: [] as StockMovement[] });

    // Drawer Computed
    drawerMovements = computed(() => {
        const selection = this.selectedDrawerProduct();
        if (!selection) return [];
        return this.movements()
            .filter(m => m.product_id === selection.productId && m.location_id === selection.locationId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // newest first
    });

    private transfers$ = this.refreshTrigger.pipe(
        switchMap(() => this.stockService.getTransfers().pipe(
            retry(3),
            catchError(err => of([]))
        ))
    );
    transfers = toSignal(this.transfers$, { initialValue: [] as StockTransfer[] });

    private lowStockAlerts$ = this.refreshTrigger.pipe(
        switchMap(() => this.stockService.getLowStockItems().pipe(
            retry(3),
            catchError(err => of([]))
        ))
    );
    lowStockAlerts = toSignal(this.lowStockAlerts$, { initialValue: [] as any[] });

    private products$ = this.storeService.currentStore$.pipe(
        switchMap(store => store ? this.supabase.getProducts(store.id).pipe(
            retry(3),
            catchError(err => {
                console.error('Failed to load products', err);
                return of([]);
            })
        ) : of([]))
    );
    products = toSignal(this.products$, { initialValue: [] as Product[] });

    // Computed Dashboard Metrics
    totalInventoryValue = computed(() => {
        const levels = this.stockLevels() as any[];
        const prods = this.products();
        return levels.reduce((acc: number, level: any) => {
            const product = prods.find(p => p.id === level.product_id);
            return acc + ((level.physical_quantity || 0) * (product?.price || 0));
        }, 0);
    });

    activeTransfersCount = computed(() => {
        return this.transfers().filter(t => t.status === 'PENDING' || t.status === 'APPROVED' || t.status === 'IN_TRANSIT').length;
    });

    // AG Grid Setup
    private gridApi!: GridApi;
    isDarkMode = signal(document.documentElement.classList.contains('dark'));

    columnDefs: ColDef[] = [
        {
            headerName: 'Product',
            valueGetter: (p) => this.getProductName(p.data.product_id),
            filter: true,
            flex: 2,
            minWidth: 200
        },
        {
            headerName: 'Location',
            valueGetter: (p) => this.getLocationName(p.data.location_id),
            filter: true,
            flex: 1,
            minWidth: 150
        },
        {
            headerName: 'Available',
            valueGetter: params => params.data.available_quantity,
            type: 'numericColumn',
            sortable: true,
            filter: 'agNumberColumnFilter',
            cellClassRules: {
                'text-red-600 font-bold': params => params.value < 5,
                'text-green-600 font-bold': params => params.value >= 20
            }
        },
        { headerName: 'Reserved', valueGetter: params => params.data.reserved_quantity || 0, type: 'numericColumn', flex: 1 },
        { headerName: 'Damaged', valueGetter: params => params.data.damaged_quantity || 0, type: 'numericColumn', cellClass: 'text-orange-600', flex: 1 },
        { headerName: 'Physical', valueGetter: params => params.data.physical_quantity, type: 'numericColumn', sortable: true, flex: 1, cellClass: 'font-bold' },
        {
            headerName: 'Value',
            valueGetter: (params) => {
                const product = this.products().find(p => p.id === params.data.product_id);
                const qty = params.data.physical_quantity || 0;
                return qty * (product?.price || 0);
            },
            valueFormatter: (p) => {
                const currency = this.storeService.currency();
                try {
                    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(p.value);
                } catch (e) {
                    return currency + ' ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.value);
                }
            },
            type: 'numericColumn',
            flex: 1
        },
        {
            headerName: 'Actions',
            width: 100,
            cellRenderer: () => '<div class="flex justify-end items-center h-full"><span class="material-symbols-rounded text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer">history</span></div>',
            cellClass: 'flex items-center justify-center',
            pinned: 'right',
            sortable: false,
            filter: false
        }
    ];

    defaultColDef: ColDef = { sortable: true, filter: true, resizable: true };

    onGridReady(params: GridReadyEvent) { this.gridApi = params.api; }
    onQuickFilterChanged(event: any) { this.gridApi.setGridOption('quickFilterText', event.target.value); }
    onCellClicked(event: CellClickedEvent) { if (event.colDef.headerName === 'Actions') this.viewMovementHistory(event.data.product_id, event.data.location_id); }

    // Forms
    adjustmentForm = this.fb.group({
        product_id: ['', Validators.required],
        location_id: ['', Validators.required],
        movement_type: ['ADJUSTMENT_IN', Validators.required],
        quantity: [0, [Validators.required, Validators.min(1)]],
        reason: ['', Validators.required]
    });

    transferForm = this.fb.group({
        from_location_id: ['', Validators.required],
        to_location_id: ['', Validators.required],
        notes: [''],
        items: this.fb.array([
            this.createTransferItem()
        ], Validators.required)
    });

    get transferItems() {
        return this.transferForm.get('items') as any; // any to bypass strict type checking for FormArray
    }

    createTransferItem() {
        return this.fb.group({
            product_id: ['', Validators.required],
            quantity: [1, [Validators.required, Validators.min(1)]]
        });
    }

    addTransferItem() {
        this.transferItems.push(this.createTransferItem());
    }

    removeTransferItem(index: number) {
        if (this.transferItems.length > 1) {
            this.transferItems.removeAt(index);
        }
    }

    locationForm = this.fb.group({
        name: ['', Validators.required],
        location_type: ['STORE', Validators.required],
        allows_sales: [true],
        allows_receiving: [true]
    });

    ngOnInit() { }

    refreshStockLevels() { this.refreshTrigger.next(); }

    refreshAll() {
        this.supabase.fetchAllData();
        this.loadLocations();
        this.refreshStockLevels();
    }

    loadLocations() {
        this.stockService.getLocations().pipe(
            retry(3),
            catchError(err => {
                console.error('Failed to load locations', err);
                return of([]);
            })
        ).subscribe(data => this.locations.set(data));
    }

    openAdjustmentModal() {
        this.loadLocations();
        this.refreshStockLevels();
        this.showAdjustmentModal.set(true);
    }

    openTransferModal() {
        this.loadLocations();
        this.refreshStockLevels();
        this.showTransferModal.set(true);
    }

    openEditLocationModal(location: StockLocation) {
        this.editingLocation.set(location);
        this.locationForm.patchValue({
            name: location.name,
            location_type: location.location_type,
            allows_sales: location.allows_sales,
            allows_receiving: location.allows_receiving
        });
        this.showLocationModal.set(true);
    }

    deleteLocation(locationId: string) {
        if (confirm('Are you sure you want to delete this location?')) {
            this.stockService.getStockLevels(locationId).subscribe(levels => {
                const totalStock = levels.reduce((acc, l) => acc + (l.available_quantity || 0), 0);
                if (totalStock > 0) {
                    this.dialog.alert('Cannot Delete', 'This location still has items in stock.');
                    return;
                }
                this.stockService.deleteLocation(locationId).subscribe({
                    next: () => {
                        this.dialog.alert('Success', 'Location deleted');
                        this.loadLocations();
                    },
                    error: (err) => this.dialog.alert('Error', err.message)
                });
            });
        }
    }

    getProductName(productId: string): string {
        return this.products().find(p => p.id === productId)?.name || 'Unknown';
    }

    getLocationName(locationId: string): string {
        return this.locations().find(l => l.id === locationId)?.name || 'Unknown';
    }

    getMovementTypeClass(type: MovementType): string {
        const classes: Record<string, string> = {
            'SALE': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            'PURCHASE_RECEIVE': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            'TRANSFER_IN': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            'TRANSFER_OUT': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            'ADJUSTMENT_IN': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            'ADJUSTMENT_OUT': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
            'DAMAGE_WRITE_OFF': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        };
        return classes[type] || 'bg-slate-100 text-slate-700';
    }

    getTransferStatusClass(status: string): string {
        const classes: Record<string, string> = {
            'PENDING': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            'APPROVED': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            'IN_TRANSIT': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            'RECEIVED': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            'CANCELLED': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        };
        return classes[status] || 'bg-slate-100 text-slate-700';
    }

    submitAdjustment() {
        if (!this.adjustmentForm.valid) return;
        const formValue = this.adjustmentForm.value;
        const quantity = formValue.movement_type === 'ADJUSTMENT_IN' ? Math.abs(formValue.quantity!) : -Math.abs(formValue.quantity!);

        // Validation for ADJUSTMENT_OUT
        if (formValue.movement_type === 'ADJUSTMENT_OUT' || formValue.movement_type === 'DAMAGE_WRITE_OFF') {
            const currentLevel = this.stockLevels().find(l => l.product_id === formValue.product_id && l.location_id === formValue.location_id);
            const available = currentLevel?.available_quantity || 0;
            if (Math.abs(quantity) > available) {
                this.dialog.alert('Insufficient Stock', `You are trying to remove ${Math.abs(quantity)} units, but only ${available} are available at this location.`);
                return;
            }
        }

        this.stockService.createMovement({
            movement_type: formValue.movement_type as MovementType,
            product_id: formValue.product_id!,
            location_id: formValue.location_id!,
            quantity: quantity,
            reason: formValue.reason!,
            performed_by: '00000000-0000-0000-0000-000000000000'
        }).subscribe({
            next: () => {
                this.dialog.alert('Success', 'Adjustment recorded');
                this.showAdjustmentModal.set(false);
                this.adjustmentForm.reset({ movement_type: 'ADJUSTMENT_IN', quantity: 0 });
                this.refreshStockLevels();
            },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }

    submitTransfer() {
        if (!this.transferForm.valid) return;
        const formValue = this.transferForm.value;

        // Ensure from and to locations are different
        if (formValue.from_location_id === formValue.to_location_id) {
            this.dialog.alert('Invalid Transfer', 'Source and destination locations cannot be the same.');
            return;
        }

        // Validate stock availability for each item
        const items = formValue.items as any[];
        for (const item of items) {
            const currentLevel = this.stockLevels().find(l => l.product_id === item.product_id && l.location_id === formValue.from_location_id);
            const available = currentLevel?.available_quantity || 0;
            if (item.quantity > available) {
                const productName = this.getProductName(item.product_id);
                this.dialog.alert('Insufficient Stock', `Not enough stock for ${productName}. Requested: ${item.quantity}, Available: ${available} at source location.`);
                return;
            }
        }

        this.stockService.createTransfer({
            from_location_id: formValue.from_location_id!,
            to_location_id: formValue.to_location_id!,
            requested_by: '00000000-0000-0000-0000-000000000000',
            items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
            notes: formValue.notes || undefined
        }).subscribe({
            next: () => {
                this.dialog.alert('Success', 'Transfer created successfully');
                this.showTransferModal.set(false);
                this.transferForm.reset();
                this.transferForm.setControl('items', this.fb.array([this.createTransferItem()]));
                this.refreshAll();
            },
            error: (err) => this.dialog.alert('Error', err.message || 'Failed to create transfer')
        });
    }

    submitLocation() {
        if (!this.locationForm.valid) return;
        const store = this.storeService.currentStore();
        if (!store) return;
        const formValue = this.locationForm.value;
        const editing = this.editingLocation();

        if (editing) {
            this.stockService.updateLocation(editing.id, {
                name: formValue.name!,
                location_type: formValue.location_type as any,
                allows_sales: formValue.allows_sales!,
                allows_receiving: formValue.allows_receiving!
            }).subscribe({
                next: () => {
                    this.dialog.alert('Success', 'Location updated');
                    this.showLocationModal.set(false);
                    this.editingLocation.set(null);
                    this.loadLocations();
                },
                error: (err) => this.dialog.alert('Error', err.message)
            });
        } else {
            this.stockService.createLocation({
                store_id: store.id,
                name: formValue.name!,
                location_type: formValue.location_type as any,
                allows_sales: formValue.allows_sales!,
                allows_receiving: formValue.allows_receiving!,
                is_active: true
            }).subscribe({
                next: () => {
                    this.dialog.alert('Success', 'Location created');
                    this.showLocationModal.set(false);
                    this.locationForm.reset({ name: '', location_type: 'STORE', allows_sales: true, allows_receiving: true });
                    this.loadLocations();
                },
                error: (err) => this.dialog.alert('Error', err.message)
            });
        }
    }

    approveTransfer(transferId: string) {
        // Optimistic UI Update: instantly jump to Approved visually
        const previousTransfers = this.transfers();
        this.stockService.overrideTransfers(
            previousTransfers.map(t => t.id === transferId ? { ...t, status: 'APPROVED' } : t)
        );

        this.stockService.approveTransfer(transferId, '00000000-0000-0000-0000-000000000000').subscribe({
            next: () => {
                // Success: already optimistic, just refresh underlying stock
                this.refreshStockLevels();
            },
            error: (err) => {
                // Revert on failure
                this.stockService.overrideTransfers(previousTransfers);
                this.dialog.alert('Error', err.message);
            }
        });
    }

    shipTransfer(transferId: string) {
        // Optimistic UI Update
        const previousTransfers = this.transfers();
        this.stockService.overrideTransfers(
            previousTransfers.map(t => t.id === transferId ? { ...t, status: 'IN_TRANSIT' } : t)
        );

        this.stockService.shipTransfer(transferId, '00000000-0000-0000-0000-000000000000').subscribe({
            next: () => { this.refreshStockLevels(); },
            error: (err) => {
                this.stockService.overrideTransfers(previousTransfers);
                this.dialog.alert('Error', err.message);
            }
        });
    }

    receiveTransfer(transferId: string) {
        // Optimistic UI Update
        const previousTransfers = this.transfers();
        this.stockService.overrideTransfers(
            previousTransfers.map(t => t.id === transferId ? { ...t, status: 'RECEIVED' } : t)
        );

        this.stockService.receiveTransfer(transferId, '00000000-0000-0000-0000-000000000000').subscribe({
            next: () => { this.refreshStockLevels(); },
            error: (err) => {
                this.stockService.overrideTransfers(previousTransfers);
                this.dialog.alert('Error', err.message);
            }
        });
    }

    viewMovementHistory(productId: string, locationId: string) {
        this.selectedDrawerProduct.set({ productId, locationId });
        this.showDrawer.set(true);
    }

    closeDrawer() {
        this.showDrawer.set(false);
        setTimeout(() => this.selectedDrawerProduct.set(null), 300); // wait for anim
    }
}
