import type {
  CustomerRecord,
  DashboardLayout,
  InventoryAlert,
  InventorySnapshot,
  PurchaseBill,
  SalesBill,
  SlabLot,
  StockTransfer,
  StoneCategory,
  SupplierRecord,
  UnitType,
  UserProfile,
  VarianceItem,
} from '../types/inventory';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    credentials: 'include',
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as {error?: string}).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getMe: () => requestJson<{user: UserProfile | null}>('/api/auth/me'),

  login: (email: string, password: string) =>
    requestJson<{user: UserProfile}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({email, password}),
    }),

  register: (payload: {name: string; email: string; password: string; role: string}) =>
    requestJson<{user: UserProfile}>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginDemo: () =>
    requestJson<{user: UserProfile}>('/api/auth/demo', {
      method: 'POST',
    }),

  logout: () =>
    requestJson<{ok: boolean}>('/api/auth/logout', {
      method: 'POST',
    }),

  getLayout: () => requestJson<{layout: DashboardLayout}>('/api/layout'),

  saveLayout: (layout: Partial<DashboardLayout>) =>
    requestJson<{layout: DashboardLayout}>('/api/layout', {
      method: 'PUT',
      body: JSON.stringify(layout),
    }),

  resetLayout: () =>
    requestJson<{layout: DashboardLayout}>('/api/layout/reset', {
      method: 'POST',
    }),

  getSnapshot: () => requestJson<InventorySnapshot>('/api/inventory/snapshot'),

  reconcileItem: (itemId: string, newPhysicalQty: number, reason: string) =>
    requestJson<{item: VarianceItem; snapshot: InventorySnapshot}>('/api/inventory/adjustments', {
      method: 'POST',
      body: JSON.stringify({itemId, newPhysicalQty, reason}),
    }),

  createProduct: (payload: {
    itemCode: string;
    itemName: string;
    dimensions: string;
    category: StoneCategory;
    finish: VarianceItem['finish'];
    thickness: string;
    locationId: string;
    unit: UnitType;
    qty: number;
    unitPriceInr: number;
    imageUrl?: string;
  }) =>
    requestJson<{item: VarianceItem; snapshot: InventorySnapshot}>('/api/inventory/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProduct: (
    itemId: string,
    payload: {
      itemName: string;
      dimensions: string;
      category: StoneCategory;
      finish: VarianceItem['finish'];
      thickness: string;
      locationId: string;
      unitPriceInr: number;
      imageUrl?: string;
    },
  ) =>
    requestJson<{item: VarianceItem; snapshot: InventorySnapshot}>(
      `/api/inventory/products/${itemId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  toggleProductEnabled: (itemId: string) =>
    requestJson<{item: VarianceItem; snapshot: InventorySnapshot}>(
      `/api/inventory/products/${itemId}/toggle`,
      {
        method: 'PATCH',
      },
    ),

  deleteProduct: (itemId: string) =>
    requestJson<{deletedId: string; itemCode: string; snapshot: InventorySnapshot}>(
      `/api/inventory/products/${itemId}`,
      {
        method: 'DELETE',
      },
    ),

  createSlabLot: (payload: {
    stoneName: string;
    category: StoneCategory;
    dimensionsFt: string;
    slabCountPcs: number;
    totalSqFt: number;
    thicknessMm: number;
    branchName: string;
    finish: 'Polished' | 'Honed' | 'Leather';
  }) =>
    requestJson<{slab: SlabLot; snapshot: InventorySnapshot}>('/api/inventory/slabs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSlabLot: (
    slabId: string,
    payload: {
      stoneName: string;
      category: StoneCategory;
      dimensionsFt: string;
      slabCountPcs: number;
      totalSqFt: number;
      thicknessMm: number;
      branchName: string;
      finish: SlabLot['finish'];
      status: SlabLot['status'];
    },
  ) =>
    requestJson<{slab: SlabLot; snapshot: InventorySnapshot}>(`/api/inventory/slabs/${slabId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  createPurchaseBill: (payload: {
    supplierName: string;
    branchName: string;
    itemCode: string;
    qty: number;
    unit: UnitType;
    totalInr: number;
  }) =>
    requestJson<{bill: PurchaseBill; snapshot: InventorySnapshot}>(
      '/api/inventory/purchase-bills',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  createSalesBill: (payload: {
    customerName: string;
    branchName: string;
    itemCode: string;
    qty: number;
    unit: UnitType;
    totalInr: number;
  }) =>
    requestJson<{bill: SalesBill; snapshot: InventorySnapshot}>('/api/inventory/sales-bills', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createTransfer: (payload: {
    itemCode: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }) =>
    requestJson<{transfer: StockTransfer; snapshot: InventorySnapshot}>('/api/inventory/transfers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createCustomer: (payload: {
    name: string;
    segment: CustomerRecord['segment'];
    phone: string;
    city: string;
  }) =>
    requestJson<{customer: CustomerRecord; snapshot: InventorySnapshot}>(
      '/api/inventory/customers',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  createSupplier: (payload: {
    name: string;
    origin: string;
    specialty: string;
    phone: string;
  }) =>
    requestJson<{supplier: SupplierRecord; snapshot: InventorySnapshot}>(
      '/api/inventory/suppliers',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  toggleAcknowledgeAlert: (alertId: string) =>
    requestJson<{alert: InventoryAlert; snapshot: InventorySnapshot}>(
      `/api/inventory/alerts/${alertId}/acknowledge`,
      {method: 'POST'},
    ),
};
