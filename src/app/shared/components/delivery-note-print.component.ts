import { Component, input, output, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DeliveryNote, Store } from '../../core/services/mock-supabase.service';

@Component({
  selector: 'app-delivery-note-print',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <!-- Overlay wrapper (visible on screen as modal, but covers the entire page during print) -->
    <div class="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 print:p-0 print:bg-white print:backdrop-blur-none print:block print:inset-0 print:overflow-visible">
      
      <!-- Inner modal container. Normal dimensions on screen, full height/width on print without scrolls -->
      <div class="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[95vh] border border-slate-200 overflow-hidden print:w-full print:max-w-none print:h-auto print:border-none print:shadow-none print:rounded-none print:overflow-visible">
        
        <!-- Header & Controls (Hidden during print) -->
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:hidden">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                <span class="material-symbols-rounded">local_shipping</span>
             </div>
             <div>
                <h3 class="text-lg font-black text-slate-800 uppercase tracking-tight">Print Preview</h3>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Note / e-POD</p>
             </div>
          </div>
          <div class="flex items-center gap-6">
            <!-- Template Selector -->
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Template:</span>
              <select [value]="activeTemplate()" (change)="setTemplate($event)"
                      class="bg-white border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                <option value="standard">Standard A4</option>
                <option value="modern">Modern Professional</option>
              </select>
            </div>

            <div class="h-6 w-px bg-slate-200"></div>

            <button (click)="onPrint()" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xl hover:shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">
              <span class="material-symbols-rounded text-sm">print</span> 
              Print Document
            </button>
            <button (click)="close.emit()" class="p-3 text-slate-400 hover:text-slate-600 transition-colors">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        </div>

        <!-- Scrollable Document View -->
        <div class="flex-1 overflow-y-auto bg-slate-200/50 p-12 flex justify-center custom-scrollbar print:overflow-visible print:bg-white print:p-0 print:block">
          
          <!-- TEMPLATE 1: STANDARD -->
          @if (activeTemplate() === 'standard') {
            <div class="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl relative text-black font-sans leading-relaxed flex flex-col print:shadow-none print:m-0 print:p-[15mm] print:w-full print:border-none border border-slate-200">
              
              <!-- Watermark -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.03]">
                  <div class="text-[150px] font-black -rotate-45 uppercase border-[20px] border-slate-900 px-10 py-5">
                    {{ note().status }}
                  </div>
              </div>

              <!-- Header -->
              <div class="flex justify-between items-start mb-16 relative">
                 <div>
                    <h1 class="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Delivery Note</h1>
                    <div class="flex items-center gap-4">
                       <div class="bg-slate-900 text-white px-3 py-1 text-xs font-black tracking-widest">#{{ note().note_number }}</div>
                       <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">Date: {{ note().created_at | date:'longDate' }}</div>
                    </div>
                 </div>
                 <div class="text-right">
                    <div class="font-black text-xl tracking-tighter text-indigo-600 italic">{{ store()?.name }}</div>
                    <div class="text-[10px] font-bold text-slate-500 max-w-[200px] ml-auto">
                      {{ store()?.address }}<br>
                      Logistics & Transport Division<br>
                      Official Delivery Record
                    </div>
                 </div>
              </div>

              <!-- Address Grid -->
              <div class="grid grid-cols-2 gap-20 mb-16">
                 <div class="space-y-4">
                    <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Deliver To</h4>
                    <div class="space-y-1">
                       <div class="text-lg font-black text-slate-900">{{ $any(note()).customer?.full_name || 'Walk-in Customer' }}</div>
                       <div class="text-xs font-bold text-slate-500 italic">Attn: {{ note().recipient_name || '—' }}</div>
                       <div class="text-xs text-slate-600 font-medium">{{ note().delivery_address || 'No address on file' }}</div>
                    </div>
                 </div>
                 <div class="space-y-4">
                    <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Logistics Details</h4>
                    <div class="space-y-1">
                       <div class="text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">Driver</div>
                       <div class="text-sm font-black text-slate-900">{{ note().driver_name || 'N/A' }}</div>
                       <span class="text-xs font-bold text-slate-400">{{ note().driver_phone || '' }}</span>
                       <div class="text-xs font-bold text-slate-500 mt-2 uppercase tracking-[0.1em]">Status</div>
                       <div class="text-sm font-black text-indigo-600 uppercase tracking-widest">{{ note().status }}</div>
                    </div>
                 </div>
              </div>

              <!-- Items Table -->
              <div class="mb-16">
                 <table class="w-full text-left">
                    <thead>
                       <tr class="border-b-2 border-slate-900">
                          <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Product Description</th>
                          <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Qty Shipped</th>
                          <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Qty Recv</th>
                          <th class="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Rct. Verify</th>
                       </tr>
                    </thead>
                    <tbody>
                       @for (item of mappedItems(); track item.id; let i = $index) {
                          <tr class="border-b border-slate-50" [class.bg-slate-50]="i % 2 !== 0">
                             <td class="py-4 px-2 font-black text-slate-800">{{ item.productName }}</td>
                             <td class="py-4 text-center font-black font-mono text-lg text-slate-600">{{ item.quantity_shipped }}</td>
                             <td class="py-4 text-center">
                                @if (note().status === 'DELIVERED' || note().status === 'PARTIAL_REJECTED') {
                                   <span class="font-black text-indigo-600 text-lg">{{ item.quantity_accepted }}</span>
                                } @else {
                                   <div class="w-16 border-b-2 border-slate-300 mx-auto"></div>
                                }
                             </td>
                             <td class="py-4 text-right">
                                @if (note().status === 'DELIVERED' || note().status === 'PARTIAL_REJECTED') {
                                   <span class="material-symbols-rounded text-emerald-500">check_circle</span>
                                } @else {
                                   <div class="w-6 h-6 border-2 border-slate-300 rounded ml-auto"></div>
                                }
                             </td>
                          </tr>
                       }
                    </tbody>
                    <tfoot>
                       <tr class="border-t-2 border-slate-900 border-b-4 border-slate-900">
                          <td class="py-4 text-right font-black uppercase text-[10px] tracking-widest text-slate-500">Total Items Shipped</td>
                          <td class="py-4 text-center font-black text-2xl font-mono text-indigo-600">{{ totalShipped() }}</td>
                          <td colspan="2"></td>
                       </tr>
                    </tfoot>
                 </table>
              </div>

              <!-- Notes -->
              @if (note().notes) {
                <div class="mb-16">
                   <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2 mb-4">Delivery Instructions</h4>
                   <p class="text-sm font-medium text-slate-700 leading-relaxed italic border-l-4 border-indigo-200 pl-4">{{ note().notes }}</p>
                </div>
              }

              <!-- Signatures -->
              <div class="grid grid-cols-2 gap-12 mt-auto pt-8 border-t border-slate-200 opacity-80">
                 <div>
                    <div class="h-20 border-b-2 border-slate-300 mb-2"></div>
                    <div class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Received By / Print Name & Signature</div>
                 </div>
                 <div>
                    <div class="h-20 border-b-2 border-slate-300 mb-2"></div>
                    <div class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date & Time Received</div>
                 </div>
              </div>

              <!-- Footer Base -->
              <div class="absolute bottom-[20mm] left-[20mm] right-[20mm] text-center pt-6 border-t border-slate-200">
                 <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 flex items-center justify-center gap-2">
                    <span class="material-symbols-rounded text-[14px] text-amber-500">warning</span> Note: Contains NO Pricing Information
                 </div>
                 <div class="text-[8px] font-bold text-slate-300">Powered by OmniPOS Enterprise Engine</div>
              </div>
            </div>
          }

          <!-- TEMPLATE 2: MODERN -->
          @if (activeTemplate() === 'modern') {
            <div class="bg-white w-[210mm] min-h-[297mm] shadow-2xl relative text-black font-sans leading-relaxed flex flex-col print:shadow-none print:m-0 print:p-[15mm] print:border-none border border-slate-200">
              
              <!-- Dark Sidebar Layout -->
              <div class="flex flex-1">
                <!-- Left Sidebar -->
                <div class="w-[65mm] bg-slate-900 text-white p-[15mm] flex flex-col print-bg">
                  <h1 class="font-black text-2xl tracking-tighter uppercase mb-16 text-white">{{ store()?.name }}</h1>
                  
                  <div class="mb-12">
                    <div class="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Document #</div>
                    <div class="font-mono text-xl font-bold break-all text-white">{{ note().note_number }}</div>
                  </div>

                  <div class="mb-12">
                    <div class="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Date</div>
                    <div class="text-sm font-bold text-white">{{ note().created_at | date:'longDate' }}</div>
                  </div>

                  <div class="mb-12">
                    <div class="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Driver</div>
                    <div class="text-base font-bold text-white">{{ note().driver_name || 'N/A' }}</div>
                    <div class="text-xs text-slate-400 mt-1">{{ note().driver_phone || '' }}</div>
                  </div>

                  <div class="mt-auto">
                    <div class="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Contact</div>
                    <div class="text-xs text-slate-400 font-medium mt-2">{{ store()?.address }}</div>
                  </div>
                </div>

                <!-- Right Content -->
                <div class="flex-1 p-[15mm]">
                  <div class="flex justify-between items-center mb-16">
                    <div class="text-4xl font-black tracking-tighter text-slate-900 uppercase">Delivery Note</div>
                    <div class="text-[10px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 uppercase tracking-widest print-bg">{{ note().status }}</div>
                  </div>

                  <!-- Delivery Address Block -->
                  <div class="p-6 bg-slate-50 border border-slate-100 rounded-2xl mb-12 print-bg">
                    <div class="flex items-center gap-3 mb-4 text-indigo-600">
                      <span class="material-symbols-rounded">location_on</span>
                      <span class="text-[10px] font-black uppercase tracking-widest text-slate-900">Delivery Destination</span>
                    </div>
                    <div class="text-xl font-black text-slate-900">{{ $any(note()).customer?.full_name || 'Walk-in Customer' }}</div>
                    <div class="text-sm font-bold text-slate-500 mt-2">Attention: <span class="text-slate-900">{{ note().recipient_name || '—' }}</span></div>
                  </div>

                  <!-- Items Minimal Table -->
                  <table class="w-full text-left mb-12 border-collapse">
                    <thead>
                      <tr>
                        <th class="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b-2 border-slate-200">Item Description</th>
                        <th class="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b-2 border-slate-200 text-center">Shipped</th>
                        <th class="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b-2 border-slate-200 text-right">Verify</th>
                      </tr>
                    </thead>
                    <tbody class="text-sm">
                      @for (item of mappedItems(); track item.id) {
                        <tr class="border-b border-slate-100">
                           <td class="py-4 font-black text-slate-800">{{ item.productName }}</td>
                           <td class="py-4 text-center">
                             @if (note().status === 'DELIVERED' || note().status === 'PARTIAL_REJECTED') {
                               <span class="font-black text-indigo-600">{{ item.quantity_accepted }}</span>
                             } @else {
                               <span class="text-slate-400 font-mono">—</span>
                             }
                           </td>
                           <td class="py-4 text-right">
                             <div class="inline-flex gap-2">
                               @if (note().status === 'DELIVERED' || note().status === 'PARTIAL_REJECTED') {
                                 <span class="material-symbols-rounded text-emerald-500 text-sm">verified</span>
                               } @else {
                                 <div class="w-10 h-8 border border-slate-300 rounded bg-slate-50 print-bg shadow-inner"></div>
                               }
                             </div>
                           </td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr>
                        <td class="py-6 text-right font-black uppercase text-xs tracking-widest text-slate-500">Total Quantities</td>
                        <td class="py-6 text-center font-black text-2xl font-mono text-indigo-600">{{ totalShipped() }}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>

                  <!-- Notes -->
                  @if (note().notes) {
                    <div class="mb-12">
                      <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Instructions</div>
                      <div class="text-sm font-medium text-slate-700 leading-relaxed">{{ note().notes }}</div>
                    </div>
                  }

                  <!-- Signatures -->
                  <div class="grid grid-cols-2 gap-12 mt-auto pt-12 border-t border-slate-200">
                    <div>
                      <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-12">Received By / Signature</div>
                      <div class="border-b-2 border-slate-800"></div>
                    </div>
                    <div>
                      <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-12">Date & Time Stamp</div>
                      <div class="border-b-2 border-slate-800"></div>
                    </div>
                  </div>

                  <div class="text-center mt-12 text-[9px] font-bold text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
                    <span class="material-symbols-rounded text-sm">inventory_2</span> Physical Goods Only
                  </div>
                </div>
              </div>

            </div>
          }

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
      }
    </style>
  `
})
export class DeliveryNotePrintComponent {
  note = input.required<DeliveryNote>();
  items = input.required<any[]>();
  store = input.required<Store | null>();
  close = output<void>();

  activeTemplate = signal<'standard' | 'modern'>('standard');

  mappedItems = computed(() => {
    return this.items().map(i => ({
      ...i,
      productName: i.product?.name ?? i.product_id ?? 'Unknown Product'
    }));
  });

  totalShipped = computed(() => {
    return this.mappedItems().reduce((sum, item) => sum + (item.quantity_shipped || 0), 0);
  });

  setTemplate(event: Event) {
    const value = (event.target as HTMLSelectElement).value as 'standard' | 'modern';
    this.activeTemplate.set(value);
  }

  onPrint() {
    window.print();
  }
}
