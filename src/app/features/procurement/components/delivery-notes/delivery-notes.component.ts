import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, switchMap, tap, finalize } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  MockSupabaseService, DeliveryNote, DeliveryNoteItem,
  DeliveryStatus, Product, Customer, CartItem, Transaction
} from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DeliveryNotePrintComponent } from '../../../../shared/components/delivery-note-print.component';

type View = 'list' | 'create' | 'detail' | 'receive';

interface ReceivingLine extends DeliveryNoteItem {
  accepted_input: number;
  rejected_input: number;
  rejection_reason_input: string;
}

interface CartLine {
  product: Product;
  quantity_shipped: number;
}

@Component({
  selector: 'app-delivery-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, DeliveryNotePrintComponent],
  template: `
    <div class="h-full flex flex-col gap-6 animate-in fade-in duration-300">

      <!-- ── Header ── -->
      <div class="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 class="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <span class="material-symbols-rounded text-white text-[20px]">local_shipping</span>
            </div>
            Dispatch &amp; Delivery Notes
          </h2>
          <p class="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-[48px]">
            Order-to-Cash · Dispatch-to-Invoice Workflow
          </p>
        </div>
        @if (view() === 'list') {
          <button (click)="openCreate()"
            class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/25 transition-all duration-200 hover:scale-[1.02]">
            <span class="material-symbols-rounded text-[18px]">add</span>
            New Delivery Note
          </button>
        }
        @if (view() !== 'list') {
          <button (click)="view.set('list')"
            class="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm font-bold px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 transition-all">
            <span class="material-symbols-rounded text-[16px]">arrow_back</span>
            Back to List
          </button>
        }
      </div>

      <!-- ── LIST VIEW ── -->
      @if (view() === 'list') {
        <div class="grid grid-cols-4 gap-4 flex-shrink-0">
          @for (stat of stats(); track stat.label) {
            <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">{{ stat.label }}</p>
              <p class="text-2xl font-black mt-1" [class]="stat.color">{{ stat.value }}</p>
            </div>
          }
        </div>

        <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col flex-1 overflow-hidden">
          <div class="p-5 border-b border-slate-100 flex items-center justify-between">
            <p class="text-sm font-black text-slate-700">All Delivery Notes</p>
            <input [(ngModel)]="searchTerm" placeholder="Search by note number or customer…"
              class="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-64 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
          </div>
          <div class="overflow-y-auto flex-1">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Note #</th>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver</th>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                @for (note of filteredNotes(); track note.id) {
                  <tr class="hover:bg-slate-50/50 transition-colors group">
                    <td class="px-5 py-3.5">
                      <span class="font-mono font-black text-indigo-600 text-xs bg-indigo-50 px-2.5 py-1 rounded-lg">{{ note.note_number }}</span>
                    </td>
                    <td class="px-5 py-3.5 font-semibold text-slate-700">{{ note.customer?.full_name ?? '—' }}</td>
                    <td class="px-5 py-3.5 text-slate-500">{{ note.driver_name ?? '—' }}</td>
                    <td class="px-5 py-3.5">
                      <span [class]="statusBadge(note.status)"
                        class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                        {{ note.status.replace('_', ' ') }}
                      </span>
                    </td>
                    <td class="px-5 py-3.5 text-slate-500 text-xs">{{ note.created_at | date: 'dd MMM yyyy' }}</td>
                    <td class="px-5 py-3.5">
                      <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button (click)="openDetail(note)"
                          class="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                          <span class="material-symbols-rounded text-[14px]">open_in_new</span> View
                        </button>
                        @if (note.status === 'DRAFT') {
                          <button (click)="dispatch(note)"
                            class="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            <span class="material-symbols-rounded text-[14px]">local_shipping</span> Dispatch
                          </button>
                        }
                        @if (note.status === 'DISPATCHED') {
                          <button (click)="openReceive(note)"
                            class="text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            <span class="material-symbols-rounded text-[14px]">inventory</span> Receive Goods
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="py-20 text-center">
                      <span class="material-symbols-rounded text-5xl text-slate-200 block mb-3">local_shipping</span>
                      <p class="text-slate-400 font-semibold">No delivery notes yet.</p>
                      <p class="text-slate-300 text-sm mt-1">Create your first one using the button above.</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- ── CREATE VIEW ── -->
      @if (view() === 'create') {
        <div class="grid grid-cols-[1.2fr_1fr] gap-6 flex-1 min-h-0">
          <div class="flex flex-col gap-4 overflow-y-auto pr-1">
            <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5">
              <h3 class="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                <span class="material-symbols-rounded text-indigo-500 text-[18px]">info</span>
                Delivery Information
              </h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer</label>
                  <select [(ngModel)]="newNote.customer_id"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50">
                    <option value="">— Select Customer —</option>
                    @for (c of customers(); track c.id) {
                      <option [value]="c.id">{{ c.full_name }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Recipient Name</label>
                  <input [(ngModel)]="newNote.recipient_name" placeholder="e.g. John at Warehouse"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50" />
                </div>
                <div>
                  <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Driver Name</label>
                  <input [(ngModel)]="newNote.driver_name" placeholder="e.g. Ahmed Khan"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50" />
                </div>
                <div>
                  <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Driver Phone</label>
                  <input [(ngModel)]="newNote.driver_phone" placeholder="+44 7700 000000"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50" />
                </div>
                <div class="col-span-2">
                  <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Internal Notes</label>
                  <textarea [(ngModel)]="newNote.notes" rows="2" placeholder="Any special instructions for the driver…"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50 resize-none"></textarea>
                </div>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5 flex-1">
              <h3 class="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                <span class="material-symbols-rounded text-indigo-500 text-[18px]">add_box</span>
                Add Products to Delivery
              </h3>
              <input [(ngModel)]="productSearch" placeholder="Search products by name or barcode…"
                class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50 mb-3" />
              <div class="max-h-64 overflow-y-auto divide-y divide-slate-50 rounded-xl border border-slate-100">
                @for (p of filteredProducts(); track p.id) {
                  <div class="flex items-center justify-between px-4 py-3 hover:bg-indigo-50/50 transition-colors">
                    <div>
                      <p class="text-sm font-bold text-slate-700">{{ p.name }}</p>
                      <p class="text-xs text-slate-400">Stock: {{ p.stock_quantity }} · {{ p.barcode ?? 'No barcode' }}</p>
                    </div>
                    <button (click)="addToCart(p)"
                      class="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <span class="material-symbols-rounded text-[14px]">add</span> Add
                    </button>
                  </div>
                } @empty {
                  <div class="py-8 text-center text-slate-300 text-sm font-semibold">No products found</div>
                }
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden">
            <div class="p-5 border-b border-slate-100">
              <h3 class="text-sm font-black text-slate-700 flex items-center gap-2">
                <span class="material-symbols-rounded text-indigo-500 text-[18px]">fact_check</span>
                Delivery Manifest
                @if (cart().length > 0) {
                  <span class="ml-auto bg-indigo-100 text-indigo-700 text-xs font-black px-2.5 py-0.5 rounded-full">{{ cart().length }} lines</span>
                }
              </h3>
            </div>
            <div class="flex-1 overflow-y-auto divide-y divide-slate-50">
              @for (line of cart(); track line.product.id) {
                <div class="px-5 py-4 flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-slate-700 truncate">{{ line.product.name }}</p>
                    <p class="text-xs text-slate-400 mt-0.5">Available: {{ line.product.stock_quantity }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</label>
                    <input type="number" [(ngModel)]="line.quantity_shipped" min="1" [max]="line.product.stock_quantity"
                      class="w-20 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
                  </div>
                  <button (click)="removeFromCart(line.product.id)" class="text-red-400 hover:text-red-600 transition-colors">
                    <span class="material-symbols-rounded text-[18px]">delete</span>
                  </button>
                </div>
              } @empty {
                <div class="flex-1 flex flex-col items-center justify-center py-16 text-center">
                  <span class="material-symbols-rounded text-5xl text-slate-200 mb-3">inventory_2</span>
                  <p class="text-slate-400 font-semibold text-sm">Your manifest is empty</p>
                  <p class="text-slate-300 text-xs mt-1">Pick products from the left panel</p>
                </div>
              }
            </div>
            <div class="p-5 border-t border-slate-100 bg-slate-50/50">
              <div class="flex items-center justify-between mb-3 text-sm">
                <span class="text-slate-500 font-semibold">Total Lines</span>
                <span class="font-black text-slate-800">{{ cart().length }}</span>
              </div>
              <div class="flex items-center justify-between mb-4 text-sm">
                <span class="text-slate-500 font-semibold">Total Units</span>
                <span class="font-black text-slate-800">{{ totalUnits() }}</span>
              </div>
              <button (click)="saveDeliveryNote()"
                [disabled]="cart().length === 0 || saving()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2">
                @if (saving()) {
                  <span class="material-symbols-rounded text-[18px] animate-spin">sync</span> Saving…
                } @else {
                  <span class="material-symbols-rounded text-[18px]">save</span> Save as Draft
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ── DETAIL VIEW ── -->
      @if (view() === 'detail' && selectedNote()) {
        <div class="flex-1 grid grid-cols-[1fr_380px] gap-6 min-h-0 overflow-hidden">
          <div class="flex flex-col gap-4 overflow-y-auto pr-1">
            <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5 flex items-center justify-between">
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Delivery Note</p>
                <p class="text-2xl font-black text-indigo-600 font-mono mt-0.5">{{ selectedNote()!.note_number }}</p>
              </div>
              <div class="flex items-center gap-3">
                <span [class]="statusBadge(selectedNote()!.status)"
                  class="text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
                  {{ selectedNote()!.status.replace('_', ' ') }}
                </span>
                @if (selectedNote()!.status === 'DRAFT') {
                  <button (click)="dispatch(selectedNote()!)"
                    class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/25 transition-all">
                    <span class="material-symbols-rounded text-[16px]">local_shipping</span> Dispatch Now
                  </button>
                }
                @if (selectedNote()!.status === 'DISPATCHED') {
                  <button (click)="openReceive(selectedNote()!)"
                    class="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg shadow-violet-600/25 transition-all">
                    <span class="material-symbols-rounded text-[16px]">inventory</span> Receive Goods
                  </button>
                }
                @if (selectedNote()!.status === 'DELIVERED' || selectedNote()!.status === 'PARTIAL_REJECTED') {
                  @if (!selectedNote()!.invoiced_at) {
                    <button (click)="showInvoiceModal.set(true)"
                      class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/25 transition-all">
                      <span class="material-symbols-rounded text-[16px]">receipt_long</span> Generate Invoice
                    </button>
                  } @else {
                    <div class="flex flex-col items-end">
                      <div class="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-emerald-200">
                        <span class="material-symbols-rounded text-[16px]">task_alt</span>
                        Invoiced
                      </div>
                      <p class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Issued: {{ selectedNote()!.invoiced_at | date:'dd MMM, HH:mm' }}</p>
                    </div>
                  }
                }
                <button (click)="printNote()"
                  class="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-xl transition-all">
                  <span class="material-symbols-rounded text-[16px]">print</span> Print
                </button>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5">
              <h3 class="text-sm font-black text-slate-700 mb-4">Delivery Details</h3>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Customer</p>
                  <p class="text-sm font-bold text-slate-700">{{ selectedNote()!.customer?.full_name ?? '—' }}</p>
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Recipient</p>
                  <p class="text-sm font-bold text-slate-700">{{ selectedNote()!.recipient_name ?? '—' }}</p>
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Driver</p>
                  <p class="text-sm font-bold text-slate-700">{{ selectedNote()!.driver_name ?? '—' }}</p>
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Created</p>
                  <p class="text-sm font-bold text-slate-700">{{ selectedNote()!.created_at | date: 'dd MMM yyyy HH:mm' }}</p>
                </div>
                @if (selectedNote()!.dispatched_at) {
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Dispatched</p>
                    <p class="text-sm font-bold text-emerald-600">{{ selectedNote()!.dispatched_at | date: 'dd MMM yyyy HH:mm' }}</p>
                  </div>
                }
                @if (selectedNote()!.delivered_at) {
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Delivered</p>
                    <p class="text-sm font-bold text-blue-600">{{ selectedNote()!.delivered_at | date: 'dd MMM yyyy HH:mm' }}</p>
                  </div>
                }
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">
              <div class="p-5 border-b border-slate-100">
                <h3 class="text-sm font-black text-slate-700">Line Items (No Pricing — Physical Only)</h3>
              </div>
              <table class="w-full text-sm">
                <thead class="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                    <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Shipped</th>
                    <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Accepted</th>
                    <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejected</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  @for (item of selectedNoteItems(); track item.id) {
                    <tr class="hover:bg-slate-50/50 transition-colors">
                      <td class="px-5 py-3.5 font-semibold text-slate-700">{{ item.product?.name ?? item.product_id }}</td>
                      <td class="px-5 py-3.5 text-center font-bold">{{ item.quantity_shipped }}</td>
                      <td class="px-5 py-3.5 text-center font-bold text-emerald-600">{{ item.quantity_accepted }}</td>
                      <td class="px-5 py-3.5 text-center font-bold text-red-500">{{ item.quantity_rejected }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="py-8 text-center text-slate-300 font-semibold">No items</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Printable preview -->
          <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden">
            <div class="p-4 border-b border-slate-100 bg-slate-50">
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Document Preview (No Pricing)</p>
            </div>
            <div class="flex-1 overflow-y-auto p-6 font-mono text-xs leading-relaxed space-y-4">
              <div class="text-center border-b-2 border-slate-200 pb-4">
                <p class="text-lg font-black tracking-widest uppercase">DELIVERY NOTE</p>
                <p class="text-2xl font-black text-indigo-700 mt-1">{{ selectedNote()!.note_number }}</p>
                <p class="text-xs text-slate-400 mt-1">{{ selectedNote()!.created_at | date: 'EEEE, dd MMMM yyyy' }}</p>
              </div>
              <div class="grid grid-cols-2 gap-4 text-xs border-b border-dashed border-slate-200 pb-4">
                <div>
                  <p class="font-black uppercase text-slate-400 mb-1">Deliver To:</p>
                  <p class="font-bold">{{ selectedNote()!.customer?.full_name ?? '—' }}</p>
                  <p class="text-slate-500">Attn: {{ selectedNote()!.recipient_name ?? '—' }}</p>
                </div>
                <div>
                  <p class="font-black uppercase text-slate-400 mb-1">Driver:</p>
                  <p class="font-bold">{{ selectedNote()!.driver_name ?? '—' }}</p>
                  <p class="text-slate-500">{{ selectedNote()!.driver_phone ?? '' }}</p>
                </div>
              </div>
              <table class="w-full border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-200">
                    <th class="py-2 text-left font-black text-slate-600 uppercase">Item</th>
                    <th class="py-2 text-right font-black text-slate-600 uppercase">Qty</th>
                    <th class="py-2 text-right font-black text-slate-600 uppercase">✓ Recv'd</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of selectedNoteItems(); track item.id) {
                    <tr class="border-b border-dashed border-slate-100">
                      <td class="py-2">{{ item.product?.name ?? '—' }}</td>
                      <td class="py-2 text-right">{{ item.quantity_shipped }}</td>
                      <td class="py-2 text-right w-16">
                        @if (selectedNote()?.status === 'DELIVERED' || selectedNote()?.status === 'PARTIAL_REJECTED') {
                          <span class="font-bold text-indigo-600">[{{ item.quantity_accepted }}]</span>
                        } @else {
                          [ &nbsp;&nbsp;&nbsp; ]
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <div class="pt-8 border-t border-slate-200">
                <div class="grid grid-cols-2 gap-8">
                  <div>
                    <p class="text-[10px] uppercase font-black text-slate-400 mb-6">Received By (Print Name):</p>
                    <div class="border-b border-slate-400 h-8"></div>
                  </div>
                  <div>
                    <p class="text-[10px] uppercase font-black text-slate-400 mb-6">Signature &amp; Date:</p>
                    <div class="border-b border-slate-400 h-8"></div>
                  </div>
                </div>
              </div>
              <p class="text-center text-[9px] text-slate-300 pt-4 uppercase tracking-widest">
                ⚠️ This document contains NO pricing information.
              </p>
            </div>
          </div>
        </div>
      }

      <!-- ── RECEIVE / e-POD VIEW ── -->
      @if (view() === 'receive' && selectedNote()) {
        <div class="flex-1 flex flex-col gap-5 min-h-0 overflow-y-auto">

          <!-- Banner -->
          <div class="bg-violet-600 text-white rounded-2xl p-5 flex items-center justify-between flex-shrink-0">
            <div>
              <p class="text-xs font-black uppercase tracking-widest opacity-70">Goods Receiving · e-POD</p>
              <p class="text-2xl font-black mt-0.5 font-mono">{{ selectedNote()!.note_number }}</p>
              <p class="text-sm opacity-80 mt-1">Confirm exactly what was physically received. This will generate the invoice basis.</p>
            </div>
            <span class="material-symbols-rounded text-6xl opacity-20">inventory</span>
          </div>

          <!-- Receiving Table -->
          <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden flex-shrink-0">
            <div class="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-sm font-black text-slate-700">Confirm Quantities Received</h3>
              <span class="text-xs font-bold text-slate-400">Tip: If all accepted, leave Rejected as 0</span>
            </div>
            <table class="w-full text-sm">
              <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                  <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Shipped</th>
                  <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">✅ Accepted</th>
                  <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">❌ Rejected</th>
                  <th class="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejection Reason</th>
                  <th class="px-5 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Match?</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                @for (line of receivingLines(); track line.id) {
                  <tr [class]="receivingLineStatus(line)">
                    <td class="px-5 py-3.5 font-semibold text-slate-700">{{ line.product?.name ?? line.product_id }}</td>
                    <td class="px-5 py-3.5 text-center font-black text-slate-800">{{ line.quantity_shipped }}</td>
                    <td class="px-5 py-3.5 text-center">
                      <input type="number" [(ngModel)]="line.accepted_input" min="0" [max]="line.quantity_shipped"
                        (ngModelChange)="syncRejected(line)"
                        class="w-20 text-center border-2 border-emerald-200 focus:border-emerald-400 rounded-lg px-2 py-1.5 text-sm font-bold outline-none transition-all bg-emerald-50" />
                    </td>
                    <td class="px-5 py-3.5 text-center">
                      <input type="number" [(ngModel)]="line.rejected_input" min="0" [max]="line.quantity_shipped"
                        class="w-20 text-center border-2 border-red-200 focus:border-red-400 rounded-lg px-2 py-1.5 text-sm font-bold outline-none transition-all bg-red-50" />
                    </td>
                    <td class="px-5 py-3.5">
                      <input [(ngModel)]="line.rejection_reason_input"
                        [placeholder]="line.rejected_input > 0 ? 'e.g. Damaged, Wrong item…' : '—'"
                        [disabled]="line.rejected_input === 0"
                        class="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all disabled:opacity-40 disabled:bg-slate-50" />
                    </td>
                    <td class="px-5 py-3.5 text-center">
                      @if (line.accepted_input + line.rejected_input === line.quantity_shipped) {
                        <span class="text-emerald-500 material-symbols-rounded text-[20px]">check_circle</span>
                      } @else {
                        <span class="text-amber-400 material-symbols-rounded text-[20px]">warning</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot class="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td class="px-5 py-3 text-xs font-black text-slate-500 uppercase">Totals</td>
                  <td class="px-5 py-3 text-center font-black text-slate-700">{{ receivedTotalShipped() }}</td>
                  <td class="px-5 py-3 text-center font-black text-emerald-600">{{ receivedTotalAccepted() }}</td>
                  <td class="px-5 py-3 text-center font-black text-red-500">{{ receivedTotalRejected() }}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Summary + Confirm -->
          <div class="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-6">
              <div class="text-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Shipped</p>
                <p class="text-2xl font-black text-slate-800">{{ receivedTotalShipped() }}</p>
              </div>
              <div class="text-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Accepted</p>
                <p class="text-2xl font-black text-emerald-600">{{ receivedTotalAccepted() }}</p>
              </div>
              <div class="text-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Rejected</p>
                <p class="text-2xl font-black text-red-500">{{ receivedTotalRejected() }}</p>
              </div>
              @if (receivedTotalRejected() > 0) {
                <div class="flex items-center gap-2 bg-amber-50 text-amber-700 text-xs font-bold px-3 py-2 rounded-xl border border-amber-200">
                  <span class="material-symbols-rounded text-[16px]">warning</span>
                  Partial rejection detected — status will be PARTIAL REJECTED
                </div>
              }
            </div>
            <button (click)="confirmReceiving()"
              [disabled]="!receivingValid()"
              class="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-6 py-3 rounded-xl shadow-lg shadow-violet-600/25 transition-all">
              <span class="material-symbols-rounded text-[18px]">task_alt</span>
              Confirm Receiving &amp; Close POD
            </button>
          </div>

        </div>
      }

      <!-- ── INVOICE MODAL ── -->
      @if (showInvoiceModal()) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] w-full max-w-xl overflow-hidden border border-white/20 scale-100 animate-in zoom-in-95 duration-200">
            
            <!-- Header Section -->
            <div class="bg-slate-900 p-8 text-white relative overflow-hidden">
               <div class="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
               <div class="relative z-10 flex justify-between items-start">
                  <div>
                    <h3 class="text-2xl font-black tracking-tight uppercase">Generate Invoice</h3>
                    <p class="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Ready for Billing · Delivery Note Ref #{{ selectedNote()?.note_number }}</p>
                  </div>
                  <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <span class="material-symbols-rounded text-white">receipt_long</span>
                  </div>
               </div>
            </div>

            <div class="p-8">
              <!-- Summary Bento -->
              <div class="grid grid-cols-2 gap-4 mb-8">
                 <div class="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Items Confirmed</p>
                    <p class="text-xl font-black text-slate-800 dark:text-white">{{ invoiceableLines().length }} Lines</p>
                 </div>
                 <div class="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                    <p class="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Billable</p>
                    <p class="text-xl font-black text-emerald-600">{{ invoiceTotal() | currency:'GBP' }}</p>
                 </div>
              </div>

              <!-- Line Items Table -->
              <div class="mb-8 overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                <table class="w-full text-xs">
                   <thead class="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th class="px-4 py-3 text-left font-black text-slate-400 uppercase">Product</th>
                        <th class="px-4 py-3 text-center font-black text-slate-400 uppercase">Qty</th>
                        <th class="px-4 py-3 text-right font-black text-slate-400 uppercase">Total</th>
                      </tr>
                   </thead>
                   <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
                      @for (line of invoiceableLines(); track line.id) {
                        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <td class="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{{ line.product?.name }}</td>
                          <td class="px-4 py-3 text-center font-black text-slate-900 dark:text-white">{{ line.accepted }}</td>
                          <td class="px-4 py-3 text-right font-black text-slate-600 dark:text-slate-400">{{ line.lineTotal | currency:'GBP' }}</td>
                        </tr>
                      } @empty {
                        <tr><td colspan="3" class="p-8 text-center text-slate-400 italic">No accepted items discovered.</td></tr>
                      }
                   </tbody>
                </table>
              </div>

              <!-- Payment Method Controls -->
              <div class="mb-8">
                <label class="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-4">Payment Terms & Settlement</label>
                <div class="grid grid-cols-3 gap-3">
                  @for (m of paymentMethods; track m.value) {
                    <button (click)="invoicePaymentMethod = m.value"
                      [class]="invoicePaymentMethod === m.value
                        ? 'border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 shadow-lg shadow-indigo-600/10'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'"
                      class="flex flex-col items-center gap-2 p-4 rounded-2xl text-xs font-bold transition-all duration-200">
                      <span class="material-symbols-rounded text-2xl">{{ m.icon }}</span>
                      {{ m.label }}
                    </button>
                  }
                </div>
              </div>

              <!-- Actions -->
              <div class="flex gap-4">
                <button (click)="showInvoiceModal.set(false)"
                  class="flex-1 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold text-sm transition-all">
                  Discard
                </button>
                <button (click)="generateInvoice()"
                  [disabled]="invoiceableLines().length === 0 || generatingInvoice()"
                  class="flex-[2] py-4 rounded-2xl bg-slate-900 hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition-all flex items-center justify-center gap-3 shadow-xl">
                  @if (generatingInvoice()) {
                    <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Processing...
                  } @else {
                    <span class="material-symbols-rounded">check_circle</span>
                    Confirm & Publish Invoice
                  }
                </button>
              </div>
            </div>

      <!-- ── SUCCESS CONFIRMATION MODAL ── -->
      @if (showInvoiceSuccess()) {
        <div class="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-500">
           <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-10 max-w-sm w-full text-center border border-white/20 animate-in zoom-in-95 duration-300">
              <div class="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                <span class="material-symbols-rounded text-4xl">check_circle</span>
              </div>
              <h3 class="text-2xl font-black text-slate-800 dark:text-white mb-2 uppercase tracking-tight">Invoice Published!</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400 mb-8 font-medium">
                 Your document has been successfully converted to **Transaction #{{ lastInvoiceId() }}**. 
                 All ledger entries and stock updates are finalized.
              </p>
              <div class="flex flex-col gap-3">
                 <button (click)="showInvoiceSuccess.set(false)" 
                    class="w-full py-4 bg-slate-900 hover:bg-black text-white font-black rounded-2xl shadow-xl transition-all uppercase tracking-widest text-xs">
                    Great, Continue
                 </button>
              </div>
           </div>
        </div>
      }

      <!-- ── PRINT MODAL ── -->
      @if (showPrintModal() && selectedNote()) {
        <app-delivery-note-print
          [note]="selectedNote()!"
          [items]="selectedNoteItems()"
          [store]="storeService.currentStore()"
          (close)="showPrintModal.set(false)"
        />
      }

    </div>
  `
})
export class DeliveryNotesComponent implements OnInit {
  private supabase = inject(MockSupabaseService);
  private storeService = inject(StoreConfigService);

