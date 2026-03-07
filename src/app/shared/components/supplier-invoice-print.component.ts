import { Component, input, output } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { SupplierInvoice } from '../../core/services/mock-supabase.service';

@Component({
  selector: 'app-supplier-invoice-print',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  template: `
    <!-- Overlay wrapper (hidden during print) -->
    <div class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 print:p-0 print:bg-white print:backdrop-blur-none print:block print:inset-0 print:overflow-visible">
      <div class="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[95vh] border border-slate-200 overflow-hidden print:w-full print:max-w-none print:h-auto print:border-none print:shadow-none print:rounded-none print:overflow-visible">

        <!-- Print Controls Header -->
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0 print:hidden">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-600/20">
              <span class="material-symbols-rounded">receipt_long</span>
            </div>
            <div>
              <h3 class="text-lg font-black text-slate-800 uppercase tracking-tight">Invoice Preview</h3>
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">{{ invoice().invoice_number }} — Official Tax Invoice</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right mr-4">
              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Due</p>
              <p class="text-2xl font-black text-teal-700">{{ invoice().total_amount | currency: currency() }}</p>
            </div>
            <button (click)="onPrint()"
              class="px-8 py-3 bg-slate-900 text-white text-xs font-black rounded-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">
              <span class="material-symbols-rounded text-sm">print</span>
              Print / Save PDF
            </button>
            <button (click)="close.emit()" class="p-3 text-slate-400 hover:text-slate-600 transition-colors">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        </div>

        <!-- Scrollable Document Preview -->
        <div class="flex-1 overflow-y-auto bg-slate-200/50 p-12 flex justify-center custom-scrollbar print:overflow-visible print:bg-white print:p-0 print:block">

          <!-- ═══════════════════════════════════════════════════════
               THE PRINTABLE A4 DOCUMENT — id must be "inv-document"
               ═══════════════════════════════════════════════════════ -->
          <div id="inv-document"
            class="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl relative text-slate-800 font-sans leading-relaxed flex flex-col print:shadow-none print:m-0 print:p-[15mm] print:w-full print:border-none border border-slate-200">


            <!-- Watermark -->
            <div class="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
              <div class="text-[150px] font-black -rotate-45 uppercase border-[20px] border-slate-900 px-10 py-5">
                {{ invoice().payment_status === 'PAID' ? 'PAID' : 'INVOICE' }}
              </div>
            </div>

            <!-- ── TOP HEADER ──────────────────────────────────────── -->
            <div class="flex justify-between items-start mb-12">
              <!-- Left: Doc title + numbers -->
              <div>
                <h1 class="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-3">Tax Invoice</h1>
                <div class="space-y-1">
                  <div class="flex items-center gap-3">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400 w-28">Invoice No.</span>
                    <span class="bg-slate-900 text-white px-3 py-1 text-xs font-black tracking-widest">{{ invoice().invoice_number }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400 w-28">PO Reference</span>
                    <span class="bg-teal-50 border border-teal-200 text-teal-800 px-3 py-1 text-xs font-black tracking-widest">{{ poNumber() }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400 w-28">Issue Date</span>
                    <span class="text-xs font-bold text-slate-700">{{ invoice().issued_date | date:'longDate' }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400 w-28">Due Date</span>
                    <span class="text-xs font-black" [class.text-red-600]="isOverdue()" [class.text-slate-700]="!isOverdue()">
                      {{ invoice().due_date ? (invoice().due_date | date:'longDate') : '—' }}
                      @if (isOverdue()) { <span class="ml-1 text-[9px] bg-red-100 text-red-700 px-2 py-0.5 font-black uppercase tracking-widest">OVERDUE</span> }
                    </span>
                  </div>
                </div>
              </div>

              <!-- Right: Store / Company info -->
              <div class="text-right">
                <div class="font-black text-2xl tracking-tighter text-teal-700 italic mb-2">{{ storeName() }}</div>
                <div class="text-[10px] font-bold text-slate-500 leading-relaxed">
                  Official Supplier Invoice<br>
                  Procurement Division<br>
                  OmniPOS Management System
                </div>
                <!-- Payment Status Badge -->
                <div class="mt-3 inline-block">
                  @if (invoice().payment_status === 'PAID') {
                    <span class="bg-emerald-100 text-emerald-800 border border-emerald-200 px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-full">✓ PAID</span>
                  } @else {
                    <span class="bg-amber-100 text-amber-800 border border-amber-200 px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-full">⏳ PAYMENT PENDING</span>
                  }
                </div>
              </div>
            </div>

            <!-- ── PARTIES GRID ───────────────────────────────────── -->
            <div class="grid grid-cols-2 gap-16 mb-12">
              <!-- From (our store) -->
              <div class="space-y-3">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Bill To (Supplier)</h4>
                <div>
                  <div class="text-lg font-black text-slate-900">{{ invoice().supplier?.name }}</div>
                  <div class="text-xs font-bold text-slate-500 italic mt-0.5">{{ invoice().supplier?.contact_person }}</div>
                  <div class="text-xs text-slate-600 font-medium mt-1">{{ invoice().supplier?.address || 'Address on file' }}</div>
                  @if (invoice().supplier?.phone) {
                    <div class="text-xs font-bold text-slate-700 mt-2">📞 {{ invoice().supplier?.phone }}</div>
                  }
                  @if (invoice().supplier?.email) {
                    <div class="text-xs font-bold text-slate-500 mt-0.5">✉ {{ invoice().supplier?.email }}</div>
                  }
                </div>
              </div>
              <!-- Remit To -->
              <div class="space-y-3">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Issued By (Purchaser)</h4>
                <div>
                  <div class="text-lg font-black text-slate-900">{{ storeName() }}</div>
                  <div class="text-xs text-slate-600 font-medium mt-1">Procurement Department</div>
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3">Payment Terms</div>
                  <div class="text-sm font-black text-slate-800">Net {{ paymentTermDays() }} Days from Issue</div>
                </div>
              </div>
            </div>

            <!-- ── LINE ITEMS TABLE ───────────────────────────────── -->
            <div class="mb-12">
              <table class="w-full text-left">
                <thead>
                  <tr class="border-b-2 border-slate-900 bg-slate-50">
                    <th class="py-4 pl-3 text-[10px] font-black uppercase tracking-widest text-slate-500">#</th>
                    <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Description</th>
                    <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Qty</th>
                    <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Unit Price</th>
                    <th class="py-4 pr-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody class="text-xs divide-y divide-slate-100">
                  @for (item of invoice().items; track item.id; let i = $index) {
                    <tr>
                      <td class="py-4 pl-3 text-slate-400 font-bold">{{ i + 1 }}</td>
                      <td class="py-4">
                        <div class="font-black text-slate-900">{{ item.description }}</div>
                      </td>
                      <td class="py-4 text-center font-black text-slate-800">{{ item.quantity }}</td>
                      <td class="py-4 text-right font-medium text-slate-600">{{ item.unit_cost | currency: currency() }}</td>
                      <td class="py-4 pr-3 text-right font-black text-slate-900">{{ item.line_total | currency: currency() }}</td>
                    </tr>
                  }
                  @if (!invoice().items?.length) {
                    <tr>
                      <td colspan="5" class="py-8 text-center text-slate-400 italic text-xs">No line items recorded</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- ── TOTALS BLOCK ───────────────────────────────────── -->
            <div class="flex justify-between items-start gap-12">
              <!-- Notes -->
              <div class="flex-1">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Invoice Notes</h4>
                <div class="p-4 bg-slate-50 rounded-lg text-[11px] font-medium text-slate-600 leading-relaxed italic border border-slate-100">
                  {{ invoice().notes || 'No additional notes for this invoice.' }}
                </div>
              </div>

              <!-- Numbers -->
              <div class="w-64 space-y-2">
                <div class="flex justify-between text-xs font-bold text-slate-500 uppercase pb-2" [class.border-b]="!invoice().tax_amount || invoice().tax_amount === 0" [class.border-slate-200]="!invoice().tax_amount || invoice().tax_amount === 0">
                  <span>Subtotal</span>
                  <span>{{ invoice().subtotal | currency: currency() }}</span>
                </div>
                @if (invoice().tax_amount && invoice().tax_amount! > 0) {
                  <div class="flex justify-between text-xs font-bold text-slate-500 uppercase pb-2 border-b border-slate-200">
                    <span>Tax ({{ taxRate() }}%)</span>
                    <span>{{ invoice().tax_amount | currency: currency() }}</span>
                  </div>
                }
                <div class="flex justify-between items-center pt-2 border-b-2 border-slate-900 pb-2">
                  <span class="text-sm font-black uppercase tracking-widest text-slate-900">Total Due</span>
                  <span class="text-2xl font-black text-slate-900 tabular-nums">{{ invoice().total_amount | currency: currency() }}</span>
                </div>
                @if (invoice().payment_status === 'PAID') {
                  <div class="flex justify-between items-center pt-1">
                    <span class="text-xs font-black uppercase text-emerald-700">Amount Paid</span>
                    <span class="text-lg font-black text-emerald-700">{{ invoice().total_amount | currency: currency() }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-black uppercase text-slate-400">Balance Due</span>
                    <span class="text-lg font-black text-slate-400">{{ 0 | currency: currency() }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- ── SIGNATURE BLOCKS ───────────────────────────────── -->
            <div class="mt-20 grid grid-cols-2 gap-20">
              <div>
                <div class="h-16"></div>
                <div class="h-px bg-slate-900 mb-2"></div>
                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Authorised Signature (Purchaser)</div>
                <div class="text-[10px] font-bold text-slate-800 mt-1 uppercase">{{ storeName() }} — Procurement</div>
              </div>
              <div>
                <div class="h-16"></div>
                <div class="h-px bg-slate-900 mb-2"></div>
                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Supplier Representative Signature</div>
                <div class="text-[10px] font-bold text-slate-800 mt-1">{{ invoice().supplier?.name }}</div>
              </div>
            </div>

            <!-- ── FOOTER ─────────────────────────────────────────── -->
            <div class="absolute bottom-[20mm] left-[20mm] right-[20mm] text-center border-t border-slate-100 pt-6">
              <div class="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] mb-1 italic">Official Tax Invoice — OmniPOS Procurement System</div>
              <div class="text-[8px] font-bold text-slate-400">This is a computer-generated document. Valid without physical signature unless required by law.</div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <style>
      .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }

        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background: white !important;
        }

        tr { page-break-inside: avoid; }
      }
    </style>
  `
})
export class SupplierInvoicePrintComponent {
  invoice = input.required<SupplierInvoice & { items?: any[]; supplier?: any }>();
  currency = input.required<string>();
  storeName = input<string>('OmniPOS Store');
  poNumber = input<string>('');

  close = output<void>();

  onPrint() {
    window.print();
  }

  isOverdue(): boolean {
    if (!this.invoice().due_date || this.invoice().payment_status === 'PAID') return false;
    return new Date(this.invoice().due_date!) < new Date();
  }

  paymentTermDays(): number {
    if (!this.invoice().due_date || !this.invoice().issued_date) return 30;
    const issued = new Date(this.invoice().issued_date);
    const due = new Date(this.invoice().due_date!);
    return Math.round((due.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24));
  }

  taxRate(): number {
    if (!this.invoice().subtotal || !this.invoice().tax_amount) return 0;
    return Math.round((this.invoice().tax_amount / this.invoice().subtotal) * 100);
  }
}
