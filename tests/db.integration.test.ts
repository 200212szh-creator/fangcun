import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseFile = path.join(process.cwd(), "data", "test-library.db");
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
let dbModule: typeof import("@/lib/db");
let repository: typeof import("@/lib/db/repository");

beforeAll(async () => {
  for (const file of [testDatabaseFile, `${testDatabaseFile}-wal`, `${testDatabaseFile}-shm`]) fs.rmSync(file, { force: true });
  process.env.DATABASE_URL = testDatabaseFile;
  const migrationEnv = { ...process.env, DATABASE_URL: testDatabaseFile };
  delete migrationEnv.FANGCUN_DATA_DIR;
  execFileSync(process.execPath, [tsxCli, path.join(process.cwd(), "scripts", "migrate.ts")], { cwd: process.cwd(), env: migrationEnv, stdio: "pipe" });
  execFileSync(process.execPath, [tsxCli, path.join(process.cwd(), "scripts", "migrate-v2.ts")], { cwd: process.cwd(), env: migrationEnv, stdio: "pipe" });
  dbModule = await import("@/lib/db");
  repository = await import("@/lib/db/repository");
});

afterAll(() => {
  dbModule.sqlite.close();
  for (const file of [testDatabaseFile, `${testDatabaseFile}-wal`, `${testDatabaseFile}-shm`]) fs.rmSync(file, { force: true });
});

describe("SQLite repository", () => {
  it("supports CRUD, isolated fixtures, soft delete, restore, and export shape", () => {
    dbModule.ensureDatabase();
    const created = repository.createOwnedCopy({ edition: { id: `fixture-${crypto.randomUUID()}`, title: "Fixture Book", authors: ["Tester"], source: "test" }, location: "Fixture shelf", readingStatus: "unread" });
    expect(repository.getOwnedCopy(created.id)?.edition.title).toBe("Fixture Book");
    expect(repository.updateOwnedCopy(created.id, { readingStatus: "read", rating: 5 })?.readingStatus).toBe("read");
    expect(repository.softDeleteOwnedCopy(created.id)?.deletedAt).toBeTruthy();
    expect(repository.listOwnedCopies().some((book) => book.id === created.id)).toBe(false);
    expect(repository.restoreOwnedCopy(created.id)?.deletedAt).toBeNull();
    expect(repository.listOwnedCopies().some((book) => book.id === created.id)).toBe(true);
    expect(repository.exportData().version).toBe(1);
  });

  it("keeps two ISBN-less copies under one edition and protects in-use shelves", () => {
    const shelf = repository.createShelf({ name: "Phase 1 shelf", room: "Study" });
    const editionId = `edition-${crypto.randomUUID()}`;
    const first = repository.createOwnedCopy({ edition: { id: editionId, title: "无 ISBN 的长书名", authors: ["Tester"], source: "test" }, shelfLocationId: shelf.id, shelfSlot: "2", acquisitionMethod: "purchase", acquisitionSource: "Bookshop", priceCents: 1299, currency: "CNY" });
    const second = repository.createOwnedCopy({ edition: { id: editionId, title: "无 ISBN 的长书名", authors: ["Tester"], source: "test" }, shelfLocationId: shelf.id, shelfSlot: "3", acquisitionMethod: "gift", acquisitionSource: "Friend", priceCents: 0, currency: "CNY" });
    expect(first.id).not.toBe(second.id);
    expect(repository.getOwnedCopy(first.id)?.priceCents).toBe(1299);
    expect(repository.getOwnedCopy(second.id)?.acquisitionMethod).toBe("gift");
    expect(repository.updateBookEdition(editionId, { title: "版本名称已编辑" })).toBeTruthy();
    expect(repository.getOwnedCopy(first.id)?.edition.title).toBe("版本名称已编辑");
    expect(repository.deleteShelf(shelf.id)).toEqual({ ok: false, reason: "IN_USE" });
    expect(repository.updateShelf(shelf.id, { sortOrder: 3, active: false })?.active).toBe(false);
    expect(repository.updateOwnedCopy(first.id, { shelfLocationId: null })).toBeTruthy();
    expect(repository.updateOwnedCopy(second.id, { shelfLocationId: null })).toBeTruthy();
    expect(repository.deleteShelf(shelf.id)).toEqual({ ok: true });
  });

  it("keeps loan history and normalized annotation concepts consistent", () => {
    const created = repository.createOwnedCopy({ edition: { id: `loan-edition-${crypto.randomUUID()}`, title: "借阅测试书", authors: ["Tester"], source: "test" } });
    const loan = repository.createLoan(created.id, { borrowerName: "Reader", dueAt: "2099-01-01" });
    expect(loan.ok).toBe(true);
    expect(repository.createLoan(created.id, { borrowerName: "Second reader" })).toEqual({ ok: false, reason: "ALREADY_LENT" });
    if (!loan.ok) throw new Error("loan fixture was not created");
    expect(repository.renewLoan(loan.loan.id, "2099-02-01")?.dueAt).toBe("2099-02-01");
    expect(repository.returnLoan(loan.loan.id)?.status).toBe("returned");
    const annotation = repository.createAnnotation(created.id, { pageLabel: "p. 12", body: "A useful idea", concepts: ["Memory", "memory"] });
    expect(annotation?.concepts).toHaveLength(1);
    expect(repository.listAnnotations(undefined, "memory")).toHaveLength(1);
    expect(repository.updateAnnotation(annotation!.id, { body: "An edited idea", concepts: ["Archive"] })?.body).toBe("An edited idea");
    repository.deleteAnnotation(annotation!.id);
    expect(repository.listAnnotations(created.id)).toHaveLength(0);
  });
});
