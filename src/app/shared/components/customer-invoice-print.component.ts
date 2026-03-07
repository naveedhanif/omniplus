import { Component, input, output, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Transaction, TransactionItem, Store } from '../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../core/services/store-config.service';

@Component({
   selector: 'app-customer-invoice-print',
   standalone: true,
   imports: [CommonModule, CurrencyPipe, DatePipe],
   template: `
    <!-- Full-screen backdrop (hidden when printing) -->
    <div (click)="close.emit()" class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 print:p-0 print:bg-white print:block shadow-2xl overflow-y-auto no-scrollbar cursor-zoom-out">
      
      <!-- Container for A4 -->
      <div (click)="$event.stopPropagation()" class="bg-white rounded-[2rem] shadow-[0_25px_100px_rgba(0,0,0,0.2)] w-full max-w-5xl flex flex-col h-fit my-8 border border-white/20 print:border-none print:shadow-none print:m-0 print:rounded-none cursor-default">
        
        <!-- Action Bar (Hidden when printing) -->
        <div class="p-8 border-b border-slate-100 flex justify-between items-center bg-transparent print:hidden shrink-0">
           <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
                <span class="material-symbols-rounded text-2xl">receipt_long</span>
              </div>
              <div>
                <h3 class="text-2xl font-black text-slate-800 tracking-tight uppercase">Tax Invoice</h3>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Reference #{{ transaction().id.substring(0,8) }}</p>
              </div>
           </div>

           <div class="flex items-center gap-3">
              <button (click)="onPrint()" 
                class="px-8 py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs transition-all shadow-xl active:scale-95 flex items-center gap-2 uppercase tracking-[0.2em]">
                <span class="material-symbols-rounded text-lg">print</span>
                Download / Print
              </button>
              <button (click)="close.emit()" 
                class="w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all">
                <span class="material-symbols-rounded">close</span>
              </button>
           </div>
        </div>

        <!-- The Printable Document Area -->
        <div class="p-12 print:p-0 flex justify-center bg-slate-50/50 print:bg-white">
           
           <div id="invoice-canvas" 
             class="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-sm relative text-slate-900 font-sans leading-relaxed print:shadow-none print:w-full print:p-[10mm] border border-slate-100 print:border-none">
             
             <!-- Corner Badge Overlay -->
             <div class="absolute top-[10mm] right-[10mm] border-2 border-slate-900/10 rounded-3xl p-4 flex flex-col items-center gap-1">
                <div class="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Verified Financial Doc</div>
                <div class="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100">
                    <!-- Placeholder QR -->
                    <span class="material-symbols-rounded text-slate-300 text-3xl">qr_code_2</span>
                </div>
             </div>

             <!-- Top Section: Logo & Titles -->
             <div class="flex flex-col gap-10 mb-20">
                <div class="flex justify-between items-start">
                  <div>
                    <div class="text-3xl font-black tracking-tighter italic text-indigo-700 mb-2">{{ store()?.name || 'OMNIPLUS STORE' }}</div>
                    <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">
                       Official Commercial Invoice<br>
                       Ref: {{ transaction().id.substring(0,8).toUpperCase() }}
                    </div>
                  </div>
                  <div class="text-right">
                    <h1 class="text-5xl font-black tracking-tighter uppercase text-slate-900 mb-2">Invoice</h1>
                    <div class="space-y-1">
                       <p class="text-xs font-bold"><span class="text-slate-400 uppercase tracking-widest text-[10px] mr-4">Invoice Date</span> {{ transaction().created_at | date:'longDate' }}</p>
                       <p class="text-xs font-bold"><span class="text-slate-400 uppercase tracking-widest text-[10px] mr-4">Reference No.</span> #{{ transaction().id.substring(0,8) }}</p>
                       @if (transaction().delivery_note_id) {
                         <p class="text-xs font-bold"><span class="text-slate-400 uppercase tracking-widest text-[10px] mr-4">Delivery Ref</span> DN-{{ transaction().delivery_note_id.substring(0,6) }}</p>
                       }
                    </div>
                  </div>
                </div>

                <!-- Parties Information -->
                <div class="grid grid-cols-2 gap-20">
                   <!-- Bill From -->
                   <div class="space-y-4">
                      <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b-2 border-indigo-600 pb-2 flex-shrink-0">Shipped From</h4>
                      <div class="space-y-1">
                         <p class="text-lg font-black">{{ store()?.name }}</p>
                         <p class="text-xs font-medium text-slate-500">{{ store()?.address || 'Operational Warehouse Address On File' }}</p>
                         <p class="text-xs font-bold text-slate-700 mt-2">Support: contact&#64;omniplus.demo</p>
                      </div>
                   </div>
                   <!-- Bill To -->
                   <div class="space-y-4">
                      <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b-2 border-slate-900 pb-2">Billed To (Customer)</h4>
                      <div class="space-y-1">
                         <p class="text-lg font-black">{{ transaction().customer?.full_name || 'Walk-in / Cash Sales' }}</p>
                         <p class="text-xs font-medium text-slate-500">{{ transaction().customer?.email || 'No email profile provided' }}</p>
                         @if (transaction().customer?.phone) {
                            <p class="text-xs font-bold text-slate-700 mt-2">VAT Registration: GB-{{ transaction().customer?.id?.substring(0,8) }}</p>
                         }
                      </div>
                   </div>
                </div>
             </div>

             <!-- Line Items -->
             <div class="mb-20">
                <table class="w-full text-left border-collapse">
                   <thead>
                      <tr class="border-b-4 border-slate-900 bg-slate-50">
                        <th class="py-4 pl-4 text-[10px] font-black uppercase tracking-widest text-slate-500">#</th>
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 w-1/2">Line Item Description</th>
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Qty</th>
                        <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Unit Price</th>
                        <th class="py-4 pr-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Total</th>
                      </tr>
                   </thead>
                   <tbody class="divide-y divide-slate-100">
                      @for (item of items(); track item.id; let i = $index) {
                        <tr class="hover:bg-slate-50/50 transition-colors">
                           <td class="py-6 pl-4 text-slate-400 font-bold text-xs">{{ i + 1 }}</td>
                           <td class="py-6">
                              <div class="font-black text-slate-900 text-sm tracking-tight">{{ item.product?.name || 'Line Item Charge' }}</div>
                              <div class="text-[10px] font-medium text-slate-400 italic">Product ID: {{ item.product?.id?.substring(0,8) }}</div>
                           </td>
                           <td class="py-6 text-center font-black text-slate-900">{{ item.quantity }}</td>
                           <td class="py-6 text-right font-medium text-slate-600 tabular-nums text-xs font-mono">{{ item.price_at_sale / item.quantity | currency:currency() }}</td>
                           <td class="py-6 pr-4 text-right font-black text-slate-900 tabular-nums text-sm font-mono">{{ item.price_at_sale | currency:currency() }}</td>
                        </tr>
                      }
                   </tbody>
                </table>
             </div>

             <!-- Summary Calculations -->
             <div class="flex justify-between items-start gap-20">
                <div class="flex-1 space-y-6">
                   <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
                      <h5 class="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Terms & Signature</h5>
                      <p class="text-[10px] text-indigo-700 leading-relaxed italic">
                        All goods remain the property of {{ store()?.name }} until paid for in full. 
                        Invoices on account are subject to 30-day settlement terms. 
                        Returns are accepted within 7 days with valid proof of delivery.
                      </p>
                   </div>
                </div>

                <div class="w-72 space-y-3">
                   <div class="flex justify-between items-center text-xs font-bold text-slate-400 uppercase px-2">
                      <span>Gross Amount</span>
                      <span class="font-mono">{{ transaction().total_amount | currency:currency() }}</span>
                   </div>
                   <div class="flex justify-between items-center text-xs font-bold text-slate-400 uppercase px-2">
                      <span>Estimated VAT (20%)</span>
                      <span class="font-mono">{{ transaction().total_amount * 0.2 | currency:currency() }}</span>
                   </div>
                   <div class="h-px bg-slate-200"></div>
                   <div class="flex justify-between items-center bg-slate-900 p-4 rounded-2xl text-white shadow-xl shadow-slate-900/20 scale-105 transform translate-x-2">
                      <span class="text-xs font-black uppercase tracking-widest">Total Pay</span>
                      <span class="text-2xl font-black tracking-tighter tabular-nums">{{ transaction().total_amount | currency:currency() }}</span>
                   </div>

                   <div class="pt-6 text-right">
                      <div class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100/50 border border-emerald-200 rounded-full">
                        <div class="h-2 w-2 bg-emerald-500 rounded-full"></div>
                        <span class="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Post to Ledger: Complete</span>
                      </div>
                   </div>
                </div>
             </div>

             <!-- Professional Signature -->
             <div class="mt-20 pt-10 border-t-4 border-double border-slate-100">
               <div class="flex justify-between items-end">
                  <div class="text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em] italic">
                    Certified System Generated Document — Omniplus ERP 🔒
                  </div>
                  <div class="flex flex-col items-center">
                    <div class="font-black text-xl italic text-indigo-400/30 font-serif mb-2 -rotate-2 select-none">Authorized Control</div>
                    <div class="h-0.5 w-32 bg-slate-900"></div>
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Store Authority Signature</span>
                  </div>
               </div>
             </div>

           </div>
        </div>

      </div>
    </div>

    <style>
      .no-scrollbar::-webkit-scrollbar { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: white !important; }
        .fixed { position: absolute !important; }
      }
    </style>
  `
})
export class CustomerInvoicePrintComponent {
   transaction = input.required<Transaction>();
   items = input.required<TransactionItem[]>();
   currency = input<string>('GBP');
   store = input<Store | null>(null);

   close = output<void>();

   onPrint() {
      window.print();
   }
}
