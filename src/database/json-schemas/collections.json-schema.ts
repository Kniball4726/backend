import {
  categoriesJsonSchema,
  productsJsonSchema,
} from './catalog.json-schema';
import { COLLECTION_NAMES, CollectionDefinition } from './constants';
import { customersJsonSchema } from './customers.json-schema';
import { inventoryMovementsJsonSchema } from './inventory.json-schema';
import {
  apiKeysJsonSchema,
  auditLogsJsonSchema,
  systemSettingsJsonSchema,
  webhooksJsonSchema,
} from './master.json-schema';
import { salesJsonSchema } from './sales.json-schema';
import {
  cashOperationsJsonSchema,
  cashRegistersJsonSchema,
} from './treasury.json-schema';
import { usersJsonSchema } from './users.json-schema';

export { COLLECTION_NAMES, CollectionDefinition };

/**
 * Agregador modular de esquemas $jsonSchema por dominio.
 */
export const MONGO_COLLECTION_SCHEMAS: CollectionDefinition[] = [
  usersJsonSchema,
  customersJsonSchema,
  categoriesJsonSchema,
  productsJsonSchema,
  inventoryMovementsJsonSchema,
  salesJsonSchema,
  cashRegistersJsonSchema,
  cashOperationsJsonSchema,
  apiKeysJsonSchema,
  systemSettingsJsonSchema,
  webhooksJsonSchema,
  auditLogsJsonSchema,
];
