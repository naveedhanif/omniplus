import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../services/dialog.service';

@Component({
  selector: 'app-dialog-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (dialog.state().isOpen) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div class="bg-[var(--card-bg)] text-[var(--text-color)] rounded-xl shadow-2xl max-w-md w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
          
          <div class="p-6">
            <h3 class="text-xl font-bold mb-3 flex items-center gap-2">
              @if (dialog.state().title.toLowerCase().includes('error')) {
                 <span class="material-symbols-rounded text-red-500">error</span>
              } @else if (dialog.state().title.toLowerCase().includes('warning')) {
                 <span class="material-symbols-rounded text-orange-500">warning</span>
              } @else if (dialog.state().type === 'CONFIRM') {
                 <span class="material-symbols-rounded text-[var(--primary-color)]">help</span>
              } @else {
                 <span class="material-symbols-rounded text-[var(--primary-color)]">info</span>
              }
              {{ dialog.state().title }}
            </h3>
            <!-- whitespace-pre-wrap ensures \n characters create new lines -->
            <p class="opacity-80 whitespace-pre-wrap leading-relaxed">{{ dialog.state().message }}</p>

            @if (dialog.state().type === 'PROMPT') {
              <div class="mt-4">
                <input 
                  type="text" 
                  [(ngModel)]="promptValue"
                  (keyup.enter)="handleConfirm()"
                  class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Enter reason..."
                  autofocus
                >
              </div>
            }
          </div>

          <div class="p-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700">
            @if (dialog.state().type === 'CONFIRM' || dialog.state().type === 'PROMPT') {
              <button 
                (click)="handleCancel()"
                class="px-5 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {{ dialog.state().cancelText || 'Cancel' }}
              </button>
            }
            <button 
              (click)="handleConfirm()"
              [class.bg-red-600]="dialog.state().confirmText?.toLowerCase().includes('delete')"
              [class.hover:bg-red-700]="dialog.state().confirmText?.toLowerCase().includes('delete')"
              [class.bg-[var(--primary-color)]]="!dialog.state().confirmText?.toLowerCase().includes('delete')"
              [class.hover:brightness-110]="!dialog.state().confirmText?.toLowerCase().includes('delete')"
              class="px-6 py-2 text-white font-bold rounded-lg shadow-lg active:scale-95 transition-all">
              {{ dialog.state().confirmText || (dialog.state().type === 'PROMPT' ? 'Submit' : 'OK') }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class DialogModalComponent {
  dialog = inject(DialogService);
  promptValue = '';

  onOpen() {
    this.promptValue = this.dialog.state().defaultValue || '';
  }

  handleConfirm() {
    if (this.dialog.state().type === 'PROMPT') {
      this.dialog.close(this.promptValue);
    } else {
      this.dialog.close(true);
    }
    this.promptValue = '';
  }

  handleCancel() {
    if (this.dialog.state().type === 'PROMPT') {
      this.dialog.close(null);
    } else {
      this.dialog.close(false);
    }
    this.promptValue = '';
  }
}