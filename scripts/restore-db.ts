import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = path.join(projectRoot, 'prisma', 'data', 'studiobynani.sqlite');
const backupFile = process.env.BACKUP_FILE;

if (!backupFile) {
  throw new Error('Indicá BACKUP_FILE con la ruta de la copia a restaurar.');
}

const backupPath = path.resolve(projectRoot, backupFile);
if (!existsSync(backupPath)) {
  throw new Error(`No existe la copia indicada: ${backupPath}`);
}

copyFileSync(backupPath, databasePath);
console.log(`Base restaurada desde: ${backupPath}`);
