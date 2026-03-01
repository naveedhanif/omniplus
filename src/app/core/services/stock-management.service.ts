import { Injectable, signal, computed } from '@angular/core';
import { from, Observable, BehaviorSubject, of, forkJoin } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

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
        return from(new Promise<StockMovement>(async (resolve, reject) => {
            try {
                // 1. Get Product and Location info
                // Defensive select to avoid missing column errors like updated_at
                const { data: product, error: productErr } = await this.supabase
                    .from('products')
                    .select('stock_warehouse, stock_shop, stock_quantity')
                    .eq('id', request.product_id)
                    .single();
                if (productErr) throw productErr;

                const { data: loc, error: locErr } = await this.supabase
                    .from('stock_locations').select('location_type, store_id').eq('id', request.location_id).single();
                if (locErr) throw locErr;

                // 2. Calculate New Quantities
                let newWhouse = product.stock_warehouse || 0;
                let newShop = product.stock_shop || 0;
                const newTotal = (product.stock_quantity || 0) + request.quantity;

                if (loc.location_type === 'STORE') {
                    newShop += request.quantity;
                } else {
                    newWhouse += request.quantity;
                }

                // 3. Update the Product model (Single source of truth)
                const { error: updateErr } = await this.supabase.from('products').update({
                    stock_warehouse: newWhouse >= 0 ? newWhouse : 0,
                    stock_shop: newShop >= 0 ? newShop : 0,
                    stock_quantity: newTotal >= 0 ? newTotal : 0
                }).eq('id', request.product_id);
                if (updateErr) throw updateErr;

                // 4. Log to stock_logs avoiding broken stock_ledger backend triggers
                // 'reason' is strictly validated by postgres stock_reason_enum! Only ['SALE','RETURN','DAMAGE','RECEIPT'] allow insertion.
                let logReason = 'RETURN';
                if (request.movement_type.includes('DAMAGE')) logReason = 'DAMAGE';
                else if (request.movement_type.includes('SALE')) logReason = 'SALE';
                else if (request.movement_type.includes('PO') || request.movement_type.includes('RECEIVE')) logReason = 'RECEIPT';

                // Hack: store location_id and the real movement_type hidden in the note since stock_logs is simple
                const safeNote = request.reason || request.notes || 'Manual Adjustment';
                const embeddedNote = `${safeNote} [loc:${request.location_id}] [type:${request.movement_type}]`;

                const { data: logEntry, error: logErr } = await this.supabase.from('stock_logs').insert({
                    store_id: loc.store_id || this.activeStoreId(),
                    product_id: request.product_id,
                    quantity_change: request.quantity,
                    reason: logReason,
                    note: embeddedNote
                }).select().single();

                if (logErr) console.warn('Stock Log insertion failed, but product updated.', logErr);

                // Try refreshing materialized view in background just in case
                this.refreshStockLevels();
                resolve((logEntry || { ...request, id: 'temp' }) as StockMovement);
            } catch (err) {
                console.error("Movement creation failed", err);
                reject(err);
            }
        }));
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
        const promise = (async () => {
            // Fetch heavily frozen history from broken stock_ledger
            let ledgerQ = this.supabase.from('stock_ledger').select('*');
            if (filters?.productId) ledgerQ = ledgerQ.eq('product_id', filters.productId);
            if (filters?.locationId) ledgerQ = ledgerQ.eq('location_id', filters.locationId);
            if (filters?.fromDate) ledgerQ = ledgerQ.gte('created_at', filters.fromDate);
            if (filters?.toDate) ledgerQ = ledgerQ.lte('created_at', filters.toDate);

            // Fetch live new history from stock_logs bypass
            let logsQ = this.supabase.from('stock_logs').select('*');
            if (filters?.productId) logsQ = logsQ.eq('product_id', filters.productId);
            if (filters?.fromDate) logsQ = logsQ.gte('created_at', filters.fromDate);
            if (filters?.toDate) logsQ = logsQ.lte('created_at', filters.toDate);

            const [ledgerRes, logsRes] = await Promise.all([
                ledgerQ.order('created_at', { ascending: false }).limit(200),
                logsQ.order('created_at', { ascending: false }).limit(200)
            ]);

            const legacy = (ledgerRes.data || []).map((item: any) => ({
                ...item,
                movement_type: item.reason || 'UNKNOWN',
                quantity: item.quantity_change || 0,
            }));

            const recent = (logsRes.data || []).map((item: any) => {
                let locId = null;
                let cleanNote = item.note || '';
                let realType = item.reason;

                if (cleanNote.includes('[type:')) {
                    const typeParts = cleanNote.split('[type:');
                    realType = typeParts[1].replace(']', '').trim();
                    cleanNote = typeParts[0].trim();
                }

                if (cleanNote.includes('[loc:')) {
                    const locParts = cleanNote.split('[loc:');
                    locId = locParts[1].replace(']', '').trim();
                    cleanNote = locParts[0].trim();
                }

                return {
                    ...item,
                    location_id: locId,
                    movement_type: realType,
                    quantity: item.quantity_change || 0,
                    notes: cleanNote,
                    reason: cleanNote // Map back for grid
                };
            });

            let combined = [...recent, ...legacy].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            if (filters?.locationId) {
                combined = combined.filter(c => c.location_id === filters.locationId);
            }

            return combined as StockMovement[];
        })();

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

            // 2. Create TRANSFER_OUT movements and Update Product Stock
            const { data: loc } = await this.supabase.from('stock_locations').select('store_id, location_type').eq('id', transfer.from_location_id).single();
            const storeId = loc?.store_id || this.activeStoreId() || '00000000-0000-0000-0000-000000000000'; // fallback

            const movements = (transfer as any).items.map((item: any) => ({
                store_id: storeId,
                product_id: item.product_id,
                location_id: transfer.from_location_id,
                quantity_change: -item.quantity_requested,
                balance_after: 0,
                reason: `TRANSFER_OUT to ${transfer.to_location_id}`,
                reference_id: transferId,
                created_by: shippedBy,
                notes: `Shipped by ${shippedBy}`
            }));

            const { error: movementError } = await this.supabase
                .from('stock_ledger')
                .insert(movements);

            if (movementError) throw movementError;

            // --- CRITICAL: Sync with products table for real-time app update ---
            for (const item of (transfer as any).items) {
                // Defensive select to avoid missing column errors like updated_at
                const { data: prod } = await this.supabase
                    .from('products')
                    .select('stock_warehouse, stock_shop, stock_quantity')
                    .eq('id', item.product_id)
                    .single();

                if (prod) {
                    const isWarehouse = loc?.location_type === 'WAREHOUSE';
                    const up: any = {};
                    if (isWarehouse) {
                        up.stock_warehouse = Math.max(0, (Number(prod.stock_warehouse) || 0) - item.quantity_requested);
                    } else {
                        up.stock_shop = Math.max(0, (Number(prod.stock_shop) || 0) - item.quantity_requested);
                    }
                    // Subtract from total too since it is leaving the location
                    up.stock_quantity = Math.max(0, (Number(prod.stock_quantity) || 0) - item.quantity_requested);

                    // Simple update payload to avoid triggering missing column errors
                    await this.supabase.from('products').update(up).eq('id', item.product_id);
                }
            }

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

            // 2. Create TRANSFER_IN movements and Update Product Stock
            const { data: loc } = await this.supabase.from('stock_locations').select('store_id, location_type').eq('id', transfer.to_location_id).single();
            const storeId = loc?.store_id || this.activeStoreId() || '00000000-0000-0000-0000-000000000000'; // fallback

            const movements = (transfer as any).items.map((item: any) => ({
                store_id: storeId,
                product_id: item.product_id,
                location_id: transfer.to_location_id,
                quantity_change: item.quantity_shipped,
                balance_after: 0,
                reason: `TRANSFER_IN from ${transfer.from_location_id}`,
                reference_id: transferId,
                created_by: receivedBy,
                notes: `Received by ${receivedBy}`
            }));

            const { error: movementError } = await this.supabase
                .from('stock_ledger')
                .insert(movements);

            if (movementError) throw movementError;

            // --- CRITICAL: Sync with products table for real-time app update ---
            for (const item of (transfer as any).items) {
                const { data: prod } = await this.supabase
                    .from('products')
                    .select('stock_warehouse, stock_shop, stock_quantity')
                    .eq('id', item.product_id)
                    .single();

                if (prod) {
                    const isWarehouse = loc?.location_type === 'WAREHOUSE';
                    const up: any = {};
                    if (isWarehouse) {
                        up.stock_warehouse = (Number(prod.stock_warehouse) || 0) + item.quantity_shipped;
                    } else {
                        up.stock_shop = (Number(prod.stock_shop) || 0) + item.quantity_shipped;
                    }
                    // Add back to total as it is now in a countable location
                    up.stock_quantity = (Number(prod.stock_quantity) || 0) + item.quantity_shipped;

                    await this.supabase.from('products').update(up).eq('id', item.product_id);
                }
            }

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
                // If we have an optimistic cache, favor it over DB during the transition
                const cached = this.manualTransfersCache();
                if (cached) {
                    this.manualTransfersCache.set(null); // Clear it after use
                    return cached;
                }
                return data as StockTransfer[];
            });
        return from(promise);
    }

    // Support Optimistic UI
    private manualTransfersCache = signal<StockTransfer[] | null>(null);

    overrideTransfers(transfers: StockTransfer[]) {
        this.manualTransfersCache.set(transfers);
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
        this.supabase.rpc('refresh_materialized_view', { view_name: 'stock_levels' })
            .then(({ error }) => {
                if (error) console.error('Error refreshing stock levels view:', error);
            });
    }
}
