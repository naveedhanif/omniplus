import { Component, input, output, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { PurchaseOrder, Store, Supplier } from '../../core/services/mock-supabase.service';

@Component({
   selector: 'app-purchase-order-print',
   standalone: true,
   imports: [CommonModule, CurrencyPipe, DatePipe],
   template: `
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 no-print">
      <div class="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[95vh] border border-slate-200 overflow-hidden">
        
        <!-- Header & Controls -->
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-xl bg-[var(--primary-color)] flex items-center justify-center text-white shadow-lg shadow-[var(--primary-color)]/20">
                <span class="material-symbols-rounded">print</span>
             </div>
             <div>
                <h3 class="text-lg font-black text-slate-800 uppercase tracking-tight">Print Preview</h3>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisition Official Document</p>
             </div>
          </div>
          <div class="flex items-center gap-3">
            <button (click)="onPrint()" class="px-8 py-3 bg-slate-900 text-white text-xs font-black rounded-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">
              <span class="material-symbols-rounded text-sm">print</span> 
              Print Document
            </button>
            <button (click)="close.emit()" class="p-3 text-slate-400 hover:text-slate-600 transition-colors">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        </div>

        <!-- Scrollable Document View -->
        <div class="flex-1 overflow-y-auto bg-slate-200/50 p-12 flex justify-center custom-scrollbar">
          
          <!-- The Actual A4 Document -->
          <div id="po-document" class="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl relative text-slate-800 font-sans leading-relaxed">
            
            <!-- WATERMARK -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none" [class.opacity-[0.03]]="po().status !== 'DRAFT'" [class.opacity-[0.05]]="po().status === 'DRAFT'" [class.text-red-900]="po().status === 'DRAFT'" [class.text-slate-900]="po().status !== 'DRAFT'">
                <div class="text-[150px] font-black -rotate-45 uppercase border-[20px] px-10 py-5" [class.border-red-900]="po().status === 'DRAFT'" [class.border-slate-900]="po().status !== 'DRAFT'">
                  {{ po().status === 'DRAFT' ? 'DRAFT' : 'OFFICIAL' }}
                </div>
            </div>

            <!-- DOCUMENT HEADER -->
            <div class="flex justify-between items-start mb-16 relative">
               <div>
                  <h1 class="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Purchase Order</h1>
                  <div class="flex items-center gap-4">
                     <div class="bg-slate-900 text-white px-3 py-1 text-xs font-black tracking-widest">#{{ po().id.substring(0,8).toUpperCase() }}</div>
                     <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">Date: {{ po().created_at | date:'longDate' }}</div>
                  </div>
               </div>
               <div class="text-right">
                  <div class="font-black text-xl tracking-tighter text-[var(--primary-color)] italic">{{ store()?.name }}</div>
                  <div class="text-[10px] font-bold text-slate-500 max-w-[200px] ml-auto">
                    {{ store()?.name }} Management System<br>
                    Inventory & Supply Chain Division<br>
                    Official Procurement Form
                  </div>
               </div>
            </div>

            <!-- ADDRESS GRID -->
            <div class="grid grid-cols-2 gap-20 mb-16">
               <div class="space-y-4">
                  <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Supplier Recipient</h4>
                  <div class="space-y-1">
                     <div class="text-lg font-black text-slate-900">{{ po().supplier?.name }}</div>
                     <div class="text-xs font-bold text-slate-500 italic">{{ po().supplier?.contact_person }}</div>
                     <div class="text-xs text-slate-600 font-medium">{{ po().supplier?.address || 'No address on file' }}</div>
                     <div class="text-xs font-bold text-slate-700 mt-2 flex items-center gap-2">
                        <span class="material-symbols-rounded text-sm">phone</span>
                        {{ po().supplier?.phone }}
                     </div>
                  </div>
               </div>
               <div class="space-y-4">
                  <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Delivery Destination</h4>
                  <div class="space-y-1">
                     <div class="text-lg font-black text-slate-900">{{ store()?.name }}</div>
                     <div class="text-xs text-slate-600 font-medium">Main Warehouse / Shop Floor</div>
                     <div class="text-xs font-bold text-slate-400 mt-4 uppercase tracking-[0.1em]">Expected Arrival</div>
                     <div class="text-sm font-black text-blue-600">
                        {{ po().expected_arrival ? (po().expected_arrival | date:'fullDate') : 'STAT (Immediate Delivery Requested)' }}
                     </div>
                  </div>
               </div>
            </div>

            <!-- ITEM TABLE -->
            <div class="mb-16">
               <table class="w-full text-left">
                  <thead>
                     <tr class="border-b-2 border-slate-900">
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</th>
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Qty</th>
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Unit Price</th>
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Extension</th>
                     </tr>
                  </thead>
                  <tbody class="text-xs divide-y divide-slate-100">
                     @for (item of items(); track item.id) {
                        <tr>
                           <td class="py-5">
                              <div class="font-black text-slate-900">{{ item.product?.name }}</div>
                              <div class="text-[9px] font-bold text-slate-400 uppercase mt-0.5">SKU: {{ item.product?.supplier_sku || 'N/A' }}</div>
                           </td>
                           <td class="py-5 text-center font-black">{{ item.quantity_ordered }}</td>
                           <td class="py-5 text-right font-medium text-slate-500">{{ item.unit_cost | currency:currency() }}</td>
                           <td class="py-5 text-right font-black text-slate-900 italic">{{ (item.quantity_ordered * item.unit_cost) | currency:currency() }}</td>
                        </tr>
                     }
                  </tbody>
               </table>
            </div>

            <!-- TOTALS & NOTES -->
            <div class="flex justify-between items-start gap-12">
               <div class="flex-1">
                  <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Requisition Notes</h4>
                  <div class="p-4 bg-slate-50 rounded-lg text-[11px] font-medium text-slate-600 leading-relaxed italic border border-slate-100 shadow-inner">
                     {{ po().notes || 'No special instructions provided for this procurement cycle.' }}
                  </div>
               </div>
               <div class="w-64 space-y-3">
                  <div class="flex justify-between text-xs font-bold text-slate-400 uppercase">
                     <span>Subtotal</span>
                     <span>{{ (po().subtotal ?? po().total_amount) | currency:currency() }}</span>
                  </div>
                  @if (po().tax_amount && po().tax_amount! > 0) {
                     <div class="flex justify-between text-xs font-bold text-slate-400 uppercase pb-2 border-b border-slate-100">
                        <span>Tax</span>
                        <span>{{ po().tax_amount | currency:currency() }}</span>
                     </div>
                  }
                  <div class="flex justify-between items-center pt-2">
                     <span class="text-xs font-black uppercase tracking-widest text-slate-900">Grand Total</span>
                     <span class="text-2xl font-black text-slate-900 tabular-nums">{{ po().total_amount | currency:currency() }}</span>
                  </div>
               </div>
            </div>

            <!-- SIGNATURE BLOCKS -->
            <div class="mt-24 grid grid-cols-2 gap-20">
               <div>
                  <div class="h-px bg-slate-900 mb-2"></div>
                  <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Authorized Requestor Signature</div>
                  <div class="text-[10px] font-bold text-slate-800 mt-1 uppercase">{{ store()?.name }} Staff</div>
               </div>
               <div>
                  <div class="h-px bg-slate-900 mb-2"></div>
                  <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Official Approval / Stamp</div>
                  <div class="text-[10px] font-bold text-slate-800 mt-1">Management Division</div>
               </div>
            </div>

            <!-- FOOTER -->
            <div class="absolute bottom-[20mm] left-[20mm] right-[20mm] text-center border-t border-slate-100 pt-6">
               <div class="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] mb-1 italic">World-Class Procurement by OmniPlus</div>
               <div class="text-[8px] font-bold text-slate-400">This is a computer-generated document. No signature is required for electronic validation.</div>
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
        body > * { display: none !important; }
        .no-print { display: none !important; }

        #po-document {
          display: block !important;
          visibility: visible !important;
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          height: auto !important;
          padding: 20mm !important;
          margin: 0 !important;
          box-shadow: none !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        /* Ensure page breaks don't cut items */
        tr { page-break-inside: avoid; }
        
        @page {
          size: A4;
          margin: 0;
        }
      }
    </style>
  `
})
export class PurchaseOrderPrintComponent {
   po = input.required<PurchaseOrder>();
   items = input.required<any[]>();
   store = input.required<Store | null>();
   currency = input.required<string>();
   close = output<void>();

   onPrint() {
      window.print();
   }
}
