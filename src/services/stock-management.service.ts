import { Injectable, signal, computed } from '@angular/core';
import { from, Observable, BehaviorSubject, of, forkJoin } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// =====================================================
// TYPES & INTERFACES
// =====================================================

export type LocationType = 'STORE' | 'WAREHOUSE' | 'TRANSIT';
export type MovementType =
    | 'INITIAL_STOCK'
    | 'PURCHASE_RECEIVE'
    | 'SALE'
    | 'RETURN_IN'
    | 'RETURN_OUT'
    | 'TRANSFER_OUT'
    | 'TRANSFER_IN'
    | 'ADJUSTMENT_IN'
    | 'ADJUSTMENT_OUT'
    | 'DAMAGE_WRITE_OFF'
    | 'RESERVATION'
    | 'RESERVATION_RELEASE';

export type TransferStatus = 'PENDING' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
export type ReservationType = 'QUOTE' | 'PENDING_ORDER' | 'TECHNICIAN_BOOKING' | 'MANUAL';
export type ReservationStatus = 'ACTIVE' | 'FULFILLED' | 'RELEASED' | 'EXPIRED';

export interface StockLocation {
    id: string;
    store_id?: string;
    name: string;
    location_type: LocationType;
    address?: string;
    is_active: boolean;
    allows_sales: boolean;
    allows_receiving: boolean;
    metadata?: any;
    created_at: string;
    updated_at: string;
}

export interface StockMovement {
    id: string;
    movement_type: MovementType;
    product_id: string;
    location_id: string;
    quantity: number;
    unit_cost?: number;
    total_cost?: number;
    reference_type?: string;
    reference_id?: string;
    from_location_id?: string;
    to_location_id?: string;
    transfer_id?: string;
    performed_by?: string;
    reason?: string;
    notes?: string;
    metadata?: any;
    created_at: string;
}

export interface StockLevel {
    product_id: string;
    location_id: string;
    available_quantity: number;
    reserved_quantity: number;
    damaged_quantity: number;
    physical_quantity: number;
    stock_value: number;
    last_movement_at: string;
}

export interface StockReorderRule {
    id: string;
    product_id: string;
    location_id: string;
    minimum_quantity: number;
    reorder_quantity: number;
    maximum_quantity?: number;
    preferred_supplier_id?: string;
    supplier_lead_time_days: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface StockTransfer {
    id: string;
    transfer_number: string;
    from_location_id: string;
    to_location_id: string;
    status: TransferStatus;
    requested_by?: string;
    approved_by?: string;
    shipped_by?: string;
    received_by?: string;
    requested_at: string;
    approved_at?: string;
    shipped_at?: string;
    received_at?: string;
    notes?: string;
    metadata?: any;
    created_at: string;
    updated_at: string;
}

export interface StockTransferItem {
    id: string;
    transfer_id: string;
    product_id: string;
    quantity_requested: number;
    quantity_shipped: number;
    quantity_received: number;
    unit_cost?: number;
    notes?: string;
    created_at: string;
}

export interface StockReservation {
    id: string;
    product_id: string;
    location_id: string;
    quantity: number;
    reservation_type: ReservationType;
    reference_id?: string;
    reserved_by?: string;
    reserved_for?: string;
    expires_at?: string;
    status: ReservationStatus;
    notes?: string;
    created_at: string;
    released_at?: string;
}

export interface CreateMovementRequest {
    movement_type: MovementType;
    product_id: string;
    location_id: string;
    quantity: number;
    unit_cost?: number;
    reference_type?: string;
    reference_id?: string;
    performed_by?: string;
    reason?: string;
    notes?: string;
}

export interface CreateTransferRequest {
    from_location_id: string;
    to_location_id: string;
    requested_by?: string;
    items: {
        product_id: string;
        quantity: number;
    }[];
    notes?: string;
}

// =====================================================
// STOCK MANAGEMENT SERVICE
// =====================================================

@Injectable({
    providedIn: 'root'
})
export class StockManagementService {
    private supabase: SupabaseClient;

    // Active tenant/store context
    private activeTenantId = signal<string | null>(null);
    private activeStoreId = signal<string | null>(null);

    constructor() {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    }

    setContext(tenantId: string, storeId?: string) {
        this.activeTenantId.set(tenantId);
        if (storeId) this.activeStoreId.set(storeId);
    }

    // =====================================================
    // STOCK LOCATIONS
    // =====================================================

    getLocations(): Observable<StockLocation[]> {
        const promise = this.supabase
            .from('stock_locations')
            .select('*')
            .eq('is_active', true)
            .order('name')
            .then(({ data, error }) => {
                if (error) throw error;
                return data as StockLocation[];
            });
        return from(promise);
    }

