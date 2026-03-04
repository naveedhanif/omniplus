import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-pin-login',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 selection:bg-transparent">
      
      <!-- Top Status Context -->
      <div class="absolute top-8 left-8 flex items-center gap-3 animate-in fade-in duration-700">
        <div class="w-12 h-12 rounded-2xl bg-[var(--primary-color)] flex items-center justify-center text-white shadow-lg shadow-[var(--primary-color)]/30">
          <span class="material-symbols-rounded text-2xl font-black">point_of_sale</span>
        </div>
        <div>
          <h1 class="text-white font-black text-xl tracking-tight">Terminal 1</h1>
          <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Awaiting Cashier</p>
        </div>
      </div>

      <div class="absolute top-8 right-8">
        <button (click)="goToAdminLogin()" class="px-5 py-3 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-black uppercase tracking-widest transition-all border border-slate-700">
          Manager Access
        </button>
      </div>

      <!-- Main Login Container -->
      <div class="w-full max-w-sm flex flex-col items-center animate-in slide-in-from-bottom-8 duration-500">
        
        <!-- User Context Area -->
        <h2 class="text-slate-400 font-bold uppercase tracking-widest text-xs mb-8 text-center flex items-center justify-center gap-2">
          <span class="material-symbols-rounded text-sm">lock</span>
          Enter Authorisation PIN
        </h2>

        <!-- The 4-digit PIN Visual Display -->
        <div class="flex items-center justify-center gap-4 mb-12">
          @for (digit of [0, 1, 2, 3]; track digit) {
            <div 
              class="w-5 h-5 rounded-full transition-all duration-300"
              [ngClass]="{
                'bg-[var(--primary-color)] shadow-[0_0_15px_rgba(var(--primary-color-rgb),0.8)] scale-110': pinString().length > digit,
                'bg-slate-800 border-2 border-slate-700': pinString().length <= digit
              }">
            </div>
          }
        </div>

        @if (authService.authError()) {
          <div class="mb-8 px-6 py-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold animate-in shake">
            {{ authService.authError() }}
          </div>
        }

        <!-- The massive, touch-friendly Numpad -->
        <div class="grid grid-cols-3 gap-4 w-full px-4">
          @for (num of [1, 2, 3, 4, 5, 6, 7, 8, 9]; track num) {
            <button
              (click)="appendPin(num.toString())"
              [disabled]="authService.isAuthenticating()"
              class="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-3xl text-3xl font-black text-white shadow-xl flex items-center justify-center transition-all active:scale-95 border-b-4 border-slate-900 border-t border-slate-700 disabled:opacity-50">
              {{ num }}
            </button>
          }
          
          <!-- Empty Space -->
          <div></div>

          <!-- Zero -->
          <button
            (click)="appendPin('0')"
            [disabled]="authService.isAuthenticating()"
            class="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-3xl text-3xl font-black text-white shadow-xl flex items-center justify-center transition-all active:scale-95 border-b-4 border-slate-900 border-t border-slate-700 disabled:opacity-50">
            0
          </button>

          <!-- Backspace / Clear -->
          <button
            (click)="backspace()"
            [disabled]="authService.isAuthenticating()"
            class="aspect-square bg-slate-800/50 hover:bg-slate-700/80 active:bg-slate-600 rounded-3xl flex items-center justify-center transition-all active:scale-95 text-slate-400 hover:text-rose-400 disabled:opacity-50 border border-slate-700">
            <span class="material-symbols-rounded text-3xl">backspace</span>
          </button>
        </div>

      </div>
    </div>
  `
})
export class PinLoginComponent {
    authService = inject(AuthService);
    router = inject(Router);

    pinString = signal<string>('');

    appendPin(digit: string) {
        if (this.pinString().length < 4) {
            this.pinString.update(p => p + digit);

            // Auto-submit when exactly 4 digits are entered
            if (this.pinString().length === 4) {
                this.submitPin();
            }
        }
    }

    backspace() {
        this.authService.authError.set(null); // Clear errors
        this.pinString.update(p => p.slice(0, -1));
    }

    goToAdminLogin() {
        this.router.navigate(['/admin/login']);
    }

    private async submitPin() {
        const success = await this.authService.loginWithPin(this.pinString());
        if (!success) {
            // If login failed, instantly clear the PIN so they can try again fast
            setTimeout(() => this.pinString.set(''), 500);
        }
    }
}
