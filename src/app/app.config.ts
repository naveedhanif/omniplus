import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { EposComponent } from '../components/epos/epos.component';
import { AdminDashboardComponent } from '../components/admin/admin-dashboard.component';

export const appConfig: ApplicationConfig = {
  providers: [
    // FIX: Use 'provideZoneChangeDetection'. 
    // This function exists in both Angular 18 and 19 with the exact same name.
    // This solves the conflict between your editor and your browser.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideCharts(withDefaultRegisterables()),
    provideRouter([
      { path: '', component: EposComponent, title: 'OmniPOS | EPOS' },
      { path: 'admin', component: AdminDashboardComponent, title: 'OmniPOS | Admin' }
    ], withHashLocation())
  ]
};