import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { provisionMongoDatabase } from './db-provisioner';

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

async function runCli(): Promise<void> {
  loadDotEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<usuario>')) {
    console.error(
      'ERROR: Configura primero tu MONGODB_URI real de MongoDB Atlas en el archivo backend/.env',
    );
    process.exit(1);
  }

  const runSeed = process.argv.includes('--seed');
  console.log('Conectando a MongoDB Atlas...');
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  try {
    if (!conn.connection.db) {
      throw new Error('No se pudo obtener la instancia de base de datos.');
    }
    console.log(
      `Conectado exitosamente al clúster Atlas -> Base de datos: "${conn.connection.name}"`,
    );
    await provisionMongoDatabase(conn.connection.db, { runSeed });
  } finally {
    await mongoose.disconnect();
  }
}

runCli().catch((err) => {
  console.error('Fallo durante el aprovisionamiento DB-First:', err);
  process.exit(1);
});
