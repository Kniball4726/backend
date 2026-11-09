import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const customersJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.CUSTOMERS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'fullName',
        'email',
        'activeDiscount',
        'isActive',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        fullName: {
          bsonType: 'string',
          minLength: 2,
          description: 'Nombres completos del cliente registrado en CRM',
        },
        email: {
          bsonType: 'string',
          description: 'Correo electrónico único del cliente en CRM',
        },
        branch: {
          enum: ['LOCALES', 'CARRERAS', null],
          description: 'Sucursal asignada al operador CRM que registró al cliente',
        },
        activeDiscount: {
          bsonType: 'object',
          required: ['isAvailable', 'percentage', 'assignedAt'],
          properties: {
            isAvailable: {
              bsonType: 'bool',
              description:
                'True si el descuento está listo para usarse en la próxima compra; False cuando ya fue consumido',
            },
            percentage: {
              bsonType: ['int', 'double', 'long'],
              minimum: 0,
              maximum: 100,
              description:
                'Porcentaje de descuento (0 a 100) asignado por el rol CRM',
            },
            assignedAt: {
              bsonType: 'date',
              description:
                'Fecha y hora automática en que el CRM asignó el descuento',
            },
            assignedByUserId: {
              bsonType: ['objectId', 'null'],
              description:
                'Usuario con rol CRM/ADMIN/MASTER que asignó el descuento',
            },
            consumedAt: {
              bsonType: ['date', 'null'],
              description:
                'Fecha y hora automática en que se consumió en caja',
            },
            consumedInSaleNumber: {
              bsonType: ['string', 'null'],
              description: 'Folio del ticket donde se aplicó el descuento',
            },
          },
        },
        discountHistory: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['percentage', 'assignedAt', 'status'],
            properties: {
              _id: { bsonType: 'objectId' },
              percentage: {
                bsonType: ['int', 'double', 'long'],
                minimum: 0,
                maximum: 100,
              },
              assignedByUserId: { bsonType: ['objectId', 'null'] },
              assignedAt: { bsonType: 'date' },
              status: { enum: ['ASSIGNED', 'CONSUMED', 'REPLACED'] },
              consumedAt: { bsonType: ['date', 'null'] },
              consumedInSaleNumber: { bsonType: ['string', 'null'] },
            },
          },
        },
        isActive: { bsonType: 'bool' },
        createdAt: {
          bsonType: 'date',
          description: 'Fecha y hora automática de alta en CRM',
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Fecha y hora automática de última modificación',
        },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};
