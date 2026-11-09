import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const apiKeysJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.API_KEYS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'name',
        'keyPrefix',
        'keyHash',
        'scopes',
        'isActive',
        'createdByUserId',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        name: {
          bsonType: 'string',
          minLength: 2,
          description: 'Nombre descriptivo de la aplicación externa',
        },
        keyPrefix: {
          bsonType: 'string',
          description: 'Prefijo visible (ej. jmk_live_a1b2c3d4)',
        },
        keyHash: {
          bsonType: 'string',
          description: 'Hash SHA-256 de la API Key completa',
        },
        scopes: {
          bsonType: 'array',
          minItems: 1,
          items: {
            enum: [
              '*',
              'crm:read',
              'crm:write',
              'catalog:read',
              'catalog:write',
              'inventory:read',
              'inventory:write',
              'sales:read',
              'sales:write',
              'treasury:read',
              'treasury:write',
            ],
          },
        },
        isActive: { bsonType: 'bool' },
        expiresAt: { bsonType: ['date', 'null'] },
        lastUsedAt: { bsonType: ['date', 'null'] },
        createdByUserId: { bsonType: 'objectId' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};

export const systemSettingsJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.SYSTEM_SETTINGS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'key',
        'businessName',
        'maxCrmDiscountPercentage',
        'defaultTaxRateBasisPoints',
        'maintenanceMode',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        key: { enum: ['GLOBAL_CONFIG'] },
        businessName: { bsonType: 'string' },
        receiptFooterText: { bsonType: ['string', 'null'] },
        maxCrmDiscountPercentage: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
          maximum: 100,
        },
        defaultTaxRateBasisPoints: {
          bsonType: ['int', 'long'],
          minimum: 0,
          maximum: 10000,
        },
        maintenanceMode: {
          bsonType: 'object',
          required: ['posPaused', 'crmPaused'],
          properties: {
            posPaused: { bsonType: 'bool' },
            crmPaused: { bsonType: 'bool' },
            reason: { bsonType: ['string', 'null'] },
          },
        },
        updatedByUserId: { bsonType: ['objectId', 'null'] },
        lastKillSwitchAt: { bsonType: ['date', 'null'] },
        createdAt: { bsonType: ['date', 'null'] },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};

export const webhooksJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.WEBHOOKS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'name',
        'targetUrl',
        'signingSecret',
        'events',
        'isActive',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        name: { bsonType: 'string' },
        targetUrl: { bsonType: 'string' },
        signingSecret: { bsonType: 'string' },
        events: {
          bsonType: 'array',
          minItems: 1,
          items: {
            enum: [
              'sale.completed',
              'sale.cancelled',
              'customer.discount_assigned',
            ],
          },
        },
        isActive: { bsonType: 'bool' },
        lastTriggeredAt: { bsonType: ['date', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};

export const auditLogsJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.AUDIT_LOGS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['action', 'actorType', 'actorIdentifier', 'createdAt'],
      properties: {
        _id: { bsonType: 'objectId' },
        action: { bsonType: 'string' },
        actorType: { enum: ['USER', 'API_KEY'] },
        actorIdentifier: { bsonType: 'string' },
        targetCollection: { bsonType: ['string', 'null'] },
        targetId: { bsonType: ['string', 'null'] },
        metadata: { bsonType: ['object', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: ['date', 'null'] },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};
