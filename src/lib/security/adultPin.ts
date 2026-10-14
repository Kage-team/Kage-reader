const PBKDF2_ITERATIONS = 210_000;
const SALT_LENGTH = 16;
const PIN_PATTERN = /^\d{4,6}$/;
const ADULT_ACCESS_SESSION_KEY = "kage-reader:adult-access";

export type AdultPinCredential = {
  salt: string;
  hash: string;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[\da-f]{2})+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derivePinHash(
  pin: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return new Uint8Array(derivedBits);
}

export async function createAdultPinCredential(
  pin: string,
): Promise<AdultPinCredential> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error("PIN must contain 4 to 6 digits.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return {
    salt: toHex(salt),
    hash: toHex(await derivePinHash(pin, salt)),
  };
}

export async function verifyAdultPin(
  pin: string,
  credential: AdultPinCredential,
): Promise<boolean> {
  if (!PIN_PATTERN.test(pin)) return false;
  const salt = fromHex(credential.salt);
  const expectedHash = fromHex(credential.hash);
  if (!salt || !expectedHash) return false;

  const actualHash = await derivePinHash(pin, salt);
  if (actualHash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    difference |= actualHash[index] ^ expectedHash[index];
  }
  return difference === 0;
}

export function hasAdultAccess(pinHash: string): boolean {
  if (!pinHash) return false;
  try {
    return sessionStorage.getItem(ADULT_ACCESS_SESSION_KEY) === pinHash;
  } catch {
    return false;
  }
}

export function grantAdultAccess(pinHash: string): void {
  if (!pinHash) return;
  try {
    sessionStorage.setItem(ADULT_ACCESS_SESSION_KEY, pinHash);
  } catch {
    // Keep the adult area locked when session storage is unavailable.
  }
}

export function clearAdultAccess(): void {
  try {
    sessionStorage.removeItem(ADULT_ACCESS_SESSION_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}
