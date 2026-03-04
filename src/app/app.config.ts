import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { provideServiceWorker } from '@angular/service-worker';

import { EposComponent } from './features/pos/components/epos.component';
import { AdminDashboardComponent } from './features/admin/components/admin-dashboard.component';
import { PinLoginComponent } from './features/auth/components/pin-login.component';
import { AdminLoginComponent } from './features/auth/components/admin-login.component';
import { posGuard, adminGuard } from './core/guards/auth.guard';

export const appConfig: ApplicationConfig = {
  providers: [
    // FIX: Use 'provideZoneChangeDetection'. 
    // This function exists in both Angular 18 and 19 with the exact same name.
    // This solves the conflict between your editor and your browser.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideCharts(withDefaultRegisterables()),
    provideRouter([
      { path: 'pin-login', component: PinLoginComponent, title: 'OmniPOS | Cashier Login' },
      { path: 'admin/login', component: AdminLoginComponent, title: 'OmniPOS | Admin Login' },
      { path: 'epos', component: EposComponent, title: 'OmniPOS | EPOS', canActivate: [posGuard] },
      { path: 'customer-display', loadComponent: () => import('./features/pos/components/customer-display.component').then(m => m.CustomerDisplayComponent), title: 'OmniPOS | Customer View' },
      { path: 'admin', component: AdminDashboardComponent, title: 'OmniPOS | Admin', canActivate: [adminGuard] },
      // Redirect root to epos by default (which drops into the pin-pad if blocked)
      { path: '', redirectTo: 'epos', pathMatch: 'full' }
    ], withHashLocation()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};