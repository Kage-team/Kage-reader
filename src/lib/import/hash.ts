const CHAPTER_SIGNATURE_SIZE = 64 * 1024;

export async function hashBlobSignature(blob: Blob): Promise<string> {
  const size = blob.size;
  const head = new Uint8Array(
    await blob.slice(0, CHAPTER_SIGNATURE_SIZE).arrayBuffer(),
  );
  const tailStart = Math.max(0, size - CHAPTER_SIGNATURE_SIZE);
  const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  const prefix = new TextEncoder().encode(`${size}:`);

  const combined = new Uint8Array(prefix.length + head.length + tail.length);
  combined.set(prefix, 0);
  combined.set(head, prefix.length);
  combined.set(tail, prefix.length + head.length);

  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
