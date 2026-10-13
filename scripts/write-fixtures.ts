import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { zipSync, strToU8 } from "fflate";

const root = join(process.cwd(), "fixtures");

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function writeText(path: string, content: string): void {
  ensureParent(path);
  writeFileSync(path, content, "utf8");
}

function writeBinary(path: string, content: Uint8Array): void {
  ensureParent(path);
  writeFileSync(path, content);
}

function makeZip(entries: Record<string, Uint8Array | string>): Uint8Array {
  const normalized: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) {
    normalized[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(normalized, { level: 0 });
}

const png1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x04, 0xbf, 0x01,
  0xfe, 0xa7, 0x38, 0x81, 0x9d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

const imageEntries = {
  "page_1.png": png1x1,
  "page_2.png": png1x1,
  "page_10.png": png1x1,
};

writeBinary(join(root, "ok.cbz"), makeZip(imageEntries));

writeBinary(
  join(root, "junk.cbz"),
  makeZip({
    ...imageEntries,
    "__MACOSX/._page_1.png": "junk",
    "Thumbs.db": "junk",
  }),
);

writeBinary(
  join(root, "meta.cbz"),
  makeZip({
    "ComicInfo.xml": `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo>
  <Series>Kage Sample</Series>
  <Number>1</Number>
  <Title>Opening Move</Title>
  <Writer>A. Reader</Writer>
  <AgeRating>18+</AgeRating>
</ComicInfo>
`,
    ...imageEntries,
  }),
);

writeBinary(
  join(root, "nested.zip"),
  makeZip({
    "ch1/page_1.png": png1x1,
    "ch1/page_2.png": png1x1,
    "ch2/page_1.png": png1x1,
    "ch10/page_1.png": png1x1,
  }),
);

writeText(join(root, "corrupt.cbz"), "this is not a valid archive");

writeBinary(
  join(root, "book.epub"),
  makeZip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`,
    "OPS/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Sample EPUB</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">sample-epub</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine>
    <itemref idref="chapter1" />
  </spine>
</package>
`,
    "OPS/nav.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Navigation</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter 1</a></li></ol></nav></body></html>
`,
    "OPS/chapter1.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sample EPUB</title></head><body><p>Hello from Kage Reader.</p></body></html>
`,
  }),
);
