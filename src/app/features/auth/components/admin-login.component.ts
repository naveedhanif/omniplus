import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-admin-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    template: `
    <div class="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 selection:bg-[var(--primary-color)] selection:text-white relative overflow-hidden">
      
      <!-- Modern Decorative Background -->
      <div class="absolute -top-[500px] -right-[500px] w-[1000px] h-[1000px] bg-gradient-to-br from-indigo-500/10 to-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-[500px] -left-[500px] w-[1000px] h-[1000px] bg-gradient-to-tr from-sky-500/10 to-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Back to POS button -->
      <button (click)="goToPosLogin()" class="absolute top-8 left-8 flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-slate-500 hover:text-slate-800 shadow-sm border border-slate-200 transition-all font-bold text-xs uppercase tracking-widest z-10">
        <span class="material-symbols-rounded text-sm">arrow_back</span>
        POS Register Login
      </button>

      <!-- The Main Login Card -->
      <div class="w-full max-w-md bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-slate-100 p-10 relative z-10 animate-in slide-in-from-bottom-8 duration-700">
        
        <!-- Logo / Brand Area -->
        <div class="flex flex-col items-center mb-10">
          <div class="w-16 h-16 rounded-3xl bg-gradient-to-br from-[var(--primary-color)] to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-5 relative group">
            <span class="material-symbols-rounded text-3xl text-white">dashboard</span>
            <div class="absolute -inset-1 rounded-3xl bg-[var(--primary-color)]/20 blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
          </div>
          <h1 class="text-2xl font-black text-slate-800 tracking-tight">Omni<span class="text-[var(--primary-color)]">plus</span> Admin</h1>
          <p class="text-xs font-black uppercase tracking-widest text-slate-400 mt-1">Management Portal</p>
        </div>

        @if (authService.authError()) {
          <div class="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-3 animate-in shake">
            <span class="material-symbols-rounded text-rose-500">error</span>
            <p class="text-sm font-bold text-rose-700 leading-tight pt-0.5">{{ authService.authError() }}</p>
          </div>
        }

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="flex flex-col gap-6">
          
          <!-- Email Input -->
          <div class="space-y-2 relative">
            <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400">Admin Email</label>
            <div class="relative group">
              <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--primary-color)] transition-colors">mail</span>
              <input type="email" formControlName="email" placeholder="admin@omniplus.com" class="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-[var(--primary-color)]/10 focus:border-[var(--primary-color)] outline-none transition-all placeholder:font-medium placeholder:text-slate-300">
            </div>
            @if (loginForm.get('email')?.touched && loginForm.get('email')?.invalid) {
              <p class="text-[10px] font-bold text-rose-500 absolute -bottom-5 right-0">Valid email required</p>
            }
          </div>

          <!-- Password Input -->
          <div class="space-y-2 relative">
            <div class="flex items-center justify-between">
              <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400">Secure Password</label>
              <!-- Small utility link, non-functional for demo -->
              <a href="javascript:void(0)" class="text-[10px] font-bold text-[var(--primary-color)] hover:underline">Reset?</a>
            </div>
            <div class="relative group">
              <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--primary-color)] transition-colors">key</span>
              <input [type]="showPassword() ? 'text' : 'password'" formControlName="password" placeholder="••••••••" class="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-[var(--primary-color)]/10 focus:border-[var(--primary-color)] outline-none transition-all">
              <button type="button" (click)="togglePassword()" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none">
                <span class="material-symbols-rounded text-[18px]">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
              </button>
            </div>
            @if (loginForm.get('password')?.touched && loginForm.get('password')?.invalid) {
              <p class="text-[10px] font-bold text-rose-500 absolute -bottom-5 right-0">Password required</p>
            }
          </div>

          <!-- Submit Action -->
          <button type="submit" [disabled]="loginForm.invalid || authService.isAuthenticating()" 
            class="w-full mt-4 py-4 rounded-2xl bg-[var(--primary-color)] text-white text-sm font-black tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-[0_10px_20px_rgba(var(--primary-color-rgb),0.2)] flex items-center justify-center gap-2">
            
            @if (authService.isAuthenticating()) {
              <span class="material-symbols-rounded animate-spin">progress_activity</span>
              Authenticating...
            } @else {
              Access Workspace
              <span class="material-symbols-rounded text-[18px]">arrow_forward</span>
            }
          </button>
          
        </form>

        <div class="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2">
          <span class="material-symbols-rounded text-[16px] text-emerald-500">shield</span>
          <p class="text-[10px] font-bold text-slate-400">Secured via Supabase RBAC connection</p>
        </div>

      </div>
    </div>
  `
})
export class AdminLoginComponent {
    authService = inject(AuthService);
    fb = inject(FormBuilder);
    router = inject(Router);

    showPassword = signal(false);

    loginForm = this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]]
    });

    togglePassword() {
        this.showPassword.update(v => !v);
    }

    goToPosLogin() {
        this.router.navigate(['/pin-login']);
    }

    async onSubmit() {
        if (this.loginForm.valid) {
            const { email, password } = this.loginForm.value;
            await this.authService.loginWithEmail(email!, password!);
        } else {
            // Force validation display
            this.loginForm.markAllAsTouched();
        }
    }
}
