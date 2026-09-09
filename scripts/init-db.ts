import { execFileSync } from "node:child_process";
import path from "node:path";

const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
for (const migration of ["migrate.ts", "migrate-v2.ts"]) {
  execFileSync(process.execPath, [tsxCli, path.join(process.cwd(), "scripts", migration)], { stdio: "inherit", env: process.env });
}
console.log("SQLite database is ready after explicit migrations.");
