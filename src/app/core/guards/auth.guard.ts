import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Ensures ONLY logged-in users with a role of ADMIN or MANAGER
 * can access the requested route (e.g. /admin)
 */
export const adminGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Grab synchronous state. 
    // In a production app with async startup, you'd use an Observable or Effect here.
    const user = authService.currentUser();

    if (user && (user.role === 'ADMIN' || user.role === 'MANAGER')) {
        return true;
    }

    // Kick them to login
    return router.parseUrl('/admin/login');
};

/**
 * Ensures ONLY logged in CASHIERs (or Managers)
 * can access the POS route.
 */
export const posGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.currentUser();

    // Admins, Managers, and Cashiers can all theoretically use the POS.
    if (user && (user.role === 'CASHIER' || user.role === 'ADMIN' || user.role === 'MANAGER')) {
        return true;
    }

    // Send cashiers to the PIN login by default
    return router.parseUrl('/pin-login');
};
