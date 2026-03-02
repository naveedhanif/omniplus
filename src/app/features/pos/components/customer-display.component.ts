import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MockSupabaseService } from '../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../core/services/store-config.service';
import { POSSharedStateService } from '../../../core/services/pos-shared-state.service';

@Component({
  selector: 'app-customer-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-screen w-full bg-slate-950 text-white flex overflow-hidden font-sans">
      <!-- Left Side: Live Receipt -->
      <div class="w-1/2 flex flex-col border-r border-white/10 p-12 overflow-y-auto">
        <header class="mb-12">
            <div class="flex items-center gap-4 mb-2">
                <div class="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <span class="material-symbols-rounded text-3xl">point_of_sale</span>
                </div>
                <h1 class="text-4xl font-black tracking-tighter uppercase">{{ storeService.currentStore()?.name || 'OmniPOS' }}</h1>
            </div>
            <p class="text-indigo-400 text-lg font-medium">Welcome! View your order below.</p>
        </header>

        <div class="flex-grow space-y-6">
          @for (item of cart(); track item.product.id) {
            <div class="flex items-center gap-6 group animate-in fade-in slide-in-from-left duration-300">
              <div class="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                 @if (item.product.image_url) {
                    <img [src]="item.product.image_url" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                 } @else {
                    <span class="material-symbols-rounded text-3xl text-white/20">inventory_2</span>
                 }
              </div>
              <div class="flex-grow">
                <h3 class="text-2xl font-bold">{{ item.product.name }}</h3>
                <p class="text-white/40 text-lg uppercase tracking-widest">{{ item.product.category?.name || 'Item' }}</p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-black">{{ (item.product.price * item.quantity) | currency: storeService.currentStore()?.config?.currency }}</p>
                <p class="text-white/40 font-medium">Qty: {{ item.quantity }}</p>
              </div>
            </div>
          }

          @if (cart().length === 0) {
            <div class="h-full flex flex-col items-center justify-center opacity-20">
              <span class="material-symbols-rounded text-9xl">shopping_cart</span>
              <p class="text-2xl font-bold mt-4 italic">Ready to serve you...</p>
            </div>
          }
        </div>

        <footer class="mt-12 pt-12 border-t border-white/10 space-y-4">
          <div class="flex justify-between text-2xl text-white/60">
            <span>Subtotal</span>
            <span>{{ subtotal() | currency: storeService.currentStore()?.config?.currency }}</span>
          </div>

          @if (storeService.currentStore()?.config?.tax_enabled) {
            <div class="flex justify-between text-2xl text-white/40">
              <span>Tax</span>
              <span>{{ taxAmount() | currency: storeService.currentStore()?.config?.currency }}</span>
            </div>
          }

          @if (loyaltyDiscount() > 0) {
            <div class="flex justify-between text-2xl text-emerald-400">
              <span>Loyalty Reward</span>
              <span>-{{ loyaltyDiscount() | currency: storeService.currentStore()?.config?.currency }}</span>
            </div>
          }
          @if (shippingFee() > 0) {
            <div class="flex justify-between text-2xl text-indigo-400">
              <span>Delivery Fee</span>
              <span>+{{ shippingFee() | currency: storeService.currentStore()?.config?.currency }}</span>
            </div>
          }
          <div class="flex justify-between pt-4">
            <span class="text-4xl font-black uppercase text-indigo-500">Total</span>
            <span class="text-6xl font-black text-white glow-text">{{ total() | currency: storeService.currentStore()?.config?.currency }}</span>
          </div>
        </footer>
      </div>

      <!-- Right Side: Brand & Promotion -->
      <div class="w-1/2 relative bg-indigo-600">
        <div class="absolute inset-0 bg-gradient-to-br from-indigo-600 to-indigo-900 opacity-90"></div>
        
        <!-- Animated Background Shapes -->
        <div class="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-white/5 rounded-full blur-3xl animate-pulse"></div>
        <div class="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] bg-indigo-400/20 rounded-full blur-3xl"></div>

        <div class="relative h-full flex flex-col items-center justify-center p-20 text-center">
            <div class="mb-12 relative">
                <div class="w-32 h-32 rounded-3xl bg-white shadow-2xl flex items-center justify-center relative z-10">
                    <span class="material-symbols-rounded text-7xl text-indigo-600">volunteer_activism</span>
                </div>
                <!-- Premium Glow -->
                <div class="absolute inset-0 bg-white blur-3xl opacity-30 scale-150"></div>
            </div>

            <h2 class="text-6xl font-black mb-8 leading-tight">Thank you for shopping with us!</h2>
            <p class="text-2xl text-indigo-100/80 mb-12 max-w-lg leading-relaxed font-medium">
                {{ selectedCustomer() 
                    ? 'Lovely to see you again, ' + selectedCustomer()?.full_name + '!' 
                    : 'Ask our staff about our VIP Loyalty Program to save more on your next visit.' 
                }}
            </p>

            <div class="grid grid-cols-2 gap-8 w-full">
                <div class="p-8 rounded-3xl bg-white/10 border border-white/20 backdrop-blur-md">
                    <span class="material-symbols-rounded text-5xl mb-4">qr_code_2</span>
                    <h4 class="text-xl font-bold uppercase tracking-widest text-indigo-200">Scan for VIP</h4>
                </div>
                <div class="p-8 rounded-3xl bg-white/10 border border-white/20 backdrop-blur-md">
                    <span class="material-symbols-rounded text-5xl mb-4">local_shipping</span>
                    <h4 class="text-xl font-bold uppercase tracking-widest text-indigo-200">Home Delivery</h4>
                </div>
            </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .glow-text {
        text-shadow: 0 0 30px rgba(99, 102, 241, 0.4);
    }
  `]
})
export class CustomerDisplayComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  sharedState = inject(POSSharedStateService);

  cart = this.sharedState.cart;
  selectedCustomer = this.sharedState.selectedCustomer;
  shippingFee = this.sharedState.shippingFee;
  subtotal = this.sharedState.subtotal;
  taxAmount = this.sharedState.taxAmount;
  loyaltyDiscount = this.sharedState.loyaltyDiscount;
  total = this.sharedState.total;
}