    getLocationsByStore(storeId: string): Observable<StockLocation[]> {
        const promise = this.supabase
            .from('stock_locations')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true)
            .order('name')
            .then(({ data, error }) => {
                if (error) throw error;
                return data as StockLocation[];
            });
        return from(promise);
    }

    createLocation(location: Omit<StockLocation, 'id' | 'created_at' | 'updated_at'>): Observable<StockLocation> {
        const promise = this.supabase
            .from('stock_locations')
            .insert(location)
            .select()
            .single()
            .then(({ data, error }) => {
                if (error) throw error;
                return data as StockLocation;
            });
        return from(promise);
    }

    updateLocation(locationId: string, updates: Partial<StockLocation>): Observable<void> {
        const promise = this.supabase
            .from('stock_locations')
            .update(updates)
            .eq('id', locationId)
            .then(({ error }) => {
                if (error) throw error;
            });
        return from(promise);
    }

    deleteLocation(locationId: string): Observable<void> {
        const promise = this.supabase
            .from('stock_locations')
            .delete()
            .eq('id', locationId)
            .then(({ error }) => {
                if (error) throw error;
            });
        return from(promise);
    }

    // =====================================================
    // STOCK LEVELS
    // =====================================================

    getStockLevels(locationId?: string, productId?: string): Observable<StockLevel[]> {
        let query = this.supabase
            .from('stock_levels')
            .select('*');

        if (locationId) query = query.eq('location_id', locationId);
        if (productId) query = query.eq('product_id', productId);

        const promise = query
            // .order('available_quantity', { ascending: true }) // potentially causing error
            .order('product_id', { ascending: true })
            .then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map((item: any) => ({
                    ...item,
                    available_quantity: item.available_quantity || item.quantity || 0,
                    physical_quantity: item.physical_quantity || item.quantity || 0,
                    reserved_quantity: item.reserved_quantity || 0,
                    damaged_quantity: item.damaged_quantity || 0
                })) as StockLevel[];
            });
        return from(promise);
    }

    getStockLevel(productId: string, locationId: string): Observable<StockLevel | null> {
        const promise = this.supabase
            .from('stock_levels')
            .select('*')
            .eq('product_id', productId)
            .eq('location_id', locationId)
            .single()
            .then(({ data, error }) => {
                if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
                if (!data) return null;
                return {
                    ...data,
                    available_quantity: data.available_quantity || data.quantity || 0,
                    physical_quantity: data.physical_quantity || data.quantity || 0,
                    reserved_quantity: data.reserved_quantity || 0,
                    damaged_quantity: data.damaged_quantity || 0
                } as StockLevel;
            });
        return from(promise);
    }

    getLowStockItems(locationId?: string): Observable<any[]> {
        // Join stock_levels with stock_reorder_rules to find low stock
        let query = this.supabase
            .from('stock_levels')
            .select(`
                *,
                product:products(*),
                location:stock_locations(*),
                reorder_rule:stock_reorder_rules(*)
            `);

        if (locationId) query = query.eq('location_id', locationId);

        const promise = query.then(({ data, error }) => {
            if (error) throw error;

            const mapped = (data || []).map((item: any) => ({
                ...item,
                available_quantity: item.available_quantity || item.quantity || 0,
                physical_quantity: item.physical_quantity || item.quantity || 0
            }));

            // Filter where available < minimum
            return mapped.filter((item: any) => {
                const rule = item.reorder_rule;
                return rule && item.available_quantity < rule.minimum_quantity;
            });
        });

        return from(promise);
    }

    // =====================================================
    // STOCK MOVEMENTS
    // =====================================================

    createMovement(request: CreateMovementRequest): Observable<StockMovement> {
        const promise = this.supabase
            .from('stock_ledger')
            .insert(request)
            .select()
            .single()
            .then(({ data, error }) => {
                if (error) throw error;

                // Refresh materialized view (in production, use triggers)
                this.refreshStockLevels();

                return data as StockMovement;
            });
        return from(promise);
    }

    getMovements(
        filters?: {
            productId?: string;
            locationId?: string;
            movementType?: MovementType;
            fromDate?: string;
            toDate?: string;
        }
    ): Observable<StockMovement[]> {
        let query = this.supabase
            .from('stock_ledger')
            .select('*');

        if (filters?.productId) query = query.eq('product_id', filters.productId);
        if (filters?.locationId) query = query.eq('location_id', filters.locationId);
        if (filters?.movementType) query = query.eq('movement_type', filters.movementType);
        if (filters?.fromDate) query = query.gte('created_at', filters.fromDate);
        if (filters?.toDate) query = query.lte('created_at', filters.toDate);

        const promise = query
            .order('created_at', { ascending: false })
            .limit(100)
            .then(({ data, error }) => {
                if (error) throw error;
                return data as StockMovement[];
            });
        return from(promise);
    }

    // =====================================================
    // STOCK TRANSFERS
    // =====================================================

    createTransfer(request: CreateTransferRequest): Observable<StockTransfer> {
        const transferNumber = `TRF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

        const promise = (async () => {
            // 1. Create transfer header
            const { data: transfer, error: transferError } = await this.supabase
                .from('stock_transfers')
                .insert({
                    transfer_number: transferNumber,
                    from_location_id: request.from_location_id,
                    to_location_id: request.to_location_id,
                    requested_by: request.requested_by,
                    notes: request.notes,
                    status: 'PENDING'
                })
                .select()
                .single();

            if (transferError) throw transferError;

            // 2. Create transfer items
            const items = request.items.map(item => ({
                transfer_id: transfer.id,
                product_id: item.product_id,
                quantity_requested: item.quantity
            }));

            const { error: itemsError } = await this.supabase
                .from('stock_transfer_items')
                .insert(items);

            if (itemsError) throw itemsError;

            return transfer as StockTransfer;
        })();

        return from(promise);
    }

    approveTransfer(transferId: string, approvedBy: string): Observable<StockTransfer> {
        const promise = this.supabase
            .from('stock_transfers')
            .update({
                status: 'APPROVED',
                approved_by: approvedBy,
                approved_at: new Date().toISOString()
            })
            .eq('id', transferId)
            .select()
            .then(({ data, error }) => {
                if (error) throw error;
                // If the update worked, Supabase returns an array of updated rows
                const updatedRow = data && data.length > 0 ? data[0] : null;
                if (!updatedRow) throw new Error("Could not find the updated transfer.");
                return updatedRow as StockTransfer;
            });
        return from(promise);
    }

    shipTransfer(transferId: string, shippedBy: string): Observable<StockTransfer> {
        const promise = (async () => {
            // 1. Get transfer and items
            const { data: transfer, error: transferError } = await this.supabase
                .from('stock_transfers')
                .select('*, items:stock_transfer_items(*)')
                .eq('id', transferId)
                .single();

            if (transferError) throw transferError;

            // 2. Create TRANSFER_OUT movements
            const { data: loc } = await this.supabase.from('stock_locations').select('store_id').eq('id', transfer.from_location_id).single();
            const storeId = loc?.store_id || this.activeStoreId() || '00000000-0000-0000-0000-000000000000'; // fallback
            const movements = (transfer as any).items.map((item: any) => ({
                store_id: storeId,
                product_id: item.product_id,
                location_id: transfer.from_location_id,
                quantity_change: -item.quantity_requested,
                balance_after: 0, // This should normally be calculated or handled by trigger
                reason: `TRANSFER_OUT to ${transfer.to_location_id}`,
                reference_id: transferId,
                created_by: shippedBy,
                notes: `Shipped by ${shippedBy}`
            }));

            const { error: movementError } = await this.supabase
                .from('stock_ledger')
                .insert(movements);

            if (movementError) throw movementError;

            // 3. Update transfer status
            const { data: updated, error: updateError } = await this.supabase
                .from('stock_transfers')
                .update({
                    status: 'IN_TRANSIT',
                    shipped_by: shippedBy,
                    shipped_at: new Date().toISOString()
                })
                .eq('id', transferId)
                .select();

            if (updateError) throw updateError;

            const updatedRow = updated && updated.length > 0 ? updated[0] : null;
            if (!updatedRow) throw new Error("Could not find the shipped transfer.");

            // 4. Update transfer items - set shipped = requested
            // Note: In production, use a database trigger or RPC function
            const { data: items } = await this.supabase
                .from('stock_transfer_items')
                .select('id, quantity_requested')
                .eq('transfer_id', transferId);

            if (items) {
                for (const item of items) {
                    await this.supabase
                        .from('stock_transfer_items')
                        .update({ quantity_shipped: item.quantity_requested })
                        .eq('id', item.id);
                }
            }

            this.refreshStockLevels();

            return updatedRow as StockTransfer;
        })();

        return from(promise);
    }

    receiveTransfer(transferId: string, receivedBy: string): Observable<StockTransfer> {
        const promise = (async () => {
            // 1. Get transfer and items
            const { data: transfer, error: transferError } = await this.supabase
                .from('stock_transfers')
                .select('*, items:stock_transfer_items(*)')
                .eq('id', transferId)
                .single();

            if (transferError) throw transferError;

            // 2. Create TRANSFER_IN movements
            const { data: loc } = await this.supabase.from('stock_locations').select('store_id').eq('id', transfer.to_location_id).single();
            const storeId = loc?.store_id || this.activeStoreId() || '00000000-0000-0000-0000-000000000000'; // fallback
            const movements = (transfer as any).items.map((item: any) => ({
                store_id: storeId,
                product_id: item.product_id,
                location_id: transfer.to_location_id,
                quantity_change: item.quantity_shipped,
                balance_after: 0, // This should normally be calculated or handled by trigger
                reason: `TRANSFER_IN from ${transfer.from_location_id}`,
                reference_id: transferId,
                created_by: receivedBy,
                notes: `Received by ${receivedBy}`
            }));

            const { error: movementError } = await this.supabase
                .from('stock_ledger')
                .insert(movements);

            if (movementError) throw movementError;

            // 3. Update transfer status
            const { data: updated, error: updateError } = await this.supabase
                .from('stock_transfers')
                .update({
                    status: 'RECEIVED',
                    received_by: receivedBy,
                    received_at: new Date().toISOString()
                })
                .eq('id', transferId)
                .select();

            if (updateError) throw updateError;

            const updatedRow = updated && updated.length > 0 ? updated[0] : null;
            if (!updatedRow) throw new Error("Could not find the received transfer.");

            // 4. Update transfer items - set received = shipped
            // Note: In production, use a database trigger or RPC function
            const { data: items } = await this.supabase
                .from('stock_transfer_items')
                .select('id, quantity_shipped')
                .eq('transfer_id', transferId);

            if (items) {
                for (const item of items) {
                    await this.supabase
                        .from('stock_transfer_items')
                        .update({ quantity_received: item.quantity_shipped })
                        .eq('id', item.id);
                }
            }

            this.refreshStockLevels();

            return updatedRow as StockTransfer;
        })();

        return from(promise);
    }

    getTransfers(status?: TransferStatus): Observable<StockTransfer[]> {
        let query = this.supabase
            .from('stock_transfers')
            .select('*');

        if (status) query = query.eq('status', status);

        const promise = query
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (error) throw error;
                return data as StockTransfer[];
            });
        return from(promise);
    }

    // =====================================================
    // STOCK RESERVATIONS
    // =====================================================

    createReservation(reservation: Omit<StockReservation, 'id' | 'created_at' | 'released_at'>): Observable<StockReservation> {
        const promise = (async () => {
            // 1. Create reservation record
            const { data: res, error: resError } = await this.supabase
                .from('stock_reservations')
                .insert(reservation)
                .select()
                .single();

            if (resError) throw resError;

            // 2. Create RESERVATION movement
            const { error: movementError } = await this.supabase
                .from('stock_ledger')
                .insert({
                    movement_type: 'RESERVATION',
                    product_id: reservation.product_id,
                    location_id: reservation.location_id,
                    quantity: -reservation.quantity,
                    performed_by: reservation.reserved_by,
                    reference_type: reservation.reservation_type,
                    reference_id: res.id,
                    notes: reservation.notes
                });

            if (movementError) throw movementError;

            this.refreshStockLevels();

            return res as StockReservation;
        })();

        return from(promise);
    }

    releaseReservation(reservationId: string): Observable<boolean> {
        const promise = (async () => {
            // 1. Get reservation
            const { data: res, error: resError } = await this.supabase
                .from('stock_reservations')
                .select('*')
                .eq('id', reservationId)
                .single();

            if (resError) throw resError;

            // 2. Create RESERVATION_RELEASE movement
            const { error: movementError } = await this.supabase
                .from('stock_ledger')
                .insert({
                    movement_type: 'RESERVATION_RELEASE',
                    product_id: res.product_id,
                    location_id: res.location_id,
                    quantity: res.quantity,
                    reference_type: res.reservation_type,
                    reference_id: reservationId,
                    notes: 'Reservation released'
                });

            if (movementError) throw movementError;

            // 3. Update reservation status
            const { error: updateError } = await this.supabase
                .from('stock_reservations')
                .update({
                    status: 'RELEASED',
                    released_at: new Date().toISOString()
                })
                .eq('id', reservationId);

            if (updateError) throw updateError;

            this.refreshStockLevels();

            return true;
        })();

        return from(promise);
    }

    // =====================================================
    // REORDER RULES
    // =====================================================

    setReorderRule(rule: Omit<StockReorderRule, 'id' | 'created_at' | 'updated_at'>): Observable<StockReorderRule> {
        const promise = this.supabase
            .from('stock_reorder_rules')
            .upsert(rule, { onConflict: 'tenant_id,product_id,location_id' })
            .select()
            .single()
            .then(({ data, error }) => {
                if (error) throw error;
                return data as StockReorderRule;
            });
        return from(promise);
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    private refreshStockLevels(): void {
        // In production, this would be handled by triggers or scheduled jobs
        // For now, we'll use RPC to refresh the materialized view
        this.supabase.rpc('refresh_materialized_view', { view_name: 'stock_levels' });
    }
}
