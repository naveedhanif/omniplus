import { Component, input, output, signal, computed, effect, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../core/services/mock-supabase.service';

declare var JsBarcode: any;

@Component({
  selector: 'app-label-print',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div class="bg-[var(--card-bg)] w-full max-w-4xl rounded-xl shadow-2xl flex flex-col h-[90vh] scale-100 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
        
        <!-- Header & Controls -->
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center no-print">
          <div>
            <h3 class="text-xl font-bold flex items-center gap-2">
              <span class="material-symbols-rounded text-[var(--primary-color)]">barcode</span>
              Print Barcode Labels
            </h3>
            <p class="text-sm opacity-70">For product: <strong>{{ product().name }}</strong></p>

            @if (!product().barcode && !isSaved()) {
              <div class="mt-2 text-xs p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg flex items-center gap-2 border border-blue-200 dark:border-blue-800">
                <span class="material-symbols-rounded text-sm">info</span>
                <span>This product uses a temporary barcode. Save it to make it permanent.</span>
                <button 
                  (click)="onSaveBarcode()"
                  [disabled]="isSaving()"
                  class="ml-auto px-2 py-1 bg-blue-500 text-white rounded-md font-bold text-[10px] hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1">
                  @if(isSaving()){
                    <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Saving...
                  } @else {
                     <span class="material-symbols-rounded text-xs">save</span>
                    Save Barcode
                  }
                </button>
              </div>
            } @else if(isSaved()) {
                 <div class="mt-2 text-xs p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-2 border border-green-200 dark:border-green-800">
                    <span class="material-symbols-rounded text-sm">check_circle</span>
                    <span>Barcode saved to product successfully!</span>
                 </div>
            }
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <label for="labelCount" class="text-sm font-medium">Labels:</label>
              <input 
                id="labelCount" 
                type="number" 
                [ngModel]="labelCount()"
                (ngModelChange)="labelCount.set(+$event)"
                min="1" 
                max="30" 
                class="w-20 bg-transparent border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm text-center">
            </div>
            <button (click)="printLabels()" class="px-5 py-2 bg-[var(--primary-color)] text-white font-bold rounded-lg shadow flex items-center gap-2">
              <span class="material-symbols-rounded">print</span> Print
            </button>
            <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        </div>

        <!-- Printable Area -->
        <div id="label-sheet" class="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900 p-4">
          <div class="grid grid-cols-3 gap-x-px gap-y-px bg-white dark:bg-slate-800 shadow-lg p-px aspect-[8.5/11]">
            @for (item of labelsToRender(); track $index) {
              <div class="border border-dashed border-slate-200 dark:border-slate-700 p-1 text-center text-[8px] flex flex-col justify-center items-center">
                <div class="font-bold truncate w-full px-1">{{ product().name }}</div>
                <div class="font-mono font-bold">{{ product().price | currency:currency() }}</div>
                <svg #barcodeSvg class="w-full h-8 mt-1"></svg>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
    <style>
      @media print {
        body > * { display: none !important; }
        .no-print { display: none !important; }

        #label-sheet, #label-sheet * { 
          display: block !important; 
          visibility: visible !important; 
        }

        #label-sheet { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100vw !important; 
            height: 100vh !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            overflow: hidden !important;
        }
        
        #label-sheet .grid {
            height: 100% !important;
            width: 100% !important;
            padding: 0.5in 0.1875in !important; /* Standard Avery 5160 margins */
            box-sizing: border-box !important;
            gap: 0 !important;
            border: none !important;
            box-shadow: none !important;
        }
        
        #label-sheet .border {
            border: none !important; /* Hide dashed borders for printing */
            padding: 2px !important;
            box-sizing: border-box !important;
        }

        #label-sheet svg {
          height: 25px !important; /* Fixed height for printing consistency */
        }
      }
      #label-sheet .grid {
        /* Standard Avery 5160: 3 columns, 10 rows on 8.5x11 paper */
        grid-template-rows: repeat(10, 1fr);
      }
    </style>
  `
})
export class LabelPrintComponent {
  product = input.required<Product>();
  currency = input.required<string>();
  close = output<void>();
  saveBarcode = output<string>();

  labelCount = signal(30);
  isSaving = signal(false);
  isSaved = signal(false);

  labelsToRender = computed(() => {
    const count = this.labelCount();
    // Ensure count is a positive integer, default to 0 if not
    const validCount = (Number.isInteger(count) && count > 0) ? count : 0;
    return Array(Math.min(30, validCount)).fill(0);
  });

  @ViewChildren('barcodeSvg') barcodeSvgs!: QueryList<ElementRef<SVGElement>>;

  constructor() {
    effect(() => {
      // Defer barcode generation until the view is stable and svgs are rendered.
      setTimeout(() => {
        this.generateBarcodes();
      }, 0);
    }, { allowSignalWrites: true });

    // When the product input changes (e.g. after saving), re-run barcode generation
    effect(() => {
        const p = this.product(); // Depend on product
        setTimeout(() => this.generateBarcodes(), 0);
    });
  }
  
  generateBarcodes() {
    const barcodeValue = this.product().barcode || this.product().id;
    this.barcodeSvgs.forEach(svgRef => {
        if (svgRef.nativeElement) {
        if (!barcodeValue) {
            svgRef.nativeElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="8" fill="red">NO BARCODE</text>`;
            return;
        }
        try {
            JsBarcode(svgRef.nativeElement, barcodeValue, {
            format: "CODE128",
            displayValue: true,
            fontSize: 10,
            height: 30,
            margin: 0,
            textMargin: 0,
            fontOptions: "bold"
            });
        } catch (e) {
            console.error("JsBarcode error:", e);
            svgRef.nativeElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="8" fill="red">INVALID</text>`;
        }
        }
    });
  }

  onSaveBarcode() {
      this.isSaving.set(true);
      this.saveBarcode.emit(this.product().id);
      // A slight delay to show saving state, parent component will update the product input
      // which will then cause the isSaved state to show up via the computed property in the template.
      setTimeout(() => {
          this.isSaving.set(false);
          this.isSaved.set(true);
      }, 500);
  }

  printLabels() {
    window.print();
  }
}