  view = signal<View>('list');
  notes = signal<DeliveryNote[]>([]);
  selectedNote = signal<DeliveryNote | null>(null);
  selectedNoteItems = signal<DeliveryNoteItem[]>([]);
  receivingLines = signal<ReceivingLine[]>([]);
  saving = signal(false);
  showInvoiceModal = signal(false);
  showPrintModal = signal(false);
  generatingInvoice = signal(false);
  showInvoiceSuccess = signal(false);
  lastInvoiceId = signal('');
  invoicePaymentMethod: 'ON_ACCOUNT' | 'CASH' | 'CARD' = 'ON_ACCOUNT';

  paymentMethods = [
    { value: 'ON_ACCOUNT' as const, label: 'On Account', icon: 'account_balance_wallet' },
    { value: 'CASH' as const, label: 'Cash', icon: 'payments' },
    { value: 'CARD' as const, label: 'Card', icon: 'credit_card' },
  ];

  searchTerm = '';
  productSearch = '';
  cart = signal<CartLine[]>([]);
  newNote = { customer_id: '', recipient_name: '', driver_name: '', driver_phone: '', notes: '' };

  allProducts = toSignal(
    this.supabase.getProducts(this.storeService.currentStore()?.id ?? ''),
    { initialValue: [] as Product[] }
  );
  customers = toSignal(
    this.supabase.getCustomers(this.storeService.currentStore()?.id ?? ''),
    { initialValue: [] as Customer[] }
  );

