import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
const destination = process.argv[3];
if (!source || !destination) throw new Error("Usage: npm run db:restore -- <backup-file> <new-database-file>");
const sourcePath = path.resolve(source);
const destinationPath = path.resolve(destination);
if (!fs.existsSync(sourcePath)) throw new Error(`Backup does not exist: ${sourcePath}`);
if (fs.existsSync(destinationPath)) throw new Error(`Refusing to overwrite an existing database: ${destinationPath}`);
fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
console.log(`Database restored to new file: ${destinationPath}`);
