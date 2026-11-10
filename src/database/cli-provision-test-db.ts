import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { provisionMongoDatabase } from './db-provisioner';
import { importProductsFromExcel } from './importers/ultratech-products.importer';

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawVal = trimmed.slice(eqIndex + 1).trim();
    const val = rawVal.replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function runProvisionTestDb(): Promise<void> {
  loadDotEnv();
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI no configurado en backend/.env');
    process.exit(1);
  }

  // Asegurar que la URI apunte explícitamente a ventas_pos_test
  if (uri.includes('/ventas_pos?')) {
    uri = uri.replace('/ventas_pos?', '/ventas_pos_test?');
  } else if (uri.endsWith('/ventas_pos')) {
    uri = uri.replace(/\/ventas_pos$/, '/ventas_pos_test');
  }

  console.log('----------------------------------------------------');
  console.log('Aprovisionando Base de Datos de Pruebas: ventas_pos_test');
  console.log('----------------------------------------------------');

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    const db = conn.connection.db;
    if (!db) {
      throw new Error('No se pudo obtener la instancia de base de datos.');
    }

    console.log(`[✓] Conectado a MongoDB Atlas -> Base de datos: "${conn.connection.name}"`);

    // 1. Aprovisionar colecciones con $jsonSchema e índices, y semillas de usuarios/configuraciones
    await provisionMongoDatabase(db, { runSeed: true });
    console.log('[✓] Esquemas $jsonSchema, índices y usuarios semilla creados con éxito en ventas_pos_test.');

    // 2. Importar los 165 productos de ultratechrun.xlsx
    const excelPath = path.resolve(process.cwd(), '..', 'ultratechrun.xlsx');
    if (fs.existsSync(excelPath)) {
      console.log(`[i] Importando catálogo de productos desde: ${excelPath}...`);
      const summary = await importProductsFromExcel(db, excelPath, 'Productos');
      console.log(`[✓] Catálogo importado en ventas_pos_test:`, summary);
    } else {
      console.warn(`[!] No se encontró el archivo Excel en ${excelPath}. Omitiendo importación de productos.`);
    }

    console.log('----------------------------------------------------');
    console.log('¡Base de datos ventas_pos_test lista para pruebas seguras!');
    console.log('----------------------------------------------------');
  } finally {
    await mongoose.disconnect();
  }
}

runProvisionTestDb().catch((err) => {
  console.error('Fallo durante el aprovisionamiento de ventas_pos_test:', err);
  process.exit(1);
});
