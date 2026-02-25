import { Injectable, signal } from '@angular/core';

export type IndustryType = 'hardware' | 'pharmacy' | 'grocery';

export interface TenantProfile {
    id: string;
    name: string;
    industry: IndustryType;
}

@Injectable({
    providedIn: 'root'
})
export class TenantService {
    // Using Angular 18 Signals for reactive state
    // Defaulting to 'grocery' for the PoC, but this would normally be fetched from Supabase on login
    private currentTenantSignal = signal<TenantProfile>({
        id: 'mock-tenant-123',
        name: 'Demo Grocery Store',
        industry: 'grocery'
    });

    // Expose the signal as readonly to components
    public readonly currentTenant = this.currentTenantSignal.asReadonly();

    constructor() { }

    // Method to manually switch industries for testing purposes
    public switchIndustry(industry: IndustryType) {
        this.currentTenantSignal.update(tenant => ({
            ...tenant,
            name: `Demo ${industry.charAt(0).toUpperCase() + industry.slice(1)} Store`,
            industry
        }));
    }
}
