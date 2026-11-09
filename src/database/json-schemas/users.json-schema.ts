import { COLLECTION_NAMES, CollectionDefinition } from './constants';

export const usersJsonSchema: CollectionDefinition = {
  name: COLLECTION_NAMES.USERS,
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'email',
        'passwordHash',
        'fullName',
        'role',
        'isActive',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: { bsonType: 'objectId' },
        email: {
          bsonType: 'string',
          description: 'Correo electrónico único del usuario',
        },
        passwordHash: {
          bsonType: 'string',
          description: 'Hash bcrypt de la contraseña',
        },
        fullName: {
          bsonType: 'string',
          minLength: 2,
          description: 'Nombre completo del operador',
        },
        role: {
          enum: ['MASTER', 'ADMIN', 'CRM', 'CASHIER'],
          description: 'Rol RBAC: MASTER, ADMIN, CRM o CASHIER',
        },
        refreshTokenHash: {
          bsonType: ['string', 'null'],
          description: 'Hash del refresh token activo para cliente móvil',
        },
        isActive: {
          bsonType: 'bool',
          description: 'Indica si la cuenta está activa',
        },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'null'] },
      },
    },
  },
};