  filteredNotes = computed(() => {
    const q = this.searchTerm.toLowerCase();
    return this.notes().filter(n =>
      n.note_number.toLowerCase().includes(q) ||
      (n.customer?.full_name ?? '').toLowerCase().includes(q)
    );
  });

  filteredProducts = computed(() => {
    const q = this.productSearch.toLowerCase();
    return this.allProducts().filter(p =>
      p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
    );
  });

  totalUnits = computed(() => this.cart().reduce((s, l) => s + l.quantity_shipped, 0));
  totalShipped = computed(() => this.selectedNoteItems().reduce((s, i) => s + i.quantity_shipped, 0));
  totalAccepted = computed(() => this.selectedNoteItems().reduce((s, i) => s + i.quantity_accepted, 0));
  totalRejected = computed(() => this.selectedNoteItems().reduce((s, i) => s + i.quantity_rejected, 0));

  stats = computed(() => [
    { label: 'Total Notes', value: this.notes().length, color: 'text-slate-800' },
    { label: 'Draft', value: this.notes().filter(n => n.status === 'DRAFT').length, color: 'text-amber-600' },
    { label: 'In Transit', value: this.notes().filter(n => n.status === 'DISPATCHED').length, color: 'text-indigo-600' },
    { label: 'Delivered', value: this.notes().filter(n => n.status === 'DELIVERED' || n.status === 'PARTIAL_REJECTED').length, color: 'text-emerald-600' },
  ]);

