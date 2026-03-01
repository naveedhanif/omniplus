import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, BehaviorSubject, retry, catchError, tap, map, combineLatest, Subject } from 'rxjs';
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

type ViewMode = 'DASHBOARD' | 'LEVELS' | 'MOVEMENTS' | 'TRANSFERS' | 'REORDER' | 'LOCATIONS' | 'CONSIGNMENTS';
type DateFilter = 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

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
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

            /* Premium Glass Drawer Styles */
            .glass-drawer {
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(20px);
                border-left: 1px solid rgba(255, 255, 255, 0.3);
            }
            .dark .glass-drawer {
                background: rgba(15, 23, 42, 0.85);
                border-left: 1px solid rgba(51, 65, 85, 0.5);
            }
            .glass-input {
                background: rgba(255, 255, 255, 0.5);
                border: 1px solid rgba(203, 213, 225, 0.5);
                transition: all 0.2s ease;
            }
            .dark .glass-input {
                background: rgba(30, 41, 59, 0.4);
                border: 1px solid rgba(51, 65, 85, 0.5);
            }
            .glass-input:focus {
                background: rgba(255, 255, 255, 0.9);
                border-color: var(--primary-color);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
            }
            .dark .glass-input:focus {
                background: rgba(30, 41, 59, 0.8);
            }
            
            .premium-gradient-btn {
                background: linear-gradient(135deg, var(--primary-color), #4f46e5);
                box-shadow: 0 4px 15px -3px rgba(79, 70, 229, 0.4);
            }
            .premium-gradient-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.5);
            }
        </style>
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex justify-between items-end mb-2">
                <div>
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-tighter mb-2 border border-blue-100 dark:border-blue-800/30">
                        <span class="relative flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        Enterprise Inventory System
                    </div>
                    <h2 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Stock Management</h2>
                    <p class="text-slate-500 text-sm mt-1">Audit-ready inventory tracking & supply chain orchestration</p>
                </div>
                <div class="flex items-center gap-3">
                    <button 
                        (click)="refreshAll()"
                        class="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all text-slate-500 hover:text-[var(--primary-color)] active:scale-95"
                        title="Refresh Intelligence">
                        <span class="material-symbols-rounded">refresh</span>
                    </button>
                    <div class="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
                    
                    <!-- Premium Date Filter Selector -->
                    <div class="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-all">
                        <div class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-all">
                            <span class="material-symbols-rounded text-slate-400 text-[18px]">calendar_today</span>
                            <select 
                                [ngModel]="dateFilter()" 
                                (ngModelChange)="dateFilter.set($event)"
                                class="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer outline-none">
                                <option value="ALL">All Time</option>
                                <option value="DAILY">Today</option>
                                <option value="WEEKLY">This Week</option>
                                <option value="MONTHLY">This Month</option>
                                <option value="YEARLY">This Year</option>
                                <option value="CUSTOM">Custom Range</option>
                            </select>
                        </div>

                        <!-- Custom Date Range Inputs (Only if CUSTOM selected) -->
                        @if (dateFilter() === 'CUSTOM') {
                            <div class="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-200 ml-1 border-l border-slate-200 dark:border-slate-700 pl-2">
                                <input type="date" 
                                    [ngModel]="customStartDate()" 
                                    (ngModelChange)="customStartDate.set($event)"
                                    class="bg-transparent border-none text-[10px] font-bold text-[var(--primary-color)] focus:ring-0 p-0 outline-none w-24">
                                <span class="text-slate-300 text-[10px] font-bold">to</span>
                                <input type="date" 
                                    [ngModel]="customEndDate()" 
                                    (ngModelChange)="customEndDate.set($event)"
                                    class="bg-transparent border-none text-[10px] font-bold text-[var(--primary-color)] focus:ring-0 p-0 outline-none w-24">
                            </div>
                        }
                    </div>

                    <div class="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                    <button 
                        (click)="openCommand('ADJUST')"
                        class="premium-gradient-btn pl-4 pr-6 py-3 text-white rounded-2xl font-black text-sm transition-all flex items-center gap-2">
                        <span class="material-symbols-rounded">inventory_2</span> 
                        Operations Hub
                    </button>
                </div>
            </div>

            <!-- 🎨 COMMAND CENTER: Bento Box Dashboard -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
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

                <!-- Card 4: Inbound Consignments (New) -->
                <div class="relative overflow-hidden bg-[var(--card-bg)] rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 dark:border-slate-700 p-5 group cursor-pointer transition-all duration-300 hover:-translate-y-1"
                     (click)="viewMode.set('CONSIGNMENTS')">
                    <div class="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/5 dark:bg-amber-500/10 blur-2xl rounded-full transition-colors group-hover:bg-amber-500/20"></div>
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                            <span class="material-symbols-rounded">downloading</span>
                        </div>
                        @if (pendingConsignmentsCount() > 0) {
                            <span class="px-2 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-black rounded-full shadow-sm animate-bounce">
                                {{ pendingConsignmentsCount() }} Pending
                            </span>
                        }
                    </div>
                    <div class="relative z-10">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Incoming Consignments</div>
                        <div class="text-3xl font-extrabold tracking-tight">{{ pendingConsignmentsCount() }}</div>
                        <div class="text-[10px] opacity-60 mt-1">Purchase orders awaiting receipt</div>
                    </div>
                </div>

                <!-- Card 5 (Action): Stock Adjustment -->
                <div (click)="openCommand('ADJUST')"
                     class="group relative overflow-hidden bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-5 shadow-lg shadow-blue-500/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <div class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="flex justify-between items-start relative z-10 mb-6">
                        <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center">
                            <span class="material-symbols-rounded">box_edit</span>
                        </div>
                        <span class="material-symbols-rounded text-white/40 group-hover:text-white transition-colors">arrow_forward_ios</span>
                    </div>
                    <div class="relative z-10 text-white">
                        <div class="text-[10px] font-black uppercase tracking-widest opacity-80">Inventory Action</div>
                        <div class="text-xl font-black">Adjust Stock</div>
                        <div class="text-xs opacity-70 mt-1 font-medium">Corrections & Damages</div>
                    </div>
                </div>

                <!-- Card 6 (Action): Rapid Transfer -->
                <div (click)="openCommand('TRANSFER')"
                     class="group relative overflow-hidden bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-5 shadow-lg shadow-purple-500/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <div class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="flex justify-between items-start relative z-10 mb-6">
                        <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center">
                            <span class="material-symbols-rounded">move_item</span>
                        </div>
                        <span class="material-symbols-rounded text-white/40 group-hover:text-white transition-colors">arrow_forward_ios</span>
                    </div>
                    <div class="relative z-10 text-white">
                        <div class="text-[10px] font-black uppercase tracking-widest opacity-80">Logistics Flow</div>
                        <div class="text-xl font-black">Inter-Store Transfer</div>
                        <div class="text-xs opacity-70 mt-1 font-medium">Rebalance Inventory</div>
                    </div>
                </div>

                <!-- Card 7 (Action): Manage Nodes -->
                <div (click)="openCommand('LOCATIONS')"
                     class="group relative overflow-hidden bg-[var(--card-bg)] rounded-2xl p-5 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-all">
                    <div class="flex flex-col items-center justify-center h-full gap-2 py-2">
                        <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 flex items-center justify-center transition-all">
                            <span class="material-symbols-rounded text-2xl">add_location_alt</span>
                        </div>
                        <div class="text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">Manage Locations</div>
                    </div>
                </div>

                <!-- Card 8 (Action): Stock Receipt -->
                <div (click)="openCommand('RECEIVE')"
                     class="group relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 shadow-lg shadow-amber-500/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <div class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="flex justify-between items-start relative z-10 mb-6">
                        <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center">
                            <span class="material-symbols-rounded">download_for_offline</span>
                        </div>
                        <span class="material-symbols-rounded text-white/40 group-hover:text-white transition-colors">arrow_forward_ios</span>
                    </div>
                    <div class="relative z-10 text-white">
                        <div class="text-[10px] font-black uppercase tracking-widest opacity-80">Procurement</div>
                        <div class="text-xl font-black">Stock Receipt</div>
                        <div class="text-xs opacity-70 mt-1 font-medium">Receive Inbound POs</div>
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
                <div class="w-px bg-slate-200 dark:bg-slate-700 my-2 mx-1"></div>
                <button 
                    (click)="viewMode.set('CONSIGNMENTS')"
                    [class]="viewMode() === 'CONSIGNMENTS' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                    class="px-5 py-2 text-sm rounded-lg transition-all flex items-center gap-2">
                    <span class="material-symbols-rounded text-amber-500 text-[18px]">downloading</span>
                    Inbound Queue
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
                                @if (dateFilter() !== 'ALL') {
                                    <span class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded text-[9px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-left-2">
                                        Active in {{ dateFilter() === 'CUSTOM' ? 'Range' : dateFilter() }}
                                    </span>
                                }
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
                                [rowData]="filteredStockLevels()"
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
                                @if (filteredTransfers().length > 0) {
                                    <div class="my-4 border-t border-slate-100 dark:border-slate-800"></div>
                                    @for (t of filteredTransfers().slice(0, 3); track t.id) {
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

            <!-- Movements History View -->
            @if (viewMode() === 'MOVEMENTS') {
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    <div class="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                        <div>
                            <h3 class="font-bold text-xl flex items-center gap-2">
                                <span class="material-symbols-rounded text-indigo-500 bg-indigo-500/10 p-1.5 rounded-lg text-[20px]">manage_search</span> 
                                Official Movement Ledger
                            </h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-10">Permanent audit trail of all physical quantity changes</p>
                        </div>
                        <button class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-2">
                            <span class="material-symbols-rounded text-[18px]">download</span> Export CSV
                        </button>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm align-middle">
                            <thead class="bg-slate-50 dark:bg-slate-800/40 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-widest text-[10px]">
                                <tr>
                                    <th class="px-6 py-4">Date & Time</th>
                                    <th class="px-6 py-4">Transaction Type</th>
                                    <th class="px-6 py-4">Product</th>
                                    <th class="px-6 py-4">Location</th>
                                    <th class="px-6 py-4 text-right">Qty Change</th>
                                    <th class="px-6 py-4">Details / Reason</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                                @for (movement of filteredMovements(); track movement.id) {
                                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="font-medium text-slate-900 dark:text-slate-100">{{ movement.created_at | date:'MMM d, yyyy' }}</div>
                                            <div class="text-xs text-slate-500">{{ movement.created_at | date:'h:mm a' }}</div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border"
                                                  [class]="getMovementTypeClass(movement.movement_type)">
                                                <span class="material-symbols-rounded text-[14px]">{{ getMovementTypeIcon(movement.movement_type) }}</span>
                                                {{ formatMovementType(movement.movement_type) }}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="font-bold">{{ getProductName(movement.product_id) }}</div>
                                            <div class="text-[10px] text-slate-400 font-mono tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">ID: {{ movement.product_id.substring(0,8) }}</div>
                                        </td>
                                        <td class="px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">
                                            <span class="flex items-center gap-1.5"><span class="material-symbols-rounded text-[16px] opacity-40">location_on</span> {{ getLocationName(movement.location_id) }}</span>
                                        </td>
                                        <td class="px-6 py-4 text-right font-mono text-base whitespace-nowrap">
                                            <div class="inline-flex items-center justify-end font-black drop-shadow-sm"
                                                [class.text-emerald-600]="movement.quantity > 0"
                                                [class.dark:text-emerald-400]="movement.quantity > 0"
                                                [class.text-red-500]="movement.quantity < 0"
                                                [class.text-slate-400]="movement.quantity === 0">
                                                {{ movement.quantity > 0 ? '+' : '' }}{{ movement.quantity }}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 max-w-xs">
                                            <div class="truncate font-medium">{{ formatMovementReason(movement) }}</div>
                                            @if(movement.notes) {
                                                <div class="text-xs opacity-70 truncate" title="{{ formatMovementNotes(movement) }}">{{ formatMovementNotes(movement) }}</div>
                                            }
                                        </td>
                                    </tr>
                                } @empty {
                                    <tr>
                                        <td colspan="6" class="p-16 text-center">
                                            <div class="flex flex-col items-center justify-center opacity-40">
                                                <span class="material-symbols-rounded text-6xl mb-4">history_toggle_off</span>
                                                <h3 class="text-lg font-bold">No Movement History</h3>
                                                <p class="text-sm mt-1">There have been no stock changes recorded yet.</p>
                                            </div>
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            }

            <!-- Transfers View -->
            @if (viewMode() === 'TRANSFERS') {
                <div class="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    @for (transfer of filteredTransfers(); track transfer.id) {
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

            <!-- Consignments Inbound Queue View (New) -->
            @if (viewMode() === 'CONSIGNMENTS') {
                <div class="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10 flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <h3 class="font-bold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                <span class="material-symbols-rounded text-[18px]">downloading</span> 
                                Procurement Inbound Queue
                            </h3>
                            @if (isRefreshingPOs()) {
                                <div class="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded-full animate-pulse">
                                    <div class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce"></div>
                                    <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tighter">Syncing...</span>
                                </div>
                            }
                        </div>
                        <button 
                            (click)="refreshInboundQueue()"
                            [disabled]="isRefreshingPOs()"
                            class="p-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 transition-all active:scale-95 disabled:opacity-50">
                            <span class="material-symbols-rounded text-[18px]" [class.animate-spin]="isRefreshingPOs()">refresh</span>
                        </button>
                    </div>
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                            <tr>
                                <th class="p-4">Reference</th>
                                <th class="p-4">Supplier</th>
                                <th class="p-4">Status</th>
                                <th class="p-4 text-center">Qty</th>
                                <th class="p-4 text-right">Value</th>
                                <th class="p-4">Ordered On</th>
                                <th class="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            @for (po of purchaseOrders(); track po.id) {
                                <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group">
                                    <td class="p-4 font-mono font-bold text-xs">PO-{{ po.id.substring(0,8).toUpperCase() }}</td>
                                    <td class="p-4">{{ po.supplier?.name || po.supplier_id }}</td>
                                    <td class="p-4">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-current"
                                            [class]="po.status === 'PARTIAL' ? 'text-orange-500' : 
                                                     po.status === 'RECEIVED' ? 'text-emerald-500' :
                                                     po.status === 'DRAFT' ? 'text-slate-400' : 'text-blue-500'">
                                            {{ po.status }}
                                        </span>
                                    </td>
                                    <td class="p-4 text-center">
                                        <div class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg font-mono font-bold text-xs inline-block min-w-[32px]">
                                            {{ po.total_quantity || 0 }}
                                        </div>
                                    </td>
                                    <td class="p-4 text-right font-bold">{{ po.total_amount | currency:storeService.currency() }}</td>
                                    <td class="p-4 opacity-60 text-xs">{{ po.created_at | date:'MMM d, y' }}</td>
                                    <td class="p-4 text-right">
                                        @if (po.status !== 'RECEIVED' && po.status !== 'CANCELLED') {
                                            <button 
                                                (click)="receivePOFromInventory(po)"
                                                class="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 shadow-sm transition-all flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100">
                                                <span class="material-symbols-rounded text-sm">download_for_offline</span> Receive
                                            </button>
                                        } @else {
                                            <div class="text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1 font-bold text-xs">
                                                <span class="material-symbols-rounded text-sm">check_circle</span> Processed
                                            </div>
                                        }
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="6" class="p-20 text-center flex flex-col items-center justify-center gap-4 text-slate-400">
                                        <div class="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                                            @if (isRefreshingPOs()) {
                                                <span class="material-symbols-rounded text-4xl opacity-50 animate-spin text-amber-500">progress_activity</span>
                                            } @else {
                                                <span class="material-symbols-rounded text-4xl opacity-20">inventory</span>
                                            }
                                        </div>
                                        <div>
                                            <p class="text-base font-bold text-slate-900 dark:text-white mb-1">
                                                {{ isRefreshingPOs() ? 'Syncing Consignments...' : 'Queue is Empty' }}
                                            </p>
                                            <p class="text-sm">
                                                {{ isRefreshingPOs() ? 'Retrieving latest procurement data from ALDeem store...' : 'No incoming consignments are currently pending receipt.' }}
                                            </p>
                                            @if (!isRefreshingPOs()) {
                                                <button (click)="refreshInboundQueue()" class="mt-4 px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold hover:scale-105 active:scale-95 transition-all">
                                                    Check for Updates
                                                </button>
                                            }
                                        </div>
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
        </div>

        <!-- 🛠️ INVENTORY COMMAND CENTER (Premium Drawer) -->
        @if (showCommandCenter()) {
            <div class="fixed inset-0 z-[110] flex justify-end" (click)="closeCommandCenter()">
                <!-- Ultra-premium Backdrop -->
                <div class="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-md transition-all duration-500 animate-in fade-in"></div>
                
                <!-- The Command Drawer -->
                <div class="relative w-full max-w-lg h-full glass-drawer shadow-[-20px_0_50px_rgba(0,0,0,0.2)] dark:shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-500" 
                     (click)="$event.stopPropagation()">
                    
                    <!-- Drawer Header -->
                    <div class="p-8 border-b border-slate-200 dark:border-slate-800 relative overflow-hidden">
                        <!-- Content -->
                        <div class="relative z-10 flex justify-between items-start">
                            <div>
                                <h2 class="text-2xl font-black text-slate-900 dark:text-white leading-tight">
                                    @if (activeCommand() === 'ADJUST') { Stock Correction }
                                    @if (activeCommand() === 'TRANSFER') { Logistics Transfer }
                                    @if (activeCommand() === 'LOCATIONS') { Node Management }
                                    @if (activeCommand() === 'RECEIVE') { Procurement Receipt }
                                </h2>
                                <p class="text-sm text-slate-500 font-medium mt-1">
                                    @if (activeCommand() === 'ADJUST') { Adjust physical counts and log discrepancies }
                                    @if (activeCommand() === 'TRANSFER') { Movement of assets between registered locations }
                                    @if (activeCommand() === 'LOCATIONS') { Configure storage nodes and sales points }
                                    @if (activeCommand() === 'RECEIVE') { Process incoming stock from purchase orders }
                                </p>
                            </div>
                            <button (click)="closeCommandCenter()" class="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-90 text-slate-500">
                                <span class="material-symbols-rounded">close</span>
                            </button>
                        </div>
                    </div>

                    <!-- Scrollable Form Area -->
                    <div class="flex-1 overflow-y-auto p-8 hide-scrollbar">
                        
                        <!-- 1. ADJUSTMENT FORM -->
                        @if (activeCommand() === 'ADJUST') {
                            <form [formGroup]="adjustmentForm" (ngSubmit)="submitAdjustment()" class="space-y-6">
                                <div class="p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 space-y-4">
                                    <div>
                                        <label class="block text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">Target Asset</label>
                                        <select formControlName="product_id" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                            <option value="">Search or select product...</option>
                                            @for (product of products(); track product.id) {
                                                <option [value]="product.id">{{ product.name }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">Location Node</label>
                                        <select formControlName="location_id" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                            <option value="">Select storage location...</option>
                                            @for (loc of locations(); track loc.id) {
                                                <option [value]="loc.id">{{ loc.name }}</option>
                                            }
                                        </select>
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Correction Type</label>
                                        <select formControlName="movement_type" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                            <option value="ADJUSTMENT_IN">Inward (+)</option>
                                            <option value="ADJUSTMENT_OUT">Outward (-)</option>
                                            <option value="DAMAGE_WRITE_OFF">Damage/Loss</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Quantity</label>
                                        <input type="number" formControlName="quantity" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold text-center" placeholder="0">
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Reasoning & Audit Note</label>
                                    <textarea formControlName="reason" rows="4" class="w-full glass-input rounded-xl px-4 py-3 text-sm" placeholder="Explain why this adjustment is being made..."></textarea>
                                </div>

                                <div class="pt-4">
                                    <button type="submit" [disabled]="!adjustmentForm.valid" class="w-full py-4 premium-gradient-btn text-white rounded-2xl font-black shadow-lg disabled:opacity-30 disabled:grayscale transition-all active:scale-[0.98]">
                                        Confirm Inventory Update
                                    </button>
                                </div>
                            </form>
                        }

                        <!-- 2. TRANSFER FORM -->
                        @if (activeCommand() === 'TRANSFER') {
                            <form [formGroup]="transferForm" (ngSubmit)="submitTransfer()" class="space-y-6">
                                <!-- Visualization Map -->
                                <div class="relative p-6 bg-slate-100/50 dark:bg-slate-800/40 rounded-3xl border border-slate-200 dark:border-slate-700 mb-8 overflow-hidden">
                                    <div class="flex items-center justify-between gap-4 relative z-10">
                                        <!-- Source Identity -->
                                        <div class="flex-1 text-center">
                                            <div class="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-2">Source Node</div>
                                            <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[80px] flex flex-col items-center justify-center gap-1 transition-all">
                                                @if (transferSource()) {
                                                    <span class="material-symbols-rounded text-slate-400">
                                                        {{ transferSource()?.location_type === 'WAREHOUSE' ? 'warehouse' : 'storefront' }}
                                                    </span>
                                                    <span class="text-xs font-black leading-tight">{{ transferSource()?.name }}</span>
                                                    <span class="text-[9px] font-bold uppercase tracking-widest opacity-50">{{ transferSource()?.location_type }}</span>
                                                } @else {
                                                    <span class="text-xs font-bold text-slate-300">Set Origin</span>
                                                }
                                            </div>
                                        </div>

                                        <div class="pt-4 flex flex-col items-center gap-1">
                                            <span class="material-symbols-rounded text-blue-500 animate-pulse">forward</span>
                                            <div class="w-12 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
                                        </div>

                                        <!-- Destination Identity -->
                                        <div class="flex-1 text-center">
                                            <div class="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-2">Destination Node</div>
                                            <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[80px] flex flex-col items-center justify-center gap-1 transition-all">
                                                @if (transferDest()) {
                                                    <span class="material-symbols-rounded text-blue-500">
                                                        {{ transferDest()?.location_type === 'WAREHOUSE' ? 'warehouse' : 'storefront' }}
                                                    </span>
                                                    <span class="text-xs font-black leading-tight">{{ transferDest()?.name }}</span>
                                                    <span class="text-[9px] font-bold uppercase tracking-widest opacity-50">{{ transferDest()?.location_type }}</span>
                                                } @else {
                                                    <span class="text-xs font-bold text-slate-300">Set Target</span>
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Background flourish -->
                                    <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full"></div>
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">From Node</label>
                                        <select formControlName="from_location_id" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                            <option value="">Origin...</option>
                                            @for (loc of locations(); track loc.id) {
                                                <option [value]="loc.id">{{ loc.name }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">To Node</label>
                                        <select formControlName="to_location_id" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                            <option value="">Destination...</option>
                                            @for (loc of locations(); track loc.id) {
                                                <option [value]="loc.id">{{ loc.name }}</option>
                                            }
                                        </select>
                                    </div>
                                </div>

                                <!-- Item Manifest -->
                                <div class="space-y-3 pt-2">
                                    <div class="flex justify-between items-center px-1">
                                        <label class="text-[10px] font-black uppercase tracking-widest text-slate-500">Manifest Items</label>
                                        <button type="button" (click)="addTransferItem()" class="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 hover:brightness-90">
                                            <span class="material-symbols-rounded text-sm">add_circle</span> Add Asset
                                        </button>
                                    </div>
                                    
                                    <div formArrayName="items" class="space-y-2">
                                        @for (item of transferItems.controls; track item; let i = $index) {
                                            <div [formGroupName]="i" class="group flex gap-2 items-center p-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm">
                                                <div class="flex-1">
                                                    <select formControlName="product_id" 
                                                            class="w-full bg-transparent border-none p-0 text-sm font-bold focus:ring-0 appearance-none cursor-pointer">
                                                        <option value="">Select Item...</option>
                                                        @for (product of products(); track product.id) {
                                                            <option [value]="product.id">
                                                                {{ product.name }} 
                                                                ({{ getItemStock(product.id, transferForm.get('from_location_id')?.value) }} Avail)
                                                            </option>
                                                        }
                                                    </select>
                                                    
                                                    <!-- REAL-TIME STOCK GLANCE -->
                                                    @if (item.get('product_id')?.value) {
                                                        <div class="flex gap-3 mt-1 px-0.5">
                                                            <div class="flex items-center gap-1">
                                                                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Selected Source:</span>
                                                                <span class="text-[10px] font-black" [class.text-red-500]="getItemStock(item.get('product_id')?.value, transferForm.get('from_location_id')?.value) <= 0">
                                                                    {{ getItemStock(item.get('product_id')?.value, transferForm.get('from_location_id')?.value) }}
                                                                </span>
                                                            </div>
                                                            <div class="flex items-center gap-1">
                                                                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Current Dest:</span>
                                                                <span class="text-[10px] font-black text-blue-500">
                                                                    {{ getItemStock(item.get('product_id')?.value, transferForm.get('to_location_id')?.value) }}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    }
                                                </div>
                                                <div class="w-20">
                                                    <input type="number" formControlName="quantity" class="w-full bg-slate-200/50 dark:bg-slate-700/50 border-none rounded-lg px-2 py-1 text-center text-sm font-black focus:ring-1 focus:ring-blue-500">
                                                </div>
                                                @if (transferItems.length > 1) {
                                                    <button type="button" (click)="removeTransferItem(i)" class="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                                        <span class="material-symbols-rounded text-[18px]">delete</span>
                                                    </button>
                                                }
                                            </div>
                                        }
                                    </div>
                                </div>

                                <div class="pt-2 px-1">
                                    <label class="flex items-center gap-3 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 cursor-pointer transition-all hover:bg-blue-100/50 dark:hover:bg-blue-900/20 active:scale-[0.99] group">
                                        <div class="relative w-10 h-6 bg-slate-200 dark:bg-slate-700 rounded-full transition-colors group-has-[:checked]:bg-blue-600">
                                            <input type="checkbox" formControlName="direct_execution" class="sr-only peer">
                                            <div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                        </div>
                                        <div>
                                            <span class="block text-xs font-black text-slate-700 dark:text-white leading-tight">Instant Execution</span>
                                            <span class="block text-[10px] text-slate-400 font-bold uppercase tracking-tight">Auto-approve, Ship, and Receive Assets</span>
                                        </div>
                                        <span class="material-symbols-rounded text-blue-500 ml-auto opacity-40 group-has-[:checked]:opacity-100 group-has-[:checked]:animate-bounce">bolt</span>
                                    </label>
                                </div>

                                <div class="pt-4">
                                    <button type="submit" [disabled]="!transferForm.valid" class="w-full h-16 premium-gradient-btn text-white rounded-3xl font-black shadow-[0_10px_30px_rgba(59,130,246,0.2)] dark:shadow-[0_10px_30px_rgba(30,58,138,0.4)] disabled:opacity-30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group overflow-hidden relative">
                                        <span class="relative z-10 flex items-center gap-2">
                                            <span class="material-symbols-rounded transition-transform group-hover:translate-x-1">rocket_launch</span>
                                            {{ transferForm.get('direct_execution')?.value ? 'Execute Instant Transfer' : 'Initialize Transfer Protocol' }}
                                        </span>
                                        <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    </button>
                                </div>
                            </form>
                        }

                        <!-- 3. LOCATIONS FORM -->
                        @if (activeCommand() === 'LOCATIONS') {
                            <div class="space-y-8">
                                <!-- Create New Node -->
                                <div class="p-6 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-800/30">
                                    <h4 class="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-4 flex items-center gap-2">
                                        <span class="material-symbols-rounded text-sm font-black">add_location_alt</span> Define New Node
                                    </h4>
                                    <form [formGroup]="locationForm" (ngSubmit)="submitLocation()" class="space-y-4">
                                        <input type="text" formControlName="name" placeholder="Node Name (e.g. Warehouse A)" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                        <select formControlName="location_type" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                            <option value="STORE">Retail Sales Point</option>
                                            <option value="WAREHOUSE">Deep Storage / Warehouse</option>
                                            <option value="TRANSIT">Logistics Transit</option>
                                        </select>
                                        <div class="grid grid-cols-2 gap-3 pt-2">
                                            <label class="flex items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-all active:scale-95">
                                                <input type="checkbox" formControlName="allows_sales" class="w-4 h-4 rounded-md border-slate-300 text-emerald-500 focus:ring-emerald-500/20">
                                                <span class="text-[10px] font-black uppercase tracking-tight opacity-70">POS Enabled</span>
                                            </label>
                                            <label class="flex items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-all active:scale-95">
                                                <input type="checkbox" formControlName="allows_receiving" class="w-4 h-4 rounded-md border-slate-300 text-emerald-500 focus:ring-emerald-500/20">
                                                <span class="text-[10px] font-black uppercase tracking-tight opacity-70">Can Receive PO</span>
                                            </label>
                                        </div>
                                        <button type="submit" [disabled]="!locationForm.valid" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 disabled:opacity-30 mt-2">
                                            Initialize Network Node
                                        </button>
                                    </form>
                                </div>

                                <!-- Node List -->
                                <div class="space-y-3">
                                    <label class="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Active Network Nodes</label>
                                    <div class="space-y-2">
                                        @for (loc of locations(); track loc.id) {
                                            <div class="group flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all">
                                                <div class="flex items-center gap-3">
                                                    <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
                                                        <span class="material-symbols-rounded text-xl">
                                                            {{ loc.location_type === 'WAREHOUSE' ? 'warehouse' : loc.location_type === 'STORE' ? 'storefront' : 'local_shipping' }}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div class="text-sm font-black text-slate-900 dark:text-white">{{ loc.name }}</div>
                                                        <div class="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{{ loc.location_type }} • {{ loc.id.substring(0,8).toUpperCase() }}</div>
                                                    </div>
                                                </div>
                                                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button (click)="openEditLocationModal(loc)" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all" title="Edit">
                                                        <span class="material-symbols-rounded text-[18px]">edit</span>
                                                    </button>
                                                    <button (click)="deleteLocation(loc.id)" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Delete">
                                                        <span class="material-symbols-rounded text-[18px]">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </div>
                            </div>
                        }

                        <!-- 4. RECEIVE FORM / QUEUE -->
                        @if (activeCommand() === 'RECEIVE') {
                            @if (receivingPO()) {
                                <!-- Receipt Detail Form -->
                                <div class="space-y-6">
                                    <div class="p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-3xl border border-amber-100 dark:border-amber-800/30">
                                        <div class="flex justify-between items-start mb-4">
                                            <div>
                                                <div class="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Incoming PO</div>
                                                <div class="text-lg font-black">{{ receivingPO().po_number }}</div>
                                            </div>
                                            <button (click)="receivingPO.set(null)" class="text-[10px] font-black text-slate-400 uppercase hover:text-slate-600">Change PO</button>
                                        </div>
                                        
                                        <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/50">
                                            <div class="flex justify-between items-center mb-2">
                                                <span class="text-xs font-bold opacity-60">Total Quantity</span>
                                                <span class="text-xs font-black">{{ receivingPO().total_quantity }} Units</span>
                                            </div>
                                            <div class="flex justify-between items-center">
                                                <span class="text-xs font-bold opacity-60">Value</span>
                                                <span class="text-xs font-black">{{ receivingPO().total_amount | currency:storeService.currency() }}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <form [formGroup]="receiveForm" (ngSubmit)="submitReceivePO()" class="space-y-6">
                                        <div>
                                            <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Destination Node (Warehouse/Store)</label>
                                            <select formControlName="destination_location_id" class="w-full glass-input rounded-xl px-4 py-3 text-sm font-bold">
                                                <option value="">Select storage node...</option>
                                                @for (loc of locations(); track loc.id) {
                                                    @if (loc.allows_receiving) {
                                                        <option [value]="loc.id">{{ loc.name }} ({{ loc.location_type }})</option>
                                                    }
                                                }
                                            </select>
                                            <p class="text-[10px] text-slate-400 mt-2 italic px-1">* Only locations with "Allow Receiving" enabled are shown.</p>
                                        </div>

                                        <div class="pt-4">
                                            <button type="submit" [disabled]="!receiveForm.valid" class="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]">
                                                Finalize Inbound Receipt
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            } @else {
                                <!-- Inbound Queue Summary -->
                                <div class="space-y-4">
                                    <div class="flex justify-between items-center px-1">
                                        <label class="text-[10px] font-black uppercase tracking-widest text-slate-500">Awaiting Arrival</label>
                                        <button (click)="refreshInboundQueue()" class="text-[10px] font-black text-blue-500 uppercase flex items-center gap-1">
                                            <span class="material-symbols-rounded text-sm">sync</span> Sync
                                        </button>
                                    </div>

                                    @if (inboundQueue().length === 0) {
                                        <div class="p-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                                            <span class="material-symbols-rounded text-4xl text-slate-200 mb-2">inbox</span>
                                            <p class="text-xs font-bold text-slate-400">Queue is empty</p>
                                        </div>
                                    } @else {
                                        <div class="space-y-2">
                                            @for (po of inboundQueue(); track po.id) {
                                                <div (click)="receivePOFromInventory(po)" class="group p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/50 shadow-sm hover:shadow-md cursor-pointer transition-all">
                                                    <div class="flex justify-between items-start">
                                                        <div>
                                                            <div class="text-sm font-black text-slate-900 dark:text-white group-hover:text-amber-600 transition-colors">PO-{{ po.id.substring(0,8).toUpperCase() }}</div>
                                                            <div class="text-[10px] font-bold text-slate-400 mt-1 uppercase">{{ po.supplier?.name || po.supplier_id }}</div>
                                                        </div>
                                                        <div class="text-right">
                                                            <div class="text-[10px] font-black uppercase tracking-tighter">{{ po.total_quantity }} Units</div>
                                                            <div class="text-xs font-black text-slate-900 dark:text-white mt-1">{{ po.total_amount | currency:storeService.currency() }}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        }

                    </div>
                    
                    <!-- Drawer Footer (Branding) -->
                    <div class="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-center gap-4 grayscale opacity-40">
                        <span class="font-black italic text-xs tracking-tighter text-slate-400">Powered by OmniPlus Core</span>
                        <div class="w-1 h-1 rounded-full bg-slate-300"></div>
                        <span class="font-black italic text-xs tracking-tighter text-slate-400">Secure Audit Trail v2.0</span>
                    </div>
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
    showReceiveModal = signal(false);
    receivingPO = signal<any | null>(null);
    editingLocation = signal<StockLocation | null>(null);
    selectedLocationId = '';
    isRefreshingPOs = signal(false);

    // Command Center State (New Design)
    showCommandCenter = signal(false);
    activeCommand = signal<'ADJUST' | 'TRANSFER' | 'LOCATIONS' | 'RECEIVE' | null>(null);

    // Advanced Drawer State (Product History)
    showDrawer = signal(false);
    selectedDrawerProduct = signal<{ productId: string, locationId: string } | null>(null);

    private refreshTrigger = new BehaviorSubject<void>(undefined);

    // Data streams
    locations = signal<StockLocation[]>([]);

    // Stock Levels Computed (Fully Reactive overrides)
    stockLevels = computed(() => {
        const allProducts = this.products();
        const allLocs = this.locations();
        const allMovements = this.movements();
        const store = this.storeService.currentStore();
        if (!store) return [];

        const enrichedLevels = [];
        for (const product of allProducts) {
            for (const loc of allLocs) {
                let truthQty = 0;
                if (loc.location_type === 'WAREHOUSE') truthQty = product.stock_warehouse || 0;
                if (loc.location_type === 'STORE') truthQty = product.stock_shop || 0;

                // Calculate damages dynamically from history
                const damages = allMovements.filter(m =>
                    m.product_id === product.id &&
                    m.location_id === loc.id &&
                    m.movement_type.includes('DAMAGE')
                );
                const sumDamaged = damages.reduce((acc, curr) => acc + Math.abs(curr.quantity), 0);

                enrichedLevels.push({
                    product_id: product.id,
                    location_id: loc.id,
                    available_quantity: truthQty, // Note: damaged quantity has already been subtracted from product truthQty during the write_off
                    physical_quantity: truthQty,
                    reserved_quantity: 0, // Computed from pending transfers if needed later
                    damaged_quantity: sumDamaged
                } as any);
            }
        }

        return enrichedLevels.filter(l => this.selectedLocationId ? l.location_id === this.selectedLocationId : true);
    });

    private movements$ = this.refreshTrigger.pipe(
        switchMap(() => this.stockService.getMovements().pipe(
            retry(3),
            catchError(err => of([]))
        ))
    );
    movements = toSignal(this.movements$, { initialValue: [] as StockMovement[] });

    // Global Date Filtering Signals
    dateFilter = signal<DateFilter>('ALL');
    customStartDate = signal<string>(new Date().toISOString().split('T')[0]);
    customEndDate = signal<string>(new Date().toISOString().split('T')[0]);

    // Computed Date Objects for filtering
    dateRange = computed(() => {
        const filter = this.dateFilter();
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        switch (filter) {
            case 'DAILY':
                return { from: start, to: end };
            case 'WEEKLY':
                start.setDate(start.getDate() - 7);
                return { from: start, to: end };
            case 'MONTHLY':
                start.setMonth(start.getMonth() - 1);
                return { from: start, to: end };
            case 'YEARLY':
                start.setFullYear(start.getFullYear() - 1);
                return { from: start, to: end };
            case 'CUSTOM':
                const s = new Date(this.customStartDate());
                const e = new Date(this.customEndDate());
                e.setHours(23, 59, 59, 999);
                return { from: s, to: e };
            default:
                return null;
        }
    });

    isWithinRange(dateStr: string | Date | undefined): boolean {
        if (!dateStr) return false;
        const range = this.dateRange();
        if (!range) return true;

        const date = new Date(dateStr);
        return date >= range.from && date <= range.to;
    }

    filteredMovements = computed(() => {
        return this.movements().filter(m => this.isWithinRange(m.created_at));
    });

    // Drawer Computed
    drawerMovements = computed(() => {
        const selection = this.selectedDrawerProduct();
        if (!selection) return [];
        return this.filteredMovements()
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

    filteredTransfers = computed(() => {
        return this.transfers().filter(t => this.isWithinRange(t.created_at));
    });

    private lowStockAlerts$ = this.refreshTrigger.pipe(
        switchMap(() => this.stockService.getLowStockItems().pipe(
            retry(3),
            catchError(err => of([]))
        ))
    );
    lowStockAlerts = toSignal(this.lowStockAlerts$, { initialValue: [] as any[] });

    private store$ = toObservable(this.storeService.currentStore);

    private purchaseOrders$ = combineLatest([this.refreshTrigger, this.store$]).pipe(
        tap(() => this.isRefreshingPOs.set(true)),
        switchMap(([_, store]) => {
            if (!store) return of([]);
            // Call the service and specifically wait for it to emit
            return this.supabase.getPurchaseOrders(store.id).pipe(
                retry(3),
                catchError(err => {
                    console.error('Inbound queue fetch error:', err);
                    return of([]);
                }),
                tap(() => this.isRefreshingPOs.set(false))
            );
        })
    );
    purchaseOrders = toSignal(this.purchaseOrders$, { initialValue: [] as any[] });

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
    filteredStockLevels = computed(() => {
        const levels = this.stockLevels();
        const range = this.dateRange();
        if (!range) return levels;

        // Find products that had movements in this range
        const activeProductIds = new Set(
            this.movements()
                .filter(m => this.isWithinRange(m.created_at))
                .map(m => m.product_id)
        );

        // Also check transfers for activity
        this.transfers()
            .filter(t => this.isWithinRange(t.created_at))
            .forEach(t => activeProductIds.add(t.id)); // Transfers themselves are entities, but we care about items in them

        // Filter levels to only show products that were active or had a last_movement_at in range
        return levels.filter(lvl =>
            activeProductIds.has(lvl.product_id) ||
            (lvl.last_movement_at && this.isWithinRange(lvl.last_movement_at))
        );
    });

    totalInventoryValue = computed(() => {
        const levels = this.filteredStockLevels() as any[];
        const prods = this.products();
        return levels.reduce((acc: number, level: any) => {
            const product = prods.find(p => p.id === level.product_id);
            // MAC Valuation: Use frozen MAC from metadata if available, fallback to cost_price. NEVER use retail price.
            const unitValue = product?.metadata?.mac ?? product?.cost_price ?? 0;
            return acc + ((level.physical_quantity || 0) * unitValue);
        }, 0);
    });

    activeTransfersCount = computed(() => {
        return this.filteredTransfers().filter(t => t.status === 'PENDING' || t.status === 'APPROVED' || t.status === 'IN_TRANSIT').length;
    });

    pendingConsignmentsCount = computed(() => {
        return this.purchaseOrders().filter(po => po.status === 'SENT' || po.status === 'ORDERED' || po.status === 'PARTIAL' || po.status === 'DRAFT').length;
    });

    inboundQueue = computed(() => {
        return this.purchaseOrders().filter(po => po.status !== 'RECEIVED' && po.status !== 'CANCELLED');
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
            flex: 1,
            cellStyle: { textAlign: 'right' },
            cellClassRules: {
                'text-red-600 font-bold': params => params.value < 5,
                'text-green-600 font-bold': params => params.value >= 20
            }
        },
        { headerName: 'Reserved', valueGetter: params => params.data.reserved_quantity || 0, type: 'numericColumn', flex: 1, cellStyle: { textAlign: 'right' } },
        { headerName: 'Damaged', valueGetter: params => params.data.damaged_quantity || 0, type: 'numericColumn', cellClass: 'text-orange-600', flex: 1, cellStyle: { textAlign: 'right' } },
        { headerName: 'Physical', valueGetter: params => params.data.physical_quantity, type: 'numericColumn', sortable: true, flex: 1, cellClass: 'font-bold', cellStyle: { textAlign: 'right' } },
        {
            headerName: 'Value',
            valueGetter: (params) => {
                const product = this.products().find(p => p.id === params.data.product_id);
                const qty = params.data.physical_quantity || 0;
                // MAC Valuation
                const unitValue = product?.metadata?.mac ?? product?.cost_price ?? 0;
                return qty * unitValue;
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
        direct_execution: [true], // Default to instant for manual command center moves
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

    receiveForm = this.fb.group({
        destination_location_id: ['', Validators.required]
    });

    ngOnInit() { }

    refreshStockLevels() { this.refreshTrigger.next(); }

    refreshInboundQueue() {
        this.refreshTrigger.next();
        const store = this.storeService.currentStore();
        if (store) this.supabase.fetchAllData(); // Refresh underlying service caches
    }

    refreshAll() {
        this.supabase.fetchAllData();
        this.loadLocations();
        this.refreshStockLevels();
    }

    // Command Center Methods
    openCommand(type: 'ADJUST' | 'TRANSFER' | 'LOCATIONS' | 'RECEIVE', data?: any) {
        this.activeCommand.set(type);
        this.showCommandCenter.set(true);

        // Pre-fill forms if needed
        if (type === 'ADJUST') this.adjustmentForm.reset({ movement_type: 'ADJUSTMENT_IN', product_id: '', location_id: '', quantity: 0, reason: '' });
        if (type === 'TRANSFER') {
            this.transferItems.clear();
            this.addTransferItem();
        }
        if (type === 'RECEIVE' && data) {
            this.receivingPO.set(data);
            const defaultLoc = this.locations().find(l => l.location_type === 'WAREHOUSE') || this.locations().find(l => l.allows_receiving);
            this.receiveForm.patchValue({ destination_location_id: defaultLoc?.id || '' });
        }
    }

    closeCommandCenter() {
        this.showCommandCenter.set(false);
    }

    // Visualization helpers for Transfer
    // Reactively watch form value changes to update visualization cards immediately
    transferSource = toSignal(
        this.transferForm.get('from_location_id')!.valueChanges.pipe(
            map(id => this.locations().find(l => l.id === id))
        ),
        { initialValue: undefined }
    );

    transferDest = toSignal(
        this.transferForm.get('to_location_id')!.valueChanges.pipe(
            map(id => this.locations().find(l => l.id === id))
        ),
        { initialValue: undefined }
    );

    getItemStock(productId: string | null | undefined, locationId: string | null | undefined): number {
        if (!productId || !locationId) return 0;
        const level = this.stockLevels().find(l => l.product_id === productId && l.location_id === locationId);
        return level?.available_quantity ?? 0;
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
        this.openCommand('ADJUST');
    }

    openTransferModal() {
        this.openCommand('TRANSFER');
    }

    openEditLocationModal(location: StockLocation) {
        this.editingLocation.set(location);
        this.locationForm.patchValue({
            name: location.name,
            location_type: location.location_type,
            allows_sales: location.allows_sales,
            allows_receiving: location.allows_receiving
        });
        this.openCommand('LOCATIONS');
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

    getMovementTypeClass(type: string): string {
        const t = (type || '').toUpperCase();
        if (t.includes('RECEIVE_PO') || t.includes('PURCHASE_RECEIVE') || t === 'RECEIPT') return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
        if (t.includes('TRANSFER_IN')) return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20';
        if (t.includes('TRANSFER_OUT') || t === 'TRANSFER') return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20';
        if (t.includes('SALE')) return 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20';
        if (t.includes('DAMAGE') || t.includes('LOSS') || t.includes('WRITE_OFF')) return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
        if (t.includes('ADJUSTMENT') || t === 'MANUAL') return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
        return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20';
    }

    getMovementTypeIcon(type: string): string {
        const t = (type || '').toUpperCase();
        if (t.includes('PO') || t.includes('RECEIVE') || t === 'RECEIPT') return 'inventory';
        if (t.includes('TRANSFER_IN')) return 'arrow_downward';
        if (t.includes('TRANSFER_OUT') || t === 'TRANSFER') return 'local_shipping';
        if (t.includes('SALE')) return 'point_of_sale';
        if (t.includes('DAMAGE') || t.includes('LOSS') || t.includes('WRITE_OFF')) return 'delete_forever';
        if (t.includes('ADJUSTMENT') || t === 'MANUAL') return 'tune';
        return 'sync_alt';
    }

    formatMovementType(type: string): string {
        const t = (type || 'UNKNOWN').replace('_', ' ');
        if (t.includes('TRANSFER IN')) return 'TRANSFER IN';
        if (t.includes('TRANSFER OUT')) return 'TRANSFER OUT';
        return t;
    }

    formatMovementReason(movement: any): string {
        const raw = movement.reason || movement.movement_type || '';
        if (raw.includes('TRANSFER_IN from')) {
            const parts = raw.split('from ');
            return `Received from ${this.getLocationName(parts[1]?.trim() || '')}`;
        }
        if (raw.includes('TRANSFER_OUT to')) {
            const parts = raw.split('to ');
            return `Shipped to ${this.getLocationName(parts[1]?.trim() || '')}`;
        }
        return raw;
    }

    formatMovementNotes(movement: any): string {
        const raw = movement.notes || '';
        // If it looks like 'Received by [uuid]' we can try to suppress the UUID
        if (raw.includes('Received by ') || raw.includes('Shipped by ')) {
            return raw.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'Staff');
        }
        return raw;
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
                this.closeCommandCenter();
                this.adjustmentForm.reset({ movement_type: 'ADJUSTMENT_IN', quantity: 0 });
                this.refreshStockLevels();
            },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }

    submitTransfer() {
        if (!this.transferForm.valid) return;
        const formValue = this.transferForm.value;
        const isInstant = formValue.direct_execution;

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
        }).pipe(
            switchMap(transfer => {
                if (isInstant) {
                    // Chain the workflow for immediate effect
                    return this.stockService.approveTransfer(transfer.id, '00000000-0000-0000-0000-000000000000').pipe(
                        switchMap(() => this.stockService.shipTransfer(transfer.id, '00000000-0000-0000-0000-000000000000')),
                        switchMap(() => this.stockService.receiveTransfer(transfer.id, '00000000-0000-0000-0000-000000000000'))
                    );
                }
                return of(transfer);
            })
        ).subscribe({
            next: () => {
                this.dialog.alert('Success', isInstant ? 'Transfer executed & physical stock updated' : 'Transfer request initialized successfully');
                this.closeCommandCenter();
                this.transferForm.reset();
                this.transferForm.get('direct_execution')?.setValue(true);
                this.transferForm.setControl('items', this.fb.array([this.createTransferItem()]));
                this.refreshAll();
            },
            error: (err) => this.dialog.alert('Error', err.message || 'Failed to process transfer')
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
                    this.closeCommandCenter();
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
                    this.closeCommandCenter();
                    this.locationForm.reset({ name: '', location_type: 'STORE', allows_sales: true, allows_receiving: true });
                    this.loadLocations();
                },
                error: (err) => this.dialog.alert('Error', err.message)
            });
        }
    }

    receivePOFromInventory(po: any) {
        this.openCommand('RECEIVE', po);
    }

    submitReceivePO() {
        const po = this.receivingPO();
        const locId = this.receiveForm.value.destination_location_id;
        if (!po || !locId) return;

        // Fetch PO items to calculate what's left to receive
        this.supabase.getPurchaseOrderItems(po.id).subscribe(items => {
            const itemsToReceive = items.map(item => ({
                item_id: item.id,
                product_id: item.product_id,
                received_amount: (item.quantity_ordered || 0) - (item.quantity_received || 0),
                unit_cost: item.unit_cost || 0
            })).filter(i => i.received_amount > 0);

            if (itemsToReceive.length === 0) {
                this.dialog.alert('Already Received', 'This order has no more items left to receive.');
                this.closeCommandCenter();
                return;
            }

            this.supabase.receivePO(po.id, itemsToReceive, locId).subscribe({
                next: () => {
                    this.dialog.alert('Success', 'Goods received into inventory');
                    this.closeCommandCenter();
                    this.receivingPO.set(null);
                    this.refreshAll();
                },
                error: (err: any) => this.dialog.alert('Error', err.message || 'Failed to receive goods')
            });
        });
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
