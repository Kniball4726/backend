import { IndexSpecification, CreateIndexesOptions } from 'mongodb';
import { COLLECTION_NAMES } from '../json-schemas/collections.json-schema';

export interface CollectionIndexDefinition {
  collection: string;
  key: IndexSpecification;
  options: CreateIndexesOptions;
}

/**
 * Capa DB-First: Índices estratégicos para el POS móvil, el CRM y el módulo MASTER.
 */
export const MONGO_COLLECTION_INDEXES: CollectionIndexDefinition[] = [
  // USERS
  {
    collection: COLLECTION_NAMES.USERS,
    key: { email: 1 },
    options: { name: 'idx_users_email_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.USERS,
    key: { role: 1, isActive: 1 },
    options: { name: 'idx_users_role_active' },
  },

  // CUSTOMERS (CRM)
  {
    collection: COLLECTION_NAMES.CUSTOMERS,
    key: { email: 1 },
    options: { name: 'idx_customers_email_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.CUSTOMERS,
    key: { fullName: 1 },
    options: { name: 'idx_customers_fullname' },
  },
  {
    collection: COLLECTION_NAMES.CUSTOMERS,
    key: { 'activeDiscount.isAvailable': 1, updatedAt: -1 },
    options: { name: 'idx_customers_active_discount' },
  },
  {
    collection: COLLECTION_NAMES.CUSTOMERS,
    key: { updatedAt: 1, _id: 1 },
    options: { name: 'idx_customers_delta_sync' },
  },

  // CATEGORIES
  {
    collection: COLLECTION_NAMES.CATEGORIES,
    key: { slug: 1 },
    options: { name: 'idx_categories_slug_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.CATEGORIES,
    key: { updatedAt: 1, _id: 1 },
    options: { name: 'idx_categories_delta_sync' },
  },

  // PRODUCTS
  {
    collection: COLLECTION_NAMES.PRODUCTS,
    key: { sku: 1 },
    options: { name: 'idx_products_sku_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.PRODUCTS,
    key: { barcode: 1 },
    options: {
      name: 'idx_products_barcode_unique_sparse',
      unique: true,
      partialFilterExpression: { barcode: { $type: 'string' } },
    },
  },
  {
    collection: COLLECTION_NAMES.PRODUCTS,
    key: { categoryId: 1, isActive: 1 },
    options: { name: 'idx_products_category_active' },
  },
  {
    collection: COLLECTION_NAMES.PRODUCTS,
    key: { updatedAt: 1, _id: 1 },
    options: { name: 'idx_products_delta_sync' },
  },

  // INVENTORY MOVEMENTS (Kardex)
  {
    collection: COLLECTION_NAMES.INVENTORY_MOVEMENTS,
    key: { productId: 1, createdAt: -1 },
    options: { name: 'idx_inventory_product_history' },
  },
  {
    collection: COLLECTION_NAMES.INVENTORY_MOVEMENTS,
    key: { referenceId: 1 },
    options: { name: 'idx_inventory_reference' },
  },

  // SALES (POS)
  {
    collection: COLLECTION_NAMES.SALES,
    key: { idempotencyKey: 1 },
    options: { name: 'idx_sales_idempotency_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.SALES,
    key: { receiptNumber: 1 },
    options: { name: 'idx_sales_receipt_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.SALES,
    key: { customerId: 1, createdAt: -1 },
    options: { name: 'idx_sales_customer_history' },
  },
  {
    collection: COLLECTION_NAMES.SALES,
    key: { cashierId: 1, createdAt: -1 },
    options: { name: 'idx_sales_cashier_history' },
  },

  // TREASURY (CASH REGISTERS & OPERATIONS)
  {
    collection: COLLECTION_NAMES.CASH_REGISTERS,
    key: { branch: 1, status: 1, openedAt: -1 },
    options: { name: 'idx_cash_registers_branch_status' },
  },
  {
    collection: COLLECTION_NAMES.CASH_REGISTERS,
    key: { userId: 1, branch: 1, status: 1, openedAt: -1 },
    options: { name: 'idx_cash_registers_user_branch_status' },
  },
  {
    collection: COLLECTION_NAMES.CASH_OPERATIONS,
    key: { branch: 1, createdAt: -1 },
    options: { name: 'idx_cash_operations_branch_created' },
  },
  {
    collection: COLLECTION_NAMES.CASH_OPERATIONS,
    key: { userId: 1, branch: 1, createdAt: -1 },
    options: { name: 'idx_cash_operations_user_branch_created' },
  },

  // API KEYS (MASTER)
  {
    collection: COLLECTION_NAMES.API_KEYS,
    key: { keyHash: 1 },
    options: { name: 'idx_api_keys_hash_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.API_KEYS,
    key: { keyPrefix: 1, isActive: 1 },
    options: { name: 'idx_api_keys_prefix_active' },
  },

  // SYSTEM SETTINGS (MASTER)
  {
    collection: COLLECTION_NAMES.SYSTEM_SETTINGS,
    key: { key: 1 },
    options: { name: 'idx_system_settings_key_unique', unique: true },
  },

  // WEBHOOKS (MASTER)
  {
    collection: COLLECTION_NAMES.WEBHOOKS,
    key: { events: 1, isActive: 1 },
    options: { name: 'idx_webhooks_events_active' },
  },

  // AUDIT LOGS (MASTER)
  {
    collection: COLLECTION_NAMES.AUDIT_LOGS,
    key: { createdAt: -1 },
    options: { name: 'idx_audit_logs_created_desc' },
  },
  {
    collection: COLLECTION_NAMES.AUDIT_LOGS,
    key: { action: 1, createdAt: -1 },
    options: { name: 'idx_audit_logs_action_created' },
  },
];