  ngOnInit() { this.loadNotes(); }

  // ── Database CRUD (Supabase) ─────────────────────────────────────────────

  loadNotes() {
    const storeId = this.storeService.currentStore()?.id;
    if (!storeId) return;
    this.supabase.getDeliveryNotes(storeId).subscribe({
      next: (data) => this.notes.set(data),
      error: (err) => console.error("Failed to load notes", err)
    });
  }

  openCreate() {
    this.cart.set([]);
    this.newNote = { customer_id: '', recipient_name: '', driver_name: '', driver_phone: '', notes: '' };
    this.productSearch = '';
    this.view.set('create');
  }

  openDetail(note: DeliveryNote) {
    this.selectedNote.set(note);
    this.view.set('detail');
    this.supabase.getDeliveryNoteItems(note.id).subscribe({
      next: (items) => this.selectedNoteItems.set(items),
      error: (err) => console.error("Failed to load note items", err)
    });
  }

  addToCart(p: Product) {
    if (this.cart().some(l => l.product.id === p.id)) return;
    this.cart.update(c => [...c, { product: p, quantity_shipped: 1 }]);
  }

  removeFromCart(productId: string) {
    this.cart.update(c => c.filter(l => l.product.id !== productId));
  }

  saveDeliveryNote() {
    const storeId = this.storeService.currentStore()?.id;
    if (!storeId || this.cart().length === 0) return;
    this.saving.set(true);

    const noteNumber = `DN-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

    const noteData: Omit<DeliveryNote, 'id' | 'created_at' | 'updated_at'> = {
      store_id: storeId,
      note_number: noteNumber,
      status: 'DRAFT',
      customer_id: this.newNote.customer_id || undefined,
      recipient_name: this.newNote.recipient_name || undefined,
      driver_name: this.newNote.driver_name || undefined,
      driver_phone: this.newNote.driver_phone || undefined,
      notes: this.newNote.notes || undefined,
    };

    const items: Omit<DeliveryNoteItem, 'id' | 'delivery_note_id'>[] = this.cart().map(l => ({
      product_id: l.product.id,
      quantity_shipped: l.quantity_shipped,
      quantity_accepted: 0,
      quantity_rejected: 0,
    }));

    this.supabase.createDeliveryNote(noteData, items).subscribe({
      next: () => {
        this.saving.set(false);
        this.loadNotes();
        this.view.set('list');
      },
      error: (err) => {
        console.error("Failed to save delivery note", err);
        this.saving.set(false);
      }
    });
  }

  dispatch(note: DeliveryNote) {
    this.supabase.updateDeliveryNoteStatus(note.id, 'DISPATCHED').subscribe({
      next: () => {
        this.loadNotes();
        const updated = { ...note, status: 'DISPATCHED' as DeliveryStatus };
        if (this.selectedNote()?.id === note.id) this.selectedNote.set(updated);
        // Auto-print after dispatch
        setTimeout(() => this.printNote(), 200);
      },
      error: (err) => console.error('Dispatch failed', err)
    });
  }

  markDelivered(note: DeliveryNote) {
    this.supabase.updateDeliveryNoteStatus(note.id, 'DELIVERED').subscribe({
      next: () => {
        this.loadNotes();
        if (this.selectedNote()?.id === note.id) this.selectedNote.set({ ...note, status: 'DELIVERED' as DeliveryStatus });
      },
      error: (err) => console.error('Mark delivered failed', err)
    });
  }

  openReceive(note: DeliveryNote) {
    this.selectedNote.set(note);
    this.supabase.getDeliveryNoteItems(note.id).subscribe({
      next: (rawItems) => {
        const lines: ReceivingLine[] = rawItems.map(i => ({
          ...i,
          accepted_input: i.quantity_shipped,
          rejected_input: 0,
          rejection_reason_input: '',
        }));
        this.receivingLines.set(lines);
        this.view.set('receive');
      },
      error: (err) => console.error("Failed to load items for receive", err)
    });
  }

  syncRejected(line: ReceivingLine) {
    line.rejected_input = Math.max(0, line.quantity_shipped - line.accepted_input);
  }

  receivedTotalShipped = computed(() => this.receivingLines().reduce((s, l) => s + l.quantity_shipped, 0));
  receivedTotalAccepted = computed(() => this.receivingLines().reduce((s, l) => s + l.accepted_input, 0));
  receivedTotalRejected = computed(() => this.receivingLines().reduce((s, l) => s + l.rejected_input, 0));

  receivingValid = computed(() =>
    this.receivingLines().every(l => l.accepted_input + l.rejected_input === l.quantity_shipped)
  );

  receivingLineStatus(line: ReceivingLine): string {
    const ok = line.accepted_input + line.rejected_input === line.quantity_shipped;
    return ok ? 'hover:bg-slate-50/50 transition-colors' : 'bg-amber-50/50 hover:bg-amber-50 transition-colors';
  }

  confirmReceiving() {
    const note = this.selectedNote();
    if (!note) return;
    const lines = this.receivingLines();

    const updatedItems: DeliveryNoteItem[] = lines.map(l => ({
      ...l,
      quantity_accepted: l.accepted_input,
      quantity_rejected: l.rejected_input,
      rejection_reason: l.rejection_reason_input || undefined,
    }));

    const hasRejections = lines.some(l => l.rejected_input > 0);
    const finalStatus: DeliveryStatus = hasRejections ? 'PARTIAL_REJECTED' : 'DELIVERED';

    this.supabase.updateDeliveryNoteItems(updatedItems).subscribe({
      next: () => {
        this.supabase.updateDeliveryNoteStatus(note.id, finalStatus).subscribe({
          next: () => {
            this.loadNotes();
            const updated = { ...note, status: finalStatus };
            this.selectedNote.set(updated);
            this.openDetail(updated);
          },
          error: (err) => console.error('Status update failed', err)
        });
      },
      error: (err) => console.error('Item update failed', err)
    });
  }

  // ── Invoice generation ──────────────────────────────────

  invoiceableLines = computed(() => {
    return this.selectedNoteItems()
      .map(i => {
        // If status is DELIVERED, we MUST have quantity_accepted filled.
        // Fallback to 0 if not yet set, rather than shipped quantity.
        const acceptedQty = i.quantity_accepted ?? 0;
        return {
          ...i,
          accepted: acceptedQty,
          price: i.product?.price ?? 0,
          lineTotal: (i.product?.price ?? 0) * acceptedQty,
        };
      })
      .filter(l => l.accepted > 0);
  });

  invoiceTotal = computed(() =>
    this.invoiceableLines().reduce((s, l) => s + l.lineTotal, 0)
  );

  generateInvoice() {
    const note = this.selectedNote();
    const storeId = this.storeService.currentStore()?.id;
    if (!note || !storeId || this.invoiceableLines().length === 0) return;

    this.generatingInvoice.set(true);
    const lines = this.invoiceableLines();
    const subtotal = this.invoiceTotal();

    const cartItems: CartItem[] = lines.map(l => ({
      product: l.product!,
      quantity: l.accepted,
    }));

    const txData: Omit<Transaction, 'id' | 'created_at'> = {
      store_id: storeId,
      customer_id: note.customer_id,
      subtotal_amount: subtotal,
      total_discount: 0,
      total_amount: subtotal,
      tax_amount: 0,
      payment_method: this.invoicePaymentMethod,
      delivery_note_id: note.id,
      metadata: { type: 'SALE', source: 'DELIVERY_NOTE', delivery_note_number: note.note_number },
    };

    this.supabase.addTransaction(txData, cartItems).pipe(
      switchMap(tx => {
        this.lastInvoiceId.set(tx.id.substring(0, 8));
        return this.supabase.updateDeliveryNoteStatus(note.id, note.status, { invoiced_at: new Date().toISOString() });
      }),
      finalize(() => this.generatingInvoice.set(false))
    ).subscribe({
      next: () => {
        this.loadNotes();
        const updated = { ...note, invoiced_at: new Date().toISOString() };
        this.selectedNote.set(updated);
        this.showInvoiceModal.set(false);
        this.showInvoiceSuccess.set(true);
      },
      error: (err) => {
        console.error('Invoice generation failed:', err);
        alert('Invoice Error: Please check if the customer has an assigned store account or try a different payment method.');
      }
    });
  }

  printNote() {
    const note = this.selectedNote();
    if (note) this.showPrintModal.set(true);
  }

  statusBadge(status: DeliveryStatus): string {
    const map: Record<DeliveryStatus, string> = {
      DRAFT: 'bg-amber-100 text-amber-700',
      DISPATCHED: 'bg-indigo-100 text-indigo-700',
      DELIVERED: 'bg-emerald-100 text-emerald-700',
      PARTIAL_REJECTED: 'bg-red-100 text-red-700',
      CANCELLED: 'bg-slate-100 text-slate-500',
    };
    return map[status] ?? 'bg-slate-100 text-slate-500';
  }
}
