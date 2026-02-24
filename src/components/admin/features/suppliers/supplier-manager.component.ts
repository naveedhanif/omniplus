
import { Component, inject, signal, Signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, UpperCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, forkJoin } from 'rxjs';
import { MockSupabaseService, Supplier, PurchaseOrder, Product } from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';

@Component({
  selector: 'app-supplier-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, CurrencyPipe, UpperCasePipe],
  template: `
    <div class="flex gap-0 h-[calc(100vh-120px)] bg-[var(--card-bg)] rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">

      <!-- ══════════════════════════════════════════════════════════
           LEFT SIDEBAR — Supplier List
      ══════════════════════════════════════════════════════════ -->
      <div class="w-72 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700">

        <!-- Sidebar Header -->
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-[var(--primary-color)]">local_shipping</span>
              Suppliers
              <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full text-[10px] font-black text-slate-600 dark:text-slate-400">{{ suppliersSignal().length }}</span>
            </h2>
            <button (click)="openAddModal()"
                    class="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary-color)] text-white text-xs font-bold rounded-lg shadow hover:brightness-110 active:scale-95 transition-all">
              <span class="material-symbols-rounded text-sm">add</span>
              New
            </button>
          </div>
          <!-- Search -->
          <div class="relative">
            <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
            <input [formControl]="searchControl" type="text" placeholder="Search suppliers..."
                   class="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 transition-all">
          </div>
        </div>

        <!-- Supplier Rows -->
        <div class="flex-1 overflow-y-auto">
          @if (filteredSuppliers().length === 0) {
            <div class="flex flex-col items-center py-16 text-slate-400 text-sm gap-2 px-6 text-center">
              <span class="material-symbols-rounded text-4xl opacity-20">storefront</span>
              <span>No suppliers found</span>
            </div>
          }
          @for (supplier of filteredSuppliers(); track supplier.id) {
            <button type="button"
                    (click)="selectSupplier(supplier)"
                    class="w-full text-left px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 transition-colors group"
                    [class.bg-[var(--primary-color)]_10]="selectedSupplier()?.id === supplier.id"
                    [class.bg-blue-50]="selectedSupplier()?.id === supplier.id"
                    [class.dark:bg-blue-900_20]="selectedSupplier()?.id === supplier.id"
                    [class.border-l-2]="selectedSupplier()?.id === supplier.id"
                    [class.border-l-[var(--primary-color)]]="selectedSupplier()?.id === supplier.id"
                    [class.hover:bg-slate-50]="selectedSupplier()?.id !== supplier.id"
                    [class.dark:hover:bg-slate-800_50]="selectedSupplier()?.id !== supplier.id">

              <div class="flex items-center gap-3">
                <!-- Avatar: deterministic gradient (Option B) -->
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 text-white transition-all"
                     [ngStyle]="getAvatarStyle(supplier.name, selectedSupplier()?.id === supplier.id)">
                  {{ supplier.name.substring(0, 2) | uppercase }}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{{ supplier.name }}</span>
                    @if (getSupplierActiveCount(supplier.id) > 0) {
                      <span class="flex-shrink-0 w-4 h-4 bg-blue-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{{ getSupplierActiveCount(supplier.id) }}</span>
                    }
                    @if (hasOverduePOs(supplier.id)) {
                      <span class="flex-shrink-0 material-symbols-rounded text-[12px] text-red-500" title="Overdue PO">warning</span>
                    }
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-slate-400">{{ getSupplierTotalSpend(supplier.id) | currency: storeService.currency() }}</span>
                    <span class="text-[10px] text-slate-300 dark:text-slate-600">•</span>
                    <span class="text-[11px] text-slate-400">{{ supplier.lead_time_days }}d lead</span>
                  </div>
                </div>

                <!-- Reliability dot -->
                <div class="flex-shrink-0 w-2 h-2 rounded-full"
                     [class.bg-green-400]="getOnTimeRate(supplier.id) >= 80"
                     [class.bg-amber-400]="getOnTimeRate(supplier.id) >= 50 && getOnTimeRate(supplier.id) < 80"
                     [class.bg-red-400]="getOnTimeRate(supplier.id) < 50"
                     [class.bg-slate-200]="getSupplierPOs(supplier.id).length === 0"
                     [title]="getOnTimeRate(supplier.id) + '% on-time'">
                </div>
              </div>
            </button>
          }
        </div>

        <!-- Sidebar Footer — global stats -->
        <div class="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 grid grid-cols-2 gap-2">
          <div class="text-center">
            <div class="text-[10px] text-slate-400 uppercase tracking-wide">Active POs</div>
            <div class="font-black text-sm text-blue-600">{{ pendingPOCount() }}</div>
          </div>
          <div class="text-center">
            <div class="text-[10px] text-slate-400 uppercase tracking-wide">Total Spend</div>
            <div class="font-black text-sm text-green-600">{{ totalPOValue() | currency: storeService.currency() }}</div>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           RIGHT PANEL — Supplier Detail
      ══════════════════════════════════════════════════════════ -->
      <div class="flex-1 flex flex-col overflow-hidden">

        <!-- Empty state: no supplier selected -->
        @if (!selectedSupplier()) {
          <div class="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
            <span class="material-symbols-rounded text-6xl opacity-15">storefront</span>
            <div class="text-center">
              <div class="font-bold text-slate-600 dark:text-slate-400">Select a supplier</div>
              <div class="text-sm mt-1 opacity-70">Choose a supplier from the list to view their full profile</div>
            </div>
          </div>
        }

        @if (selectedSupplier(); as s) {
          <!-- Header -->
          <div class="flex-shrink-0 px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-center gap-4">
                <!-- Large avatar: deterministic gradient (Option B) -->
                <div class="w-14 h-14 rounded-2xl text-white flex items-center justify-center text-xl font-black flex-shrink-0 transition-all"
                     [ngStyle]="getAvatarStyle(s.name, true)">
                  {{ s.name.substring(0, 2) | uppercase }}
                </div>
                <div>
                  <h2 class="text-xl font-black text-slate-800 dark:text-slate-200">{{ s.name }}</h2>
                  <div class="flex items-center gap-3 mt-1 flex-wrap">
                    @if (s.contact_person) {
                      <span class="flex items-center gap-1 text-sm text-slate-500">
                        <span class="material-symbols-rounded text-sm">person</span>{{ s.contact_person }}
                      </span>
                    }
                    @if (s.email) {
                      <a [href]="'mailto:' + s.email" (click)="$event.stopPropagation()"
                         class="flex items-center gap-1 text-sm text-[var(--primary-color)] hover:underline">
                        <span class="material-symbols-rounded text-sm">mail</span>{{ s.email }}
                      </a>
                    }
                    @if (s.phone) {
                      <a [href]="'tel:' + s.phone" (click)="$event.stopPropagation()"
                         class="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                        <span class="material-symbols-rounded text-sm">call</span>{{ s.phone }}
                      </a>
                    }
                    <!-- WhatsApp button -->
                    @if (getWhatsAppUrl(s)) {
                      <a [href]="getWhatsAppUrl(s)!" target="_blank" rel="noopener noreferrer"
                         (click)="$event.stopPropagation()"
                         class="flex items-center gap-1.5 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm shadow-green-500/30">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </a>
                    }
                    <span class="flex items-center gap-1 text-sm text-slate-500">
                      <span class="material-symbols-rounded text-sm">schedule</span>{{ s.lead_time_days }}-day lead
                    </span>
                  </div>
                </div>
              </div>
              <!-- Action buttons -->
              <div class="flex items-center gap-2 flex-shrink-0">
                <button (click)="openEditModal(s)"
                        class="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors">
                  <span class="material-symbols-rounded text-sm">edit</span>Edit
                </button>
                <button (click)="deleteSupplier(s)"
                        class="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-red-600 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-colors">
                  <span class="material-symbols-rounded text-sm">delete</span>Delete
                </button>
              </div>
            </div>
          </div>

          <!-- KPI Tiles — Option B: Gradient Fill -->
          <div class="flex-shrink-0 grid grid-cols-4 gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-700">

            <!-- Total Spend -->
            <div class="rounded-xl p-4 transition-all" [ngStyle]="kpiStyles.spend">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-rounded text-base text-white/80">payments</span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Total Spend</span>
              </div>
              <div class="text-xl font-black text-white">{{ getSupplierTotalSpend(s.id) | currency: storeService.currency() }}</div>
              <div class="text-[10px] text-white/60 mt-1">{{ getSupplierPOs(s.id).length }} order{{ getSupplierPOs(s.id).length !== 1 ? 's' : '' }} total</div>
            </div>

            <!-- Avg Lead Time -->
            <div class="rounded-xl p-4 transition-all" [ngStyle]="kpiStyles.lead">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-rounded text-base text-white/80">schedule</span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Avg Lead Time</span>
              </div>
              <div class="text-xl font-black text-white">
                {{ getAvgLeadTime(s.id) !== null ? (getAvgLeadTime(s.id) + ' days') : '—' }}
              </div>
              <div class="text-[10px] text-white/70 mt-1">
                @if (getAvgLeadTime(s.id) === null) { No deliveries yet }
                @if (getAvgLeadTime(s.id) !== null && getAvgLeadTime(s.id)! <= s.lead_time_days) { ✓ Within promised {{ s.lead_time_days }}d }
                @if (getAvgLeadTime(s.id) !== null && getAvgLeadTime(s.id)! > s.lead_time_days) { ↑ Slower than promised {{ s.lead_time_days }}d }
              </div>
            </div>

            <!-- On-Time Rate — fully dynamic gradient (green / amber / red / slate) -->
            <div class="rounded-xl p-4 transition-all duration-500" [ngStyle]="getOnTimeKpiStyle(s.id)">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-rounded text-base text-white/80">verified</span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">On-Time Rate</span>
              </div>
              <div class="text-xl font-black text-white">
                {{ getReceivedPOs(s.id).length === 0 ? '—' : (getOnTimeRate(s.id) + '%') }}
              </div>
              <div class="text-[10px] text-white/60 mt-1">{{ getReceivedPOs(s.id).length }} received POs</div>
            </div>

            <!-- Active POs -->
            <div class="rounded-xl p-4 transition-all" [ngStyle]="kpiStyles.pos">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-rounded text-base text-white/80">inventory_2</span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-white/70">Active POs</span>
              </div>
              <div class="text-xl font-black text-white">{{ getSupplierActiveCount(s.id) }}</div>
              <div class="text-[10px] text-white/70 mt-1">
                @if (hasOverduePOs(s.id)) { ⚠ Overdue delivery }
                @if (!hasOverduePOs(s.id) && getSupplierActiveCount(s.id) > 0) { In-flight }
                @if (getSupplierActiveCount(s.id) === 0) { No active orders }
              </div>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex-shrink-0 flex items-center gap-0 px-6 pt-4 border-b border-slate-200 dark:border-slate-700">
            @for (tab of ['Order History', 'Products', 'Notes']; track tab) {
              <button type="button" (click)="activeTab.set(tab)"
                      class="px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px"
                      [class.border-[var(--primary-color)]]="activeTab() === tab"
                      [class.text-[var(--primary-color)]]="activeTab() === tab"
                      [class.border-transparent]="activeTab() !== tab"
                      [class.text-slate-400]="activeTab() !== tab"
                      [class.hover:text-slate-600]="activeTab() !== tab">
                {{ tab }}
                @if (tab === 'Order History') {
                  <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black"
                        [class.bg-[var(--primary-color)]]="activeTab() === tab"
                        [class.text-white]="activeTab() === tab"
                        [class.bg-slate-200]="activeTab() !== tab"
                        [class.text-slate-500]="activeTab() !== tab">{{ getSupplierPOs(s.id).length }}</span>
                }
                @if (tab === 'Products') {
                  <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black"
                        [class.bg-[var(--primary-color)]]="activeTab() === tab"
                        [class.text-white]="activeTab() === tab"
                        [class.bg-slate-200]="activeTab() !== tab"
                        [class.text-slate-500]="activeTab() !== tab">{{ getSupplierProducts(s.id).length }}</span>
                }
              </button>
            }
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-y-auto p-6">

            <!-- ── Order History Tab ── -->
            @if (activeTab() === 'Order History') {
              @if (getSupplierPOs(s.id).length === 0) {
                <div class="flex flex-col items-center py-16 text-slate-400 gap-3">
                  <span class="material-symbols-rounded text-5xl opacity-20">receipt_long</span>
                  <div class="text-center">
                    <div class="font-bold">No orders yet</div>
                    <div class="text-sm opacity-70 mt-1">Purchase orders with this supplier will appear here</div>
                  </div>
                </div>
              }
              @if (getSupplierPOs(s.id).length > 0) {
                <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                  <table class="w-full text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th class="px-4 py-3 text-left">PO Reference</th>
                        <th class="px-4 py-3 text-left">Created</th>
                        <th class="px-4 py-3 text-left">Status</th>
                        <th class="px-4 py-3 text-left">Expected</th>
                        <th class="px-4 py-3 text-left">Delivery</th>
                        <th class="px-4 py-3 text-right">Total</th>
                        <th class="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      @for (po of getSupplierPOs(s.id); track po.id) {
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                          <td class="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                            PO-{{ po.id.substring(0, 8).toUpperCase() }}
                          </td>
                          <td class="px-4 py-3 text-slate-500 text-xs">{{ po.created_at | date:'dd MMM yyyy' }}</td>
                          <td class="px-4 py-3">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold" [ngClass]="getStatusClass(po.status)">
                              {{ po.status }}
                            </span>
                          </td>
                          <td class="px-4 py-3 text-slate-400 text-xs">
                            {{ po.expected_arrival ? (po.expected_arrival | date:'dd MMM yyyy') : '—' }}
                          </td>
                          <td class="px-4 py-3 text-xs">
                            @if (po.status === 'RECEIVED') {
                              @if (isOnTime(po)) {
                                <span class="flex items-center gap-1 text-green-600">
                                  <span class="material-symbols-rounded text-xs">check_circle</span>On time
                                </span>
                              }
                              @if (!isOnTime(po)) {
                                <span class="flex items-center gap-1 text-red-500">
                                  <span class="material-symbols-rounded text-xs">cancel</span>Late
                                </span>
                              }
                            }
                            @if (po.status !== 'RECEIVED' && po.status !== 'CANCELLED') {
                              @if (isOverdue(po)) {
                                <span class="flex items-center gap-1 text-red-500 font-bold">
                                  <span class="material-symbols-rounded text-xs">warning</span>Overdue
                                </span>
                              }
                              @if (!isOverdue(po)) {
                                <span class="text-slate-400">Pending</span>
                              }
                            }
                            @if (po.status === 'CANCELLED') {
                              <span class="text-slate-400">—</span>
                            }
                          </td>
                          <td class="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                            {{ po.total_amount | currency: storeService.currency() }}
                          </td>
                          <!-- Print button -->
                          <td class="px-4 py-3 text-right">
                            <button type="button" (click)="printPO(po)"
                                    [disabled]="printingPoId() === po.id"
                                    class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                                    title="Print Purchase Order">
                              @if (printingPoId() === po.id) {
                                <span class="material-symbols-rounded text-xs animate-spin">progress_activity</span>
                              }
                              @if (printingPoId() !== po.id) {
                                <span class="material-symbols-rounded text-xs">print</span>
                              }
                              Print
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }

            <!-- ── Products Tab ── -->
            @if (activeTab() === 'Products') {
              @if (getSupplierProducts(s.id).length === 0) {
                <div class="flex flex-col items-center py-16 text-slate-400 gap-3">
                  <span class="material-symbols-rounded text-5xl opacity-20">inventory_2</span>
                  <div class="text-center">
                    <div class="font-bold">No products found</div>
                    <div class="text-sm opacity-70 mt-1">Products tagged to this supplier in Inventory Manager, or purchased via POs, appear here</div>
                  </div>
                </div>
              }
              @if (getSupplierProducts(s.id).length > 0) {
                <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                  <table class="w-full text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th class="px-4 py-3 text-left">Product</th>
                        <th class="px-4 py-3 text-center">Stock</th>
                        <th class="px-4 py-3 text-right">Cost Price</th>
                        <th class="px-4 py-3 text-right">Reorder Qty</th>
                        <th class="px-4 py-3 text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      @for (product of getSupplierProducts(s.id); track product.id) {
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                          <td class="px-4 py-3">
                            <div class="font-medium text-slate-800 dark:text-slate-200">{{ product.name }}</div>
                            @if (product.category?.name) {
                              <div class="text-[11px] text-slate-400 mt-0.5">{{ product.category?.name }}</div>
                            }
                          </td>
                          <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                  [class.bg-red-100]="(product.stock_quantity || 0) === 0"
                                  [class.text-red-700]="(product.stock_quantity || 0) === 0"
                                  [class.bg-amber-100]="(product.stock_quantity || 0) > 0 && (product.stock_quantity || 0) <= (product.reorder_point || 5)"
                                  [class.text-amber-700]="(product.stock_quantity || 0) > 0 && (product.stock_quantity || 0) <= (product.reorder_point || 5)"
                                  [class.bg-green-100]="(product.stock_quantity || 0) > (product.reorder_point || 5)"
                                  [class.text-green-700]="(product.stock_quantity || 0) > (product.reorder_point || 5)">
                              {{ (product.stock_quantity || 0) === 0 ? 'Out of Stock' : (product.stock_quantity + ' units') }}
                            </span>
                          </td>
                          <td class="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                            {{ (product.cost_price || 0) | currency: storeService.currency() }}
                          </td>
                          <td class="px-4 py-3 text-right text-slate-500">
                            {{ product.reorder_quantity ?? '—' }}
                          </td>
                          <td class="px-4 py-3 text-center">
                            @if (isProductTagged(product.id, s.id)) {
                              <span class="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-[10px] font-bold" title="Directly tagged">Tagged</span>
                            }
                            @if (!isProductTagged(product.id, s.id)) {
                              <span class="px-2 py-0.5 bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 rounded-full text-[10px] font-bold" title="Appeared in a PO">PO History</span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }

            <!-- ── Notes Tab ── -->
            @if (activeTab() === 'Notes') {
              <div class="max-w-xl space-y-4">
                @if (s.address) {
                  <div>
                    <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Address</label>
                    <div class="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{{ s.address }}</div>
                  </div>
                }
                <div>
                  <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Internal Notes</label>
                  @if (s.notes) {
                    <div class="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{{ s.notes }}</div>
                  }
                  @if (!s.notes) {
                    <div class="p-4 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-400 italic">No notes added. Click Edit to add payment terms, special instructions, or other notes.</div>
                  }
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Supplier Since</label>
                  <div class="text-sm text-slate-600 dark:text-slate-400">{{ s.created_at | date:'MMMM d, y' }}</div>
                </div>
              </div>
            }

          </div>
        }
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         ADD / EDIT MODAL (unchanged logic, refined UI)
    ══════════════════════════════════════════════════════════ -->
    @if (showModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div class="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden">

          <!-- Modal Header -->
          <div class="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h2 class="text-lg font-black flex items-center gap-2">
              <span class="material-symbols-rounded text-[var(--primary-color)]">{{ isEditing() ? 'edit' : 'add_business' }}</span>
              {{ isEditing() ? 'Edit Supplier' : 'New Supplier' }}
            </h2>
            <button (click)="showModal.set(false)" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
              <span class="material-symbols-rounded text-slate-500">close</span>
            </button>
          </div>

          <!-- Form -->
          <form [formGroup]="supplierForm" (ngSubmit)="saveSupplier()" class="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Supplier Name *</label>
              <input formControlName="name" type="text" placeholder="e.g. Acme Tools Ltd"
                     class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:ring-2 focus:ring-[var(--primary-color)]/40 outline-none">
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Contact Person</label>
                <input formControlName="contact_person" type="text"
                       class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Phone</label>
                <input formControlName="phone" type="text"
                       class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40">
              </div>
              <!-- WhatsApp number (optional, may differ from phone) -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1">
                  <svg class="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp Number
                </label>
                <input formControlName="whatsapp" type="text" placeholder="e.g. +971501234567 (incl. country code)"
                       class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-400/40">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Email</label>
              <input formControlName="email" type="email"
                     class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40">
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Address</label>
              <textarea formControlName="address" rows="2"
                        class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 resize-none outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40"></textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Lead Time (Days) *</label>
                <input formControlName="lead_time_days" type="number" min="0"
                       class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Notes / Payment Terms</label>
              <textarea formControlName="notes" rows="3" placeholder="e.g. Net 30 payment terms, ..."
                        class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40"></textarea>
            </div>

            <div class="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 mt-4">
              <button type="button" (click)="showModal.set(false)"
                      class="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
              <button type="submit" [disabled]="supplierForm.invalid || isSaving()"
                      class="px-6 py-2 bg-[var(--primary-color)] text-white font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                @if (isSaving()) {
                  <span class="material-symbols-rounded animate-spin text-sm">progress_activity</span> Saving...
                }
                @if (!isSaving()) {
                  Save Supplier
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `
})
export class SupplierManagerComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  fb = inject(FormBuilder);

  // ── Avatar Gradient Palette (Option B — deterministic hash) ─────────────
  private readonly GRADIENTS = [
    { from: '#6366f1', to: '#8b5cf6' }, // 0 Indigo → Violet
    { from: '#14b8a6', to: '#06b6d4' }, // 1 Teal → Cyan
    { from: '#f43f5e', to: '#ec4899' }, // 2 Rose → Pink
    { from: '#f59e0b', to: '#f97316' }, // 3 Amber → Orange
    { from: '#10b981', to: '#14b8a6' }, // 4 Emerald → Teal
    { from: '#0ea5e9', to: '#3b82f6' }, // 5 Sky → Blue
    { from: '#8b5cf6', to: '#a855f7' }, // 6 Violet → Purple
    { from: '#d946ef', to: '#f43f5e' }, // 7 Fuchsia → Rose
    { from: '#84cc16', to: '#10b981' }, // 8 Lime → Emerald
    { from: '#64748b', to: '#6366f1' }, // 9 Slate → Indigo
  ] as const;

  /** Stable hash of a string → integer */
  private hashName(name: string): number {
    return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  }

  /**
   * Returns an ngStyle object for the supplier avatar.
   * When selected=true, adds a crisp 2-layer ring using double box-shadow:
   *   layer 1 → white gap, layer 2 → gradient start colour.
   */
  getAvatarStyle(name: string, selected = false): Record<string, string> {
    const g = this.GRADIENTS[this.hashName(name) % this.GRADIENTS.length];
    const baseShadow = `0 4px 12px ${g.from}40`;
    const ringsShadow = `0 4px 14px ${g.from}55, 0 0 0 2px white, 0 0 0 4px ${g.from}`;
    return {
      background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
      'box-shadow': selected ? ringsShadow : baseShadow,
    };
  }

  // ── Search ───────────────────────────────────────────────────────────────
  searchControl = this.fb.control('');
  searchQuery = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  // ── Modal State ──────────────────────────────────────────────────────────
  showModal = signal(false);
  isEditing = signal(false);
  isSaving = signal(false);
  editingId: string | null = null;

  // ── Panel State ──────────────────────────────────────────────────────────
  selectedSupplier = signal<Supplier | null>(null);
  activeTab = signal<string>('Order History');

  selectSupplier(supplier: Supplier) {
    this.selectedSupplier.set(supplier);
    this.activeTab.set('Order History');
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  supplierForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    contact_person: [''],
    email: ['', [Validators.email]],
    phone: [''],
    whatsapp: [''],
    address: [''],
    lead_time_days: [7, [Validators.required, Validators.min(0)]],
    notes: ['']
  });

  // ── Data ─────────────────────────────────────────────────────────────────
  suppliersSignal: Signal<Supplier[]> = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap(store => store ? this.supabase.getSuppliers(store.id) : of([]))
    ),
    { initialValue: [] }
  );

  private allPOs = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap(store => store ? this.supabase.getPurchaseOrders(store.id) : of([]))
    ),
    { initialValue: [] as PurchaseOrder[] }
  );

  private allProducts = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
    ),
    { initialValue: [] as Product[] }
  );

  // ── Products: combined Approach A + B cache ────────────────────────────────

  /** PO line items for all POs of the currently selected supplier (loaded reactively) */
  supplierPOItems = signal<any[]>([]);

  private _loadSupplierPOItemsEffect = effect(() => {
    const s = this.selectedSupplier();
    const pos = this.allPOs(); // reactive — re-runs whenever POs refresh
    if (!s) { this.supplierPOItems.set([]); return; }
    const supplierPOs = pos.filter(po => po.supplier_id === s.id);
    if (!supplierPOs.length) { this.supplierPOItems.set([]); return; }
    forkJoin(supplierPOs.map(po => this.supabase.getPurchaseOrderItems(po.id))).subscribe({
      next: (all) => this.supplierPOItems.set(all.flat()),
      error: () => this.supplierPOItems.set([])
    });
  }, { allowSignalWrites: true });

  // ── Print state ────────────────────────────────────────────────────────────
  /** ID of the PO whose items are currently being fetched for printing */
  printingPoId = signal<string | null>(null);

  // ── Filtered List ─────────────────────────────────────────────────────────
  filteredSuppliers = computed(() => {
    const q = (this.searchQuery() || '').toLowerCase();
    return this.suppliersSignal().filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.contact_person || '').toLowerCase().includes(q)
    );
  });

  // ── Global Stats ──────────────────────────────────────────────────────────
  pendingPOCount = computed(() =>
    this.allPOs().filter(po => po.status !== 'RECEIVED' && po.status !== 'CANCELLED').length
  );

  totalPOValue = computed(() =>
    this.allPOs()
      .filter(po => po.status !== 'CANCELLED')
      .reduce((sum, po) => sum + (po.total_amount || 0), 0)
  );

  // ── Per-Supplier Helpers ──────────────────────────────────────────────────

  getSupplierPOs(supplierId: string): PurchaseOrder[] {
    return this.allPOs()
      .filter(po => po.supplier_id === supplierId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getReceivedPOs(supplierId: string): PurchaseOrder[] {
    return this.getSupplierPOs(supplierId).filter(po => po.status === 'RECEIVED');
  }

  getSupplierActiveCount(supplierId: string): number {
    return this.allPOs().filter(po =>
      po.supplier_id === supplierId &&
      po.status !== 'RECEIVED' && po.status !== 'CANCELLED'
    ).length;
  }

  getSupplierTotalSpend(supplierId: string): number {
    return this.getSupplierPOs(supplierId)
      .filter(po => po.status !== 'CANCELLED')
      .reduce((sum, po) => sum + (po.total_amount || 0), 0);
  }

  /** Average actual delivery days for RECEIVED POs that had an expected_arrival date */
  getAvgLeadTime(supplierId: string): number | null {
    const received = this.getReceivedPOs(supplierId).filter(po => po.expected_arrival);
    if (received.length === 0) return null;
    const totalDays = received.reduce((sum, po) => {
      const created = new Date(po.created_at).getTime();
      const expected = new Date(po.expected_arrival!).getTime();
      return sum + Math.round((expected - created) / (1000 * 60 * 60 * 24));
    }, 0);
    return Math.round(totalDays / received.length);
  }

  /** % of RECEIVED POs that arrived on or before expected_arrival */
  getOnTimeRate(supplierId: string): number {
    const received = this.getReceivedPOs(supplierId).filter(po => po.expected_arrival);
    if (received.length === 0) return 0;
    const onTime = received.filter(po => this.isOnTime(po)).length;
    return Math.round((onTime / received.length) * 100);
  }

  isOnTime(po: PurchaseOrder): boolean {
    if (!po.expected_arrival || !po.created_at) return true;
    // We approximate: if expected arrival is in the future or today, consider on-time
    // A real implementation would use actual received_at timestamp
    return new Date(po.expected_arrival) >= new Date(po.created_at);
  }

  isOverdue(po: PurchaseOrder): boolean {
    if (!po.expected_arrival) return false;
    return new Date(po.expected_arrival) < new Date();
  }

  hasOverduePOs(supplierId: string): boolean {
    return this.allPOs().some(po =>
      po.supplier_id === supplierId &&
      po.status !== 'RECEIVED' && po.status !== 'CANCELLED' &&
      this.isOverdue(po)
    );
  }

  /**
   * Returns products associated with this supplier via two approaches:
   *   A) Directly tagged via product.supplier_id (catalogue metadata)
   *   B) Appeared in at least one PO line item for this supplier (PO history)
   * Shows a "Source" badge (Tagged / PO History) in the Products tab.
   */
  getSupplierProducts(supplierId: string): Product[] {
    const allProds = this.allProducts();
    // Approach A: directly tagged
    const taggedIds = new Set(
      allProds.filter(p => p.supplier_id === supplierId).map(p => p.id)
    );
    // Approach B: appeared in any PO line item for this supplier
    const historicalIds = new Set(
      this.supplierPOItems().map((i: any) => i.product_id as string)
    );
    // Union of both sets
    const allIds = new Set([...taggedIds, ...historicalIds]);
    return allProds.filter(p => allIds.has(p.id));
  }

  /** True if the product is explicitly tagged (Approach A) */
  isProductTagged(productId: string, supplierId: string): boolean {
    return this.allProducts().some(p => p.id === productId && p.supplier_id === supplierId);
  }

  getStatusClass(status: string): Record<string, boolean> {
    return {
      'bg-slate-100 text-slate-600': status === 'DRAFT',
      'bg-blue-100 text-blue-800': status === 'SENT',
      'bg-purple-100 text-purple-800': status === 'ORDERED',
      'bg-orange-100 text-orange-800': status === 'PARTIAL',
      'bg-green-100 text-green-800': status === 'RECEIVED',
      'bg-red-100 text-red-800': status === 'CANCELLED',
    };
  }

  // ── KPI Tile Gradient Styles (Option B) ───────────────────────────────────

  /** Static gradient palettes for 3 of the 4 KPI tiles */
  readonly kpiStyles = {
    spend: {
      background: 'linear-gradient(135deg, #10b981, #0d9488)',
      'box-shadow': '0 8px 20px rgba(16, 185, 129, 0.35)'
    },
    lead: {
      background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
      'box-shadow': '0 8px 20px rgba(14, 165, 233, 0.35)'
    },
    pos: {
      background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
      'box-shadow': '0 8px 20px rgba(139, 92, 246, 0.35)'
    },
  } as const;

  /**
   * Dynamic gradient for On-Time Rate tile — the entire card shifts colour
   * in real time based on supplier delivery performance:
   *   ≥ 80%  → Green   (reliable)
   *   ≥ 50%  → Amber   (acceptable but watch)
   *   < 50%  → Red     (failing)
   *   no data → Slate  (neutral)
   */
  getOnTimeKpiStyle(supplierId: string): Record<string, string> {
    const rate = this.getOnTimeRate(supplierId);
    const received = this.getReceivedPOs(supplierId);
    if (!received.length) {
      return {
        background: 'linear-gradient(135deg, #64748b, #475569)',
        'box-shadow': '0 8px 20px rgba(100, 116, 139, 0.25)'
      };
    }
    if (rate >= 80) {
      return {
        background: 'linear-gradient(135deg, #22c55e, #10b981)',
        'box-shadow': '0 8px 20px rgba(34, 197, 94, 0.35)'
      };
    }
    if (rate >= 50) {
      return {
        background: 'linear-gradient(135deg, #f59e0b, #f97316)',
        'box-shadow': '0 8px 20px rgba(245, 158, 11, 0.35)'
      };
    }
    return {
      background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
      'box-shadow': '0 8px 20px rgba(244, 63, 94, 0.35)'
    };
  }

  // ── WhatsApp Helper ──────────────────────────────────────────────────────

  /** Builds a wa.me deep-link. Falls back to .phone if .whatsapp not set. Returns null = button hidden. */
  getWhatsAppUrl(supplier: Supplier): string | null {
    const raw = supplier.whatsapp || supplier.phone;
    if (!raw) return null;
    const cleaned = raw.replace(/[\s\-\(\)]/g, '');
    const msg = encodeURIComponent(`Hello ${supplier.name}, I'm reaching out regarding our purchase orders.`);
    return `https://wa.me/${cleaned}?text=${msg}`;
  }

  // ── Print PO ─────────────────────────────────────────────────────────────

  /** Fetches PO items then opens a print-ready popup. */
  printPO(po: PurchaseOrder) {
    this.printingPoId.set(po.id);
    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => { this.printingPoId.set(null); this._openPrintWindow(po, items); },
      error: (err) => { console.error('Print load failed', err); this.printingPoId.set(null); alert('Could not load order items. Please try again.'); }
    });
  }

  private _openPrintWindow(po: PurchaseOrder, items: any[]) {
    const storeName = this.storeService.currentStore()?.name ?? 'Our Store';
    const currency = this.storeService.currency() || 'USD';
    const supplier = this.selectedSupplier();
    const poRef = 'PO-' + po.id.substring(0, 8).toUpperCase();
    const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
    const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    const rows = items.map(item => {
      const prod = this.allProducts().find(p => p.id === item.product_id);
      const qty = item.quantity_ordered;
      const cost = item.unit_cost;
      return `<tr>
        <td>${prod?.name ?? item.product_id}</td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right">${fmt(cost)}</td>
        <td style="text-align:right"><strong>${fmt(qty * cost)}</strong></td>
      </tr>`;
    }).join('');

    const grandTotal = items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${poRef} — ${storeName}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;padding:40px;font-size:14px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
      .co{font-size:26px;font-weight:900}.pob h1{font-size:28px;font-weight:900;color:#6366f1;text-align:right}
      .pob .ref{font-family:monospace;font-size:13px;color:#64748b;text-align:right;margin-top:4px}
      hr{border:none;border-top:2px solid #e2e8f0;margin:20px 0}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:28px}
      .meta label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;display:block;margin-bottom:6px}
      .meta .val{line-height:1.8;color:#1e293b}.meta .val strong{font-size:15px;font-weight:700;display:block}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead tr{background:#f1f5f9}
      th{padding:11px 14px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;text-align:left}
      th:nth-child(2){text-align:center}th:nth-child(3),th:nth-child(4){text-align:right}
      td{padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:13px}
      td:nth-child(2){text-align:center}td:nth-child(3),td:nth-child(4){text-align:right}
      .totals{display:flex;justify-content:flex-end;margin-bottom:32px}
      .tb{width:260px}.trow{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9}
      .grand{border-top:2px solid #6366f1;border-bottom:none;padding-top:12px;font-size:18px;font-weight:900;color:#6366f1}
      .footer{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}
      .sig{border-top:1px solid #cbd5e1;padding-top:8px;font-size:11px;color:#94a3b8}
      .notes{margin-top:24px;padding:14px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:13px}
      .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e40af}
      @media print{body{padding:0}@page{margin:15mm}}
    </style></head><body>
    <div class="hdr">
      <div><div class="co">${storeName}</div><div style="color:#64748b;font-size:12px;margin-top:4px">Purchase Department</div></div>
      <div class="pob"><h1>PURCHASE ORDER</h1><div class="ref">${poRef}</div></div>
    </div><hr>
    <div class="meta">
      <div><label>Supplier</label><div class="val"><strong>${supplier?.name ?? ''}</strong>
        ${supplier?.email ? supplier.email + '<br>' : ''}${supplier?.phone ? supplier.phone + '<br>' : ''}${supplier?.address ?? ''}</div></div>
      <div style="text-align:right"><label>Order Details</label><div class="val"><strong>Date: ${fmtDate(po.created_at)}</strong>
        Expected: ${fmtDate(po.expected_arrival ?? undefined)}<br>Status: <span class="badge">${po.status}</span></div></div>
    </div>
    <table><thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:32px">No items on this order</td></tr>'}</tbody></table>
    <div class="totals"><div class="tb"><div class="trow grand"><span>Grand Total</span><span>${fmt(grandTotal)}</span></div></div></div>
    ${po.notes ? `<div class="notes"><b style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#92400e;margin-bottom:4px">Notes / Terms</b>${po.notes}</div>` : ''}
    <div class="footer"><div><div class="sig">Authorised By &amp; Date</div></div><div><div class="sig">Supplier Acknowledgement &amp; Date</div></div></div>
    </body></html>`;

    const win = window.open('', '_blank', 'width=940,height=720');
    if (!win) { alert('Please allow pop-ups to print Purchase Orders.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  }

  // ── Modal Actions ─────────────────────────────────────────────────────────

  openAddModal() {
    this.isEditing.set(false);
    this.editingId = null;
    this.supplierForm.reset({ lead_time_days: 7 });
    this.showModal.set(true);
  }

  openEditModal(supplier: Supplier) {
    this.isEditing.set(true);
    this.editingId = supplier.id;
    this.supplierForm.patchValue(supplier);
    this.showModal.set(true);
  }

  saveSupplier() {
    if (this.supplierForm.invalid) return;
    this.isSaving.set(true);
    const formVal = this.supplierForm.value;
    const storeId = this.storeService.currentStore()?.id;
    if (!storeId) { this.isSaving.set(false); return; }

    const obs$ = this.isEditing() && this.editingId
      ? this.supabase.updateSupplier(this.editingId, formVal)
      : this.supabase.addSupplier({ ...formVal, store_id: storeId });

    obs$.subscribe({
      next: (saved: Supplier | Supplier[]) => {
        this.isSaving.set(false);
        this.showModal.set(false);
        this.supplierForm.reset();
        // If editing, refresh the selected supplier panel
        if (this.isEditing() && this.selectedSupplier()) {
          const updated = Array.isArray(saved) ? saved[0] : saved;
          if (updated) this.selectedSupplier.set(updated);
        }
      },
      error: (err: any) => {
        console.error('Error saving supplier', err);
        this.isSaving.set(false);
      }
    });
  }

  deleteSupplier(supplier: Supplier) {
    if (confirm(`Delete "${supplier.name}"? This cannot be undone.`)) {
      this.supabase.deleteSupplier(supplier.id).subscribe({
        next: () => {
          if (this.selectedSupplier()?.id === supplier.id) {
            this.selectedSupplier.set(null);
          }
        },
        error: (err: any) => console.error('Delete failed', err)
      });
    }
  }
}
