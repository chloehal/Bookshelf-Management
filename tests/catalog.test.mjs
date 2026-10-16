import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIsbn,
  comparisonRows,
  reconciliationPayload,
} from "../catalog.mjs";

test("ISBN-10/13: separators, checksum and conversion for duplicate detection", () => {
  assert.equal(normalizeIsbn("978-0-306-40615-7"), "9780306406157");
  assert.equal(normalizeIsbn("0-306-40615-2"), "9780306406157");
  assert.equal(normalizeIsbn("0-8044-2957-X"), "9780804429573");
  for (const value of ["9780306406158", "123", "hello", "1234567890128"])
    assert.throws(() => normalizeIsbn(value));
});
test("reconciliation preserves local choices and never sends personal fields", () => {
  const local = {
    id: 7,
    title: "Mon titre",
    author: "Auteur",
    genres: ["SF"],
    page_count: 200,
    year: 2024,
    rating: 5,
    is_read: true,
  };
  const candidate = {
    source: "openlibrary",
    source_id: "OL1M",
    title: "Titre API",
    author: "Auteur",
    genres: [],
    page_count: 320,
    rating: 1,
    year: 1999,
  };
  const rows = comparisonRows(local, candidate);
  assert.equal(rows.find((r) => r.key === "title").different, true);
  assert.equal(rows.find((r) => r.key === "author").different, false);
  assert.equal(rows.find((r) => r.key === "genres").available, false);
  const payload = reconciliationPayload(local, candidate, {
    title: "local",
    page_count: "api",
  });
  assert.equal(payload.choices.title, "local");
  assert.equal(payload.choices.page_count, "api");
  assert.equal(payload.choices.genres, "local");
  assert.equal("rating" in payload.expected, false);
  assert.equal("year" in payload.expected, false);
});

test("cover URLs accept only Open Library artwork and request an explicit missing-image error", async () => {
  const { safeCoverUrl } = await import("../book-cover.mjs");
  assert.equal(safeCoverUrl("javascript:alert(1)"), null);
  assert.equal(safeCoverUrl("https://example.com/cover.jpg"), null);
  assert.equal(
    safeCoverUrl("https://covers.openlibrary.org/b/id/123-M.jpg"),
    "https://covers.openlibrary.org/b/id/123-M.jpg?default=false",
  );
});

test("automatic reading conversion preserves fraction or page when old total is unknown", async () => {
  const { convertProgress } = await import("../catalog.mjs");
  assert.equal(convertProgress(120, 300, 400), 160);
  assert.equal(convertProgress(120, null, 400), 120);
  assert.equal(convertProgress(120, null, 80), 80);
  assert.equal(convertProgress(500, 300, 400), 400);
});

test("BnF provenance and cover URLs stay scoped to the official service", async () => {
  const { catalogSourceInfo } = await import("../catalog.mjs");
  const { safeCoverUrl } = await import("../book-cover.mjs");
  assert.equal(
    catalogSourceInfo("bnf", "cb485048536").url,
    "https://catalogue.bnf.fr/ark:/12148/cb485048536",
  );
  const cover =
    "https://openapi.bnf.fr/couverture/image/image/recupererImage?idArk=ark%3A%2F12148%2Fcb485048536&couverture=1";
  assert.equal(safeCoverUrl(cover), cover);
  assert.equal(safeCoverUrl(cover + "&redirect=evil"), null);
  assert.equal(
    safeCoverUrl(cover.replace("openapi.bnf.fr", "openapi.bnf.fr.evil.com")),
    null,
  );
});

test("Sudoc provenance only accepts a PPN", async () => {
  const { catalogSourceInfo } = await import("../catalog.mjs");
  assert.deepEqual(catalogSourceInfo("sudoc", "292390726"), {
    label: "Sudoc",
    url: "https://www.sudoc.fr/292390726",
  });
  assert.equal(catalogSourceInfo("sudoc", "../../evil").url, null);
});

test("edition pages accumulate without hiding notices from different catalogues", async () => {
  const { mergeEditionResults } = await import("../catalog.mjs");
  const ol = { source_id: "OL1M", isbn: "9780306406157" };
  const bnf = { source: "bnf", source_id: "cb485048536", isbn: ol.isbn };
  const sudoc = {
    source: "sudoc",
    source_id: "292390726",
    isbn: "9791041426027",
  };
  assert.deepEqual(mergeEditionResults([ol, bnf], [bnf, sudoc]), [
    ol,
    bnf,
    sudoc,
  ]);
});
