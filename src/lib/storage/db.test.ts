import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteBlob,
  getBlob,
  resetDbCache,
  saveBlob,
  wipeDatabase,
} from "./db";

beforeEach(async () => {
  resetDbCache();
  await wipeDatabase();
  resetDbCache();
});

describe("blob storage", () => {
  it("uses the IndexedDB fallback when OPFS is unavailable", async () => {
    const key = "series/chapter/page-1";
    const blob = new Blob(["hello world"], { type: "text/plain" });

    await saveBlob(key, blob);

    const stored = await getBlob(key);
    expect(stored).toBeDefined();

    await deleteBlob(key);
    await expect(getBlob(key)).resolves.toBeUndefined();
  });
});
