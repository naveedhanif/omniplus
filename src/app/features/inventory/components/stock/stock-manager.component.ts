import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, BehaviorSubject, retry, catchError, tap } from 'rxjs';
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

type ViewMode = 'LEVELS' | 'MOVEMENTS' | 'TRANSFERS' | 'REORDER' | 'LOCATIONS';

@Component({
    selector: 'app-stock-manager',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, DatePipe, AgGridAngular],
    template: `
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

            <!-- Dashboard Summary Cards -->
            <div class="grid grid-cols-4 gap-4">
                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 hover:border-[var(--primary-color)] transition-colors cursor-pointer"
                     (click)="viewMode.set('LEVELS')">
                    <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <span class="material-symbols-rounded text-[24px]">inventory_2</span>
                    </div>
                    <div>
                        <div class="text-sm opacity-60 font-medium">Total Inventory Value</div>
                        <div class="text-2xl font-bold">{{ totalInventoryValue() | currency:storeService.currency() }}</div>
                    </div>
                </div>
                
                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 hover:border-red-500 transition-colors cursor-pointer"
                     (click)="viewMode.set('REORDER')">
                    <div class="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center">
                        <span class="material-symbols-rounded text-[24px]">warning</span>
                    </div>
                    <div>
                        <div class="text-sm opacity-60 font-medium">Low Stock Alerts</div>
                        <div class="text-2xl font-bold" [class.text-red-600]="lowStockAlerts().length > 0">{{ lowStockAlerts().length }}</div>
                    </div>
                </div>

                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 hover:border-[var(--primary-color)] transition-colors cursor-pointer"
                     (click)="viewMode.set('TRANSFERS')">
                    <div class="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <span class="material-symbols-rounded text-[24px]">local_shipping</span>
                    </div>
                    <div>
                        <div class="text-sm opacity-60 font-medium">Active Transfers</div>
                        <div class="text-2xl font-bold">{{ activeTransfersCount() }}</div>
                    </div>
                </div>

                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 hover:border-[var(--primary-color)] transition-colors cursor-pointer"
                     (click)="viewMode.set('LOCATIONS')">
                    <div class="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-rounded text-[24px]">store</span>
                    </div>
                    <div>
                        <div class="text-sm opacity-60 font-medium">Total Locations</div>
                        <div class="text-2xl font-bold">{{ locations().length }}</div>
                    </div>
                </div>
            </div>

            <!-- View Tabs -->
            <div class="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                <button 
                    (click)="viewMode.set('LEVELS'); refreshStockLevels()"
                    [class.border-b-2]="viewMode() === 'LEVELS'"
                    [class.border-[var(--primary-color)]]="viewMode() === 'LEVELS'"
                    [class.text-[var(--primary-color)]]="viewMode() === 'LEVELS'"
                    class="px-4 py-2 font-medium transition-colors">
                    Stock Levels
                </button>
                <button 
                    (click)="viewMode.set('MOVEMENTS')"
                    [class.border-b-2]="viewMode() === 'MOVEMENTS'"
                    [class.border-[var(--primary-color)]]="viewMode() === 'MOVEMENTS'"
                    [class.text-[var(--primary-color)]]="viewMode() === 'MOVEMENTS'"
                    class="px-4 py-2 font-medium transition-colors">
                    Movement History
                </button>
                <button 
                    (click)="viewMode.set('TRANSFERS')"
                    [class.border-b-2]="viewMode() === 'TRANSFERS'"
                    [class.border-[var(--primary-color)]]="viewMode() === 'TRANSFERS'"
                    [class.text-[var(--primary-color)]]="viewMode() === 'TRANSFERS'"
                    class="px-4 py-2 font-medium transition-colors">
                    Transfers
                </button>
                <button 
                    (click)="viewMode.set('REORDER'); refreshStockLevels()"
                    [class.border-b-2]="viewMode() === 'REORDER'"
                    [class.border-[var(--primary-color)]]="viewMode() === 'REORDER'"
                    [class.text-[var(--primary-color)]]="viewMode() === 'REORDER'"
                    class="px-4 py-2 font-medium transition-colors">
                    Low Stock Alerts
                </button>
                <button 
                    (click)="viewMode.set('LOCATIONS')"
                    [class.border-b-2]="viewMode() === 'LOCATIONS'"
                    [class.border-[var(--primary-color)]]="viewMode() === 'LOCATIONS'"
                    [class.text-[var(--primary-color)]]="viewMode() === 'LOCATIONS'"
                    class="px-4 py-2 font-medium transition-colors">
                    Locations
                </button>
            </div>

            <!-- Stock Levels View -->
            @if (viewMode() === 'LEVELS') {
                <div class="h-[600px] bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
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
                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">
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
                <div class="grid gap-6">
                    @for (transfer of transfers(); track transfer.id) {
                        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col gap-6">
                            <div class="flex justify-between items-start">
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
                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">
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
                <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">
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

    viewMode = signal<ViewMode>('LEVELS');
    showAdjustmentModal = signal(false);
    showTransferModal = signal(false);
    showLocationModal = signal(false);
    editingLocation = signal<StockLocation | null>(null);
    selectedLocationId = '';

    private refreshTrigger = new BehaviorSubject<void>(undefined);

    // Data streams
    locations = signal<StockLocation[]>([]);

    private stockLevels$ = this.refreshTrigger.pipe(
        switchMap(() => {
            return this.stockService.getStockLevels(
                this.selectedLocationId || undefined
            ).pipe(
                retry(3),
                catchError(err => {
                    console.error('Failed to load stock levels', err);
                    return of([]);
                })
            );
        })
    );
    stockLevels = toSignal(this.stockLevels$, { initialValue: [] as StockLevel[] });

    private movements$ = this.stockService.getMovements().pipe(
        retry(3),
        catchError(err => of([]))
    );
    movements = toSignal(this.movements$, { initialValue: [] as StockMovement[] });

    private transfers$ = this.stockService.getTransfers().pipe(
        retry(3),
        catchError(err => of([]))
    );
    transfers = toSignal(this.transfers$, { initialValue: [] as StockTransfer[] });

    private lowStockAlerts$ = this.stockService.getLowStockItems().pipe(
        retry(3),
        catchError(err => of([]))
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
            valueGetter: params => params.data.quantity,
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
        { headerName: 'Physical', valueGetter: params => params.data.quantity, type: 'numericColumn', sortable: true, flex: 1, cellClass: 'font-bold' },
        {
            headerName: 'Value',
            valueGetter: (params) => {
                const product = this.products().find(p => p.id === params.data.product_id);
                const qty = params.data.quantity || 0;
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
        this.stockService.approveTransfer(transferId, '00000000-0000-0000-0000-000000000000').subscribe({
            next: () => { this.dialog.alert('Success', 'Approved'); this.refreshStockLevels(); },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }

    shipTransfer(transferId: string) {
        this.stockService.shipTransfer(transferId, '00000000-0000-0000-0000-000000000000').subscribe({
            next: () => { this.dialog.alert('Success', 'Shipped'); this.refreshStockLevels(); },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }

    receiveTransfer(transferId: string) {
        this.stockService.receiveTransfer(transferId, '00000000-0000-0000-0000-000000000000').subscribe({
            next: () => { this.dialog.alert('Success', 'Received'); this.refreshStockLevels(); },
            error: (err) => this.dialog.alert('Error', err.message)
        });
    }

    viewMovementHistory(productId: string, locationId: string) {
        this.viewMode.set('MOVEMENTS');
    }
}
