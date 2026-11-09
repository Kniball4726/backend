import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const inventoryMovementsJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.INVENTORY_MOVEMENTS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'productId',
        'userId',
        'type',
        'quantityDelta',
        'previousStock',
        'newStock',
        'createdAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        productId: { bsonType: 'objectId' },
        userId: { bsonType: 'objectId' },
        type: {
          enum: ['INITIAL', 'SALE', 'ADJUSTMENT', 'RETURN', 'RESTOCK'],
        },
        quantityDelta: { bsonType: ['int', 'double', 'long'] },
        previousStock: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
        },
        newStock: {
          bsonType: ['int', 'double', 'long'],
          minimum: 0,
        },
        referenceId: { bsonType: ['objectId', 'null'] },
        notes: { bsonType: ['string', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: ['date', 'null'] },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};
