import { Injectable, inject } from '@angular/core';
import { MockSupabaseService, Customer, MarketingRule } from '../mock-supabase.service';
import { StoreConfigService } from '../store-config.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class MarketingAutomationService {
    private supabase = inject(MockSupabaseService);
    private storeConfig = inject(StoreConfigService);
    // private http = inject(HttpClient); // We would use this to hit the real Supabase Edge Function API

    constructor() {
        // For demonstration in the frontend, we will poll this every hour if it were a real PWA.
        // In a true production app, this logic lives entirely in a CRON function on the server.

        // Let's set up a simulator that checks rules immediately for demo purposes
        console.log('🤖 Marketing Automation Engine Initialized.');
    }

    /**
     * Simulates the nightly Server CRON Job that checks all customers against all active rules.
     * In a real app, this function lives in Supabase Edge Functions (Deno/Node).
     */
    async triggerServerCRONJob() {
        const storeId = this.storeConfig.currentStore()?.id;
        if (!storeId) {
            console.error("Marketing CRON: No active store context.");
            return;
        }

        console.group(`🔔 [CRON JOB] Running Marketing Automation for Store: ${storeId}`);

        try {
            // 1. Fetch all ACTIVE Marketing Rules
            const rules = await firstValueFrom(this.supabase.getMarketingRules(storeId));
            const activeRules = rules.filter((r: MarketingRule) => r.is_active);

            if (activeRules.length === 0) {
                console.log('No active campaigns running today. Sleeping.');
                console.groupEnd();
                return;
            }

            console.log(`Found ${activeRules.length} active campaign(s). Evaluating customers...`);

            // 2. Fetch all customers
            const customers = await firstValueFrom(this.supabase.getCustomers(storeId));

            let messagesSent = 0;

            // 3. Evaluate each rule against each customer
            for (const rule of activeRules) {
                console.log(`Evaluating Rule: "${rule.name}" (${rule.trigger_days} days inactive)`);

                for (const customer of customers) {
                    // Skip customers without a phone number
                    if (!customer.phone) continue;

                    // If they have never purchased, or we don't know when they did... they aren't "inactive", they are just leads.
                    if (!customer.last_purchase_date) continue;

                    // Calculate exact days since their last recorded purchase
                    const daysInactive = this.calculateDaysInactive(customer.last_purchase_date);

                    // THRESHOLD MATCH: The customer must be AT LEAST the number of trigger days inactive.
                    // Changed from strict === to >=: if rule is "30 days", any customer inactive for 30+ days qualifies.
                    if (daysInactive >= rule.trigger_days) {

                        // 4. Draft the customized message
                        const trackingCode = `WIN${Math.floor(1000 + Math.random() * 9000)}`;
                        const validityDays = rule.validity_days || 7;

                        const personalizedMessage = this.draftMessage(rule.message_template, customer, rule.discount_percentage, trackingCode, validityDays);

                        // 5. Save the generated promotion code into the database for POS validation
                        const startDate = new Date();
                        const endDate = new Date(startDate);
                        endDate.setDate(endDate.getDate() + validityDays);

                        await firstValueFrom(this.supabase.createPromotion({
                            store_id: storeId,
                            customer_id: customer.id,
                            code: trackingCode,
                            discount_percentage: rule.discount_percentage,
                            validity_start: startDate.toISOString(),
                            validity_end: endDate.toISOString(),
                            is_used: false,
                            campaign_id: rule.id
                        }));

                        // 6. Fire to WhatsApp API Simulator
                        await this.simulateWhatsAppAPI(customer.phone, personalizedMessage, rule.name);
                        messagesSent++;

                        // In a real app, we would log this in a 'communications_log' table to prevent double-sends
                        // and track analytics (open rates, conversion rates based on the coupon code).
                    }
                }
            }

            console.log(`✅ [CRON JOB] Completed. Sent ${messagesSent} automated messages and generated codes today.`);

        } catch (error) {
            console.error("CRON failed executing marketing rules.", error);
        } finally {
            console.groupEnd();
        }
    }

    private calculateDaysInactive(lastPurchaseISO: string): number {
        const lastPurchase = new Date(lastPurchaseISO);
        const today = new Date();
        // Reset times to midnight to ensure accurate day calculation regardless of time of day
        lastPurchase.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(today.getTime() - lastPurchase.getTime());
        return Math.round(diffTime / (1000 * 60 * 60 * 24));
    }

    private draftMessage(template: string, customer: Customer, discount: number, code: string, days: number): string {
        // Replace safe variables
        let finalMessage = template
            .replace(/\[Name\]/gi, customer.full_name.split(' ')[0] || 'Friend')
            .replace(/\[Discount\]/gi, discount.toString())
            .replace(/\[Code\]/gi, code)
            .replace(/\[Days\]/gi, days.toString());

        return finalMessage;
    }

    private async simulateWhatsAppAPI(phone: string, message: string, campaignName: string) {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 800));

        console.log(`%c📱 [WhatsApp Simulated API] -> ${phone}`, 'color: #25D366; font-weight: bold; background: #e0f2f1; padding: 2px 6px; border-radius: 4px;');
        console.log(`Campaign: ${campaignName}`);
        console.log(`Payload:\n${message}\n`);

        // In reality: 
        // return this.http.post('https://graph.facebook.com/v17.0/.../messages', {
        //    messaging_product: "whatsapp",
        //    to: phone,
        //    type: "text",
        //    text: { body: message }
        // }, { headers: { Authorization: `Bearer ${ENV.WHATSAPP_TOKEN}` }})
    }
}
