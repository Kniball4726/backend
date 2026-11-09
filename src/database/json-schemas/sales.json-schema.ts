import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const salesJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.SALES,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'receiptNumber',
        'idempotencyKey',
        'cashierId',
        'items',
        'subtotalCents',
        'discountPercentageApplied',
        'discountCents',
        'taxCents',
        'totalCents',
        'payments',
        'status',
        'createdAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        receiptNumber: { bsonType: 'string' },
        idempotencyKey: {
          bsonType: 'string',
          description:
            'UUIDv4 único enviado por el cliente móvil para evitar cobros duplicados',
        },
        cashierId: { bsonType: 'objectId' },
        customerId: { bsonType: ['objectId', 'null'] },
        customerSnapshot: {
          bsonType: ['object', 'null'],
          properties: {
            fullName: { bsonType: 'string' },
            email: { bsonType: 'string' },
            discountPercentageApplied: {
              bsonType: ['int', 'double', 'long'],
            },
          },
        },
        items: {
          bsonType: 'array',
          minItems: 1,
          items: {
            bsonType: 'object',
            required: [
              'productId',
              'sku',
              'name',
              'quantity',
              'unitPriceCents',
              'lineSubtotalCents',
            ],
            properties: {
              _id: { bsonType: 'objectId' },
              productId: { bsonType: 'objectId' },
              sku: { bsonType: 'string' },
              name: { bsonType: 'string' },
              quantity: {
                bsonType: ['int', 'double', 'long'],
                minimum: 0,
                exclusiveMinimum: true,
              },
              unitPriceCents: {
                bsonType: ['int', 'long'],
                minimum: 0,
              },
              taxRateBasisPoints: {
                bsonType: ['int', 'long'],
                minimum: 0,
              },
              lineSubtotalCents: {
                bsonType: ['int', 'long'],
                minimum: 0,
              },
            },
          },
        },
        subtotalCents: { bsonType: ['int', 'long'], minimum: 0 },
        discountPercentageApplied: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
          maximum: 100,
        },
        discountCents: { bsonType: ['int', 'long'], minimum: 0 },
        taxCents: { bsonType: ['int', 'long'], minimum: 0 },
        totalCents: { bsonType: ['int', 'long'], minimum: 0 },
        payments: {
          bsonType: 'array',
          minItems: 1,
          items: {
            bsonType: 'object',
            required: ['method', 'amountCents'],
            properties: {
              _id: { bsonType: 'objectId' },
              method: { enum: ['CASH', 'CARD', 'TRANSFER'] },
              amountCents: { bsonType: ['int', 'long'], minimum: 0 },
              reference: { bsonType: ['string', 'null'] },
            },
          },
        },
        status: { enum: ['COMPLETED', 'CANCELLED'] },
        deviceTimestamp: { bsonType: ['date', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: ['date', 'null'] },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};
