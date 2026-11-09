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

async function runImport(): Promise<void> {
  loadDotEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI no configurado en backend/.env');
    process.exit(1);
  }

  const excelPath = path.resolve(process.cwd(), '..', 'ultratechrun.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error(`ERROR: No se encontró el archivo ${excelPath}`);
    process.exit(1);
  }

  console.log('Conectando a MongoDB Atlas (ventas_pos)...');
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  try {
    const db = conn.connection.db;
    if (!db) {
      throw new Error('No se pudo obtener la instancia de base de datos.');
    }

    // 1. Asegurar que las reglas $jsonSchema e índices estén al día
    await provisionMongoDatabase(db, { runSeed: false });

    // 2. Importar la pestaña "Productos" de ultratechrun.xlsx
    const summary = await importProductsFromExcel(db, excelPath, 'Productos');
    console.log('Resumen de carga:', JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

runImport().catch((err) => {
  console.error('Fallo durante la importación desde Excel:', err);
  process.exit(1);
});
