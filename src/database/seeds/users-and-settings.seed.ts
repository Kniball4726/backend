import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Db, ObjectId } from 'mongodb';
import { COLLECTION_NAMES } from '../json-schemas/constants';

export async function seedUsersAndMasterSettings(
  db: Db,
  logger: Logger,
): Promise<{ crmUserId: ObjectId }> {
  const now = new Date();
  const usersCol = db.collection(COLLECTION_NAMES.USERS);

  const [
    masterPasswordHash,
    adminPasswordHash,
    crmPasswordHash,
    cashierPasswordHash,
  ] = await Promise.all([
    bcrypt.hash('caracas17130989', 10),
    bcrypt.hash('Admin123!', 10),
    bcrypt.hash('Crm123!', 10),
    bcrypt.hash('Caja123!', 10),
  ]);

  await usersCol.deleteMany({
    email: { $in: ['crm@justimobile.com', 'caja@justimobile.com'] },
  });

  await usersCol.updateOne(
    { email: 'glrd4726ml@gmail.com' },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        email: 'glrd4726ml@gmail.com',
        fullName: 'Master System Owner',
        refreshTokenHash: null,
        createdAt: now,
      },
      $set: {
        passwordHash: masterPasswordHash,
        role: 'MASTER',
        branch: 'LOCALES',
        isActive: true,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  await usersCol.updateOne(
    { email: 'admin@justimobile.com' },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        email: 'admin@justimobile.com',
        passwordHash: adminPasswordHash,
        fullName: 'Administrador General',
        role: 'ADMIN',
        refreshTokenHash: null,
        isActive: true,
        createdAt: now,
      },
      $set: { branch: 'LOCALES', updatedAt: now },
    },
    { upsert: true },
  );

  await usersCol.updateOne(
    { email: 'gregory@justimobile.com' },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        email: 'gregory@justimobile.com',
        passwordHash: crmPasswordHash,
        fullName: 'Gregory (CRM)',
        role: 'CRM',
        refreshTokenHash: null,
        isActive: true,
        createdAt: now,
      },
      $set: { branch: 'LOCALES', updatedAt: now },
    },
    { upsert: true },
  );

  await usersCol.updateOne(
    { email: 'daniel@justimobile.com' },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        email: 'daniel@justimobile.com',
        passwordHash: cashierPasswordHash,
        fullName: 'Daniel (Cajero)',
        role: 'CASHIER',
        refreshTokenHash: null,
        isActive: true,
        createdAt: now,
      },
      $set: { branch: 'LOCALES', updatedAt: now },
    },
    { upsert: true },
  );

  const gregoryDoc = await usersCol.findOne({
    email: 'gregory@justimobile.com',
  });
  const crmUserId = gregoryDoc ? gregoryDoc._id : new ObjectId();

  const settingsCol = db.collection(COLLECTION_NAMES.SYSTEM_SETTINGS);
  await settingsCol.updateOne(
    { key: 'GLOBAL_CONFIG' },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        key: 'GLOBAL_CONFIG',
        businessName: 'JustiMobile POS & CRM',
        receiptFooterText: '¡Gracias por su compra!',
        maxCrmDiscountPercentage: 100,
        defaultTaxRateBasisPoints: 1600,
        maintenanceMode: {
          posPaused: false,
          crmPaused: false,
          reason: null,
        },
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  logger.log(
    '[Seed] Usuarios verificados: glrd4726ml@gmail.com (MASTER), admin@justimobile.com (ADMIN), gregory@justimobile.com (CRM), daniel@justimobile.com (CASHIER)',
  );

  // Semilla de Caja inicial abierta en sucursal LOCALES si no existe ninguna
  const registersCol = db.collection(COLLECTION_NAMES.CASH_REGISTERS);
  await registersCol.updateMany(
    { branch: { $nin: ['LOCALES', 'CARRERAS'] } },
    { $set: { branch: 'LOCALES' } },
  );
  await db
    .collection(COLLECTION_NAMES.CASH_OPERATIONS)
    .updateMany(
      { branch: { $nin: ['LOCALES', 'CARRERAS'] } },
      { $set: { branch: 'LOCALES' } },
    );

  const existingOpenReg = await registersCol.findOne({
    branch: 'LOCALES',
    status: 'ABIERTA',
  });
  if (!existingOpenReg) {
    await registersCol.insertOne({
      _id: new ObjectId(),
      userId: crmUserId,
      userFullName: 'Daniel (Cajero)',
      branch: 'LOCALES',
      boxType: 'Ventas Sucursal',
      status: 'ABIERTA',
      initialBalanceCents: 0,
      currentBalanceCents: 0,
      observations: 'Apertura inicial turno LOCALES',
      openedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    logger.log('[Seed] Caja "Ventas Sucursal" abierta en sucursal LOCALES.');
  }

  return { crmUserId };
}
