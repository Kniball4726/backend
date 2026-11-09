import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const cashRegistersJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.CASH_REGISTERS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'userFullName',
        'branch',
        'boxType',
        'status',
        'initialBalanceCents',
        'currentBalanceCents',
        'openedAt',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        userId: { bsonType: ['objectId', 'null'] },
        userFullName: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 120,
        },
        branch: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 60,
        },
        boxType: {
          enum: ['Ventas Sucursal', 'Caja Consolidada'],
        },
        status: {
          enum: ['ABIERTA', 'CERRADA'],
        },
        initialBalanceCents: {
          bsonType: ['int', 'long', 'double'],
          minimum: 0,
        },
        currentBalanceCents: {
          bsonType: ['int', 'long', 'double'],
        },
        observations: {
          bsonType: ['string', 'null'],
        },
        openedAt: { bsonType: 'date' },
        closedAt: { bsonType: ['date', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  },
};

export const cashOperationsJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.CASH_OPERATIONS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'userFullName',
        'branch',
        'type',
        'amountCents',
        'detail',
        'createdAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        registerId: { bsonType: ['objectId', 'null'] },
        userId: { bsonType: ['objectId', 'null'] },
        userFullName: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 120,
        },
        branch: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 60,
        },
        type: {
          enum: [
            'INGRESO_EXTRAORDINARIO',
            'EGRESO_EXTRAORDINARIO',
            'TRANSFERENCIA_CAJAS',
            'GASTO',
          ],
        },
        category: {
          bsonType: ['string', 'null'],
        },
        amountCents: {
          bsonType: ['int', 'long', 'double'],
          minimum: 1,
        },
        detail: {
          bsonType: 'string',
          minLength: 1,
          maxLength: 500,
        },
        createdAt: { bsonType: 'date' },
      },
    },
  },
};
