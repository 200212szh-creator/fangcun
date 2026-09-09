import fs from "node:fs";
import path from "node:path";

function absoluteOrFallback(value: string | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(fallback, value);
}

const configuredRoot = process.env.FANGCUN_DATA_DIR?.trim();
const dataRoot = configuredRoot && path.isAbsolute(configuredRoot) ? path.normalize(configuredRoot) : process.cwd();
const configuredDatabase = process.env.DATABASE_URL?.trim();
const databaseFile = configuredDatabase
  ? absoluteOrFallback(configuredDatabase, dataRoot)
  : path.join(dataRoot, "data", "library.db");

export const runtimePaths = Object.freeze({
  dataRoot,
  databaseFile,
  coversDir: path.join(dataRoot, "covers"),
  backupsDir: path.join(dataRoot, "backups"),
  dailyBackupsDir: path.join(dataRoot, "backups", "daily"),
  preUpgradeBackupsDir: path.join(dataRoot, "backups", "pre-upgrade"),
  mediaBackupsDir: path.join(dataRoot, "backups", "media"),
  configDir: path.join(dataRoot, "config"),
  logsDir: path.join(dataRoot, "logs"),
  serviceLogsDir: path.join(dataRoot, "logs", "service"),
  watchdogLogsDir: path.join(dataRoot, "logs", "watchdog"),
  launcherLogsDir: path.join(dataRoot, "logs", "launcher"),
  stateDir: path.join(dataRoot, "state"),
  recoveryDir: path.join(dataRoot, "recovery"),
  quarantineDir: path.join(dataRoot, "quarantine"),
});

export function ensureRuntimeDirectories() {
  for (const directory of Object.values(runtimePaths).filter((value) => value.endsWith("Dir") || value === runtimePaths.dataRoot)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.mkdirSync(path.dirname(runtimePaths.databaseFile), { recursive: true });
}