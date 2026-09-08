import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const filename = fileURLToPath(import.meta.url);
const directory = dirname(filename);
const compat = new FlatCompat({ baseDirectory: directory });

const config = [
  { ignores: [".next/**", "next-env.d.ts", "artifacts/**", "test-results/**", "playwright-report/**", "runtime/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;


