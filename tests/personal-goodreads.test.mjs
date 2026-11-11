import { test } from "node:test";
import assert from "node:assert/strict";
import * as personal from "../personal-goodreads.mjs";

const edition = {
  source: "goodreads",
  source_id: "220174931",
  title: "Perspective(s)",
  author: "Laurent Binet",
  isbn: "9782253907701",
  page_count: 336,
  cover_url:
    "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1736683438l/220174931.jpg",
};
test("personal catalogue keeps edition metadata and excludes private Goodreads fields", () => {
  const rows = personal.parsePersonalGoodreads(
    JSON.stringify({
      format: "bookshelf.goodreads.v1",
      books: [{ ...edition, "Private Notes": "private", rating: 5 }],
    }),
  );
  assert.equal(rows[0].source_id, edition.source_id);
  assert.equal(rows[0].isbn, edition.isbn);
  assert.equal(rows[0].cover_url, edition.cover_url);
  assert.equal(rows[0]["Private Notes"], undefined);
  assert.equal(rows[0].rating, undefined);
  assert.throws(() =>
    personal.parsePersonalGoodreads(JSON.stringify({ books: [edition] })),
  );
  assert.throws(() =>
    personal.parsePersonalGoodreads(
      JSON.stringify({
        format: "bookshelf.goodreads.v1",
        books: [{ ...edition, source_id: "../../evil" }],
      }),
    ),
  );
});
test("personal ISBN searches never substitute another edition", () => {
  assert.deepEqual(
    personal.searchPersonalGoodreads([edition], { isbn: "9782246829355" }),
    [],
  );
  assert.equal(
    personal.searchPersonalGoodreads([edition], { isbn: "2253907707" })[0]
      .source_id,
    edition.source_id,
  );
});
test("title matching tolerates punctuation, subtitle and author order while showing edition alternatives", () => {
  const rows = [
    edition,
    { ...edition, source_id: "134115463", isbn: "9782246829355" },
    {
      ...edition,
      source_id: "99",
      title: "Une autre œuvre",
      author: "Autre personne",
    },
  ];
  assert.equal(
    personal.searchPersonalGoodreads(rows, {
      title: "Perspective(s)",
      author: "Binet, Laurent",
    }).length,
    2,
  );
  assert.equal(
    personal.searchPersonalGoodreads(
      [
        {
          ...edition,
          title:
            "Les passeurs de livres de Daraya: Une bibliothèque secrète en Syrie",
          author: "Delphine Minoui",
        },
      ],
      { title: "Les passeurs de livres de Daraya", author: "Delphine Minoui" },
    ).length,
    1,
  );
  assert.deepEqual(
    personal.searchPersonalGoodreads(rows, {
      title: "Perspective(s)",
      author: "Autre personne",
    }),
    [],
  );
});
test("a linked personal edition is preferred even when its local ISBN needs correction", () => {
  assert.equal(
    personal.searchPersonalGoodreads(
      [edition],
      { isbn: "9782246829355" },
      { metadata_source: "goodreads", metadata_source_id: edition.source_id },
    )[0].source_id,
    edition.source_id,
  );
});
