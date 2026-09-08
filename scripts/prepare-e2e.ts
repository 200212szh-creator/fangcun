import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "data", "e2e-library.db");
for (const candidate of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(candidate, { force: true });
