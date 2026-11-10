export interface CollectionDefinition {
  name: string;
  validator: Record<string, unknown>;
  validationLevel: 'strict' | 'moderate';
  validationAction: 'error' | 'warn';
}

export const COLLECTION_NAMES = {
  USERS: 'users',
  CUSTOMERS: 'customers',
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  INVENTORY_MOVEMENTS: 'inventory_movements',
  SALES: 'sales',
  CASH_REGISTERS: 'cash_registers',
  CASH_OPERATIONS: 'cash_operations',
  API_KEYS: 'api_keys',
  SYSTEM_SETTINGS: 'system_settings',
  WEBHOOKS: 'webhooks',
  AUDIT_LOGS: 'audit_logs',
  COMPANIES: 'companies',
} as const;
