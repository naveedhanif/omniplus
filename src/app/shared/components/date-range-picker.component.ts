import { Component, input, output, signal, computed, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

export type DateRangePreset =
    | 'TODAY'
    | 'YESTERDAY'
    | 'THIS_WEEK'
    | 'LAST_WEEK'
    | 'THIS_MONTH'
    | 'LAST_MONTH'
    | 'THIS_QUARTER'
    | 'LAST_QUARTER'
    | 'THIS_FINANCIAL_YEAR'
    | 'CUSTOM';

export interface DateRange {
    start: Date | null;
    end: Date | null;
    preset: DateRangePreset;
}

@Component({
    selector: 'app-date-range-picker',
    standalone: true,
    imports: [CommonModule, DatePipe],
    template: `
    <div class="relative w-full md:w-auto" (click)="$event.stopPropagation()">
      <!-- Main Trigger Button -->
      <button 
        (click)="isOpen.set(!isOpen())"
        class="w-full md:w-auto flex items-center justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all shadow-sm">
        <div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
          <span class="material-symbols-rounded text-[18px]">calendar_month</span>
          <span class="text-slate-900 dark:text-white">{{ getPresetLabel(selectedPreset()) }}</span>
        </div>
        <div class="text-xs text-slate-500 hidden sm:block">
           {{ formattedDateRange() }}
        </div>
        <span class="material-symbols-rounded text-slate-400 text-[18px] transition-transform duration-200" [class.rotate-180]="isOpen()">expand_more</span>
      </button>

      <!-- Dropdown Filter Bar Modal -->
      @if (isOpen()) {
        <div class="absolute z-50 mt-2 top-full right-0 w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in slide-in-from-top-2 duration-200 flex flex-col md:flex-row">
          
          <!-- Presets Sidebar -->
          <div class="w-full md:w-[160px] bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 p-2 overflow-y-auto max-h-[300px] flex flex-col gap-1">
             <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">Quick Select</div>
             
             @for (preset of presets; track preset.value) {
               <button 
                 (click)="selectPreset(preset.value)"
                 class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between"
                 [ngClass]="{
                   'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300': selectedPreset() === preset.value,
                   'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700': selectedPreset() !== preset.value
                 }">
                 {{ preset.label }}
                 @if (selectedPreset() === preset.value) {
                   <span class="material-symbols-rounded text-[14px]">check</span>
                 }
               </button>
             }
          </div>

          <!-- Custom Inputs Area -->
          <div class="p-5 flex-1 flex flex-col gap-4">
             <div>
                <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">From Date</label>
                <div class="relative">
                   <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">edit_calendar</span>
                   <input type="date" 
                          [value]="customStart() | date:'yyyy-MM-dd'" 
                          (change)="onCustomStartChange($event)"
                          class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
             </div>
             
             <div>
                <label class="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">To Date</label>
                <div class="relative">
                   <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">edit_calendar</span>
                   <input type="date" 
                          [value]="customEnd() | date:'yyyy-MM-dd'" 
                          (change)="onCustomEndChange($event)"
                          class="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
             </div>

             <div class="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button (click)="isOpen.set(false)" class="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Cancel</button>
                <button (click)="applySelection()" class="px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all active:scale-95">Apply</button>
             </div>
          </div>

        </div>
      }
    </div>
  `,
    host: {
        '(document:click)': 'closeDropdown()'
    }
})
export class DateRangePickerComponent {
    // Inputs & Outputs
    initialPreset = input<DateRangePreset>('THIS_MONTH');
    rangeSelected = output<DateRange>();

    // State
    isOpen = signal(false);
    selectedPreset = signal<DateRangePreset>('THIS_MONTH');

    // Custom Date States
    customStart = signal<Date | null>(null);
    customEnd = signal<Date | null>(null);

    presets: { label: string, value: DateRangePreset }[] = [
        { label: 'Today', value: 'TODAY' },
        { label: 'Yesterday', value: 'YESTERDAY' },
        { label: 'This Week', value: 'THIS_WEEK' },
        { label: 'Last Week', value: 'LAST_WEEK' },
        { label: 'This Month', value: 'THIS_MONTH' },
        { label: 'Last Month', value: 'LAST_MONTH' },
        { label: 'This Quarter', value: 'THIS_QUARTER' },
        { label: 'This Financial Year', value: 'THIS_FINANCIAL_YEAR' },
        { label: 'Custom Range', value: 'CUSTOM' }
    ];

    constructor() {
        effect(() => {
            this.selectedPreset.set(this.initialPreset());
            this.calculateDatesForPreset(this.selectedPreset());
        }, { allowSignalWrites: true });
    }

    getPresetLabel(presetVal: DateRangePreset): string {
        const f = this.presets.find(p => p.value === presetVal);
        return f ? f.label : 'Select Date Range';
    }

    formattedDateRange = computed(() => {
        const start = this.customStart();
        const end = this.customEnd();
        const pipe = new DatePipe('en-US');

        if (!start && !end) return 'All Time';

        const formattedStart = start ? pipe.transform(start, 'MMM d, yyyy') : '...';
        const formattedEnd = end ? pipe.transform(end, 'MMM d, yyyy') : 'Now';

        if (this.selectedPreset() === 'TODAY' || this.selectedPreset() === 'YESTERDAY') {
            return formattedStart; // Single day
        }

        return `${formattedStart} - ${formattedEnd}`;
    });

    closeDropdown() {
        if (this.isOpen()) {
            this.isOpen.set(false);
        }
    }

    selectPreset(preset: DateRangePreset) {
        this.selectedPreset.set(preset);
        this.calculateDatesForPreset(preset);
    }

    onCustomStartChange(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.value) {
            this.customStart.set(new Date(input.value));
            this.selectedPreset.set('CUSTOM');
        }
    }

    onCustomEndChange(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.value) {
            // Set to end of day
            const d = new Date(input.value);
            d.setHours(23, 59, 59, 999);
            this.customEnd.set(d);
            this.selectedPreset.set('CUSTOM');
        }
    }

    applySelection() {
        this.rangeSelected.emit({
            start: this.customStart(),
            end: this.customEnd(),
            preset: this.selectedPreset()
        });
        this.isOpen.set(false);
    }

    private calculateDatesForPreset(preset: DateRangePreset) {
        const now = new Date();
        let start: Date | null = null;
        let end: Date | null = null;

        // Reset hours to midnight for accurate day calculations
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (preset) {
            case 'TODAY':
                start = today;
                end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
                break;
            case 'YESTERDAY':
                start = new Date(today);
                start.setDate(today.getDate() - 1);
                end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
                break;
            case 'THIS_WEEK':
                const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday
                const diffToStartOfWeek = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday as start
                start = new Date(today.setDate(diffToStartOfWeek));
                end = new Date(); // To right now
                break;
            case 'LAST_WEEK':
                const lwStart = new Date(today);
                lwStart.setDate(today.getDate() - today.getDay() - 6);
                start = lwStart;
                end = new Date(lwStart);
                end.setDate(lwStart.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            case 'THIS_MONTH':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
            case 'LAST_MONTH':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                break;
            case 'THIS_QUARTER':
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                end = new Date(now.getFullYear(), (quarter * 3) + 3, 0, 23, 59, 59, 999);
                break;
            case 'THIS_FINANCIAL_YEAR':
                // Assuming financial year starts April 1st. Adjust as needed!
                const fyStartMonth = 3; // April (0-indexed)
                const yearOffset = now.getMonth() < fyStartMonth ? -1 : 0;
                start = new Date(now.getFullYear() + yearOffset, fyStartMonth, 1);
                end = new Date(now.getFullYear() + yearOffset + 1, fyStartMonth, 0, 23, 59, 59, 999);
                break;
            case 'CUSTOM':
                // Don't auto-calculate custom, leave customStart/End as they were
                return;
        }

        this.customStart.set(start);
        this.customEnd.set(end);
    }
}
