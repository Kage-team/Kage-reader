// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAdultPinCredential, verifyAdultPin } from "./adultPin";

describe("adult PIN credentials", () => {
  it("stores a salted hash and verifies only the matching PIN", async () => {
    const credential = await createAdultPinCredential("4821");

    expect(credential.salt).not.toBe("4821");
    expect(credential.hash).not.toContain("4821");
    await expect(verifyAdultPin("4821", credential)).resolves.toBe(true);
    await expect(verifyAdultPin("4822", credential)).resolves.toBe(false);
  });

  it("requires a four-to-six digit PIN", async () => {
    await expect(createAdultPinCredential("123")).rejects.toThrow(/4 to 6/);
    await expect(createAdultPinCredential("1234567")).rejects.toThrow(/4 to 6/);
  });
});
