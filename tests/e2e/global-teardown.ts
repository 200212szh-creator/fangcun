import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export default function globalTeardown() {
  const tempRoot = path.resolve(os.tmpdir());
  const candidates = fs.readdirSync(tempRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("fangcun-playwright-"))
    .map((entry) => path.join(tempRoot, entry.name))
    .filter((entry) => path.dirname(path.resolve(entry)) === tempRoot);

  for (const target of candidates) {
    const cleanup = [
      "const fs=require('node:fs');",
      `const target=${JSON.stringify(target)};`,
      "let attempt=0;",
      "const remove=()=>{try{fs.rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:250});process.exit(0)}catch(error){if(++attempt<40){setTimeout(remove,500)}else{process.exit(1)}}};",
      "remove();",
    ].join("");
    const child = spawn(process.execPath, ["-e", cleanup], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }
}
