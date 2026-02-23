# Stock Level Management System Architecture
## Multi-Tenant EPOS for Hardware Spare Parts Retailers

**Version:** 1.0  
**Date:** 2026-02-12  
**Author:** Senior SaaS Retail Systems Architect

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Database Schema Design](#database-schema-design)
3. [Entity Relationships](#entity-relationships)
4. [API Structure](#api-structure)
5. [Stock Movement Workflows](#stock-movement-workflows)
6. [Data Consistency Strategy](#data-consistency-strategy)
7. [Scalability Considerations](#scalability-considerations)
8. [Edge Case Handling](#edge-case-handling)
9. [Indexing Strategy](#indexing-strategy)
10. [Security & Multi-Tenancy](#security--multi-tenancy)

---

## Executive Summary

This document outlines a production-ready Stock Level Management system designed for multi-tenant SaaS EPOS platforms serving hardware spare parts retailers. The system uses **movement-based inventory tracking** with immutable ledger entries, ensuring full audit traceability and preventing data inconsistencies.

### Key Design Principles

- **Immutable Ledger**: All stock changes recorded as movements, never direct updates
- **Multi-Tenant Isolation**: Strict tenant and store partitioning with RLS
- **Atomic Transactions**: ACID-compliant stock operations
- **Real-Time Sync**: Instant stock updates across all stores
- **Audit Trail**: Complete historical traceability
- **Performance**: Optimized for high-concurrency POS operations

---

## Database Schema Design

### 1. Core Stock Tables

#### `stock_locations`
Represents physical locations where inventory is stored.

```sql
CREATE TABLE stock_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL, -- e.g., "Main Store", "Central Warehouse", "Back Room"
    location_type TEXT NOT NULL CHECK (location_type IN ('STORE', 'WAREHOUSE', 'TRANSIT')),
    
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Configuration
    allows_sales BOOLEAN DEFAULT TRUE, -- Can sell from this location
    allows_receiving BOOLEAN DEFAULT TRUE, -- Can receive stock here
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_stock_locations_tenant ON stock_locations(tenant_id);
CREATE INDEX idx_stock_locations_store ON stock_locations(store_id);
CREATE INDEX idx_stock_locations_type ON stock_locations(location_type) WHERE is_active = TRUE;
```

#### `stock_ledger`
**The single source of truth for all inventory movements.**

```sql
CREATE TABLE stock_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Movement Details
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'INITIAL_STOCK',      -- Opening balance
        'PURCHASE_RECEIVE',   -- Receiving from supplier
        'SALE',               -- Sale to customer
        'RETURN_IN',          -- Customer return
        'RETURN_OUT',         -- Return to supplier
        'TRANSFER_OUT',       -- Transfer to another location
        'TRANSFER_IN',        -- Transfer from another location
        'ADJUSTMENT_IN',      -- Manual increase (stocktake, found items)
        'ADJUSTMENT_OUT',     -- Manual decrease (shrinkage, theft)
        'DAMAGE_WRITE_OFF',   -- Damaged/defective items
        'RESERVATION',        -- Reserve for quote/order
        'RESERVATION_RELEASE' -- Release reservation
    )),
    
    -- Product & Location
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    
    -- Quantity (positive for IN, negative for OUT)
    quantity NUMERIC NOT NULL,
    
    -- Cost Tracking (for valuation)
    unit_cost NUMERIC, -- Cost per unit at time of movement
    total_cost NUMERIC GENERATED ALWAYS AS (ABS(quantity) * COALESCE(unit_cost, 0)) STORED,
    
    -- Reference Documents
    reference_type TEXT, -- 'TRANSACTION', 'PURCHASE_ORDER', 'TRANSFER', 'ADJUSTMENT'
    reference_id UUID,   -- ID of the related document
    
    -- Transfer Specific
    from_location_id UUID REFERENCES stock_locations(id),
    to_location_id UUID REFERENCES stock_locations(id),
    transfer_id UUID, -- Links transfer OUT and IN movements
    
    -- Audit
    performed_by UUID REFERENCES staff(id),
    reason TEXT,
    notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CHECK (
        (movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN') AND transfer_id IS NOT NULL)
        OR
        (movement_type NOT IN ('TRANSFER_OUT', 'TRANSFER_IN'))
    ),
    
    CHECK (
        (movement_type = 'TRANSFER_OUT' AND from_location_id = location_id AND to_location_id IS NOT NULL)
        OR
        (movement_type = 'TRANSFER_IN' AND to_location_id = location_id AND from_location_id IS NOT NULL)
        OR
        (movement_type NOT IN ('TRANSFER_OUT', 'TRANSFER_IN'))
    )
);

-- Critical Indexes for Performance
CREATE INDEX idx_stock_ledger_tenant ON stock_ledger(tenant_id);
CREATE INDEX idx_stock_ledger_product_location ON stock_ledger(product_id, location_id);
CREATE INDEX idx_stock_ledger_location ON stock_ledger(location_id);
CREATE INDEX idx_stock_ledger_created ON stock_ledger(created_at DESC);
CREATE INDEX idx_stock_ledger_reference ON stock_ledger(reference_type, reference_id);
CREATE INDEX idx_stock_ledger_transfer ON stock_ledger(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX idx_stock_ledger_movement_type ON stock_ledger(movement_type);
```

#### `stock_levels` (Materialized View)
**Real-time computed stock levels per product per location.**

```sql
CREATE MATERIALIZED VIEW stock_levels AS
SELECT 
    tenant_id,
    product_id,
    location_id,
    
    -- Available Stock (physical stock minus reservations and damaged)
    SUM(CASE 
        WHEN movement_type NOT IN ('RESERVATION', 'DAMAGE_WRITE_OFF') 
        THEN quantity 
        ELSE 0 
    END) AS available_quantity,
    
    -- Reserved Stock
    SUM(CASE 
        WHEN movement_type = 'RESERVATION' 
        THEN ABS(quantity) 
        ELSE 0 
    END) AS reserved_quantity,
    
    -- Damaged Stock
    SUM(CASE 
        WHEN movement_type = 'DAMAGE_WRITE_OFF' 
        THEN ABS(quantity) 
        ELSE 0 
    END) AS damaged_quantity,
    
    -- Physical Stock (total on hand)
    SUM(CASE 
        WHEN movement_type NOT IN ('RESERVATION') 
        THEN quantity 
        ELSE 0 
    END) AS physical_quantity,
    
    -- Stock Value (FIFO/Average Cost)
    SUM(total_cost) AS stock_value,
    
    -- Last Movement
    MAX(created_at) AS last_movement_at
    
FROM stock_ledger
GROUP BY tenant_id, product_id, location_id;

-- Indexes on Materialized View
CREATE UNIQUE INDEX idx_stock_levels_unique ON stock_levels(tenant_id, product_id, location_id);
CREATE INDEX idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX idx_stock_levels_location ON stock_levels(location_id);
CREATE INDEX idx_stock_levels_low_stock ON stock_levels(available_quantity) WHERE available_quantity < 10;

-- Refresh Strategy: Use triggers or scheduled refresh
-- For real-time: REFRESH MATERIALIZED VIEW CONCURRENTLY stock_levels;
```

#### `stock_reorder_rules`
Defines reorder thresholds and quantities per product per location.

```sql
CREATE TABLE stock_reorder_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    
    -- Reorder Thresholds
    minimum_quantity NUMERIC NOT NULL DEFAULT 0, -- Alert when stock falls below this
    reorder_quantity NUMERIC NOT NULL DEFAULT 0, -- Suggested order quantity
    maximum_quantity NUMERIC, -- Optional: maximum stock level
    
    -- Supplier Information
    preferred_supplier_id UUID REFERENCES suppliers(id),
    supplier_lead_time_days INTEGER DEFAULT 7,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, product_id, location_id)
);

CREATE INDEX idx_reorder_rules_tenant ON stock_reorder_rules(tenant_id);
CREATE INDEX idx_reorder_rules_product ON stock_reorder_rules(product_id);
CREATE INDEX idx_reorder_rules_location ON stock_reorder_rules(location_id);
```

#### `stock_transfers`
Manages stock transfers between locations.

```sql
CREATE TABLE stock_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    transfer_number TEXT NOT NULL, -- Human-readable reference
    
    from_location_id UUID NOT NULL REFERENCES stock_locations(id),
    to_location_id UUID NOT NULL REFERENCES stock_locations(id),
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',    -- Created but not approved
        'APPROVED',   -- Approved, ready to ship
        'IN_TRANSIT', -- Shipped but not received
        'RECEIVED',   -- Fully received
        'CANCELLED'   -- Cancelled
    )),
    
    -- Workflow
    requested_by UUID REFERENCES staff(id),
    approved_by UUID REFERENCES staff(id),
    shipped_by UUID REFERENCES staff(id),
    received_by UUID REFERENCES staff(id),
    
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, transfer_number),
    CHECK (from_location_id != to_location_id)
);

CREATE INDEX idx_stock_transfers_tenant ON stock_transfers(tenant_id);
CREATE INDEX idx_stock_transfers_from ON stock_transfers(from_location_id);
CREATE INDEX idx_stock_transfers_to ON stock_transfers(to_location_id);
CREATE INDEX idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX idx_stock_transfers_created ON stock_transfers(created_at DESC);
```

#### `stock_transfer_items`
Line items for stock transfers.

```sql
CREATE TABLE stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    quantity_requested NUMERIC NOT NULL,
    quantity_shipped NUMERIC DEFAULT 0,
    quantity_received NUMERIC DEFAULT 0,
    
    unit_cost NUMERIC, -- For valuation
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CHECK (quantity_requested > 0),
    CHECK (quantity_shipped >= 0 AND quantity_shipped <= quantity_requested),
    CHECK (quantity_received >= 0 AND quantity_received <= quantity_shipped)
);

CREATE INDEX idx_transfer_items_transfer ON stock_transfer_items(transfer_id);
CREATE INDEX idx_transfer_items_product ON stock_transfer_items(product_id);
```

#### `purchase_orders` (Enhanced)
Links to incoming stock.

```sql
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    po_number TEXT NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    destination_location_id UUID NOT NULL REFERENCES stock_locations(id),
    
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'
    )),
    
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    
    subtotal NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    
    created_by UUID REFERENCES staff(id),
    approved_by UUID REFERENCES staff(id),
    
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, po_number)
);

CREATE INDEX idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_location ON purchase_orders(destination_location_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
```

#### `purchase_order_items`

```sql
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    quantity_ordered NUMERIC NOT NULL,
    quantity_received NUMERIC DEFAULT 0,
    
    unit_cost NUMERIC NOT NULL,
    line_total NUMERIC GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CHECK (quantity_ordered > 0),
    CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered)
);

CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_product ON purchase_order_items(product_id);
```

#### `stock_reservations`
Tracks reserved stock for quotes, pending orders, or technician bookings.

```sql
CREATE TABLE stock_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    
    quantity NUMERIC NOT NULL,
    
    reservation_type TEXT NOT NULL CHECK (reservation_type IN (
        'QUOTE', 'PENDING_ORDER', 'TECHNICIAN_BOOKING', 'MANUAL'
    )),
    
    reference_id UUID, -- Quote ID, Order ID, etc.
    
    reserved_by UUID REFERENCES staff(id),
    reserved_for TEXT, -- Customer name or description
    
    expires_at TIMESTAMP WITH TIME ZONE, -- Auto-release after this time
    
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED')),
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    released_at TIMESTAMP WITH TIME ZONE,
    
    CHECK (quantity > 0)
);

CREATE INDEX idx_reservations_tenant ON stock_reservations(tenant_id);
CREATE INDEX idx_reservations_product_location ON stock_reservations(product_id, location_id);
CREATE INDEX idx_reservations_status ON stock_reservations(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_reservations_expires ON stock_reservations(expires_at) WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;
```

---

## Entity Relationships

```
┌─────────────────┐
│    tenants      │
└────────┬────────┘
         │
         ├──────────────────────────────────────────────┐
         │                                              │
┌────────▼────────┐                           ┌────────▼────────┐
│     stores      │                           │   suppliers     │
└────────┬────────┘                           └────────┬────────┘
         │                                              │
         │                                              │
┌────────▼────────────┐                                │
│ stock_locations     │                                │
│ - STORE             │                                │
│ - WAREHOUSE         │                                │
│ - TRANSIT           │                                │
└────────┬────────────┘                                │
         │                                              │
         │                                              │
         ├──────────────────────────────────────────────┼──────────────┐
         │                                              │              │
┌────────▼────────────┐                       ┌────────▼────────┐     │
│  stock_ledger       │◄──────────────────────│ purchase_orders │     │
│  (IMMUTABLE)        │                       └────────┬────────┘     │
│                     │                                │              │
│ - Movement Type     │                       ┌────────▼────────────┐ │
│ - Quantity          │                       │ purchase_order_items│ │
│ - Product           │                       └─────────────────────┘ │
│ - Location          │                                               │
│ - Reference         │                                               │
│ - Cost              │                                               │
└────────┬────────────┘                                               │
         │                                                            │
         │ (Aggregated)                                               │
         │                                                            │
┌────────▼────────────┐                       ┌────────────────────┐ │
│  stock_levels       │                       │ stock_transfers    │◄┘
│  (MATERIALIZED)     │                       └────────┬───────────┘
│                     │                                │
│ - Available Qty     │                       ┌────────▼──────────────┐
│ - Reserved Qty      │                       │ stock_transfer_items  │
│ - Damaged Qty       │                       └───────────────────────┘
│ - Physical Qty      │
│ - Stock Value       │
└────────┬────────────┘
         │
         │
┌────────▼────────────────┐              ┌─────────────────────┐
│ stock_reorder_rules     │              │ stock_reservations  │
│                         │              │                     │
│ - Min Quantity          │              │ - Quote             │
│ - Reorder Quantity      │              │ - Pending Order     │
│ - Preferred Supplier    │              │ - Technician        │
└─────────────────────────┘              └─────────────────────┘
```

---

## API Structure

### REST API Endpoints

#### Stock Levels

```typescript
// Get current stock levels
GET /api/v1/stock/levels
Query Parameters:
  - tenant_id: UUID (required)
  - location_id: UUID (optional)
  - product_id: UUID (optional)
  - low_stock: boolean (optional) - only show items below reorder level
  - include_reserved: boolean (default: true)
  - include_damaged: boolean (default: true)

Response:
{
  "data": [
    {
      "product_id": "uuid",
      "product": {
        "name": "Compressor Motor 1.5HP",
        "sku": "COMP-150",
        "barcode": "1234567890"
      },
      "location_id": "uuid",
      "location": {
        "name": "Main Store",
        "type": "STORE"
      },
      "available_quantity": 15,
      "reserved_quantity": 3,
      "damaged_quantity": 1,
      "physical_quantity": 19,
      "stock_value": 2850.00,
      "reorder_rule": {
        "minimum_quantity": 10,
        "reorder_quantity": 20,
        "needs_reorder": false
      },
      "last_movement_at": "2026-02-12T10:30:00Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "per_page": 50
  }
}
```

```typescript
// Get stock level for specific product across all locations
GET /api/v1/stock/levels/product/:product_id
Response:
{
  "product_id": "uuid",
  "total_available": 45,
  "total_reserved": 8,
  "total_physical": 53,
  "locations": [
    {
      "location_id": "uuid",
      "location_name": "Main Store",
      "available": 15,
      "reserved": 3,
      "physical": 18
    },
    {
      "location_id": "uuid",
      "location_name": "Warehouse",
      "available": 30,
      "reserved": 5,
      "physical": 35
    }
  ]
}
```

#### Stock Movements

```typescript
// Record stock movement
POST /api/v1/stock/movements
Body:
{
  "tenant_id": "uuid",
  "movement_type": "ADJUSTMENT_IN",
  "product_id": "uuid",
  "location_id": "uuid",
  "quantity": 10,
  "unit_cost": 45.50,
  "reason": "Stocktake adjustment",
  "notes": "Found 10 units in back room",
  "performed_by": "staff_uuid"
}

Response:
{
  "movement_id": "uuid",
  "created_at": "2026-02-12T10:30:00Z",
  "new_stock_level": {
    "available": 25,
    "physical": 25
  }
}
```

```typescript
// Get movement history
GET /api/v1/stock/movements
Query Parameters:
  - tenant_id: UUID (required)
  - product_id: UUID (optional)
  - location_id: UUID (optional)
  - movement_type: string (optional)
  - from_date: ISO8601 (optional)
  - to_date: ISO8601 (optional)
  - page: integer
  - per_page: integer

Response:
{
  "data": [
    {
      "id": "uuid",
      "movement_type": "SALE",
      "product": { "name": "...", "sku": "..." },
      "location": { "name": "..." },
      "quantity": -2,
      "unit_cost": 45.50,
      "reference_type": "TRANSACTION",
      "reference_id": "uuid",
      "performed_by": { "name": "John Doe" },
      "created_at": "2026-02-12T10:30:00Z"
    }
  ]
}
```

#### Stock Transfers

```typescript
// Create transfer request
POST /api/v1/stock/transfers
Body:
{
  "tenant_id": "uuid",
  "from_location_id": "uuid",
  "to_location_id": "uuid",
  "requested_by": "staff_uuid",
  "items": [
    {
      "product_id": "uuid",
      "quantity": 5
    }
  ],
  "notes": "Urgent transfer for customer order"
}

Response:
{
  "transfer_id": "uuid",
  "transfer_number": "TRF-2026-001",
  "status": "PENDING",
  "created_at": "2026-02-12T10:30:00Z"
}
```

```typescript
// Approve transfer
POST /api/v1/stock/transfers/:id/approve
Body:
{
  "approved_by": "staff_uuid"
}
```

```typescript
// Ship transfer (creates TRANSFER_OUT movement)
POST /api/v1/stock/transfers/:id/ship
Body:
{
  "shipped_by": "staff_uuid",
  "items": [
    {
      "product_id": "uuid",
      "quantity_shipped": 5
    }
  ]
}
```

```typescript
// Receive transfer (creates TRANSFER_IN movement)
POST /api/v1/stock/transfers/:id/receive
Body:
{
  "received_by": "staff_uuid",
  "items": [
    {
      "product_id": "uuid",
      "quantity_received": 5
    }
  ]
}
```

#### Stock Reservations

```typescript
// Create reservation
POST /api/v1/stock/reservations
Body:
{
  "tenant_id": "uuid",
  "product_id": "uuid",
  "location_id": "uuid",
  "quantity": 2,
  "reservation_type": "QUOTE",
  "reference_id": "quote_uuid",
  "reserved_by": "staff_uuid",
  "reserved_for": "Customer ABC",
  "expires_at": "2026-02-15T00:00:00Z"
}
```

```typescript
// Release reservation
POST /api/v1/stock/reservations/:id/release
```

#### Purchase Orders

```typescript
// Receive purchase order (creates PURCHASE_RECEIVE movements)
POST /api/v1/purchase-orders/:id/receive
Body:
{
  "received_by": "staff_uuid",
  "items": [
    {
      "po_item_id": "uuid",
      "quantity_received": 10,
      "unit_cost": 45.50
    }
  ]
}

// This automatically:
// 1. Creates stock_ledger entries (PURCHASE_RECEIVE)
// 2. Updates purchase_order_items.quantity_received
// 3. Updates purchase_order.status
// 4. Refreshes stock_levels materialized view
```

#### Reorder Alerts

```typescript
// Get low stock alerts
GET /api/v1/stock/alerts/low-stock
Query Parameters:
  - tenant_id: UUID (required)
  - location_id: UUID (optional)

Response:
{
  "data": [
    {
      "product": { "name": "...", "sku": "..." },
      "location": { "name": "..." },
      "current_stock": 5,
      "minimum_quantity": 10,
      "reorder_quantity": 20,
      "shortage": 5,
      "suggested_order": 20,
      "preferred_supplier": { "name": "...", "lead_time_days": 7 }
    }
  ]
}
```

---

## Stock Movement Workflows

### Workflow 1: Sale Transaction

```
1. Customer purchases 2x "Compressor Motor 1.5HP"
2. POS creates transaction record
3. System creates stock_ledger entry:
   - movement_type: 'SALE'
   - product_id: compressor_uuid
   - location_id: store_uuid
   - quantity: -2 (negative = outbound)
   - unit_cost: 45.50 (for COGS calculation)
   - reference_type: 'TRANSACTION'
   - reference_id: transaction_uuid
   - performed_by: cashier_uuid

4. Materialized view refreshes (or incremental update)
5. Stock level now shows: available_quantity = previous - 2
6. If stock falls below minimum, trigger low stock alert
```

### Workflow 2: Purchase Order Receiving

```
1. Supplier delivers 50x "Thermostat Digital"
2. Staff scans PO barcode
3. Staff scans product barcode and enters quantity received
4. System creates stock_ledger entry:
   - movement_type: 'PURCHASE_RECEIVE'
   - product_id: thermostat_uuid
   - location_id: warehouse_uuid
   - quantity: +50 (positive = inbound)
   - unit_cost: 12.30 (from PO)
   - reference_type: 'PURCHASE_ORDER'
   - reference_id: po_uuid

5. Update purchase_order_items.quantity_received
6. If fully received, update PO status to 'RECEIVED'
7. Refresh stock levels
```

### Workflow 3: Inter-Store Transfer

```
STEP 1: Request Transfer
- Store A requests 10x "Water Pump" from Warehouse
- Creates stock_transfer record (status: PENDING)
- Creates stock_transfer_items

STEP 2: Approval
- Manager approves transfer
- Updates status to 'APPROVED'

STEP 3: Ship from Warehouse
- Warehouse staff ships items
- System creates stock_ledger entry:
  - movement_type: 'TRANSFER_OUT'
  - location_id: warehouse_uuid
  - quantity: -10
  - transfer_id: transfer_uuid
  - to_location_id: store_a_uuid
- Updates transfer status to 'IN_TRANSIT'

STEP 4: Receive at Store A
- Store A staff receives items
- System creates stock_ledger entry:
  - movement_type: 'TRANSFER_IN'
  - location_id: store_a_uuid
  - quantity: +10
  - transfer_id: transfer_uuid (same as TRANSFER_OUT)
  - from_location_id: warehouse_uuid
- Updates transfer status to 'RECEIVED'

Note: Both movements share the same transfer_id for traceability
```

### Workflow 4: Stock Reservation

```
1. Sales person creates quote for customer
2. Quote includes 3x "Condenser Fan Motor"
3. System creates stock_reservation:
   - quantity: 3
   - reservation_type: 'QUOTE'
   - reference_id: quote_uuid
   - expires_at: NOW() + 7 days

4. System creates stock_ledger entry:
   - movement_type: 'RESERVATION'
   - quantity: -3 (reduces available, not physical)

5. Available stock = physical - reserved - damaged

SCENARIO A: Quote converts to sale
- Release reservation (creates RESERVATION_RELEASE movement)
- Process sale (creates SALE movement)

SCENARIO B: Quote expires
- Automated job releases expired reservations
- Creates RESERVATION_RELEASE movement
```

### Workflow 5: Damage Write-Off

```
1. Staff finds 2x damaged "Heating Element"
2. Manager approves write-off
3. System creates stock_ledger entry:
   - movement_type: 'DAMAGE_WRITE_OFF'
   - quantity: -2
   - reason: "Water damage during storage"
   - performed_by: manager_uuid

4. Damaged stock tracked separately
5. Physical quantity decreases
6. Available quantity decreases
```

---

## Data Consistency Strategy

### 1. Atomic Stock Operations

All stock movements must be wrapped in database transactions:

```sql
BEGIN;

-- 1. Insert movement
INSERT INTO stock_ledger (...) VALUES (...);

-- 2. Update related documents (if any)
UPDATE purchase_order_items SET quantity_received = ... WHERE id = ...;

-- 3. Refresh stock levels (incremental)
REFRESH MATERIALIZED VIEW CONCURRENTLY stock_levels;

-- 4. Check for negative stock (if not allowed)
SELECT available_quantity FROM stock_levels 
WHERE product_id = ... AND location_id = ...;

IF available_quantity < 0 AND NOT allow_negative_stock THEN
    ROLLBACK;
    RAISE EXCEPTION 'Insufficient stock';
END IF;

COMMIT;
```

### 2. Concurrency Control

Use PostgreSQL row-level locking for high-concurrency scenarios:

```sql
-- Lock product stock level for update
SELECT * FROM stock_levels 
WHERE product_id = ... AND location_id = ...
FOR UPDATE NOWAIT;

-- If lock fails, retry with exponential backoff
```

### 3. Materialized View Refresh Strategy

**Option A: Trigger-based Incremental Update**
```sql
CREATE OR REPLACE FUNCTION refresh_stock_level()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate only affected product+location
    DELETE FROM stock_levels 
    WHERE product_id = NEW.product_id 
      AND location_id = NEW.location_id;
    
    INSERT INTO stock_levels
    SELECT ... FROM stock_ledger
    WHERE product_id = NEW.product_id 
      AND location_id = NEW.location_id
    GROUP BY ...;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_stock_level
AFTER INSERT ON stock_ledger
FOR EACH ROW
EXECUTE FUNCTION refresh_stock_level();
```

**Option B: Scheduled Concurrent Refresh**
```sql
-- Every 5 minutes via cron job
REFRESH MATERIALIZED VIEW CONCURRENTLY stock_levels;
```

**Recommendation**: Use Option A for real-time accuracy, Option B for high-volume systems.

### 4. Idempotency

All API endpoints must be idempotent using idempotency keys:

```typescript
POST /api/v1/stock/movements
Headers:
  Idempotency-Key: unique-request-id

// Server checks if movement with this key already exists
// If yes, return existing movement
// If no, create new movement
```

### 5. Event Sourcing

Stock ledger acts as an event log. Never delete entries, only add compensating entries:

```
Wrong: DELETE FROM stock_ledger WHERE id = ...
Right: INSERT INTO stock_ledger (movement_type = 'ADJUSTMENT_IN', quantity = +2, reason = 'Reversal of incorrect adjustment')
```

---

## Scalability Considerations

### 1. Database Partitioning

Partition `stock_ledger` by tenant_id and created_at:

```sql
CREATE TABLE stock_ledger (
    ...
) PARTITION BY RANGE (created_at);

CREATE TABLE stock_ledger_2026_01 PARTITION OF stock_ledger
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE stock_ledger_2026_02 PARTITION OF stock_ledger
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Auto-create partitions monthly
```

### 2. Read Replicas

- Direct all stock level queries to read replicas
- Direct all movements to primary database
- Use connection pooling (PgBouncer)

### 3. Caching Strategy

```typescript
// Cache stock levels in Redis with 30-second TTL
const cacheKey = `stock:${tenantId}:${productId}:${locationId}`;

// On read:
let stock = await redis.get(cacheKey);
if (!stock) {
    stock = await db.query('SELECT * FROM stock_levels WHERE ...');
    await redis.setex(cacheKey, 30, JSON.stringify(stock));
}

// On write (movement):
await db.insert('stock_ledger', movement);
await redis.del(cacheKey); // Invalidate cache
```

### 4. Async Processing

Use message queues for non-critical operations:

```
Movement Created → Queue → [
    - Send low stock alerts
    - Update analytics
    - Generate reports
    - Sync to external systems
]
```

### 5. Archive Old Movements

Archive movements older than 2 years to separate table:

```sql
CREATE TABLE stock_ledger_archive (LIKE stock_ledger);

-- Monthly job
INSERT INTO stock_ledger_archive
SELECT * FROM stock_ledger
WHERE created_at < NOW() - INTERVAL '2 years';

DELETE FROM stock_ledger
WHERE created_at < NOW() - INTERVAL '2 years';
```

---

## Edge Case Handling

### 1. Negative Stock

**Scenario**: Customer orders 10 units but only 8 available.

**Solution**:
```sql
-- Check before sale
SELECT available_quantity FROM stock_levels
WHERE product_id = ... AND location_id = ...;

IF available_quantity < requested_quantity THEN
    IF allow_backorders THEN
        -- Create sale with negative stock
        -- Create automatic purchase order
    ELSE
        RAISE EXCEPTION 'Insufficient stock';
    END IF;
END IF;
```

### 2. Concurrent Sales

**Scenario**: Two cashiers sell the last item simultaneously.

**Solution**: Use row-level locking
```sql
BEGIN;

-- Lock stock level
SELECT available_quantity FROM stock_levels
WHERE product_id = ... AND location_id = ...
FOR UPDATE;

-- Check availability
IF available_quantity >= 1 THEN
    INSERT INTO stock_ledger (...);
    COMMIT;
ELSE
    ROLLBACK;
    RAISE EXCEPTION 'Out of stock';
END IF;
```

### 3. Transfer In-Transit Loss

**Scenario**: Items lost during transfer.

**Solution**:
```sql
-- Receive partial quantity
POST /api/v1/stock/transfers/:id/receive
{
    "items": [
        {
            "product_id": "uuid",
            "quantity_received": 8, // Only 8 of 10 received
            "notes": "2 units damaged in transit"
        }
    ]
}

-- System creates:
-- 1. TRANSFER_IN movement (+8)
-- 2. DAMAGE_WRITE_OFF movement (-2) at destination
-- 3. Insurance claim record (optional)
```

### 4. Stocktake Discrepancies

**Scenario**: Physical count doesn't match system.

**Solution**:
```sql
-- Record actual count
POST /api/v1/stock/stocktake
{
    "location_id": "uuid",
    "counted_items": [
        {
            "product_id": "uuid",
            "physical_count": 45,
            "system_count": 50,
            "variance": -5
        }
    ]
}

-- System creates ADJUSTMENT_OUT movement for variance
-- Flags for manager review if variance > threshold
```

### 5. Reservation Expiry

**Scenario**: Quote expires but reservation not released.

**Solution**: Automated cleanup job
```sql
-- Cron job every hour
SELECT * FROM stock_reservations
WHERE status = 'ACTIVE'
  AND expires_at < NOW();

-- For each expired reservation:
BEGIN;
    INSERT INTO stock_ledger (
        movement_type = 'RESERVATION_RELEASE',
        quantity = reservation.quantity,
        ...
    );
    
    UPDATE stock_reservations
    SET status = 'EXPIRED', released_at = NOW()
    WHERE id = reservation.id;
COMMIT;
```

### 6. Duplicate Movements

**Scenario**: Network retry causes duplicate sale.

**Solution**: Idempotency keys
```sql
CREATE TABLE idempotency_log (
    key TEXT PRIMARY KEY,
    response JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- On API request:
IF EXISTS (SELECT 1 FROM idempotency_log WHERE key = request.idempotency_key) THEN
    RETURN cached_response;
ELSE
    process_movement();
    INSERT INTO idempotency_log (key, response) VALUES (...);
END IF;
```

### 7. Multi-Currency Costing

**Scenario**: Products purchased in different currencies.

**Solution**:
```sql
ALTER TABLE stock_ledger ADD COLUMN currency TEXT DEFAULT 'USD';
ALTER TABLE stock_ledger ADD COLUMN exchange_rate NUMERIC DEFAULT 1.0;
ALTER TABLE stock_ledger ADD COLUMN base_currency_cost NUMERIC 
    GENERATED ALWAYS AS (unit_cost * exchange_rate) STORED;

-- All valuations use base_currency_cost
```

---

## Indexing Strategy

### Critical Indexes (Already Defined Above)

```sql
-- Stock Ledger (most queried table)
CREATE INDEX idx_stock_ledger_tenant ON stock_ledger(tenant_id);
CREATE INDEX idx_stock_ledger_product_location ON stock_ledger(product_id, location_id);
CREATE INDEX idx_stock_ledger_created ON stock_ledger(created_at DESC);
CREATE INDEX idx_stock_ledger_reference ON stock_ledger(reference_type, reference_id);

-- Stock Levels (real-time queries)
CREATE UNIQUE INDEX idx_stock_levels_unique ON stock_levels(tenant_id, product_id, location_id);
CREATE INDEX idx_stock_levels_low_stock ON stock_levels(available_quantity) 
WHERE available_quantity < 10;

-- Transfers (workflow queries)
CREATE INDEX idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX idx_stock_transfers_created ON stock_transfers(created_at DESC);

-- Reservations (expiry cleanup)
CREATE INDEX idx_reservations_expires ON stock_reservations(expires_at) 
WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;
```

### Composite Indexes for Common Queries

```sql
-- "Show me all low stock items at this location"
CREATE INDEX idx_stock_levels_location_low 
ON stock_levels(location_id, available_quantity)
WHERE available_quantity < minimum_quantity;

-- "Show me all movements for this product today"
CREATE INDEX idx_stock_ledger_product_date 
ON stock_ledger(product_id, created_at DESC);

-- "Show me all pending transfers from this location"
CREATE INDEX idx_transfers_from_status 
ON stock_transfers(from_location_id, status)
WHERE status IN ('PENDING', 'APPROVED');
```

### Partial Indexes (Performance Optimization)

```sql
-- Only index active reservations
CREATE INDEX idx_active_reservations 
ON stock_reservations(product_id, location_id)
WHERE status = 'ACTIVE';

-- Only index recent movements (last 90 days)
CREATE INDEX idx_recent_movements 
ON stock_ledger(created_at DESC)
WHERE created_at > NOW() - INTERVAL '90 days';
```

---

## Security & Multi-Tenancy

### 1. Row-Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's data
CREATE POLICY tenant_isolation ON stock_ledger
FOR ALL
TO authenticated_users
USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Policy: Staff can only see their assigned locations
CREATE POLICY location_access ON stock_ledger
FOR SELECT
TO pos_users
USING (
    location_id IN (
        SELECT location_id FROM staff_location_assignments
        WHERE staff_id = current_setting('app.current_user_id')::UUID
    )
);
```

### 2. Role-Based Permissions

```sql
-- Roles
CREATE ROLE pos_cashier;
CREATE ROLE pos_manager;
CREATE ROLE warehouse_staff;
CREATE ROLE system_admin;

-- Permissions
GRANT SELECT ON stock_levels TO pos_cashier;
GRANT INSERT ON stock_ledger TO pos_cashier; -- Only for SALE movements

GRANT ALL ON stock_ledger TO pos_manager;
GRANT ALL ON stock_transfers TO pos_manager;

GRANT ALL ON ALL TABLES TO system_admin;
```

### 3. Audit Logging

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    performed_by UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Trigger on sensitive tables
CREATE TRIGGER audit_stock_movements
AFTER INSERT OR UPDATE OR DELETE ON stock_ledger
FOR EACH ROW EXECUTE FUNCTION log_audit();
```

### 4. API Rate Limiting

```typescript
// Per tenant rate limits
const rateLimits = {
    'stock/movements': '100 requests per minute',
    'stock/levels': '1000 requests per minute',
    'stock/transfers': '50 requests per minute'
};

// Implement using Redis
const key = `rate_limit:${tenantId}:${endpoint}`;
const count = await redis.incr(key);
if (count === 1) {
    await redis.expire(key, 60); // 1 minute window
}
if (count > limit) {
    throw new Error('Rate limit exceeded');
}
```

### 5. Data Encryption

```sql
-- Encrypt sensitive fields
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt notes/reason fields
ALTER TABLE stock_ledger 
ADD COLUMN notes_encrypted BYTEA;

-- Application-level encryption for PII
-- Use AES-256 with tenant-specific keys
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create database schema
- [ ] Implement RLS policies
- [ ] Set up partitioning
- [ ] Create materialized views
- [ ] Implement trigger-based refresh

### Phase 2: Core APIs
- [ ] Stock levels API
- [ ] Stock movements API
- [ ] Purchase receiving API
- [ ] Basic reporting API

### Phase 3: Advanced Features
- [ ] Stock transfers workflow
- [ ] Reservation system
- [ ] Reorder alerts
- [ ] Stocktake module

### Phase 4: Optimization
- [ ] Implement caching
- [ ] Set up read replicas
- [ ] Add monitoring/alerting
- [ ] Performance testing

### Phase 5: Integration
- [ ] POS integration
- [ ] Supplier portal integration
- [ ] Mobile app support
- [ ] Offline sync

---

## Performance Benchmarks

Target performance metrics for production:

| Operation | Target | Notes |
|-----------|--------|-------|
| Stock level query | < 50ms | Single product, single location |
| Stock level query (all products) | < 500ms | All products at one location |
| Record sale movement | < 100ms | Including stock update |
| Transfer creation | < 200ms | Including validation |
| Low stock report | < 1s | Across all locations |
| Movement history query | < 500ms | Last 30 days, paginated |

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Stock Accuracy**
   - Variance between physical and system stock
   - Frequency of adjustments
   - Stocktake discrepancy rate

2. **Performance**
   - Average query response time
   - Movement processing time
   - Materialized view refresh duration

3. **Business Metrics**
   - Stock turnover rate
   - Dead stock value
   - Reorder alert response time
   - Transfer completion time

### Alert Thresholds

```yaml
alerts:
  critical:
    - negative_stock_detected
    - movement_processing_failed
    - stock_sync_delay > 5 minutes
  
  warning:
    - low_stock_items > 50
    - pending_transfers > 100
    - expired_reservations > 20
    - stocktake_variance > 5%
```

---

## Conclusion

This Stock Level Management system provides:

✅ **Accuracy**: Immutable ledger ensures data integrity  
✅ **Traceability**: Full audit trail of all movements  
✅ **Scalability**: Partitioned tables, caching, read replicas  
✅ **Security**: Multi-tenant isolation with RLS  
✅ **Performance**: Optimized indexes and materialized views  
✅ **Flexibility**: Supports complex workflows and edge cases  

The system is production-ready and can handle thousands of SKUs across multiple stores with high-concurrency POS transactions.

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12  
**Next Review:** 2026-03-12
