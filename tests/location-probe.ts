import assert from "node:assert/strict";
import { createLocation, deleteShelf, getOwnedCopy, listLocations, listLoans, listOwnedCopies, updateLocationNode, updateOwnedCopy, createLoan, returnLoan, exportData } from "@/lib/db/repository";

async function main() {
const copyId = process.argv[2];
if (!copyId) throw new Error("copy id is required");

const legacy = listLocations(true);
assert.equal(legacy.length, 2);
assert.equal(legacy.every((location) => location.type === "legacy"), true);

const room = createLocation({ name: "书房", type: "room", displayCode: "R1" });
const zone = createLocation({ name: "东墙", type: "zone", parentId: room.id, displayCode: "R1-Z1" });
const shelf = createLocation({ name: "A架", type: "shelf", parentId: zone.id, displayCode: "R1-Z1-S1" });
const level = createLocation({ name: "第三层", type: "level", parentId: shelf.id, displayCode: "R1-Z1-S1-L3" });
const slot = createLocation({ name: "第04格", type: "slot", parentId: level.id, displayCode: "R1-Z1-S1-L3-04" });
assert.deepEqual(level.breadcrumb.map((item) => item.name), ["书房", "东墙", "A架", "第三层"]);
assert.equal(slot.breadcrumb.length, 5);
assert.equal(slot.available, true);

assert.throws(() => updateLocationNode(room.id, { parentId: level.id }), (error: unknown) => (error as { code?: string }).code === "PARENT_TYPE_INVALID");
const moved = updateOwnedCopy(copyId, { shelfLocationId: level.id, shelfSlot: "3", shelfCoordinate: level.displayCode });
assert.equal(moved?.shelfLocationId, level.id);

const loan = createLoan(copyId, { borrowerName: "Location Probe", dueAt: "2099-01-01" });
assert.equal(loan.ok, true);
if (!loan.ok) throw new Error("loan fixture was not created");
assert.equal(loan.loan.originalLocation?.id, level.id);
assert.equal(loan.loan.currentLocation?.id, level.id);
updateOwnedCopy(copyId, { shelfLocationId: slot.id, shelfSlot: "4", shelfCoordinate: slot.displayCode });
assert.equal(listLoans(copyId)[0].currentLocation?.id, slot.id);
const returned = returnLoan(loan.loan.id);
assert.equal(returned?.status, "returned");
assert.equal(returned?.originalLocation?.id, level.id);
assert.equal(returned?.currentLocation?.id, level.id);
assert.equal(getOwnedCopy(copyId)?.shelfLocationId, level.id);
assert.deepEqual(deleteShelf(level.id), { ok: false, reason: "IN_USE" });

const importRoute = await import("../app/api/import/books/commit/route");
const importedResponse = await importRoute.POST(new Request("http://localhost/api/import/books/commit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    rows: [{
      title: "Location Import Fixture",
      authors: "Location Probe",
      locationId: slot.id,
      shelfSlot: "5",
      shelfCoordinate: slot.displayCode,
      locationSortOrder: "4",
    }],
  }),
}));
assert.equal(importedResponse.status, 200);
assert.deepEqual(await importedResponse.json(), { imported: 1 });
assert.equal(listOwnedCopies(true).some((copy) => copy.shelfLocationId === slot.id && copy.shelfSlot === "5"), true);

const exported = exportData();
assert.equal(exported.version, 1);
assert.equal(exported.locations.some((location) => location.id === slot.id), true);
assert.equal(exported.books.some((book) => book.id === copyId && book.locationInfo?.id === level.id), true);

console.log(JSON.stringify({ status: "pass", hierarchy: { room: room.id, zone: zone.id, shelf: shelf.id, level: level.id, slot: slot.id }, returnedTo: returned?.currentLocation?.id, exportedLocations: exported.locations.length }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
