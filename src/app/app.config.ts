import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { EposComponent } from './features/pos/components/epos.component';
import { AdminDashboardComponent } from './features/admin/components/admin-dashboard.component';

export const appConfig: ApplicationConfig = {
  providers: [
    // FIX: Use 'provideZoneChangeDetection'. 
    // This function exists in both Angular 18 and 19 with the exact same name.
    // This solves the conflict between your editor and your browser.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideCharts(withDefaultRegisterables()),
    provideRouter([
      { path: '', component: EposComponent, title: 'OmniPOS | EPOS' },
      { path: 'customer-display', loadComponent: () => import('./features/pos/components/customer-display.component').then(m => m.CustomerDisplayComponent), title: 'OmniPOS | Customer View' },
      { path: 'admin', component: AdminDashboardComponent, title: 'OmniPOS | Admin' }
    ], withHashLocation())
  ]
};