export enum UserRole {
  MASTER = 'MASTER',
  ADMIN = 'ADMIN',
  CRM = 'CRM',
  CASHIER = 'CASHIER',
}

export enum BranchName {
  LOCALES = 'LOCALES',
  CARRERAS = 'CARRERAS',
}

export type ApiKeyScope =
  | '*'
  | 'crm:read'
  | 'crm:write'
  | 'catalog:read'
  | 'catalog:write'
  | 'inventory:read'
  | 'inventory:write'
  | 'sales:read'
  | 'sales:write'
  | 'treasury:read'
  | 'treasury:write';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
  branch?: BranchName;
  iat?: number;
  isApiKey?: boolean;
  apiKeyPrefix?: string;
  scopes?: ApiKeyScope[];
}
