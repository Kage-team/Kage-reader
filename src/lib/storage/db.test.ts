// @vitest-environment node
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
  it("round-trips through IndexedDB when OPFS is unavailable", async () => {
    const key = "series/chapter/page-1";
    const blob = new Blob(["hello world"], { type: "text/plain" });

    await saveBlob(key, blob);

    const stored = await getBlob(key);
    expect(stored).toBeDefined();
    expect(stored?.size).toBe(blob.size);
    expect(stored?.type).toBe(blob.type);

    const storedBytes = new Uint8Array(await stored!.arrayBuffer());
    const expectedBytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(storedBytes)).toEqual(Array.from(expectedBytes));

    await deleteBlob(key);
    await expect(getBlob(key)).resolves.toBeUndefined();
  });
});
