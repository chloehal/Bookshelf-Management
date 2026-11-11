import { normalizeIsbn } from "./catalog.mjs";

export const PERSONAL_GOODREADS_KEY = "bookshelf-personal-goodreads-v1";
const coverPattern =
  /^https:\/\/(?:m\.media-amazon\.com|i\.gr-assets\.com|images\.gr-assets\.com)\/images\/S\/compressed\.photo\.goodreads\.com\/books\/\d+[il]\/\d+(?:\._S[XY]\d+_)?\.jpg$/;
const text = (value, limit = 255) =>
  typeof value === "string" ? value.trim().slice(0, limit) || null : null;

export function parsePersonalGoodreads(contents) {
  if (typeof contents !== "string" || contents.length > 5_000_000)
    throw new Error("Fichier Goodreads trop volumineux.");
  let data;
  try {
    data = JSON.parse(contents);
  } catch {
    throw new Error("Le fichier des éditions Goodreads est illisible.");
  }
  if (
    data?.format !== "bookshelf.goodreads.v1" ||
    !Array.isArray(data.books) ||
    data.books.length > 5000
  )
    throw new Error(
      "Choisis le fichier des éditions Goodreads préparé pour ta bibliothèque (.json).",
    );
  const records = new Map();
  for (const row of data.books) {
    if (
      !row ||
      row.source !== "goodreads" ||
      typeof row.source_id !== "string" ||
      !/^[1-9]\d{0,15}$/.test(row.source_id) ||
      !text(row.title) ||
      !text(row.author)
    )
      throw new Error("Une édition du fichier Goodreads est invalide.");
    let isbn = null;
    try {
      if (row.isbn) isbn = normalizeIsbn(row.isbn);
    } catch {
      /* Unusable ISBNs do not hide a known edition. */
    }
    records.set(row.source_id, {
      source: "goodreads",
      source_id: row.source_id,
      source_url: `https://www.goodreads.com/book/show/${row.source_id}`,
      title: text(row.title),
      author: text(row.author),
      isbn,
      page_count:
        Number.isInteger(row.page_count) &&
        row.page_count > 0 &&
        row.page_count <= 1_000_000
          ? row.page_count
          : null,
      publisher: text(row.publisher),
      published_date: text(row.published_date, 100),
      cover_url:
        typeof row.cover_url === "string" && coverPattern.test(row.cover_url)
          ? row.cover_url
          : null,
      format: text(row.format),
      genres: [],
      languages: [],
      personal_goodreads: true,
    });
  }
  return [...records.values()];
}

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const titleKey = (value) =>
  normalize(
    String(value || "")
      .replace(/\(s\)/gi, "s")
      .replace(/\s*\([^)]*(?:#\d|tome\s*\d)[^)]*\)\s*$/i, "")
      .split(/[:：]/)[0],
  );
const authorWords = (value) =>
  normalize(String(value || "").split(/\s+&\s+/)[0])
    .split(" ")
    .filter(Boolean);
const sameAuthor = (left, right) => {
  const a = authorWords(left),
    b = authorWords(right);
  return (
    !a.length ||
    !b.length ||
    a.every((word) => b.includes(word)) ||
    b.every((word) => a.includes(word))
  );
};

export function searchPersonalGoodreads(editions, query, target = null) {
  if (target?.metadata_source === "goodreads" && target.metadata_source_id) {
    const linked = editions.filter(
      (edition) => edition.source_id === String(target.metadata_source_id),
    );
    if (linked.length) return linked;
  }
  if (query.isbn) {
    let isbn;
    try {
      isbn = normalizeIsbn(query.isbn);
    } catch {
      return [];
    }
    return editions.filter((edition) => edition.isbn === isbn);
  }
  const title = titleKey(query.title);
  if (title.length < 2) return [];
  return editions.filter(
    (edition) =>
      titleKey(edition.title) === title &&
      sameAuthor(query.author, edition.author),
  );
}
