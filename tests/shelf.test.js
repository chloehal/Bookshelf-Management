import test from "node:test";
import assert from "node:assert/strict";
import {
  getShelfItems,
  getBookDisplayProps,
  layoutShelves,
} from "../src/lib/shelf.js";
const book = (id, genre, is_read = false) => ({
  id,
  title: `Livre ${id}`,
  author: "Auteur",
  genres: genre ? [genre] : [],
  is_read,
  size: 2,
  page_count: 400,
});
test("les non-lus restent groupés par thème et les lus sont uniquement en piles", () => {
  const input = [
    book(1, "Roman"),
    book(2, "Essai"),
    book(3, "Roman"),
    book(4, "Roman", true),
    book(5, "Essai", true),
    book(6, null),
  ];
  const { items } = getShelfItems(input);
  assert.deepEqual(
    items
      .filter((i) => i.type === "pile")
      .flatMap((i) => i.books.map((b) => b.book.id))
      .sort(),
    [4, 5],
  );
  const standing = items.filter((i) => i.type === "book");
  assert.ok(standing.every((i) => !i.book.is_read));
  const roman = items
    .map((i, n) => (i.type === "book" && i.book.genres[0] === "Roman" ? n : -1))
    .filter((n) => n >= 0);
  assert.equal(roman[1], roman[0] + 1);
  assert.ok(standing.some((i) => i.genreLabel === "Sans genre"));
  assert.equal(
    items.flatMap((i) => (i.type === "pile" ? i.books : [i])).length,
    input.length,
  );
});
test("les piles respectent les formats et la hauteur maximale, même si tous les livres sont lus", () => {
  const { items } = getShelfItems(
    Array.from({ length: 30 }, (_, i) => ({
      ...book(i + 1, "Roman", true),
      size: (i % 3) + 1,
    })),
  );
  assert.ok(items.every((i) => i.type === "pile"));
  for (const pile of items) {
    assert.ok(pile.books.every((b) => b.props.height === pile.bookHeight));
    assert.ok(pile.books.reduce((n, b) => n + b.props.width, 0) <= 200);
  }
  for (const width of [240, 320, 1000])
    for (const row of layoutShelves(items, width))
      assert.ok(
        row.reduce(
          (n, i) =>
            n +
            (i.type === "pile"
              ? i.bookHeight
              : getBookDisplayProps(i.book).width) +
            4,
          0,
        ) -
          4 <=
          width,
      );
  assert.deepEqual(layoutShelves([], 320), []);
});
