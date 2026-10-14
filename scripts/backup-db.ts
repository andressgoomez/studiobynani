import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = path.join(projectRoot, 'prisma', 'data', 'studiobynani.sqlite');
const backupDirectory = path.join(projectRoot, 'prisma', 'backups');

export function copyDatabase(sourcePath: string) {
  if (!existsSync(sourcePath)) {
    throw new Error(`No existe la base de datos: ${sourcePath}`);
  }

  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const backupPath = path.join(backupDirectory, `studiobynani-${timestamp}.sqlite`);
  copyFileSync(sourcePath, backupPath);
  console.log(`Copia creada: ${backupPath}`);
  return backupPath;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  copyDatabase(databasePath);
}
