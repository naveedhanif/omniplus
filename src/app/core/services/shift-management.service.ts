import { Injectable, signal, computed } from '@angular/core';
import { OfflineStorageService } from './offline-storage.service';
import { StoreConfigService } from './store-config.service';
import { BehaviorSubject, from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

export interface Shift {
  id: string;
  store_id: string;
  status: 'OPEN' | 'CLOSED';
  opening_time: string;
  closing_time?: string;
  opening_float: number;
  expected_cash?: number;
  actual_cash?: number;
  discrepancy?: number;
  total_sales: number;
  total_refunds: number;
  total_cash: number;
  total_card: number;
  payouts: number;
}

export interface ShiftAction {
  id: string;
  shift_id: string;
  amount: number;
  type: 'PAY-IN' | 'PAY-OUT';
  reason: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class ShiftManagementService {
  private activeShiftSubject = new BehaviorSubject<Shift | null>(null);
  public activeShift = toSignal(this.activeShiftSubject.asObservable(), { initialValue: null });

  constructor(
    private offline: OfflineStorageService,
    private storeService: StoreConfigService
  ) {
    this.loadActiveShift();
  }

  private async loadActiveShift() {
     const storeId = this.storeService.currentStore()?.id;
     if (!storeId) return;
     
     const shifts = await this.offline.getAll<Shift>('shifts');
     const openShift = shifts.find(s => s.store_id === storeId && s.status === 'OPEN');
     this.activeShiftSubject.next(openShift || null);
  }

  async openShift(floatAmount: number) {
     const storeId = this.storeService.currentStore()?.id;
     if (!storeId) throw new Error("No active store");

     const newShift: Shift = {
        id: `shift_${Date.now()}`,
        store_id: storeId,
        status: 'OPEN',
        opening_time: new Date().toISOString(),
        opening_float: floatAmount,
        total_sales: 0,
        total_refunds: 0,
        total_cash: 0,
        total_card: 0,
        payouts: 0
     };

     await this.offline.put('shifts', newShift);
     this.activeShiftSubject.next(newShift);
     return newShift;
  }

  async closeShift(actualCashCounted: number): Promise<Shift> {
     const current = this.activeShiftSubject.value;
     if (!current) throw new Error("No active shift to close");

     const expectedCash = current.opening_float + current.total_cash - current.total_refunds + current.payouts;
     const discrepancy = actualCashCounted - expectedCash;

     const closedShift: Shift = {
        ...current,
        status: 'CLOSED',
        closing_time: new Date().toISOString(),
        expected_cash: expectedCash,
        actual_cash: actualCashCounted,
        discrepancy: discrepancy
     };

     await this.offline.put('shifts', closedShift);
     this.activeShiftSubject.next(null);
     return closedShift;
  }

  async recordTransaction(type: 'SALE' | 'REFUND', amount: number, method: 'CASH' | 'CARD') {
     const current = this.activeShiftSubject.value;
     if (!current) return; // Silent return if no shift (though shouldn't happen based on lock)

     const update = { ...current };
     
     if (type === 'SALE') {
        update.total_sales += amount;
        if (method === 'CASH') update.total_cash += amount;
        if (method === 'CARD') update.total_card += amount;
     } else if (type === 'REFUND') {
        // Treat refunds as absolute values
        update.total_refunds += Math.abs(amount);
        if (method === 'CASH') update.total_cash -= Math.abs(amount);
        if (method === 'CARD') update.total_card -= Math.abs(amount);
     }

     await this.offline.put('shifts', update);
     this.activeShiftSubject.next(update);
  }

  async recordPayout(amount: number, reason: string, isPayIn: boolean) {
     const current = this.activeShiftSubject.value;
     if (!current) throw new Error("No active shift");

     const realAmount = isPayIn ? Math.abs(amount) : -Math.abs(amount);
     const update = { ...current, payouts: current.payouts + realAmount };

     await this.offline.put('shifts', update);
     this.activeShiftSubject.next(update);
  }
}
