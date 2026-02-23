import { Component, inject, signal, Signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import {
    MockSupabaseService,
    ActivityLog,
    Staff
} from '../../../../services/mock-supabase.service';
import { StoreConfigService } from '../../../../services/store-config.service';

@Component({
    selector: 'app-activity-log',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, DatePipe],
    template: `
    <div class="space-y-6">
      <!-- Search & Filters -->
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
        <div class="flex flex-col md:flex-row md:items-center gap-4">
           <div class="relative flex-1">
              <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input 
                [formControl]="searchControl"
                type="text" 
                placeholder="Search by Action, Staff or Entity ID..." 
                class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-colors">
           </div>
           
           <select [formControl]="actionFilterControl" class="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm outline-none">
              <option value="ALL">All Actions</option>
              <option value="SALE">Sales</option>
              <option value="VOID_TRANSACTION">Voids</option>
              <option value="RESTOCK">Restock</option>
              <option value="ADJUSTMENT">Adjustments</option>
           </select>
        </div>
      </div>

      <!-- Activity Table -->
      <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">
            <tr>
              <th class="p-4">Time</th>
              <th class="p-4">Staff</th>
              <th class="p-4">Action</th>
              <th class="p-4">Entity</th>
              <th class="p-4">Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (log of filteredLogs(); track log.id) {
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group">
                <td class="p-4 opacity-60 font-medium whitespace-nowrap">{{ log.created_at | date:'MMM d, HH:mm:ss' }}</td>
                <td class="p-4">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                            {{ log.staff_id.substring(0, 2) }}
                        </div>
                        <span class="font-medium">{{ log.staff?.name || log.staff_id }}</span>
                    </div>
                </td>
                <td class="p-4">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold" [ngClass]="getActionStyles(log.action)">
                    {{ log.action }}
                  </span>
                </td>
                <td class="p-4">
                  <div class="text-[11px] opacity-70 font-mono">{{ log.entity_type }}</div>
                  <div class="font-mono font-bold text-blue-600 dark:text-blue-400">#{{ log.entity_id.substring(0,8) }}</div>
                </td>
                <td class="p-4 max-w-xs">
                   <div class="text-[11px] truncate" [title]="getMetadataString(log.metadata)">
                      {{ getMetadataString(log.metadata) }}
                   </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="p-12 text-center opacity-50 italic">No activity logs found.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
    styleUrls: []
})
export class ActivityLogComponent {
    supabase = inject(MockSupabaseService);
    storeService = inject(StoreConfigService);
    fb = inject(FormBuilder);

    searchControl = this.fb.control('');
    actionFilterControl = this.fb.control('ALL');

    searchQuery = toSignal(this.searchControl.valueChanges, { initialValue: '' });
    actionFilter = toSignal(this.actionFilterControl.valueChanges, { initialValue: 'ALL' });

    private logs$ = this.storeService.currentStore$.pipe(
        switchMap(store => {
            if (!store) return of([]);
            // Assuming a method like getActivityLogs exists or we use raw supabase call
            // For now, let's use a raw call to the activity_logs table
            return (this.supabase as any).supabase
                .from('activity_logs')
                .select('*, staff:staff_id(*)')
                .eq('store_id', store.id)
                .order('created_at', { ascending: false })
                .then(({ data, error }: any) => {
                    if (error) return [];
                    return data as ActivityLog[];
                });
        })
    );

    logsSignal = toSignal(this.logs$, { initialValue: [] as ActivityLog[] });

    filteredLogs = computed(() => {
        const all = this.logsSignal();
        const query = (this.searchQuery() || '').toLowerCase().trim();
        const action = this.actionFilter();

        return (all as ActivityLog[]).filter(log => {
            const matchesQuery = query ? (
                log.action.toLowerCase().includes(query) ||
                log.staff_id.toLowerCase().includes(query) ||
                (log.staff?.name || '').toLowerCase().includes(query) ||
                log.entity_id.toLowerCase().includes(query)
            ) : true;
            const matchesAction = action !== 'ALL' ? log.action === action : true;
            return matchesQuery && matchesAction;
        });
    });

    getActionStyles(action: string) {
        switch (action) {
            case 'SALE': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'VOID_TRANSACTION': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            case 'RESTOCK': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'ADJUSTMENT': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
            default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
        }
    }

    getMetadataString(metadata: any) {
        if (!metadata) return '';
        if (typeof metadata === 'string') return metadata;
        return JSON.stringify(metadata).replace(/[{}"]/g, '').replace(/:/g, ': ').replace(/,/g, ', ');
    }
}
