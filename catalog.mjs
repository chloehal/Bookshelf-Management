// Bibliographic fields only: acquisition year, reading, rating, gifts and loans stay local.
export const CATALOG_FIELDS = {
  title: "Titre",
  author: "Auteur",
  isbn: "ISBN",
  genres: "Genres",
  page_count: "Nombre de pages",
  publisher: "Éditeur",
  published_date: "Date de publication",
  cover_url: "Couverture",
};
export function normalizeIsbn(value) {
  let isbn = String(value).replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (n, c, i) => n + (c === "X" ? 10 : Number(c)) * (10 - i),
      0,
    );
    if (sum % 11) throw new Error("ISBN invalide : vérifie les chiffres.");
    isbn = "978" + isbn.slice(0, 9);
    const check = [...isbn].reduce(
      (n, c, i) => n + Number(c) * (i % 2 ? 3 : 1),
      0,
    );
    return isbn + ((10 - (check % 10)) % 10);
  }
  if (
    !/^97[89]\d{10}$/.test(isbn) ||
    [...isbn].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10
  ) {
    throw new Error("Saisis un ISBN-10 ou ISBN-13 valide.");
  }
  return isbn;
}
export const hasValue = (value) =>
  Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== "";
export function comparisonRows(local, candidate) {
  return Object.entries(CATALOG_FIELDS).map(([key, label]) => {
    const current = local[key] ?? null,
      proposed = candidate[key] ?? null;
    return {
      key,
      label,
      current,
      proposed,
      available: hasValue(proposed),
      different: JSON.stringify(current) !== JSON.stringify(proposed),
    };
  });
}
export function reconciliationPayload(local, candidate, choices) {
  const rows = comparisonRows(local, candidate);
  return {
    id: local.id,
    candidate,
    expected: Object.fromEntries(rows.map((r) => [r.key, r.current])),
    choices: Object.fromEntries(
      rows.map((r) => [
        r.key,
        r.available && choices[r.key] === "api" ? "api" : "local",
      ]),
    ),
  };
}

export function convertProgress(page, oldTotal, newTotal) {
  page = Math.max(0, Number(page) || 0);
  if (!newTotal || Number(newTotal) === Number(oldTotal)) return page;
  return oldTotal > 0
    ? Math.round(Math.min(1, page / oldTotal) * newTotal)
    : Math.min(page, newTotal);
}
