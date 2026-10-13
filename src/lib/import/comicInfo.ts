export type ComicInfoMetadata = {
  title?: string;
  series?: string;
  number?: string;
  volume?: number;
  writer?: string;
  tags: string[];
  ageRating?: string;
  coverPageIndex?: number;
};

function textContent(document: Document, selector: string): string | undefined {
  const node = document.querySelector(selector);
  const text = node?.textContent?.trim();
  return text ? text : undefined;
}

function collectTextList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseCoverIndex(document: Document): number | undefined {
  const pages = Array.from(
    document.querySelectorAll("ComicInfo > Pages > Page"),
  );

  for (const page of pages) {
    const type = page.getAttribute("Type")?.toLowerCase();
    if (!type || !/(frontcover|cover|dustcover)/i.test(type)) {
      continue;
    }

    const image = page.getAttribute("Image");
    if (!image) {
      continue;
    }

    const parsed = Number.parseInt(image, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function readXmlTag(xml: string, ...selectors: RegExp[]): string | undefined {
  for (const selector of selectors) {
    const match = xml.match(selector);
    if (match?.[1]) {
      return match[1].replace(/<[^>]+>/g, "").trim() || undefined;
    }
  }

  return undefined;
}

export function parseComicInfoXml(xml: string): ComicInfoMetadata {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("ComicInfo")) {
    const volumeText = textContent(document, "ComicInfo > Volume");
    const volume = volumeText ? Number.parseInt(volumeText, 10) : Number.NaN;

    const title = textContent(document, "ComicInfo > Title");
    const series = textContent(document, "ComicInfo > Series");

    return {
      title,
      series,
      number: textContent(document, "ComicInfo > Number"),
      volume: Number.isFinite(volume) ? volume : undefined,
      writer: textContent(document, "ComicInfo > Writer"),
      tags: collectTextList(textContent(document, "ComicInfo > Tags")),
      ageRating: textContent(document, "ComicInfo > AgeRating"),
      coverPageIndex: parseCoverIndex(document),
    };
  }

  if (document.querySelector("parsererror")) {
    return { tags: [] };
  }

  const title =
    readXmlTag(xml, /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) ??
    readXmlTag(xml, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const series =
    readXmlTag(xml, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) ?? title;

  return {
    title,
    series,
    writer: readXmlTag(xml, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i),
    tags: [],
  };
}
