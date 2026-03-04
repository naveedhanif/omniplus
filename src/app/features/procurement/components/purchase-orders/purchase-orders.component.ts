import { Component, inject, signal, computed, effect } from "@angular/core";
import { CommonModule, CurrencyPipe, DatePipe } from "@angular/common";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  FormGroup,
  FormArray,
  FormsModule,
} from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { switchMap, of } from "rxjs";
import {
  MockSupabaseService,
  PurchaseOrder,
  POStatus,
  Supplier,
  Store,
  Product,
  SupplierInvoice,
  SupplierInvoiceItem,
  SupplierClaim,
  ClaimType,
} from "../../../../core/services/mock-supabase.service";
import { StoreConfigService } from "../../../../core/services/store-config.service";

import { PurchaseOrderPrintComponent } from "../../../../shared/components/purchase-order-print.component";
import { SupplierInvoicePrintComponent } from "../../../../shared/components/supplier-invoice-print.component";

@Component({
  selector: "app-purchase-orders",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    PurchaseOrderPrintComponent,
    SupplierInvoicePrintComponent,
  ],
  template: `
    <div style="display:contents">
    <div class="flex flex-col h-[calc(100vh-120px)] bg-[var(--card-bg)] rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden relative">

      <!-- ── Top Tab Navigation ─────────────────────────────────────────── -->
      <div class="flex items-center gap-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 flex-shrink-0">
        <button (click)="activeTab.set('orders'); loadInvoices(); loadClaims()"
          class="flex items-center gap-2 px-5 py-4 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all duration-200"
          [class.border-[var(--primary-color)]]="activeTab() === 'orders'"
          [class.text-[var(--primary-color)]]="activeTab() === 'orders'"
          [class.border-transparent]="activeTab() !== 'orders'"
          [class.text-slate-500]="activeTab() !== 'orders'">
          <span class="material-symbols-rounded text-[18px]">shopping_cart</span>
          Purchase Orders
        </button>
        <button (click)="activeTab.set('invoices'); loadInvoices()"
          class="flex items-center gap-2 px-5 py-4 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all duration-200"
          [class.border-[var(--primary-color)]]="activeTab() === 'invoices'"
          [class.text-[var(--primary-color)]]="activeTab() === 'invoices'"
          [class.border-transparent]="activeTab() !== 'invoices'"
          [class.text-slate-500]="activeTab() !== 'invoices'">
          <span class="material-symbols-rounded text-[18px]">receipt_long</span>
          Invoices
          @if (invoices().length > 0) {
            <span class="bg-teal-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{{ invoices().length }}</span>
          }
        </button>
        <button (click)="activeTab.set('claims'); loadClaims()"
          class="flex items-center gap-2 px-5 py-4 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all duration-200"
          [class.border-[var(--primary-color)]]="activeTab() === 'claims'"
          [class.text-[var(--primary-color)]]="activeTab() === 'claims'"
          [class.border-transparent]="activeTab() !== 'claims'"
          [class.text-slate-500]="activeTab() !== 'claims'">
          <span class="material-symbols-rounded text-[18px]">warning</span>
          Claims & Disputes
          @if (claims().length > 0) {
            <span class="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{{ claims().length }}</span>
          }
        </button>

        <div class="flex-1"></div>
        @if (activeTab() === 'claims') {
          <button (click)="openClaimModal(undefined)"
            class="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl shadow hover:brightness-110 transition-all my-2">
            <span class="material-symbols-rounded text-sm">add</span>
            New Claim
          </button>
        }
      </div>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- INVOICES TAB                                           -->
      <!-- ═══════════════════════════════════════════════════════ -->
      @if (activeTab() === 'invoices') {
        <div class="flex-1 overflow-auto p-6">
          @if (invoices().length === 0) {
            <div class="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto opacity-60">
              <span class="material-symbols-rounded text-6xl text-slate-300 mb-4">receipt_long</span>
              <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200">No Invoices Yet</h3>
              <p class="text-sm text-slate-500 mt-2">Invoices are generated from <strong>RECEIVED</strong> purchase orders. Open a received PO and click "Generate Invoice".</p>
            </div>
          } @else {
            <!-- Filters -->
            <div class="flex flex-col gap-4 mb-6">
              <div class="flex flex-wrap gap-2">
                @for (status of ['ALL', 'UNPAID', 'OVERDUE', 'PAID']; track status) {
                  <button (click)="invoiceStatusFilter.set($any(status))"
                    class="px-4 py-2 rounded-xl text-xs font-black tracking-widest uppercase transition-all shadow-sm border border-transparent"
                    [ngClass]="invoiceStatusFilter() === status ? 
                      'bg-[var(--primary-color)] text-white shadow-[0_8px_15px_rgba(var(--primary-color-rgb),0.3)]' : 
                      'bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500'">
                    {{ status }}
                  </button>
                }
              </div>
              <div class="relative max-w-md">
                <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                <input type="text" placeholder="Search invoice no, PO reference, or supplier..." [ngModel]="invoiceSearchTerm()" (ngModelChange)="invoiceSearchTerm.set($event)"
                  class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[var(--primary-color)] outline-none shadow-sm dark:text-white transition-all">
              </div>
            </div>

            <div class="space-y-3">
              <!-- Column Headers -->
              <div class="grid grid-cols-8 gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Invoice #</span>
                <span>PO Ref</span>
                <span>Supplier</span>
                <span>Issued</span>
                <span>Due Date</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              @for (inv of filteredInvoices(); track inv.id) {
                <div class="grid grid-cols-8 gap-3 items-center bg-white dark:bg-slate-800 rounded-2xl px-4 py-4 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all">
                  <!-- Invoice # -->
                  <span class="font-black text-teal-600 dark:text-teal-400 font-mono text-sm">{{ inv.invoice_number }}</span>
                  <!-- PO Ref -->
                  <span class="font-medium text-slate-500 dark:text-slate-400 text-xs font-mono">{{ inv.po?.order_number || inv.po_id?.substring(0,8) }}</span>
                  <!-- Supplier -->
                  <span class="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{{ inv.supplier?.name || '—' }}</span>
                  <!-- Issued -->
                  <span class="text-sm text-slate-500">{{ inv.issued_date | date:'d MMM y' }}</span>
                  <!-- Due Date -->
                  <span class="text-sm" [class.text-rose-600]="isDueOverdue(inv)" [class.font-black]="isDueOverdue(inv)">
                    {{ inv.due_date ? (inv.due_date | date:'d MMM y') : '—' }}
                    @if (isDueOverdue(inv)) { <span class="text-[9px] ml-1">⚠</span> }
                  </span>
                  <!-- Amount -->
                  <span class="font-black text-emerald-700 dark:text-emerald-400 text-sm">{{ inv.total_amount | currency: storeService.currency() }}</span>
                  <!-- Payment Status -->
                  <span class="text-[11px] font-black px-2 py-1 rounded-full w-fit" [ngClass]="getPaymentStatusClass(inv.payment_status)">
                    {{ inv.payment_status }}
                  </span>
                  <!-- Actions -->
                  <div class="flex items-center gap-1.5">
                    <!-- VIEW button (opens invoice preview modal instantly) -->
                    <button (click)="openInvoicePrint(inv)"
                      class="flex items-center gap-1 px-3 py-1.5 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-700 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors"
                      title="View & Print Invoice">
                      <span class="material-symbols-rounded text-[14px]">visibility</span>
                      View
                    </button>
                    <!-- Mark Paid -->
                    @if (inv.payment_status !== 'PAID') {
                      <button (click)="markInvoicePaid(inv)"
                        class="text-[10px] font-black px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap">
                        Mark Paid
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════ -->
      <!-- CLAIMS TAB                                             -->
      <!-- ═══════════════════════════════════════════════════════ -->
      @if (activeTab() === 'claims') {
        <div class="flex-1 overflow-auto p-6">
          @if (claims().length === 0) {
            <div class="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto opacity-60">
              <span class="material-symbols-rounded text-6xl text-slate-300 mb-4">verified_user</span>
              <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200">No Claims Filed</h3>
              <p class="text-sm text-slate-500 mt-2">Use the <strong>"New Claim"</strong> button above to file a claim for damaged, missing, or incorrect goods from a supplier.</p>
            </div>
          } @else {
            <div class="space-y-4">
              @for (claim of claims(); track claim.id) {
                <div class="bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden"
                     [class.border-rose-200]="claim.status === 'OPEN'"
                     [class.border-amber-200]="claim.status === 'ACKNOWLEDGED'"
                     [class.border-green-200]="claim.status === 'RESOLVED'"
                     [class.border-slate-200]="claim.status === 'REJECTED'">
                  <div class="flex items-center justify-between p-5">
                    <div class="flex items-center gap-4">
                      <div class="w-12 h-12 rounded-2xl flex items-center justify-center"
                           [class.bg-rose-100]="claim.status === 'OPEN'"
                           [class.text-rose-600]="claim.status === 'OPEN'"
                           [class.bg-green-100]="claim.status === 'RESOLVED'"
                           [class.text-green-600]="claim.status === 'RESOLVED'"
                           [class.bg-amber-100]="claim.status === 'ACKNOWLEDGED'"
                           [class.text-amber-600]="claim.status === 'ACKNOWLEDGED'"
                           [class.bg-slate-100]="claim.status === 'REJECTED'"
                           [class.text-slate-500]="claim.status === 'REJECTED'">
                        <span class="material-symbols-rounded">
                          {{ claim.status === 'RESOLVED' ? 'check_circle' : 'warning' }}
                        </span>
                      </div>
                      <div>
                        <div class="flex items-center gap-3">
                          <span class="font-black text-slate-800 dark:text-slate-100 font-mono">{{ claim.claim_number }}</span>
                          <span class="text-[11px] font-black px-2 py-0.5 rounded-full" [ngClass]="getClaimStatusClass(claim.status)">{{ claim.status }}</span>
                          <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{{ claim.claim_type.replace('_', ' ') }}</span>
                        </div>
                        <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">{{ claim.description }}</p>
                        <p class="text-[11px] text-slate-400 mt-1">
                          Supplier: {{ claim.supplier?.name || '—' }}
                          @if (claim.po) { &nbsp;·&nbsp; PO: {{ claim.po.order_number || claim.po_id?.substring(0,8) }} }
                          @if (claim.product) { &nbsp;·&nbsp; Item: {{ claim.product['name'] }} (Qty: {{ claim.quantity_affected }})}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      @if (claim.status === 'OPEN' || claim.status === 'ACKNOWLEDGED') {
                        <div class="flex flex-col gap-1">
                          <p class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Resolve As</p>
                          <div class="flex gap-1">
                            <button (click)="resolveClaim(claim, 'CREDIT_NOTE')" class="text-[10px] font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">Credit Note</button>
                            <button (click)="resolveClaim(claim, 'REPLACEMENT')" class="text-[10px] font-bold px-2 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors">Replace</button>
                            <button (click)="resolveClaim(claim, 'REFUND')" class="text-[10px] font-bold px-2 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">Refund</button>
                          </div>
                        </div>
                        <button (click)="notifySupplierWhatsApp(claim)"
                          class="flex items-center gap-1 px-3 py-2 bg-green-500 text-white text-xs font-bold rounded-xl hover:bg-green-600 transition-colors shadow-sm">
                          <span class="material-symbols-rounded text-sm">chat</span>
                          WhatsApp
                        </button>
                      }
                      @if (claim.status === 'RESOLVED') {
                        <span class="text-sm text-green-600 font-bold">✅ {{ claim.resolution_type?.replace('_', ' ') }}</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- New Claim Modal -->
        @if (showClaimModal()) {
          <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-700">
              <div class="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h3 class="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span class="material-symbols-rounded text-rose-500">warning</span>
                  File a Supplier Claim
                </h3>
                <button (click)="showClaimModal.set(false)" class="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                  <span class="material-symbols-rounded">close</span>
                </button>
              </div>
              <div class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Supplier *</label>
                    <select [(ngModel)]="claimForm.supplier_id" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none dark:text-white">
                      <option value="">Select supplier...</option>
                      @for (s of suppliers(); track s.id) {
                        <option [value]="s.id">{{ s.name }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Linked PO</label>
                    <select [(ngModel)]="claimForm.po_id" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none dark:text-white">
                      <option value="">No PO link</option>
                      @for (po of purchaseOrders(); track po.id) {
                        <option [value]="po.id">{{ po.order_number || po.id.substring(0,8) }} – {{ po.supplier?.name }}</option>
                      }
                    </select>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Claim Type *</label>
                    <select [(ngModel)]="claimForm.claim_type" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none dark:text-white">
                      <option value="DAMAGED">Damaged</option>
                      <option value="SHORT_DELIVERED">Short Delivered</option>
                      <option value="WRONG_ITEM">Wrong Item</option>
                      <option value="DEFECTIVE">Defective</option>
                      <option value="OVERCHARGED">Overcharged</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Qty Affected</label>
                    <input type="number" [(ngModel)]="claimForm.quantity_affected" min="1" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none dark:text-white">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Item Affected</label>
                  <select [(ngModel)]="claimForm.product_id" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none dark:text-white">
                    <option value="">General claim (no specific item)</option>
                    @for (p of products(); track p.id) {
                      <option [value]="p.id">{{ p.name }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description *</label>
                  <textarea [(ngModel)]="claimForm.description" rows="3" placeholder="Describe the issue in detail..." class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-rose-500 outline-none dark:text-white"></textarea>
                </div>
              </div>
              <div class="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button (click)="showClaimModal.set(false)" class="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                <button (click)="submitClaim()" [disabled]="!claimForm.supplier_id || !claimForm.description || isSubmittingClaim()"
                  class="px-5 py-2.5 rounded-xl font-bold text-sm bg-rose-600 text-white hover:bg-rose-700 shadow-md disabled:opacity-50 transition-all">
                  {{ isSubmittingClaim() ? 'Filing...' : 'File Claim' }}
                </button>
              </div>
            </div>
          </div>
        }
      }

      <!-- PURCHASE ORDERS TAB (original content) -->
      <div class="flex flex-1 gap-0 overflow-hidden relative" [style.display]="activeTab() === 'orders' ? 'flex' : 'none'">
      <!-- ── Receive PO Dialog Overlay (Global) ─────────────────────────── -->
      <div
        *ngIf="showReceiveDialog()"
        class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
      >
        <div
          class="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col h-[90vh] scale-100 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800 overflow-hidden"
        >
          <!-- Dialog Header -->
          <div
            class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50"
          >
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400"
              >
                <span class="material-symbols-rounded">move_to_inbox</span>
              </div>
              <div>
                <h3
                  class="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight"
                >
                  Receive Warehouse Consignment
                </h3>
                <p
                  class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5"
                >
                  Order Ref: PO-{{
                    selectedPOToReceive()?.id?.substring(0, 8)?.toUpperCase()
                  }}
                </p>
              </div>
            </div>
            <button
              (click)="closeReceiveDialog()"
              class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>

          <!-- Scrollable List of Items to Receive -->
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            @if (receiveError()) {
              <div
                class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400 animate-in slide-in-from-top-2"
              >
                <span class="material-symbols-rounded">error</span>
                <span class="text-sm font-bold">{{ receiveError() }}</span>
              </div>
            }

            <!-- Target Destination Selector -->
            <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <span class="material-symbols-rounded">location_on</span>
                </div>
                <div>
                  <div class="text-[10px] font-black uppercase tracking-widest text-blue-500">Destination Location</div>
                  <div class="text-sm font-bold text-slate-700 dark:text-slate-200">Where should this stock be placed?</div>
                </div>
              </div>
              
              <div class="flex-1 max-w-xs">
                <select [ngModel]="selectedReceiveLocationId()" 
                        (ngModelChange)="selectedReceiveLocationId.set($event)"
                        class="w-full bg-white dark:bg-slate-800 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3 text-sm font-bold focus:border-blue-500 outline-none transition-all shadow-sm">
                  @for (loc of stockLocations(); track loc.id) {
                    <option [value]="loc.id">{{ loc.name }} ({{ loc.location_type }})</option>
                  }
                </select>
              </div>
            </div>

            <div
              class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              <table class="w-full text-left text-xs">
                <thead
                  class="bg-slate-50 dark:bg-slate-800/50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-700"
                >
                  <tr>
                    <th class="px-6 py-4">Consignment Item</th>
                    <th class="px-4 py-4 text-center">Remaining</th>
                    <th class="px-4 py-4 text-center w-32">Receiving Now</th>
                    <th class="px-6 py-4">Serial Numbers (Optional)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                  @for (item of receiveItems(); track item.id; let i = $index) {
                    <tr
                      class="hover:bg-slate-50 dark:hover:bg-slate-900/10 transition-colors"
                    >
                      <td class="px-6 py-5">
                        <div
                          class="font-black text-slate-800 dark:text-slate-200"
                        >
                          {{ getProductName(item.product_id) }}
                        </div>
                        <div
                          class="text-[10px] font-bold text-slate-400 uppercase mt-0.5"
                        >
                          Ordered: {{ item.quantity_ordered }} units
                        </div>
                      </td>
                      <td class="px-4 py-5 text-center">
                        <span
                          class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 font-black rounded-lg"
                        >
                          {{
                            item.quantity_ordered -
                              (item.quantity_received || 0)
                          }}
                        </span>
                      </td>
                      <td class="px-4 py-5">
                        <input
                          type="number"
                          [(ngModel)]="item.receiving_now"
                          min="0"
                          class="w-full bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-xl p-3 text-center font-black focus:border-green-500 outline-none transition-all"
                          [class.text-green-600]="item.receiving_now > 0"
                          [class.border-amber-400]="
                            item.receiving_now >
                            item.quantity_ordered -
                              (item.quantity_received || 0)
                          "
                        />
                      </td>
                      <td class="px-6 py-5">
                        @if (isProductSerialized(item.product_id)) {
                          <div class="space-y-2">
                            <input
                              type="text"
                              [(ngModel)]="item.serial_numbers_input"
                              placeholder="Scan or type serials (comma separated)..."
                              class="w-full bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-xl p-3 text-[11px] font-mono focus:border-blue-500 outline-none transition-all"
                            />
                            <div class="flex justify-between items-center px-1">
                              <span
                                class="text-[9px] font-black uppercase tracking-widest text-slate-400"
                                >Validated Serials</span
                              >
                              <span
                                class="text-[10px] font-black"
                                [class.text-green-600]="
                                  getValidSerialCount(
                                    item.serial_numbers_input
                                  ) === item.receiving_now
                                "
                                [class.text-red-500]="
                                  getValidSerialCount(
                                    item.serial_numbers_input
                                  ) !== item.receiving_now
                                "
                              >
                                {{
                                  getValidSerialCount(item.serial_numbers_input)
                                }}
                                / {{ item.receiving_now }}
                              </span>
                            </div>
                          </div>
                        } @else {
                          <div
                            class="text-slate-300 dark:text-slate-600 italic text-[10px] font-bold uppercase tracking-widest"
                          >
                            No Serial Tracking Required
                          </div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Footer Actions -->
          <div
            class="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shadow-[0_-10px_30px_rgba(0,0,0,0.02)]"
          >
            <div class="flex items-center gap-2 text-slate-400">
              <span class="material-symbols-rounded text-base">info</span>
              <span
                class="text-[10px] font-bold uppercase tracking-widest italic"
                >Inventory levels will increment instantly upon
                submission.</span
              >
            </div>
            <div class="flex items-center gap-3">
              <button
                (click)="closeReceiveDialog()"
                class="px-6 py-3 text-sm font-black text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 uppercase tracking-widest transition-colors"
              >
                Cancel Receipt
              </button>
              <button
                (click)="submitReceivePO()"
                [disabled]="isReceiving() || !hasValidReceiveQuantities()"
                class="px-10 py-3 bg-green-600 text-white text-sm font-black rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 uppercase tracking-widest"
              >
                <span
                  class="material-symbols-rounded text-sm animate-spin"
                  *ngIf="isReceiving()"
                  >progress_activity</span
                >
                <span
                  class="material-symbols-rounded text-sm"
                  *ngIf="!isReceiving()"
                  >done_all</span
                >
                {{ isReceiving() ? "Processing..." : "Complete Entry" }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <app-purchase-order-print
        *ngIf="showPrintPreview()"
        [po]="selectedPO()!"
        [items]="selectedPOItems()"
        [store]="storeService.currentStore()"
        [currency]="storeService.currency()"
        (close)="showPrintPreview.set(false)"
      />

      <!-- ══════════════════════════════════════════════════════════
           COLUMN 2 — PO List
      ══════════════════════════════════════════════════════════ -->
      <div
        class="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      >
        <!-- Header: Search & Filter & New -->
        <div
          class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3"
        >
          <div class="flex items-center justify-between">
            <h2
              class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"
            >
              <span
                class="material-symbols-rounded text-base text-[var(--primary-color)]"
                >shopping_cart</span
              >
              Orders
              <span
                class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full text-[10px] font-black text-slate-600 dark:text-slate-400"
                >{{ filteredPOs().length }}</span
              >
            </h2>
            <button
              (click)="startNewPO()"
              class="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary-color)] text-white text-xs font-bold rounded-lg shadow hover:brightness-110 active:scale-95 transition-all"
            >
              <span class="material-symbols-rounded text-sm">add</span>
              New
            </button>
          </div>

          <!-- Filters Strip -->
          <div
            class="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1 overflow-x-auto no-scrollbar"
          >
            <button
              *ngFor="
                let filter of ['ALL', 'DRAFT', 'SENT', 'ORDERED', 'RECEIVED']
              "
              (click)="statusFilter.set(filter)"
              [class.bg-white]="statusFilter() === filter"
              [class.dark:bg-slate-600]="statusFilter() === filter"
              [class.shadow-sm]="statusFilter() === filter"
              [class.text-slate-900]="statusFilter() === filter"
              class="flex-1 px-2 py-1.5 text-[10px] font-black rounded-md transition-all whitespace-nowrap"
            >
              {{ filter }}
            </button>
          </div>

          <!-- Search Input -->
          <div class="relative">
            <span
              class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]"
              >search</span
            >
            <input
              type="text"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              placeholder="Search ID or supplier..."
              class="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 transition-all"
            />
          </div>
        </div>

        <!-- Scrollable PO cards -->
        <div
          class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800"
        >
          @for (po of filteredPOs(); track po.id) {
            <button
              type="button"
              (click)="viewPODetail(po)"
              class="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all group border-l-4"
              [ngClass]="{
                'bg-blue-50 dark:bg-blue-900/10 border-l-[var(--primary-color)]':
                  selectedPO()?.id === po.id,
                'border-l-transparent': selectedPO()?.id !== po.id,
              }"
            >
              <div class="flex justify-between items-start mb-1">
                <span class="text-xs font-mono font-bold text-slate-400"
                  >#{{ po.id.substring(0, 8) }}</span
                >
                <span
                  class="text-[10px] font-black px-2 py-0.5 rounded-full"
                  [ngClass]="getStatusClass(po.status)"
                >
                  {{ po.status }}
                </span>
              </div>

              <div
                class="font-bold text-slate-800 dark:text-slate-100 truncate mb-1"
              >
                {{ po.supplier?.name || "Unknown" }}
              </div>

              <div class="flex items-center justify-between mt-2">
                <span
                  class="text-xs font-black text-slate-600 dark:text-slate-400"
                  >{{
                    po.total_amount | currency: storeService.currency()
                  }}</span
                >
                <span class="text-[10px] text-slate-400 font-medium">
                  {{
                    po.expected_arrival
                      ? (po.expected_arrival | date: "MMM d")
                      : (po.created_at | date: "MMM d")
                  }}
                </span>
              </div>
            </button>
          } @empty {
            <div
              class="flex flex-col items-center py-20 text-slate-400 text-sm gap-2 opacity-50 px-6 text-center"
            >
              <span class="material-symbols-rounded text-4xl">inventory_2</span>
              <span>No orders match filters</span>
            </div>
          }
        </div>

        <!-- Footer: Mini Stats -->
        <div
          class="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-1 text-[10px]"
        >
          <div class="flex justify-between">
            <span class="text-slate-400 uppercase font-black">Open Amount</span>
            <span class="font-bold text-blue-600">{{
              calculateOpenValue() | currency: storeService.currency()
            }}</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           COLUMN 3 — Detail View / Form Area
      ══════════════════════════════════════════════════════════ -->
      <div
        class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/10"
      >
        <!-- Case A: DETAIL VIEW -->
        @if (
          (viewState() === "DETAIL" || viewState() === "LIST") && selectedPO()
        ) {
          @if (selectedPO(); as po) {
            <div
              class="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300 relative"
            >
              <!-- Refined Header -->
              <div
                class="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 z-10 shadow-sm"
              >
                <div>
                  <div class="flex items-center gap-3 mb-1.5">
                    <h1
                      class="text-3xl font-black font-mono tracking-tight text-slate-900 dark:text-white"
                    >
                      PO-{{ po.id.substring(0, 8) }}
                    </h1>
                    <span
                      class="px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm border"
                      [ngClass]="getStatusClass(po.status)"
                    >
                      {{ po.status }}
                    </span>
                  </div>
                  <p
                    class="text-[12px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"
                  >
                    <span
                      class="material-symbols-rounded text-sm text-[var(--primary-color)]"
                      >local_shipping</span
                    >
                    {{ po.supplier?.name || "Unknown Supplier" }}
                    <span class="text-slate-300 mx-1">•</span>
                    Commisioned: {{ po.created_at | date: "mediumDate" }}
                  </p>
                </div>

                <div class="flex items-center gap-2 flex-wrap justify-end">
                  <!-- Workflow Transitions -->
                  @if (po.status === "DRAFT") {
                    <button
                      (click)="startEditPO(po)"
                      class="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-black text-xs text-slate-700 dark:text-slate-300 rounded-xl transition-all shadow-sm"
                    >
                      Edit Draft
                    </button>
                    <button
                      (click)="advanceStatus(po, 'SENT')"
                      class="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_8px_15px_rgba(37,99,235,0.2)] hover:shadow-[0_8px_25px_rgba(37,99,235,0.3)] active:scale-95 transition-all flex items-center gap-2"
                    >
                      <span class="material-symbols-rounded text-[15px]"
                        >send</span
                      >
                      Transmit Order
                    </button>
                  }
                  @if (po.status === "SENT") {
                    <button
                      (click)="advanceStatus(po, 'ORDERED')"
                      class="px-5 py-2 bg-gradient-to-r from-[var(--primary-color)] to-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_8px_15px_rgba(var(--primary-color-rgb),0.2)] active:scale-95 transition-all flex items-center gap-2"
                    >
                      <span class="material-symbols-rounded text-[15px]"
                        >inventory_2</span
                      >
                      Acknowledge
                    </button>
                  }
                  @if (["SENT", "ORDERED", "PARTIAL"].includes(po.status)) {
                    <button
                      (click)="openReceiveDialog(po)"
                      class="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_8px_15px_rgba(16,185,129,0.2)] active:scale-95 transition-all flex items-center gap-2"
                    >
                      <span class="material-symbols-rounded text-[15px]">move_to_inbox</span>
                      Receive Goods
                    </button>
                  }

                  @if (po.status === 'RECEIVED') {
                    <button (click)="openInvoiceModal(po)"
                      class="px-5 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_8px_15px_rgba(20,184,166,0.2)] active:scale-95 transition-all flex items-center gap-2">
                      <span class="material-symbols-rounded text-[15px]">receipt_long</span>
                      Generate Invoice
                    </button>
                  }

                  @if (!(['CANCELLED', 'DRAFT'].includes(po.status))) {
                    <button (click)="openClaimModal(po)"
                      class="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 hover:bg-rose-100 font-bold text-xs rounded-xl transition-all flex items-center gap-2 border border-rose-100">
                      <span class="material-symbols-rounded text-[15px]">warning</span>
                      Raise Claim
                    </button>
                  }

                  <!-- Destructive Actions -->
                  @if (!["RECEIVED", "CANCELLED", "INVOICED"].includes(po.status)) {
                    <button
                      (click)="cancelPO(po)"
                      class="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-bold text-xs rounded-xl transition-all flex items-center gap-2 border border-red-100 ml-2"
                    >
                      <span class="material-symbols-rounded text-[15px]">cancel</span>
                      Void
                    </button>
                  }

                  <div
                    class="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1"
                  ></div>

                  <button
                    (click)="cloneOrder(po)"
                    class="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] rounded-xl text-slate-500 transition-all shadow-sm"
                    title="Clone Order to Draft"
                  >
                    <span class="material-symbols-rounded text-[18px]"
                      >content_copy</span
                    >
                  </button>

                  <button
                    (click)="printPO(po)"
                    class="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-400 rounded-xl text-slate-500 transition-all shadow-sm"
                    title="Print Purchase Order"
                  >
                    <span class="material-symbols-rounded text-[18px]"
                      >print</span
                    >
                  </button>
                </div>
              </div>

              <!-- Scrollable Dash Content -->
              <div
                class="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 px-8 py-6"
              >
                <!-- BENTO BOX: Dashboard Grid -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
                  <!-- Primary Value Card -->
                  <div
                    class="md:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-black dark:to-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between group"
                  >
                    <!-- Abstract Deco -->
                    <div
                      class="absolute -right-10 -top-10 w-40 h-40 bg-[var(--primary-color)] rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700"
                    ></div>

                    <div>
                      <div
                        class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5"
                      >
                        <span class="material-symbols-rounded text-[14px]"
                          >account_balance_wallet</span
                        >
                        Total Commitment
                      </div>
                      <div
                        class="text-4xl lg:text-5xl font-black tracking-tighter text-white mt-2"
                      >
                        {{
                          po.total_amount | currency: storeService.currency()
                        }}
                      </div>
                    </div>

                    <div
                      class="mt-6 pt-4 border-t border-slate-700/50 flex justify-between items-end"
                    >
                      <div class="space-y-1">
                        <div
                          class="text-[10px] font-black uppercase tracking-widest text-slate-400"
                        >
                          Status
                        </div>
                        <div class="text-sm font-bold text-white">
                          {{ po.status }}
                        </div>
                      </div>
                      <div class="space-y-1 text-right">
                        <div
                          class="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-end gap-1"
                        >
                          <span class="material-symbols-rounded text-[12px]"
                            >calendar_today</span
                          >
                          Expected
                        </div>
                        <div
                          class="text-sm font-bold text-[var(--primary-color)]"
                        >
                          {{
                            po.expected_arrival
                              ? (po.expected_arrival | date: "MMM d, yyyy")
                              : "TBD"
                          }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Metrics Group -->
                  <div class="md:col-span-7 flex flex-col gap-6">
                    <!-- Internal Notes Block -->
                    <div
                      class="flex-1 bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col relative overflow-hidden"
                    >
                      <div
                        class="w-1 absolute left-0 top-0 bottom-0 bg-yellow-400/50"
                      ></div>
                      <h3
                        class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5 ml-2"
                      >
                        <span class="material-symbols-rounded text-[14px]"
                          >edit_note</span
                        >
                        Documentation
                      </h3>
                      <div
                        class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium ml-2 relative z-10"
                      >
                        @if (po.notes) {
                          {{ po.notes }}
                        } @else {
                          <span class="opacity-50 italic"
                            >No operational notes attached to this
                            document.</span
                          >
                        }
                      </div>
                      <span
                        class="material-symbols-rounded absolute -bottom-4 -right-2 text-6xl text-slate-50 dark:text-slate-800/50 pointer-events-none z-0"
                        >format_quote</span
                      >
                    </div>

                    <!-- SKU Summary -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between"
                    >
                      <div class="flex items-center gap-4">
                        <div
                          class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500"
                        >
                          <span class="material-symbols-rounded text-[22px]"
                            >category</span
                          >
                        </div>
                        <div>
                          <div
                            class="text-[10px] font-black uppercase tracking-widest text-slate-400"
                          >
                            Procurement Items
                          </div>
                          <div
                            class="text-lg font-black text-slate-800 dark:text-slate-100"
                          >
                            {{ selectedPOItems()?.length || 0 }} SKUs processing
                          </div>
                        </div>
                      </div>

                      <!-- Received Progress Ring (Faux visual for now) -->
                      <div class="hidden sm:flex flex-col items-center">
                        <div
                          class="text-[20px] font-black text-slate-800 dark:text-slate-100 tabular-nums"
                        >
                          @if (po.status === "RECEIVED") {
                            100%
                          } @else if (po.status === "PARTIAL") {
                            50%
                          } @else {
                            0%
                          }
                        </div>
                        <div
                          class="text-[9px] font-black uppercase tracking-widest text-slate-400"
                        >
                          Fulfilled
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Manifesto / Line Items Table -->
                <div
                  class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden mb-8 relative"
                >
                  <div
                    class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--primary-color)] to-blue-400"
                  ></div>

                  <div
                    class="px-6 py-5 border-b border-slate-100 dark:border-slate-700/50"
                  >
                    <h2
                      class="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2"
                    >
                      <span
                        class="material-symbols-rounded text-[18px] text-[var(--primary-color)]"
                        >format_list_bulleted</span
                      >
                      Consolidated Manifest
                    </h2>
                  </div>

                  <div class="p-0">
                    @if (isLoadingItems()) {
                      <div
                        class="py-20 flex flex-col items-center justify-center gap-3 opacity-50"
                      >
                        <span
                          class="material-symbols-rounded text-3xl animate-spin text-[var(--primary-color)]"
                          >sync</span
                        >
                        <span
                          class="text-xs font-bold uppercase tracking-widest"
                          >Compiling Database Records</span
                        >
                      </div>
                    } @else {
                      <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                          <tr>
                            <th
                              class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400"
                            >
                              Commodity
                            </th>
                            <th
                              class="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center"
                            >
                              Req. Qty
                            </th>
                            <th
                              class="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center"
                            >
                              Received
                            </th>
                            <th
                              class="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right"
                            >
                              Unit Rate
                            </th>
                            <th
                              class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right"
                            >
                              Ext. Price
                            </th>
                          </tr>
                        </thead>
                        <tbody
                          class="divide-y divide-slate-100 dark:divide-slate-700/50"
                        >
                          @for (item of selectedPOItems(); track item.id) {
                            <tr
                              class="group hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors"
                            >
                              <td class="px-6 py-4">
                                <div
                                  class="font-bold text-slate-800 dark:text-slate-200"
                                >
                                  {{ getProductName(item.product_id) }}
                                </div>
                                <div
                                  class="text-[10px] font-mono text-slate-400 mt-0.5"
                                >
                                  ID: {{ item.product_id.substring(0, 8) }}
                                </div>
                              </td>
                              <td class="px-4 py-4 text-center align-middle">
                                <span
                                  class="inline-flex items-center justify-center min-w-[32px] h-8 px-2 bg-slate-100 dark:bg-slate-800 rounded-lg font-black text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  >{{ item.quantity_ordered }}</span
                                >
                              </td>
                              <td class="px-4 py-4 text-center align-middle">
                                <span
                                  class="inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg font-black border transition-colors"
                                  [ngClass]="
                                    item.quantity_received >=
                                    item.quantity_ordered
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50'
                                      : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/50'
                                  "
                                >
                                  {{ item.quantity_received || 0 }}
                                </span>
                              </td>
                              <td
                                class="px-4 py-4 text-right align-middle text-slate-500 font-medium tabular-nums"
                              >
                                {{
                                  item.unit_cost
                                    | currency: storeService.currency()
                                }}
                              </td>
                              <td
                                class="px-6 py-4 text-right align-middle font-black text-slate-900 dark:text-white tabular-nums tracking-tight"
                              >
                                {{
                                  item.quantity_ordered * item.unit_cost
                                    | currency: storeService.currency()
                                }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        }

        @if (viewState() === "CREATE" || viewState() === "EDIT") {
          <div
            class="flex-1 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300"
          >
            <!-- Sticky Header -->
            <div
              class="px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex justify-between items-center sticky top-0 z-20"
            >
              <div>
                <h2 class="text-2xl font-black text-slate-900 dark:text-white">
                  <span
                    class="material-symbols-rounded align-middle mr-2 text-[var(--primary-color)]"
                    >{{ editMode() ? "edit_document" : "add_box" }}</span
                  >
                  {{ editMode() ? "Edit Order" : "New Purchase Order" }}
                </h2>
                @if (editMode() && editingPoId()) {
                  <p
                    class="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1 ml-9 flex items-center gap-1.5"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                    Modification Mode: PO-{{ editingPoId()!.substring(0, 8) }}
                  </p>
                } @else {
                  <p
                    class="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1 ml-9 flex items-center gap-1.5"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    Drafting New Requisition
                  </p>
                }
              </div>
              <div class="flex gap-3">
                <button
                  (click)="discardForm()"
                  class="px-5 py-2.5 text-xs font-black text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all uppercase tracking-wider"
                >
                  Discard
                </button>
                <button
                  (click)="savePO()"
                  [disabled]="
                    poForm.invalid || items.length === 0 || isSaving()
                  "
                  class="px-8 py-2.5 bg-gradient-to-r from-[var(--primary-color)] to-blue-600 text-white text-xs font-black rounded-xl shadow-[0_8px_20px_rgba(var(--primary-color-rgb),0.3)] hover:shadow-[0_8px_25px_rgba(var(--primary-color-rgb),0.4)] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2 uppercase tracking-wider"
                >
                  <span
                    class="material-symbols-rounded text-sm animate-spin"
                    *ngIf="isSaving()"
                    >progress_activity</span
                  >
                  <span
                    class="material-symbols-rounded text-sm"
                    *ngIf="!isSaving()"
                    >send</span
                  >
                  {{
                    isSaving()
                      ? "Saving..."
                      : editMode()
                        ? "Update Order"
                        : "Commit Order"
                  }}
                </button>
              </div>
            </div>

            <div
              class="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-6"
            >
              <form
                [formGroup]="poForm"
                class="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-full items-start"
              >
                <!-- LEFT PANE: Catalogue & Supplier Info (Scrolls independently if needed) -->
                <div class="flex-1 space-y-6 min-w-0">
                  <!-- Supplier Info Card -->
                  <div
                    class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm"
                  >
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div class="space-y-2 relative">
                        <label
                          class="block text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"
                        >
                          <span class="material-symbols-rounded text-xs"
                            >store</span
                          >
                          Supplier Selection
                        </label>
                        <div class="relative">
                          <select
                            formControlName="supplier_id"
                            (change)="onSupplierChange()"
                            class="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 pl-4 pr-10 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all appearance-none shadow-inner"
                          >
                            <option [ngValue]="null">
                              Select a provider...
                            </option>
                            @for (supplier of suppliers(); track supplier.id) {
                              <option [value]="supplier.id">
                                {{ supplier.name }}
                              </option>
                            }
                          </select>
                          <span
                            class="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
                            >expand_more</span
                          >
                        </div>

                        @if (lastSupplierPO()) {
                          <button
                            type="button"
                            (click)="repeatLastOrder()"
                            [disabled]="isRepeatLoading()"
                            class="absolute -bottom-8 left-0 flex items-center gap-1 text-[var(--primary-color)] text-[10px] font-black hover:underline transition-all"
                          >
                            <span
                              class="material-symbols-rounded text-[14px]"
                              [class.animate-spin]="isRepeatLoading()"
                            >
                              {{
                                isRepeatLoading()
                                  ? "progress_activity"
                                  : "history"
                              }}
                            </span>
                            Quick-Fill from Last Order ({{
                              lastSupplierPO()!.total_amount
                                | currency: storeService.currency()
                            }})
                          </button>
                        }
                      </div>
                      <div class="space-y-2">
                        <label
                          class="block text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"
                        >
                          <span class="material-symbols-rounded text-xs"
                            >event</span
                          >
                          Expected Delivery
                        </label>
                        <input
                          type="date"
                          formControlName="expected_arrival"
                          class="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all shadow-inner"
                        />
                      </div>
                    </div>

                    <div
                      class="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/50"
                    >
                      <label
                        class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"
                      >
                        <span class="material-symbols-rounded text-xs"
                          >notes</span
                        >
                        Internal / Supplier Notes
                      </label>
                      <textarea
                        formControlName="notes"
                        rows="2"
                        placeholder="Add receiving instructions, references, or context..."
                        class="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all resize-none shadow-inner"
                      ></textarea>
                    </div>
                  </div>

                  <!-- Catalogue Grid section -->
                  <div class="space-y-4">
                    <div class="flex items-end justify-between">
                      <div>
                        <h3
                          class="font-black text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2"
                        >
                          Master Catalogue
                        </h3>
                        <p
                          class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5"
                        >
                          Click items to add to workbench
                        </p>
                      </div>

                      <div
                        class="flex items-center gap-2"
                        *ngIf="_selectedSupplierId()"
                      >
                        <select
                          (change)="
                            selectedCatalogCategory.set(
                              $any($event.target).value === 'null'
                                ? null
                                : $any($event.target).value
                            )
                          "
                          class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 pl-4 pr-8 text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] transition-all cursor-pointer shadow-sm appearance-none bg-no-repeat bg-[right_0.5rem_center] bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.6rem_auto]"
                        >
                          <option value="null">All Categories</option>
                          @for (cat of categories(); track cat.id) {
                            <option
                              [value]="cat.id"
                              [selected]="selectedCatalogCategory() === cat.id"
                            >
                              {{ cat.name }}
                            </option>
                          }
                        </select>

                        <div class="relative w-56">
                          <span
                            class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]"
                            >search</span
                          >
                          <input
                            type="text"
                            [value]="catalogSearchQuery()"
                            (input)="
                              catalogSearchQuery.set($any($event.target).value)
                            "
                            placeholder="Search inventory..."
                            class="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] transition-all shadow-sm"
                          />
                        </div>
                      </div>
                    </div>

                    @if (!_selectedSupplierId()) {
                      <div
                        class="py-16 flex flex-col items-center justify-center bg-white/50 dark:bg-slate-800/30 border border-dashed border-slate-300 dark:border-slate-700/50 rounded-3xl"
                      >
                        <div
                          class="w-16 h-16 rounded-2xl bg-[var(--primary-color)]/10 flex items-center justify-center mb-3"
                        >
                          <span
                            class="material-symbols-rounded text-3xl text-[var(--primary-color)]"
                            >handshake</span
                          >
                        </div>
                        <span
                          class="text-xs font-black uppercase tracking-widest text-slate-500 mb-1"
                          >Awaiting Supplier</span
                        >
                        <p
                          class="text-[10px] text-slate-400 font-medium text-center max-w-[200px]"
                        >
                          Choose a supplier above to load their linked product
                          catalogue.
                        </p>
                      </div>
                    } @else {
                      <!-- restockSuggestions banner -->
                      @if (restockSuggestions().length > 0) {
                        <div
                          class="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200/50 dark:border-orange-800/50 rounded-2xl animate-in fade-in slide-in-from-top-2 shadow-sm"
                        >
                          <div class="flex items-center gap-3">
                            <div
                              class="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center"
                            >
                              <span
                                class="material-symbols-rounded text-orange-600 dark:text-orange-400 text-sm"
                                >warning</span
                              >
                            </div>
                            <div>
                              <div
                                class="text-[11px] font-black uppercase tracking-widest text-orange-800 dark:text-orange-300 leading-tight"
                              >
                                Low Stock Alert
                              </div>
                              <div
                                class="text-[10px] text-orange-600/80 font-bold"
                              >
                                {{ restockSuggestions().length }} products have
                                triggered reorder points.
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            (click)="preloadLowStockItems()"
                            class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/20 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 uppercase tracking-wider"
                          >
                            <span class="material-symbols-rounded text-[14px]"
                              >bolt</span
                            >
                            Auto-Fill
                          </button>
                        </div>
                      }

                      <!-- Dynamic Grid -->
                      <div
                        class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3"
                      >
                        @for (
                          product of catalogueProducts();
                          track product.id
                        ) {
                          <div
                            class="bg-white dark:bg-slate-800 rounded-2xl border-2 transition-all group overflow-hidden flex flex-col"
                            [ngClass]="{
                              'border-[var(--primary-color)] shadow-[0_4px_15px_rgba(var(--primary-color-rgb),0.1)]':
                                isInOrder(product.id),
                              'border-transparent shadow-sm hover:border-slate-300 dark:hover:border-slate-600':
                                !isInOrder(product.id),
                            }"
                          >
                            <!-- Top Info area -->
                            <div class="p-3.5 flex-1 relative">
                              <div
                                *ngIf="isInOrder(product.id)"
                                class="absolute top-3 right-3 w-5 h-5 bg-[var(--primary-color)] text-white rounded-full flex items-center justify-center animate-in zoom-in"
                              >
                                <span
                                  class="material-symbols-rounded text-[10px] font-black"
                                  >check</span
                                >
                              </div>

                              <div
                                class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-2"
                              >
                                <span
                                  class="material-symbols-rounded text-[16px] text-slate-400"
                                  >category</span
                                >
                              </div>

                              <div
                                class="font-black text-slate-800 dark:text-slate-100 text-[13px] leading-snug line-clamp-2 mb-2"
                              >
                                {{ product.name }}
                              </div>

                              <div class="flex items-center gap-1.5">
                                <span
                                  class="w-2 h-2 rounded-full"
                                  [ngClass]="
                                    (product.stock_quantity || 0) <= 0
                                      ? 'bg-red-500'
                                      : 'bg-green-500'
                                  "
                                ></span>
                                <span
                                  class="text-[10px] font-bold text-slate-500 uppercase tracking-wider"
                                >
                                  {{ product.stock_quantity || 0 }} in stock
                                </span>
                              </div>
                            </div>

                            <!-- Bottom Action area -->
                            <div
                              class="p-2 bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700/50 shrink-0"
                            >
                              <div
                                class="flex items-center gap-2"
                                (click)="$event.stopPropagation()"
                              >
                                <div
                                  class="flex items-center bg-white dark:bg-slate-900 rounded-lg overflow-hidden flex-1 h-8 border border-slate-200 dark:border-slate-700 shadow-inner"
                                >
                                  <button
                                    type="button"
                                    (click)="
                                      setCardQty(
                                        product.id,
                                        getCardQty(product.id) - 1
                                      )
                                    "
                                    class="w-8 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-black text-slate-400"
                                  >
                                    &minus;
                                  </button>
                                  <input
                                    type="text"
                                    [value]="getCardQty(product.id)"
                                    readonly
                                    class="w-8 text-center text-[11px] font-black bg-transparent border-none p-0 focus:ring-0"
                                  />
                                  <button
                                    type="button"
                                    (click)="
                                      setCardQty(
                                        product.id,
                                        getCardQty(product.id) + 1
                                      )
                                    "
                                    class="w-8 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-black text-slate-400"
                                  >
                                    &plus;
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  (click)="addProductToOrder(product)"
                                  class="h-8 w-10 flex items-center justify-center bg-[var(--primary-color)] text-white rounded-lg hover:brightness-110 active:scale-90 transition-all shadow-md shadow-[var(--primary-color)]/20 shrink-0 group-hover:scale-105"
                                >
                                  <span
                                    class="material-symbols-rounded text-[15px]"
                                    >add_shopping_cart</span
                                  >
                                </button>
                              </div>
                            </div>
                          </div>
                        } @empty {
                          <div
                            class="col-span-full py-16 flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30 rounded-3xl opacity-60"
                          >
                            <span
                              class="material-symbols-rounded text-4xl mb-3 text-slate-400"
                              >search_off</span
                            >
                            <span
                              class="text-xs font-black uppercase tracking-widest text-slate-500 mb-1"
                              >No matches found</span
                            >
                            <p class="text-[10px] text-slate-400 font-medium">
                              Try adjusting your search or category filter.
                            </p>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
                <!-- End Left Pane -->

                <!-- RIGHT PANE: Sticky Cart / Order Breakdown -->
                <div class="w-full lg:w-[450px] shrink-0 sticky top-4">
                  <div
                    class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-[0_15px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.4)] flex flex-col max-h-[calc(100vh-180px)] overflow-hidden"
                  >
                    <!-- Cart Header -->
                    <div
                      class="p-5 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50"
                    >
                      <h3
                        class="font-black text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2"
                      >
                        <div
                          class="w-6 h-6 rounded bg-[var(--primary-color)]/10 flex items-center justify-center"
                        >
                          <span
                            class="material-symbols-rounded text-[var(--primary-color)] text-[14px]"
                            >receipt_long</span
                          >
                        </div>
                        Workbench
                      </h3>
                      <span
                        class="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-[10px] font-black tracking-widest uppercase rounded-md text-slate-500 border border-slate-300 dark:border-slate-600"
                      >
                        {{ items.length }} Line{{
                          items.length !== 1 ? "s" : ""
                        }}
                      </span>
                    </div>

                    <!-- Cart Items (Scrollable) -->
                    <div
                      class="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/20"
                      formArrayName="items"
                    >
                      @if (items.length > 0) {
                        <div class="p-2 space-y-2">
                          @for (
                            item of items.controls;
                            track item;
                            let i = $index
                          ) {
                            <div
                              [formGroupName]="i"
                              class="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 pr-2 shadow-sm relative overflow-hidden transition-all hover:border-[var(--primary-color)]/50"
                            >
                              <!-- Delete Button -->
                              <button
                                type="button"
                                (click)="removeItem(i)"
                                class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100 z-10"
                              >
                                <span
                                  class="material-symbols-rounded text-[16px]"
                                  >close</span
                                >
                              </button>

                              <!-- Product Name -->
                              <div
                                class="font-black text-slate-800 dark:text-slate-200 text-xs pr-8 mb-2 leading-tight"
                              >
                                {{
                                  getProductName(item.get("product_id")?.value)
                                }}
                              </div>

                              <div class="flex items-end justify-between gap-3">
                                <!-- Qty Input -->
                                <div class="w-16">
                                  <label
                                    class="block text-[8px] font-black uppercase text-slate-400 mb-0.5"
                                    >QTY</label
                                  >
                                  <input
                                    type="number"
                                    formControlName="quantity"
                                    min="1"
                                    class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-center text-xs font-black text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-[var(--primary-color)]/20 outline-none transition-all"
                                  />
                                </div>

                                <!-- Cost Input -->
                                <div class="flex-1">
                                  <label
                                    class="block text-[8px] font-black uppercase text-slate-400 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                                    >Unit Cost ({{
                                      storeService.currency()
                                    }})</label
                                  >
                                  <input
                                    type="number"
                                    formControlName="cost"
                                    min="0"
                                    step="0.01"
                                    class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-left text-xs font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-[var(--primary-color)]/20 outline-none transition-all"
                                  />
                                </div>

                                <!-- Row Total -->
                                <div class="text-right pb-1">
                                  <div
                                    class="text-[13px] font-black text-slate-900 dark:text-slate-100 tabular-nums tracking-tight"
                                  >
                                    {{
                                      (item.get("quantity")?.value || 0) *
                                        (item.get("cost")?.value || 0)
                                        | currency: storeService.currency()
                                    }}
                                  </div>
                                </div>
                              </div>
                            </div>
                          }
                        </div>
                      } @else {
                        <div
                          class="h-48 flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 m-4 rounded-2xl"
                        >
                          <div
                            class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3"
                          >
                            <span
                              class="material-symbols-rounded text-slate-300 dark:text-slate-600 text-xl"
                              >shopping_cart</span
                            >
                          </div>
                          <span
                            class="text-xs font-black uppercase tracking-widest text-slate-400 mb-1"
                            >Cart Empty</span
                          >
                          <p class="text-[10px] font-medium text-slate-400">
                            Add products from the catalogue to build your order.
                          </p>
                        </div>
                      }
                    </div>

                    <!-- Cart Total Footer -->
                    <div
                      class="p-5 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700/50 rounded-b-3xl"
                    >
                      <div class="flex justify-between items-end">
                        <div class="space-y-1">
                          <div
                            class="text-[9px] font-black text-slate-400 uppercase tracking-widest"
                          >
                            Estimated Total
                          </div>
                          <div class="text-[10px] font-bold text-slate-500">
                            Excl. Shipping & Tax
                          </div>
                        </div>
                        <div
                          class="text-3xl font-black text-[var(--primary-color)] tracking-tighter shadow-sm"
                        >
                          <span class="text-[16px] mr-0.5 opacity-60 font-bold"
                            >$</span
                          >{{ calculateTotal() | number: "1.2-2" }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- End Right Pane -->
              </form>
            </div>
          </div>
        }

        @if (viewState() === "LIST" && !selectedPO() && !editMode()) {
          <div
            class="flex-1 flex flex-col items-center justify-center text-slate-400 gap-6 animate-in fade-in zoom-in duration-500 max-w-sm mx-auto text-center px-10"
          >
            <div
              class="w-40 h-40 rounded-[3.5rem] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none mb-4"
            >
              <span
                class="material-symbols-rounded text-7xl opacity-20 text-[var(--primary-color)]"
                >fact_check</span
              >
            </div>
            <div>
              <div
                class="text-2xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter"
              >
                Procurement Hub
              </div>
              <p
                class="text-sm mt-3 text-slate-500 dark:text-slate-400 leading-relaxed font-medium"
              >
                Select a purchase order from the side list to review its status,
                or start a new requisition to replenish stock levels across your
                organization.
              </p>
            </div>
            <button
              (click)="startNewPO()"
              class="mt-4 px-10 py-4 bg-[var(--primary-color)] text-white text-xs font-black rounded-2xl shadow-2xl hover:brightness-110 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest"
            >
              <span class="material-symbols-rounded text-sm">add_circle</span>
              New Procurement Request
            </button>
          </div>
        }
      </div>

      <!-- ── Invoice Generation Modal ─────────────────────────────────────── -->
      @if (showInvoiceModal()) {
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700">
            <div class="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 class="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span class="material-symbols-rounded text-teal-500">receipt_long</span>
                  Generate Supplier Invoice
                </h3>
                <p class="text-xs text-slate-400 mt-0.5 font-mono">Linked to: {{ poForInvoice()?.order_number || poForInvoice()?.id?.substring(0,8) }}</p>
              </div>
              <button (click)="showInvoiceModal.set(false)" class="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
            <div class="p-6 space-y-5">
              <div class="space-y-4">
                <div class="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div class="flex justify-between items-center mb-1">
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">PO Subtotal</p>
                    <p class="text-[11px] font-bold text-slate-600 dark:text-slate-300">{{ poForInvoice()?.subtotal || poForInvoice()?.total_amount | currency: storeService.currency() }}</p>
                  </div>
                  @if (poForInvoice()?.tax_amount! > 0) {
                    <div class="flex justify-between items-center mb-3">
                      <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">PO Tax Applied</p>
                      <p class="text-[11px] font-bold text-slate-600 dark:text-slate-300">{{ poForInvoice()?.tax_amount | currency: storeService.currency() }}</p>
                    </div>
                  }
                  <div class="border-t border-slate-200 dark:border-slate-700 pt-3">
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Invoice Total Due</p>
                    <p class="text-2xl font-black text-slate-800 dark:text-white">
                      {{ poForInvoice()?.total_amount | currency: storeService.currency() }}
                    </p>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Terms (Net Days)</label>
                  <input type="number" [ngModel]="invoiceDueDays()" (ngModelChange)="invoiceDueDays.set($event)" min="1"
                    class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-teal-400 outline-none dark:text-white">
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Invoice Notes (optional)</label>
                <textarea [ngModel]="invoiceNotes()" (ngModelChange)="invoiceNotes.set($event)" rows="2" placeholder="Payment terms, bank details..."
                  class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-teal-400 outline-none dark:text-white"></textarea>
              </div>
            </div>
            <div class="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
              <button (click)="showInvoiceModal.set(false)" class="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cancel</button>
              <button (click)="generateInvoice()" [disabled]="isGeneratingInvoice()"
                class="px-5 py-2.5 rounded-xl font-bold text-sm bg-teal-600 text-white hover:bg-teal-700 shadow-md disabled:opacity-50 transition-all flex items-center gap-2">
                <span class="material-symbols-rounded text-sm" *ngIf="isGeneratingInvoice()">progress_activity</span>
                {{ isGeneratingInvoice() ? 'Generating...' : 'Generate Invoice' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ── Invoice View/Print Modal — OUTSIDE overflow-hidden container ──── -->
    </div>
    @if (showInvoicePrintModal() && invoiceForPrint()) {
      <app-supplier-invoice-print
        [invoice]="invoiceForPrint()!"
        [currency]="storeService.currency()"
        [storeName]="storeService.currentStore()?.name || 'OmniPOS'"
        [poNumber]="invoiceForPrint()?.po?.order_number || invoiceForPrint()?.invoice_number?.replace('INV-','PO-') || ''"
        (close)="showInvoicePrintModal.set(false)"
      />
    }
    </div><!-- /display:contents wrapper -->
  `,
})
export class PurchaseOrderComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  fb = inject(FormBuilder);

  /** Static gradient palettes for the KPI tiles */
  readonly kpiStyles = {
    items: {
      background: "linear-gradient(135deg, #8b5cf6, #a855f7)",
      "box-shadow": "0 8px 20px rgba(139, 92, 246, 0.35)",
    },
    value: {
      background: "linear-gradient(135deg, #10b981, #0d9488)",
      "box-shadow": "0 8px 20px rgba(16, 185, 129, 0.35)",
    },
    delivery: {
      background: "linear-gradient(135deg, #0ea5e9, #3b82f6)",
      "box-shadow": "0 8px 20px rgba(14, 165, 233, 0.35)",
    },
  };

  // ── View State ──────────────────────────────────────────────────────────
  viewState = signal<"LIST" | "CREATE" | "EDIT" | "DETAIL">("LIST");
  selectedPO = signal<PurchaseOrder | null>(null);
  currentDate = new Date();
  isSaving = signal(false);
  isReceiving = signal(false);

  // ── Edit Mode State ──────────────────────────────────────────────────────
  editMode = signal(false);
  editingPoId = signal<string | null>(null);

  // ── List Filtering ───────────────────────────────────────────────────────
  statusFilter = signal<string>("ALL");
  searchQuery = signal<string>("");

  // ── Receive Dialog State ─────────────────────────────────────────────────
  showReceiveDialog = signal(false);
  selectedPOToReceive = signal<PurchaseOrder | null>(null);
  receiveItems = signal<any[]>([]);
  receiveError = signal<string | null>(null);
  selectedReceiveLocationId = signal<string | null>(null);

  // ── P2: Duplicate product warning ────────────────────────────────────────
  duplicateWarning = signal<string | null>(null);

  // ── Detail / Selection State ─────────────────────────────────────────────
  selectedPOItems = signal<any[]>([]);
  isLoadingItems = signal(false);

  // ── Print Preview State ──────────────────────────────────────────────────
  showPrintPreview = signal(false);
  isPrinting = signal(false);

  // ── Top-level Tab ────────────────────────────────────────────────────────
  activeTab = signal<'orders' | 'invoices' | 'claims'>('orders');

  // ── Invoice State ─────────────────────────────────────────────────────────
  invoices = signal<SupplierInvoice[]>([]);
  invoiceSearchTerm = signal('');
  invoiceStatusFilter = signal<'ALL' | 'UNPAID' | 'PAID' | 'OVERDUE'>('ALL');

  filteredInvoices = computed(() => {
    let list = this.invoices();

    // Status Filter
    const status = this.invoiceStatusFilter();
    if (status !== 'ALL') {
      if (status === 'OVERDUE') {
        list = list.filter(inv => this.isDueOverdue(inv));
      } else if (status === 'UNPAID') {
        list = list.filter(inv => inv.payment_status !== 'PAID' && !this.isDueOverdue(inv));
      } else if (status === 'PAID') {
        list = list.filter(inv => inv.payment_status === 'PAID');
      }
    }

    // Search Filter
    const search = this.invoiceSearchTerm().toLowerCase().trim();
    if (search) {
      list = list.filter(inv =>
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(search)) ||
        (inv.po?.order_number && inv.po.order_number.toLowerCase().includes(search)) ||
        (inv.supplier?.name && inv.supplier.name.toLowerCase().includes(search))
      );
    }

    return list;
  });

  selectedInvoice = signal<SupplierInvoice | null>(null);
  isGeneratingInvoice = signal(false);

  invoiceDueDays = signal(30);
  invoiceNotes = signal('');
  showInvoiceModal = signal(false);
  poForInvoice = signal<PurchaseOrder | null>(null);
  // Print modal state
  showInvoicePrintModal = signal(false);
  invoiceForPrint = signal<(SupplierInvoice & { items?: any[]; supplier?: any; po?: any }) | null>(null);

  // ── Claim State ───────────────────────────────────────────────────────────
  claims = signal<SupplierClaim[]>([]);
  showClaimModal = signal(false);
  claimForm = {
    po_id: '' as string,
    supplier_id: '' as string,
    product_id: '' as string,
    claim_type: 'DAMAGED' as ClaimType,
    quantity_affected: 1,
    description: ''
  };
  isSubmittingClaim = signal(false);

  // ── P3: Reorder suggestions ───────────────────────────────────────────────
  showSuggestions = signal(true); // Open by default so users notice it

  // ── Data Signals ─────────────────────────────────────────────────────────
  store = this.storeService.currentStore;

  purchaseOrders = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap((store) =>
        store ? this.supabase.getPurchaseOrders(store.id) : of([]),
      ),
    ),
    { initialValue: [] },
  );

  filteredPOs = computed(() => {
    let pos = this.purchaseOrders();
    if (this.statusFilter() !== "ALL") {
      pos = pos.filter((po) => po.status === this.statusFilter());
    }
    const query = (this.searchQuery() || "").toLowerCase().trim();
    if (query) {
      pos = pos.filter(
        (po) =>
          (po.id || "").toLowerCase().includes(query) ||
          (po.supplier?.name || "").toLowerCase().includes(query),
      );
    }
    return pos;
  });

  suppliers = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap((store) =>
        store ? this.supabase.getSuppliers(store.id) : of([]),
      ),
    ),
    { initialValue: [] },
  );

  products = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap((store) =>
        store ? this.supabase.getProducts(store.id) : of([]),
      ),
    ),
    { initialValue: [] },
  );

  categories = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap((store) =>
        store ? this.supabase.getCategories(store.id) : of([]),
      ),
    ),
    { initialValue: [] },
  );

  stockLocations = toSignal(
    this.storeService.currentStore$.pipe(
      switchMap((store) =>
        store ? this.supabase.getStockLocations(store.id) : of([]),
      ),
    ),
    { initialValue: [] },
  );

  /** P3: Products at or below the low-stock threshold, sorted most-critical first */
  lowStockProducts = computed(() =>
    this.products()
      .filter((p) => (p.stock_quantity ?? Infinity) <= 5)
      .sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0)),
  );

  /** P3: Count of products that are completely out of stock */
  outOfStockCount = computed(
    () =>
      this.lowStockProducts().filter((p) => (p.stock_quantity ?? 0) === 0)
        .length,
  );

  /** P3: Count of products that are low but not yet zero */
  criticallyLowCount = computed(
    () =>
      this.lowStockProducts().filter((p) => (p.stock_quantity ?? 0) > 0).length,
  );

  // filteredProductsForSupplier is defined after poForm so it can reactively bind to supplier_id valueChanges

  // ── Form ─────────────────────────────────────────────────────────────────
  poForm: FormGroup = this.fb.group({
    supplier_id: [null, Validators.required],
    expected_arrival: [null], // P1: now a real editable field
    notes: [null], // P1: new field
    items: this.fb.array([]),
  });

  get items() {
    return this.poForm.get("items") as FormArray;
  }

  // ── Reactive supplier_id signal (must come AFTER poForm is initialised) ────
  private _selectedSupplierId = toSignal(
    this.poForm.get("supplier_id")!.valueChanges,
    { initialValue: null as string | null },
  );

  // ── Catalogue UI state ───────────────────────────────────────────────────
  catalogSearchQuery = signal<string>("");
  selectedCatalogCategory = signal<string | null>(null);
  /** Tracks the desired qty on each product card before adding to the order */
  cardQties = signal<Record<string, number>>({});

  /** Products belonging to the selected supplier (or all if none tagged). Fully reactive. */
  filteredProductsForSupplier = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return this.products();
    const supplierProducts = this.products().filter(
      (p) => p.supplier_id === supplierId,
    );
    return supplierProducts.length > 0 ? supplierProducts : this.products();
  });

  /** True when the selected supplier has at least one product tagged to them */
  hasSupplierProducts = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return true;
    return this.products().some((p) => p.supplier_id === supplierId);
  });

  /** Supplier's products further filtered by the catalogue search bar */
  catalogueProducts = computed(() => {
    const q = this.catalogSearchQuery().toLowerCase().trim();
    const catId = this.selectedCatalogCategory();
    const base = this.filteredProductsForSupplier();

    // Prioritize Category Filtering
    let filtered = base;
    if (catId && catId !== "null") {
      filtered = base.filter((p) => String(p.category_id) === String(catId));
    }

    if (!q) return filtered;
    return filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q),
    );
  });

  /**
   * Sprint 2: Products from the selected supplier that are at or below their
   * reorder_point AND have a reorder_quantity set. These are the candidates for
   * one-click pre-fill. Only surfaces when a supplier is selected.
   */
  restockSuggestions = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return [] as Product[];
    return this.filteredProductsForSupplier().filter(
      (p) =>
        (p.stock_quantity ?? Infinity) <= (p.reorder_point ?? 0) &&
        (p.reorder_quantity ?? 0) > 0,
    );
  });

  /** Total units that would be ordered if pre-fill runs */
  restockTotalUnits = computed(() =>
    this.restockSuggestions().reduce(
      (sum, p) => sum + (p.reorder_quantity ?? 0),
      0,
    ),
  );

  /**
   * Sprint 5: The most recent non-cancelled PO from the selected supplier.
   * Used to power the "Repeat Last Order" button.
   */
  lastSupplierPO = computed(() => {
    const supplierId = this._selectedSupplierId();
    if (!supplierId) return null;
    const supplierPOs = this.purchaseOrders()
      .filter(
        (po) => po.supplier_id === supplierId && po.status !== "CANCELLED",
      )
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    return supplierPOs[0] ?? null;
  });

  /** True while repeatLastOrder() is fetching items from the service */
  isRepeatLoading = signal(false);

  /**
   * Sprint 4: Supplier Price Memory.
   * Caches the items from the last supplier PO so we can read historical
   * unit costs without an extra user-triggered network call.
   * Cleared immediately when the supplier changes.
   */
  lastPOItems = signal<any[]>([]);

  private _priceMemoryEffect = effect(
    () => {
      const po = this.lastSupplierPO();
      if (!po) {
        this.lastPOItems.set([]);
        return;
      }
      // Load items for the last PO silently in the background
      this.supabase.getPurchaseOrderItems(po.id).subscribe({
        next: (items) => this.lastPOItems.set(items),
        error: () => this.lastPOItems.set([]),
      });
    },
    { allowSignalWrites: true },
  );

  // ── Status helper ─────────────────────────────────────────────────────────
  getStatusClass(status: POStatus | string): Record<string, boolean> {
    return {
      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300': status === 'DRAFT',
      'bg-blue-100 text-blue-800': status === 'SENT',
      'bg-purple-100 text-purple-800': status === 'ORDERED',
      'bg-orange-100 text-orange-800': status === 'PARTIAL',
      'bg-green-100 text-green-800': status === 'RECEIVED',
      'bg-teal-100 text-teal-800': status === 'INVOICED',
      'bg-red-100 text-red-800': status === 'CANCELLED',
    };
  }

  // ── Create / Edit helpers ─────────────────────────────────────────────────

  startNewPO() {
    this.editMode.set(false);
    this.editingPoId.set(null);
    this.catalogSearchQuery.set("");
    this.selectedCatalogCategory.set(null);
    this.cardQties.set({});
    this.poForm.reset({
      supplier_id: null,
      expected_arrival: null,
      notes: null,
    });
    this.items.clear();
    this.viewState.set("CREATE");
  }

  startEditPO(po: PurchaseOrder) {
    if (po.status !== "DRAFT") return; // Guard: only DRAFT POs can be edited

    this.editMode.set(true);
    this.editingPoId.set(po.id);
    this.isSaving.set(false);
    this.catalogSearchQuery.set("");
    this.selectedCatalogCategory.set(null);
    this.cardQties.set({});

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        this.poForm.reset();
        this.items.clear();

        // Restore header values
        this.poForm.patchValue({
          supplier_id: po.supplier_id,
          expected_arrival: po.expected_arrival ?? null,
          notes: po.notes ?? null,
        });

        // Re-build items FormArray from existing PO items
        items.forEach((item) => {
          this.items.push(
            this.fb.group({
              product_id: [item.product_id, Validators.required],
              quantity: [
                item.quantity_ordered,
                [Validators.required, Validators.min(1)],
              ],
              cost: [item.unit_cost, [Validators.required, Validators.min(0)]],
            }),
          );
        });

        this.viewState.set("EDIT");
      },
      error: (err) => console.error("Failed to load PO for editing", err),
    });
  }

  discardForm() {
    this.editMode.set(false);
    this.editingPoId.set(null);
    this.viewState.set("LIST");
  }

  addItem() {
    this.items.push(
      this.fb.group({
        product_id: [null, Validators.required],
        quantity: [1, [Validators.required, Validators.min(1)]],
        cost: [0, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  removeItem(index: number) {
    this.items.removeAt(index);
  }

  /** P1: When a supplier is selected, auto-fill expected_arrival + reset catalogue state */
  onSupplierChange() {
    const supplierId = this.poForm.get("supplier_id")?.value;
    // Reset catalogue state whenever supplier changes
    this.catalogSearchQuery.set("");
    this.cardQties.set({});
    this.items.clear(); // Clear existing order items when supplier changes
    if (!supplierId) return;
    const supplier = this.suppliers().find((s) => s.id === supplierId);
    if (supplier?.lead_time_days) {
      const arrivalDate = new Date();
      arrivalDate.setDate(arrivalDate.getDate() + supplier.lead_time_days);
      this.poForm.patchValue({
        expected_arrival: arrivalDate.toISOString().split("T")[0],
      });
    }
  }

  // ── Catalogue Grid helpers ────────────────────────────────────────────────

  /** Returns the qty shown on a product card's stepper (default 1) */
  getCardQty(productId: string): number {
    return this.cardQties()[productId] ?? 1;
  }

  /** Updates the card stepper qty, clamping to a minimum of 1 */
  setCardQty(productId: string, qty: number) {
    this.cardQties.update((q) => ({
      ...q,
      [productId]: Math.max(1, Number(qty) || 1),
    }));
  }

  /** True if the product already has a row in the order */
  isInOrder(productId: string): boolean {
    return this.items.controls.some(
      (c) => c.get("product_id")?.value === productId,
    );
  }

  /** Returns the ordered quantity for a product already in the FormArray */
  getOrderQty(productId: string): number {
    const ctrl = this.items.controls.find(
      (c) => c.get("product_id")?.value === productId,
    );
    return ctrl ? Number(ctrl.get("quantity")?.value) || 0 : 0;
  }

  /**
   * Adds a product to the order using the card's stepper qty.
   * If the product is already in the order, increments its qty instead.
   */
  /** Sprint 4: Returns the last known supplier-specific unit cost, or null if unknown */
  getHistoricalCost(productId: string): number | null {
    const item = this.lastPOItems().find((i) => i.product_id === productId);
    return item != null ? item.unit_cost : null;
  }

  addProductToOrder(product: Product) {
    const qty = this.getCardQty(product.id);
    // Sprint 4: prefer supplier's historical price over catalogue cost_price
    const historicalCost = this.getHistoricalCost(product.id);
    const cost = historicalCost ?? product.cost_price ?? 0;
    const existing = this.items.controls.find(
      (c) => c.get("product_id")?.value === product.id,
    );
    if (existing) {
      const currentQty = Number(existing.get("quantity")?.value) || 0;
      existing.patchValue({ quantity: currentQty + qty });
    } else {
      this.items.push(
        this.fb.group({
          product_id: [product.id, Validators.required],
          quantity: [qty, [Validators.required, Validators.min(1)]],
          cost: [cost, [Validators.required, Validators.min(0)]],
        }),
      );
    }
  }

  /** Removes a product from the order by its product_id */
  removeFromOrder(productId: string) {
    const idx = this.items.controls.findIndex(
      (c) => c.get("product_id")?.value === productId,
    );
    if (idx !== -1) this.items.removeAt(idx);
  }

  /**
   * Sprint 2: One-click restock pre-fill.
   * Adds all restockSuggestions to the FormArray using each product's
   * reorder_quantity as the qty and cost_price as the unit cost.
   * Products already in the order are skipped (not double-added).
   */
  preloadLowStockItems() {
    const suggestions = this.restockSuggestions();
    suggestions.forEach((product) => {
      const alreadyIn = this.items.controls.some(
        (c) => c.get("product_id")?.value === product.id,
      );
      if (!alreadyIn) {
        // Sprint 4: use supplier's historical price if available
        const historicalCost = this.getHistoricalCost(product.id);
        const cost = historicalCost ?? product.cost_price ?? 0;
        this.items.push(
          this.fb.group({
            product_id: [product.id, Validators.required],
            quantity: [
              product.reorder_quantity ?? 1,
              [Validators.required, Validators.min(1)],
            ],
            cost: [cost, [Validators.required, Validators.min(0)]],
          }),
        );
      }
    });
  }

  /**
   * Sprint 5: Repeat Last Order.
   * Loads all items from the supplier's most recent PO and pre-populates
   * the FormArray with the same products, quantities, and unit costs.
   * Products already in the order are skipped to avoid duplication.
   */
  repeatLastOrder() {
    const lastPO = this.lastSupplierPO();
    if (!lastPO) return;

    this.isRepeatLoading.set(true);
    this.supabase.getPurchaseOrderItems(lastPO.id).subscribe({
      next: (items) => {
        items.forEach((item) => {
          const alreadyIn = this.items.controls.some(
            (c) => c.get("product_id")?.value === item.product_id,
          );
          if (!alreadyIn) {
            this.items.push(
              this.fb.group({
                product_id: [item.product_id, Validators.required],
                quantity: [
                  item.quantity_ordered,
                  [Validators.required, Validators.min(1)],
                ],
                cost: [
                  item.unit_cost,
                  [Validators.required, Validators.min(0)],
                ],
              }),
            );
          }
        });
        this.isRepeatLoading.set(false);
      },
      error: (err) => {
        console.error("Failed to load last PO items:", err);
        this.isRepeatLoading.set(false);
      },
    });
  }

  /**
   * Solution 2: The One-Click Clone.
   * Takes a historical PO, switches to the CREATE view, auto-selects the supplier,
   * sets up the delivery date, adds a note referencing the original, and loads all
   * items and their historical prices into the draft.
   */
  cloneOrder(po: PurchaseOrder) {
    this.startNewPO();
    this.poForm.patchValue({
      supplier_id: po.supplier_id,
      notes: `Cloned from PO-${po.id.substring(0, 8)}. Please review quantities before committing.`,
    });
    this.onSupplierChange(); // Resets catalogue and sets expected_arrival

    // Fetch the actual line items for the PO being cloned
    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        items.forEach((item) => {
          this.items.push(
            this.fb.group({
              product_id: [item.product_id, Validators.required],
              quantity: [
                item.quantity_ordered,
                [Validators.required, Validators.min(1)],
              ],
              cost: [item.unit_cost, [Validators.required, Validators.min(0)]],
            }),
          );
        });
      },
      error: (err) => {
        console.error("Failed to clone items:", err);
      },
    });
  }

  onProductSelect(index: number) {
    const control = this.items.at(index);
    const productId = control.get("product_id")?.value;
    if (!productId) return;

    // P2: Duplicate guard — check if this product already exists in another row
    const duplicateIndex = this.items.controls.findIndex(
      (c, i) => i !== index && c.get("product_id")?.value === productId,
    );

    if (duplicateIndex !== -1) {
      // Auto-merge: add 1 to the existing row's quantity and delete the duplicate row
      const existingControl = this.items.at(duplicateIndex);
      const existingQty = Number(existingControl.get("quantity")?.value) || 0;
      existingControl.patchValue({ quantity: existingQty + 1 });
      this.items.removeAt(index);

      const productName = this.getProductName(productId);
      this.duplicateWarning.set(
        `"${productName}" was already in the list — quantities merged.`,
      );
      // Auto-clear the warning after 5 seconds
      setTimeout(() => this.duplicateWarning.set(null), 5000);
      return;
    }

    // Normal path: auto-fill the cost price from the product catalogue
    const product = this.products().find((p) => p.id === productId);
    if (product) {
      const costPrice = product.cost_price ?? 0;
      control.patchValue({ cost: costPrice });
    }
  }

  /**
   * Returns true when a product is selected on a line item but its cost is $0,
   * indicating no cost_price is on file in the product catalogue.
   * Used by the template to show the amber "no cost on file" hint.
   */
  getItemCostMissing(index: number): boolean {
    const control = this.items.at(index);
    const hasProduct = !!control.get("product_id")?.value;
    const cost = Number(control.get("cost")?.value ?? 0);
    return hasProduct && cost === 0;
  }

  calculateTotal(): number {
    return this.items.controls.reduce((acc, control) => {
      const qty = control.get("quantity")?.value || 0;
      const cost = control.get("cost")?.value || 0;
      return acc + qty * cost;
    }, 0);
  }

  savePO() {
    if (this.poForm.invalid) return;

    const storeId = this.store()?.id;
    if (!storeId) return;

    this.isSaving.set(true);
    const formVal = this.poForm.value;

    const poItems = formVal.items.map((item: any) => ({
      product_id: item.product_id,
      quantity_ordered: item.quantity,
      unit_cost: item.cost,
    }));

    const subtotal = this.calculateTotal();
    const storeConfig = this.store()?.config;
    const taxEnabled = storeConfig?.tax_enabled || false;
    const taxRate = taxEnabled ? (storeConfig?.tax_rate || 0) : 0;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    if (this.editMode() && this.editingPoId()) {
      // ── P1: UPDATE existing DRAFT PO ────────────────────────────────
      const updates: Partial<PurchaseOrder> = {
        supplier_id: formVal.supplier_id,
        subtotal: subtotal,
        tax_amount: taxAmount,
        tax_enabled: taxEnabled,
        total_amount: totalAmount,
        expected_arrival: formVal.expected_arrival || null,
        notes: formVal.notes || null,
      };
      this.supabase
        .updatePurchaseOrder(this.editingPoId()!, updates, poItems)
        .subscribe({
          next: () => {
            this.isSaving.set(false);
            this.editMode.set(false);
            this.editingPoId.set(null);
            this.viewState.set("LIST");
          },
          error: (err) => {
            console.error("Failed to update PO", err);
            this.isSaving.set(false);
          },
        });
    } else {
      // ── CREATE new PO ────────────────────────────────────────────────
      const poData: Partial<PurchaseOrder> = {
        store_id: storeId,
        supplier_id: formVal.supplier_id,
        status: "DRAFT",
        subtotal: subtotal,
        tax_amount: taxAmount,
        tax_enabled: taxEnabled,
        total_amount: totalAmount,
        expected_arrival:
          formVal.expected_arrival ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        notes: formVal.notes || null,
      };
      this.supabase.createPurchaseOrder(poData as any, poItems).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.viewState.set("LIST");
        },
        error: (err) => {
          console.error("Failed to create PO", err);
          this.isSaving.set(false);
        },
      });
    }
  }

  // ── P1: Status Lifecycle ──────────────────────────────────────────────────

  advanceStatus(po: PurchaseOrder, newStatus: POStatus) {
    this.supabase.updatePOStatus(po.id, newStatus).subscribe({
      next: () => {
        if (this.selectedPO()?.id === po.id) {
          this.selectedPO.set({ ...this.selectedPO()!, status: newStatus });
        }
      },
      error: (err) => {
        console.error(`Failed to update status to ${newStatus}`, err);
        if (newStatus === "ORDERED") {
          alert(
            `Note: The 'ORDERED' status is a new feature. You can ignore this error for now—I've enabled the "Receive Order" button directly on your 'SENT' orders so you aren't blocked!`,
          );
        } else {
          alert(
            `Database Error: Could not update status. Please ensure your internet connection is stable.`,
          );
        }
      },
    });
  }

  cancelPO(po: PurchaseOrder) {
    if (
      !confirm(
        `Cancel Purchase Order #${po.id.substring(0, 8)}?\n\nThis will mark the order as cancelled and cannot be undone.`,
      )
    )
      return;
    this.advanceStatus(po, "CANCELLED");
  }

  // ── Receive Dialog ────────────────────────────────────────────────────────

  openReceiveDialog(po: PurchaseOrder) {
    this.selectedPOToReceive.set(po);
    this.isReceiving.set(true);

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        const dialogItems = items.map((item) => ({
          ...item,
          receiving_now:
            item.quantity_ordered - (item.quantity_received || 0) > 0
              ? item.quantity_ordered - (item.quantity_received || 0)
              : 0,
          serial_numbers_input: "",
        }));
        this.receiveItems.set(dialogItems);

        // Auto-select first warehouse as default
        const defaultLoc = this.stockLocations().find(l => l.location_type === 'WAREHOUSE') || this.stockLocations()[0];
        if (defaultLoc) this.selectedReceiveLocationId.set(defaultLoc.id);

        this.isReceiving.set(false);
        this.showReceiveDialog.set(true);
      },
      error: (err) => {
        console.error("Failed to fetch PO items for receiving", err);
        this.isReceiving.set(false);
      },
    });
  }

  closeReceiveDialog() {
    this.showReceiveDialog.set(false);
    this.selectedPOToReceive.set(null);
    this.receiveItems.set([]);
    this.receiveError.set(null);
  }

  hasValidReceiveQuantities(): boolean {
    const items = this.receiveItems();
    const hasReceiving = items.some((item) => item.receiving_now > 0);
    if (!hasReceiving) return false;
    for (const item of items) {
      if (item.receiving_now > 0 && this.isProductSerialized(item.product_id)) {
        const serials = (item.serial_numbers_input || "")
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        if (serials.length !== item.receiving_now) return false;
      }
    }
    return true;
  }

  submitReceivePO() {
    const po = this.selectedPOToReceive();
    if (!po) return;

    const itemsToReceive = this.receiveItems()
      .filter((item) => item.receiving_now > 0)
      .map((item) => {
        const serials = this.isProductSerialized(item.product_id)
          ? (item.serial_numbers_input || "")
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
          : undefined;
        return {
          item_id: item.id,
          product_id: item.product_id,
          received_amount: item.receiving_now,
          unit_cost: item.unit_cost,
          serial_numbers: serials,
        };
      });

    if (itemsToReceive.length === 0) return;

    // P2: Overage confirmation gate — require explicit acknowledgment before
    // accepting more stock than was originally ordered
    const overageItems = this.receiveItems().filter(
      (item) =>
        item.receiving_now > 0 &&
        item.receiving_now >
        item.quantity_ordered - (item.quantity_received || 0),
    );
    if (overageItems.length > 0) {
      const names = overageItems
        .map((i) => this.getProductName(i.product_id))
        .join(", ");
      const confirmed = confirm(
        `Overage detected on: ${names}\n\n` +
        `You are receiving more units than originally ordered.\n` +
        `This may indicate a billing discrepancy with your supplier.\n\n` +
        `Continue anyway?`,
      );
      if (!confirmed) return;
    }

    this.isReceiving.set(true);
    this.receiveError.set(null);
    this.supabase.receivePO(po.id, itemsToReceive, this.selectedReceiveLocationId() || undefined).subscribe({
      next: (result) => {
        if (this.selectedPO()?.id === po.id) {
          this.supabase.getPurchaseOrderItems(po.id).subscribe((items) => {
            this.selectedPO.set({
              ...po,
              status: result.newStatus as any,
              items,
            });
          });
        }
        this.isReceiving.set(false);
        this.closeReceiveDialog();
      },
      error: (err) => {
        console.error("Failed to receive PO", err);
        this.isReceiving.set(false);
        this.receiveError.set(
          typeof err?.message === "string"
            ? `Receipt failed: ${err.message}`
            : "An unexpected error occurred. Please try again.",
        );
      },
    });
  }

  viewPODetail(po: PurchaseOrder) {
    this.selectedPO.set(po);
    this.viewState.set("DETAIL");
    this.isLoadingItems.set(true);
    this.selectedPOItems.set([]);

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        this.selectedPOItems.set(items);
        this.selectedPO.set({ ...po, items });
        this.isLoadingItems.set(false);
      },
      error: (err) => {
        console.error("Failed to fetch PO items", err);
        this.isLoadingItems.set(false);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getProductName(productId: string): string {
    return (
      this.products().find((p) => p.id === productId)?.name || "Unknown Product"
    );
  }

  getSupplierName(supplierId: string | null | undefined): string {
    if (!supplierId) return "No supplier set";
    return (
      this.suppliers().find((s) => s.id === supplierId)?.name ||
      "Unknown Supplier"
    );
  }

  /** P3: One-click reorder — pre-fills the PO form from a low-stock product */
  quickCreatePO(product: Product) {
    this.startNewPO(); // Resets form and switches to CREATE view

    // Pre-fill supplier if the product has one configured
    if (product.supplier_id) {
      this.poForm.patchValue({ supplier_id: product.supplier_id });
      this.onSupplierChange(); // Triggers lead-time auto-fill
    }

    // Pre-fill the first item row with this product and its cost price
    if (this.items.length > 0) {
      this.items.at(0).patchValue({
        product_id: product.id,
        quantity: 10, // Sensible default — user can adjust
        cost: (product as any).cost_price || 0,
      });
    }
  }

  isProductSerialized(productId: string): boolean {
    return (
      this.products().find((p) => p.id === productId)?.is_serialized || false
    );
  }

  getValidSerialCount(input: string | undefined | null): number {
    if (!input) return 0;
    return input.split(",").filter((s) => s.trim().length > 0).length;
  }
  // ── P2: Calculate Open Value ───────────────────────────────────────────
  calculateOpenValue(): number {
    return this.purchaseOrders()
      .filter((po) =>
        ["DRAFT", "SENT", "ORDERED", "PARTIAL"].includes(po.status),
      )
      .reduce((sum, po) => sum + (po.total_amount || 0), 0);
  }

  printPO(po: PurchaseOrder) {
    this.selectedPO.set(po);
    this.isLoadingItems.set(true);
    this.showPrintPreview.set(true);

    this.supabase.getPurchaseOrderItems(po.id).subscribe({
      next: (items) => {
        this.selectedPOItems.set(items);
        this.isLoadingItems.set(false);
      },
      error: (err) => {
        console.error("Failed to load items for printing", err);
        this.isLoadingItems.set(false);
      },
    });
  }

  // ── Invoice Methods ───────────────────────────────────────────────────────

  loadInvoices() {
    const storeId = this.store()?.id;
    if (!storeId) return;
    this.supabase.getSupplierInvoices(storeId).subscribe({
      next: (data) => this.invoices.set(data),
      error: (err) => console.error('Failed to load invoices', err)
    });
  }

  openInvoiceModal(po: PurchaseOrder) {
    this.poForInvoice.set(po);

    this.invoiceDueDays.set(30);
    this.invoiceNotes.set('');
    this.showInvoiceModal.set(true);
  }

  async generateInvoice() {
    const po = this.poForInvoice();
    const storeId = this.store()?.id;
    if (!po || !storeId) return;

    this.isGeneratingInvoice.set(true);
    try {
      const poItems = this.selectedPOItems();
      // Use exact amounts approved on the PO
      const subtotal = po.subtotal ?? po.total_amount;
      const taxAmt = po.tax_amount ?? 0;
      const total = po.total_amount;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + this.invoiceDueDays());

      const invoice: Omit<SupplierInvoice, 'id' | 'created_at' | 'updated_at'> = {
        store_id: storeId,
        po_id: po.id,
        supplier_id: po.supplier_id,
        invoice_number: '', // auto-generated in service
        status: 'DRAFT',
        subtotal,
        tax_amount: taxAmt,
        total_amount: total,
        payment_status: 'UNPAID',
        issued_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        notes: this.invoiceNotes()
      };

      const lineItems: Omit<SupplierInvoiceItem, 'id'>[] = poItems.map(item => ({
        invoice_id: '',  // will be set in service
        product_id: item.product_id,
        description: this.getProductName(item.product_id),
        quantity: item.quantity_ordered,
        unit_cost: item.unit_cost,
        line_total: item.quantity_ordered * item.unit_cost
      }));

      this.supabase.createSupplierInvoice(invoice, lineItems).subscribe({
        next: () => {
          this.showInvoiceModal.set(false);
          this.loadInvoices();
          // Refresh the PO to show INVOICED status
          if (this.selectedPO()?.id === po.id) {
            this.selectedPO.set({ ...this.selectedPO()!, status: 'INVOICED' });
          }
          this.isGeneratingInvoice.set(false);
          this.activeTab.set('invoices');
        },
        error: (err) => {
          console.error('Failed to generate invoice', err);
          this.isGeneratingInvoice.set(false);
        }
      });
    } catch (e) {
      console.error(e);
      this.isGeneratingInvoice.set(false);
    }
  }

  markInvoicePaid(invoice: SupplierInvoice) {
    this.supabase.updateSupplierInvoice(invoice.id, { status: 'PAID', payment_status: 'PAID' }).subscribe({
      next: () => this.loadInvoices(),
      error: err => console.error('Failed to mark paid', err)
    });
  }

  getInvoiceStatusClass(status: string): string {
    const map: Record<string, string> = {
      'DRAFT': 'bg-slate-100 text-slate-600',
      'FINALISED': 'bg-blue-100 text-blue-700',
      'PAID': 'bg-green-100 text-green-700',
      'DISPUTED': 'bg-red-100 text-red-700'
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
  }

  getPaymentStatusClass(status: string): string {
    const map: Record<string, string> = {
      'UNPAID': 'bg-rose-100 text-rose-700',
      'PARTIAL': 'bg-amber-100 text-amber-700',
      'PAID': 'bg-green-100 text-green-700'
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
  }

  // ── Claim Methods ─────────────────────────────────────────────────────────

  loadClaims() {
    const storeId = this.store()?.id;
    if (!storeId) return;
    this.supabase.getSupplierClaims(storeId).subscribe({
      next: (data) => this.claims.set(data),
      error: (err) => console.error('Failed to load claims', err)
    });
  }

  openClaimModal(po?: PurchaseOrder) {
    this.claimForm = {
      po_id: po?.id ?? '',
      supplier_id: po?.supplier_id ?? '',
      product_id: '',
      claim_type: 'DAMAGED',
      quantity_affected: 1,
      description: ''
    };
    this.showClaimModal.set(true);
  }

  submitClaim() {
    const storeId = this.store()?.id;
    if (!storeId || !this.claimForm.supplier_id || !this.claimForm.description) return;
    this.isSubmittingClaim.set(true);

    this.supabase.createSupplierClaim({
      store_id: storeId,
      po_id: this.claimForm.po_id || undefined,
      supplier_id: this.claimForm.supplier_id,
      claim_number: '', // auto-generated
      claim_type: this.claimForm.claim_type,
      product_id: this.claimForm.product_id || undefined,
      quantity_affected: this.claimForm.quantity_affected,
      description: this.claimForm.description,
      status: 'OPEN'
    }).subscribe({
      next: () => {
        this.showClaimModal.set(false);
        this.loadClaims();
        this.isSubmittingClaim.set(false);
        this.activeTab.set('claims');
      },
      error: (err) => {
        console.error('Failed to submit claim', err);
        this.isSubmittingClaim.set(false);
      }
    });
  }

  resolveClaim(claim: SupplierClaim, resolution: 'CREDIT_NOTE' | 'REPLACEMENT' | 'REFUND' | 'NONE') {
    this.supabase.updateSupplierClaim(claim.id, {
      status: 'RESOLVED',
      resolution_type: resolution,
      resolved_at: new Date().toISOString()
    }).subscribe({
      next: () => this.loadClaims(),
      error: err => console.error('Failed to resolve claim', err)
    });
  }

  notifySupplierWhatsApp(claim: SupplierClaim) {
    const supplier = this.suppliers().find(s => s.id === claim.supplier_id);
    const phone = (supplier?.whatsapp || supplier?.phone || '').replace(/[\s+\-()]/g, '');
    const poRef = claim.po ? `PO ${claim.po.order_number || claim.po.id?.substring(0, 8)}` : 'a recent order';
    const productName = this.products().find(p => p.id === claim.product_id)?.name || 'item';
    const message = `Dear ${supplier?.name || 'Supplier'},\n\nWe are raising a formal claim (Ref: ${claim.claim_number}) regarding ${poRef}.\n\nIssue: ${claim.claim_type.replace('_', ' ')} — ${productName} (Qty: ${claim.quantity_affected})\n\nDetails: ${claim.description}\n\nPlease acknowledge and advise on resolution.\n\nThank you.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  /** Opens the invoice view/print modal instantly using already-loaded data.
   *  Then fetches full items in the background to enrich the preview. */
  openInvoicePrint(inv: SupplierInvoice): void {
    // Step 1: Open modal IMMEDIATELY with the data we already have.
    // This is synchronous — so window.print() inside the modal will work when user clicks Print.
    this.invoiceForPrint.set(inv as any);
    this.showInvoicePrintModal.set(true);

    // Step 2: Fetch full items in background and update the modal if successful.
    this.supabase.getSupplierInvoiceWithItems(inv.id).subscribe({
      next: (fullInvoice) => {
        if (fullInvoice) {
          // Merge in line items; keep supplier/po from the already-loaded list data
          this.invoiceForPrint.set({
            ...fullInvoice,
            supplier: (inv as any).supplier ?? (fullInvoice as any).supplier,
            po: (inv as any).po ?? (fullInvoice as any).po,
          } as any);
        }
      },
      error: () => { /* silent — modal already open with base data */ }
    });
  }

  /** True if invoice due date is in the past and not yet paid */
  isDueOverdue(inv: SupplierInvoice): boolean {
    if (!inv.due_date || inv.payment_status === 'PAID') return false;
    return new Date(inv.due_date) < new Date();
  }

  getInvoiceSubtotal(): number {
    return this.selectedPOItems().reduce((sum: number, item: any) => sum + (item.quantity_ordered * item.unit_cost), 0);
  }

  getClaimStatusClass(status: string): string {
    const map: Record<string, string> = {
      'OPEN': 'bg-rose-100 text-rose-700',
      'ACKNOWLEDGED': 'bg-amber-100 text-amber-700',
      'RESOLVED': 'bg-green-100 text-green-700',
      'REJECTED': 'bg-slate-100 text-slate-600'
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
  }
}

