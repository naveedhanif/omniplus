import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MockSupabaseService, AppUser } from './mock-supabase.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private supabaseService = inject(MockSupabaseService);
    private router = inject(Router);

    // The globally available current user state
    currentUser = signal<AppUser | null>(null);

    // Loading and Error states for the UI
    isAuthenticating = signal(false);
    authError = signal<string | null>(null);

    constructor() {
        this.restoreSession();
    }

    /**
     * Used for Back-Office (Admin/Manager) log in.
     * Compares the provided email & password against the app_users table.
     */
    async loginWithEmail(email: string, passwordHash: string): Promise<boolean> {
        this.isAuthenticating.set(true);
        this.authError.set(null);
        try {
            const { data, error } = await this.supabaseService.client
                .from('app_users')
                .select('*')
                .eq('email', email)
                .eq('password_hash', passwordHash)
                .single();

            if (error || !data) {
                throw new Error('Invalid email or password.');
            }

            this.setCurrentUser(data as AppUser);
            return true;
        } catch (err: any) {
            console.error('Email Login Error:', err);
            this.authError.set(err.message || 'Access Denied.');
            return false;
        } finally {
            this.isAuthenticating.set(false);
        }
    }

    /**
     * Used for the Front-Till (Cashier/Manager) lightning-fast login.
     * Compares the 4-6 digit numeric PIN.
     */
    async loginWithPin(pin: string): Promise<boolean> {
        this.isAuthenticating.set(true);
        this.authError.set(null);
        try {
            const { data, error } = await this.supabaseService.client
                .from('app_users')
                .select('*')
                .eq('pin_code', pin)
                .single();

            if (error || !data) {
                throw new Error('Invalid PIN code.');
            }

            this.setCurrentUser(data as AppUser);
            return true;
        } catch (err: any) {
            console.error('PIN Login Error:', err);
            this.authError.set('Invalid PIN code.');
            return false;
        } finally {
            this.isAuthenticating.set(false);
        }
    }

    /**
     * Clears out the user entirely and enforces the login wall.
     */
    logout() {
        this.currentUser.set(null);
        localStorage.removeItem('omniplus_user_session');

        // Redirect logic: If they were in the admin backoffice, send them back to the desktop login.
        // Otherwise, assume they are at the till and show the PIN pad.
        if (this.router.url.includes('/admin')) {
            this.router.navigate(['/admin/login']);
        } else {
            this.router.navigate(['/pin-login']);
        }
    }

    /**
     * Core logic for accepting a user and saving them for persistence.
     */
    private setCurrentUser(user: AppUser) {
        this.currentUser.set(user);
        // Keep them logged in across browser reloads
        localStorage.setItem('omniplus_user_session', JSON.stringify(user));

        // Intelligent Routing based strictly on their Role:
        if (user.role === 'CASHIER') {
            this.router.navigate(['/epos']);
        } else {
            // Admins and Managers default to the back-office dashboard
            this.router.navigate(['/admin']);
        }
    }

    /**
     * Rehydrates the user state if the application is refreshed from a shortcut.
     */
    private restoreSession() {
        const saved = localStorage.getItem('omniplus_user_session');
        if (saved) {
            try {
                const user: AppUser = JSON.parse(saved);
                this.currentUser.set(user);
            } catch (e) {
                console.error('Failed to parse saved session');
            }
        }
    }
}
