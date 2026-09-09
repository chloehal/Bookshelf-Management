import test from "node:test";
import assert from "node:assert/strict";
import {
  filterBooks,
  bookPayload,
  progressValue,
  statsFor,
} from "../src/lib/library.js";
const books = [
  {
    id: 1,
    title: "Écume",
    author: "Boris Vian",
    genres: ["Roman"],
    is_read: false,
    is_wishlist: false,
    page_count: 200,
  },
  {
    id: 2,
    title: "Dune",
    author: "Frank Herbert",
    genres: ["SF"],
    is_read: true,
    is_wishlist: false,
    page_count: 500,
    rating: 5,
  },
  {
    id: 3,
    title: "Demain",
    author: "Alice",
    genres: ["Roman"],
    is_wishlist: true,
  },
];
test("la recherche ignore les accents, exclut les souhaits et combine les filtres", () => {
  assert.deepEqual(
    filterBooks(books, { search: "ecume" }).map((b) => b.id),
    [1],
  );
  assert.deepEqual(filterBooks(books, { status: "read", genre: "Roman" }), []);
  assert.deepEqual(
    filterBooks(books, { wishlist: true }).map((b) => b.id),
    [3],
  );
});
test("les champs saisis respectent le schéma existant", () => {
  assert.deepEqual(
    bookPayload({
      title: " Titre ",
      author: " Auteur ",
      genres: " Roman, SF ",
      page_count: "250",
      year: "2020",
      color: "#123456",
      size: "3",
      is_gift: false,
    }),
    {
      title: "Titre",
      author: "Auteur",
      genres: ["Roman", "SF"],
      page_count: 250,
      year: 2020,
      color: "#123456",
      size: 3,
      is_gift: false,
    },
  );
  assert.throws(
    () => bookPayload({ title: " ", author: "A", genres: "SF" }),
    /Titre/,
  );
  assert.throws(
    () =>
      bookPayload({ title: "T", author: "A", genres: "SF", page_count: "-1" }),
    /pages/,
  );
});
test("une progression en pourcentage exige un nombre de pages connu", () => {
  assert.equal(progressValue("50", "percent", 300), 150);
  assert.throws(() => progressValue("50", "percent", null), /pages/);
  assert.throws(() => progressValue("310", "pages", 300), /dépasser/);
});
test("les statistiques excluent la wishlist et ne prétendent pas connaître les pages absentes", () => {
  const stats = statsFor(books, []);
  assert.equal(stats.owned, 2);
  assert.equal(stats.read, 1);
  assert.equal(stats.totalPages, 700);
  assert.equal(stats.readPages, 500);
  assert.equal(stats.averageRating, 5);
});

test("les tailles de reliure restent dans les trois valeurs historiques", () => {
  assert.throws(
    () => bookPayload({ title: "T", author: "A", genres: "Roman", size: "5" }),
    /taille/i,
  );
});

test("les filtres cadeaux et livres notés restent disponibles", () => {
  const sample = [
    ...books,
    {
      id: 4,
      title: "Cadeau",
      author: "A",
      genres: ["Roman"],
      is_wishlist: false,
      is_gift: true,
      year: 2020,
    },
    {
      id: 5,
      title: "Récent",
      author: "B",
      genres: ["Roman"],
      is_wishlist: false,
      year: 2025,
    },
  ];
  assert.deepEqual(
    filterBooks(sample, { status: "gift" }).map((b) => b.id),
    [4],
  );
  assert.deepEqual(
    filterBooks(sample, { status: "rated" }).map((b) => b.id),
    [2],
  );
  assert.deepEqual(
    filterBooks(sample, { sort: "year" })
      .slice(0, 2)
      .map((b) => b.id),
    [5, 4],
  );
});
