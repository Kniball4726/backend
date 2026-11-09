import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const categoriesJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.CATEGORIES,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'slug', 'isActive', 'createdAt', 'updatedAt'],
      properties: {
        _id: { bsonType: 'objectId' },
        name: { bsonType: 'string', minLength: 1 },
        slug: { bsonType: 'string', minLength: 1 },
        colorHex: { bsonType: ['string', 'null'] },
        sortOrder: { bsonType: ['int', 'long'] },
        isActive: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};

export const productsJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.PRODUCTS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'categoryId',
        'sku',
        'name',
        'priceCents',
        'costCents',
        'taxRateBasisPoints',
        'trackInventory',
        'stock',
        'unit',
        'isActive',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        externalId: {
          bsonType: ['int', 'long', 'null'],
          description: 'Id_Producto original del archivo Excel (ultratechrun.xlsx)',
        },
        categoryId: { bsonType: 'objectId' },
        sku: {
          bsonType: 'string',
          minLength: 1,
          description: 'Codigo del producto en Excel',
        },
        barcode: {
          bsonType: ['string', 'null'],
          description: 'Cod_Barras EAN-13 del archivo Excel',
        },
        name: { bsonType: 'string', minLength: 1 },
        price: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
          description: 'Precio directo de lista según pestaña Productos del Excel',
        },
        priceCents: {
          bsonType: ['int', 'long'],
          minimum: 0,
          description: 'Precio unitario entero para cálculos POS',
        },
        costCents: {
          bsonType: ['int', 'long'],
          minimum: 0,
          description: 'Costo unitario en centavos (entero)',
        },
        taxRateBasisPoints: {
          bsonType: ['int', 'long'],
          minimum: 0,
          maximum: 10000,
          description: 'Impuesto en puntos base (ej. 1600 = 16.00%)',
        },
        trackInventory: { bsonType: 'bool' },
        stock: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
          description: 'Existencia actual validada >= 0 a nivel motor MongoDB',
        },
        minStockAlert: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
        },
        unit: { enum: ['UNIT', 'KG', 'LITER'] },
        isActive: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};
