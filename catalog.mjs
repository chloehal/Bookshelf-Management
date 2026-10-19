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

export function catalogSourceInfo(source = "openlibrary", id = "") {
  if (source === "sudoc" && /^\d{8}[\dX]$/.test(id))
    return { label: "Sudoc", url: `https://www.sudoc.fr/${id}` };
  if (source === "bnf" && /^cb\d{8}[0-9a-z]$/.test(id))
    return { label: "BnF", url: `https://catalogue.bnf.fr/ark:/12148/${id}` };
  if (source === "openlibrary" && /^OL\d+M$/.test(id))
    return {
      label: "Open Library",
      url: `https://openlibrary.org/books/${id}`,
    };
  return { label: "API", url: null };
}

// Keep distinct catalogue notices, while avoiding repeats across loaded pages.
export function mergeEditionResults(current, incoming) {
  const records = new Map();
  for (const item of [...current, ...incoming]) {
    const source = item.source || item.lookup_source || "openlibrary";
    records.set(`${source}:${item.source_id}`, item);
  }
  return [...records.values()];
}

export function rankEditionResults(items, requestedIsbn = "") {
  let isbn;
  try {
    isbn = normalizeIsbn(requestedIsbn);
  } catch {
    isbn = null;
  }
  const score = (item) => {
    let exact = false;
    try {
      exact = !!isbn && normalizeIsbn(item.isbn) === isbn;
    } catch {
      /* No usable ISBN. */
    }
    const languages = item.languages || [];
    return (
      (exact ? 100 : 0) +
      (languages.includes("fr") ? 20 : languages.length ? 0 : 10)
    );
  };
  return [...items].sort((a, b) => score(b) - score(a));
}

export function groupEditionResults(items) {
  const groups = new Map();
  for (const item of items) {
    let key = `${item.source || item.lookup_source || "openlibrary"}:${item.source_id}`;
    try {
      if (item.isbn) key = normalizeIsbn(item.isbn);
    } catch {
      /* Keep unidentifiable notices separate. */
    }
    if (!groups.has(key)) groups.set(key, { key, notices: [], conflicts: [] });
    groups.get(key).notices.push(item);
  }
  for (const group of groups.values()) {
    group.conflicts = [
      "page_count",
      "publisher",
      "published_date",
      "format",
      "languages",
    ].filter(
      (key) =>
        new Set(
          group.notices
            .filter((n) => hasValue(n[key]))
            .map((n) => JSON.stringify(n[key])),
        ).size > 1,
    );
  }
  return [...groups.values()];
}

const identityTokens = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .split(/[^a-z0-9]+/)
    .filter(
      (w) =>
        w.length > 1 &&
        ![
          "le",
          "la",
          "les",
          "de",
          "des",
          "du",
          "un",
          "une",
          "the",
          "and",
        ].includes(w),
    );
export function identityConflict(local, candidate) {
  if (!local) return false;
  return ["title", "author"].some((key) => {
    const a = identityTokens(local[key]),
      b = identityTokens(candidate[key]);
    return a.length > 0 && b.length > 0 && !a.some((word) => b.includes(word));
  });
}

export function editionLanguageLabel(item) {
  const languages = item.languages || [];
  if (!languages.length) return "Langue inconnue";
  return languages
    .map(
      (code) =>
        ({
          fr: "Français",
          en: "Anglais",
          de: "Allemand",
          es: "Espagnol",
          it: "Italien",
          nl: "Néerlandais",
        })[code] || code,
    )
    .join(", ");
}
