import { Logger } from '@nestjs/common';
import { Db } from 'mongodb';
import { MONGO_COLLECTION_INDEXES } from './indexes/collections.indexes';
import { MONGO_COLLECTION_SCHEMAS } from './json-schemas/collections.json-schema';
import { seedCrmAndCatalog } from './seeds/crm-and-catalog.seed';
import { seedUsersAndMasterSettings } from './seeds/users-and-settings.seed';

const logger = new Logger('DbFirstProvisioner');

/**
 * Orquestador DB-First: Aplica colecciones con $jsonSchema, índices y seeds modulares.
 */
export async function provisionMongoDatabase(
  db: Db,
  options: { runSeed?: boolean } = {},
): Promise<void> {
  logger.log('Iniciando aprovisionamiento DB-First en MongoDB...');

  const existingCollections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  const existingNames = new Set(existingCollections.map((c) => c.name));

  for (const def of MONGO_COLLECTION_SCHEMAS) {
    if (!existingNames.has(def.name)) {
      await db.createCollection(def.name, {
        validator: def.validator,
        validationLevel: def.validationLevel,
        validationAction: def.validationAction,
      });
      logger.log(
        `[+] Colección creada con $jsonSchema estricto: "${def.name}"`,
      );
    } else {
      await db.command({
        collMod: def.name,
        validator: def.validator,
        validationLevel: def.validationLevel,
        validationAction: def.validationAction,
      });
      logger.log(`[~] Reglas $jsonSchema actualizadas en: "${def.name}"`);
    }
  }

  for (const idx of MONGO_COLLECTION_INDEXES) {
    try {
      await db.collection(idx.collection).createIndex(idx.key, idx.options);
    } catch (err: unknown) {
      const mongoCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: number }).code
          : undefined;
      if ((mongoCode === 85 || mongoCode === 86) && idx.options.name) {
        await db.collection(idx.collection).dropIndex(idx.options.name);
        await db.collection(idx.collection).createIndex(idx.key, idx.options);
      } else {
        throw err;
      }
    }
  }
  logger.log(
    `[✓] ${MONGO_COLLECTION_INDEXES.length} índices estratégicos verificados/creados.`,
  );

  if (options.runSeed) {
    const { crmUserId } = await seedUsersAndMasterSettings(db, logger);
    await seedCrmAndCatalog(db, crmUserId, logger);
  }

  logger.log('Aprovisionamiento DB-First completado con éxito.');
}
