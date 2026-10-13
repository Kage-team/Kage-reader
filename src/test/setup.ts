import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { resetDbCache, wipeDatabase } from "../lib/storage/db";

beforeEach(async () => {
  resetDbCache();
  await wipeDatabase();
  resetDbCache();
});

afterEach(async () => {
  await wipeDatabase();
  resetDbCache();
});
