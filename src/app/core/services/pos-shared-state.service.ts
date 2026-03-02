import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Product, Customer, CartItem } from './mock-supabase.service';
import { StoreConfigService } from './store-config.service';

@Injectable({
    providedIn: 'root'
})
export class POSSharedStateService {
    private storeService = inject(StoreConfigService);

    // Common signals used across EPOS and Customer Display
    cart = signal<CartItem[]>([]);
    selectedCustomer = signal<Customer | null>(null);
    fulfillmentMode = signal<'PICKUP' | 'DELIVERY' | 'COURIER'>('PICKUP');
    shippingFee = signal(0);
    manualDiscount = signal<{ type: 'PERCENTAGE' | 'AMOUNT', value: number } | null>(null);

    // Computations
    subtotal = computed(() => {
        return this.cart().reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
    });

    loyaltyDiscount = computed(() => {
        const md = this.manualDiscount();
        if (md && md.value > 0) {
            return md.type === 'PERCENTAGE' ? this.subtotal() * (md.value / 100) : md.value;
        }

        const cust = this.selectedCustomer();
        if (!cust) return 0;
        // VIP = 10%, Platinum (Spend > 5000) = 7%, Gold (Spend > 1000) = 5%
        if (cust.is_vip) return this.subtotal() * 0.10;
        if ((cust.lifetime_spend || 0) > 5000) return this.subtotal() * 0.07;
        if ((cust.lifetime_spend || 0) > 1000) return this.subtotal() * 0.05;
        return 0;
    });

    taxAmount = computed(() => {
        const config = this.storeService.currentStore()?.config;
        if (!config?.tax_enabled) return 0;
        const taxRate = config.tax_rate || 0.15;
        return this.subtotal() * taxRate;
    });

    total = computed(() => this.subtotal() + this.taxAmount() + this.shippingFee() - this.loyaltyDiscount());

    private channel = new BroadcastChannel('omniplus_pos_sync');
    private isSyncing = false;

    constructor() {
        // 1. Listen for updates from other windows
        this.channel.onmessage = (event) => {
            this.isSyncing = true;
            const data = event.data;
            if (data.cart) this.cart.set(data.cart);
            if (data.customer !== undefined) this.selectedCustomer.set(data.customer);
            if (data.mode) this.fulfillmentMode.set(data.mode);
            if (data.fee !== undefined) this.shippingFee.set(data.fee);
            if (data.discount !== undefined) this.manualDiscount.set(data.discount);
            // taxAmount is computed, so we don't set it directly here
            this.isSyncing = false;
        };

        // 2. Broadcast local changes to other windows
        effect(() => {
            const state = {
                cart: this.cart(),
                customer: this.selectedCustomer(),
                mode: this.fulfillmentMode(),
                fee: this.shippingFee(),
                discount: this.manualDiscount()
            };

            if (!this.isSyncing) {
                this.channel.postMessage(state);
            }
        });
    }

    addToCart(product: Product) {
        this.cart.update(items => {
            const existing = items.find(i => i.product.id === product.id);
            if (existing) {
                return items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...items, { product, quantity: 1 }];
        });
    }

    updateQuantity(productId: string, quantity: number) {
        this.cart.update(items => {
            if (quantity <= 0) {
                return items.filter(i => i.product.id !== productId);
            }
            return items.map(i => i.product.id === productId ? { ...i, quantity } : i);
        });
    }

    clearCart() {
        this.cart.set([]);
        this.selectedCustomer.set(null);
        this.manualDiscount.set(null);
        this.shippingFee.set(0);
    }
}
