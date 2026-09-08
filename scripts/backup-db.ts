import fs from "node:fs";
import path from "node:path";
import { sqlite } from "@/lib/db";

const source = sqlite.name;
const backupDir = path.join(process.cwd(), "artifacts", "db-backups");
fs.mkdirSync(backupDir, { recursive: true });
sqlite.pragma("wal_checkpoint(TRUNCATE)");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupDir, `library-${stamp}.db`);
fs.copyFileSync(source, destination);
console.log(`Database backup created: ${destination}`);
