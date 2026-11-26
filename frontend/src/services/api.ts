import type {
  CustomerRecord,
  DashboardLayout,
  InventoryAlert,
  InventorySnapshot,
  PurchaseBill,
  PurchaseReturn,
  SalesBill,
  SalesPaymentStatus,
  SalesReturn,
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
      'X-Requested-With': 'XMLHttpRequest',
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

  uploadImage: async (
    file: File,
    folder: 'products' | 'slabs' = 'products',
  ): Promise<{url: string; provider: 'imagekit' | 'inline-fallback'; path: string}> => {
    const formData = new FormData();
    formData.append('folder', folder);
    formData.append('image', file);
    const res = await fetch('/api/inventory/uploads/image', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data as {error?: string}).error || `Image upload failed (${res.status})`);
    }
    return data as {url: string; provider: 'imagekit' | 'inline-fallback'; path: string};
  },

  createSlabLot: (payload: {
    lotNumber?: string;
    stoneName: string;
    category: StoneCategory;
    dimensionsFt: string;
    slabCountPcs: number;
    totalSqFt: number;
    thicknessMm: number;
    branchName: string;
    finish: 'Polished' | 'Honed' | 'Leather';
    status: SlabLot['status'];
    imageUrl?: string;
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
      imageUrl?: string;
    },
  ) =>
    requestJson<{slab: SlabLot; snapshot: InventorySnapshot}>(`/api/inventory/slabs/${slabId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  toggleSlabEnabled: (slabId: string) =>
    requestJson<{slab: SlabLot; snapshot: InventorySnapshot}>(
      `/api/inventory/slabs/${slabId}/toggle`,
      {
        method: 'PATCH',
      },
    ),

  deleteSlabLot: (slabId: string) =>
    requestJson<{deletedId: string; lotNumber: string; snapshot: InventorySnapshot}>(
      `/api/inventory/slabs/${slabId}`,
      {
        method: 'DELETE',
      },
    ),

  createPurchaseBill: (payload: {
    billNo: string;
    supplierName: string;
    branchName: string;
    status: PurchaseBill['status'];
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
    }>;
  }) =>
    requestJson<{bill: PurchaseBill; snapshot: InventorySnapshot}>(
      '/api/inventory/purchase-bills',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  updatePurchaseBill: (
    billId: string,
    payload: {
      billNo: string;
      supplierName: string;
      branchName: string;
      status: PurchaseBill['status'];
      dateLabel: string;
      dateIso?: string;
      items: Array<{
        itemCode: string;
        qty: number;
        unit: UnitType;
        amountInr: number;
      }>;
    },
  ) =>
    requestJson<{bill: PurchaseBill; snapshot: InventorySnapshot}>(
      `/api/inventory/purchase-bills/${billId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  createPurchaseReturn: (payload: {
    returnNo: string;
    supplierName: string;
    branchName: string;
    purchaseBillId?: string;
    reason: string;
    notes?: string;
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
      reason?: string;
    }>;
  }) =>
    requestJson<{purchaseReturn: PurchaseReturn; snapshot: InventorySnapshot}>(
      '/api/inventory/returns',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  createSalesReturn: (payload: {
    returnNo: string;
    customerName: string;
    branchName: string;
    salesBillId?: string;
    reason: string;
    notes?: string;
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
      reason?: string;
    }>;
  }) =>
    requestJson<{salesReturn: SalesReturn; snapshot: InventorySnapshot}>(
      '/api/inventory/sales-returns',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  createSalesBill: (payload: {
    invoiceNo: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    branchName: string;
    dateLabel: string;
    dateIso?: string;
    items: Array<{
      itemCode: string;
      qty: number;
      unit: UnitType;
      amountInr: number;
      status: SalesPaymentStatus;
    }>;
  }) =>
    requestJson<{bill: SalesBill; snapshot: InventorySnapshot}>('/api/inventory/sales-bills', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSalesBill: (
    billId: string,
    payload: {
      invoiceNo: string;
      customerName: string;
      customerPhone: string;
      customerAddress: string;
      branchName: string;
      dateLabel: string;
      dateIso?: string;
      items: Array<{
        itemCode: string;
        qty: number;
        unit: UnitType;
        amountInr: number;
        status: SalesPaymentStatus;
      }>;
    },
  ) =>
    requestJson<{bill: SalesBill; snapshot: InventorySnapshot}>(
      `/api/inventory/sales-bills/${billId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

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

  updateSupplier: (
    supplierId: string,
    payload: {
      name: string;
      origin: string;
      specialty: string;
      phone: string;
    },
  ) =>
    requestJson<{supplier: SupplierRecord; snapshot: InventorySnapshot}>(
      `/api/inventory/suppliers/${supplierId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  deleteSupplier: (supplierId: string) =>
    requestJson<{deletedId: string; name: string; snapshot: InventorySnapshot}>(
      `/api/inventory/suppliers/${supplierId}`,
      {
        method: 'DELETE',
      },
    ),

  toggleAcknowledgeAlert: (alertId: string) =>
    requestJson<{alert: InventoryAlert; snapshot: InventorySnapshot}>(
      `/api/inventory/alerts/${alertId}/acknowledge`,
      {method: 'POST'},
    ),
};
