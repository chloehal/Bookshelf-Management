const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
export function filterBooks(
  books,
  {
    search = "",
    status = "all",
    genre = "all",
    author = "all",
    sort = "title",
    wishlist = false,
    current = [],
    loans = [],
  } = {},
) {
  const currentIds = new Set(current.map((b) => b.book_id));
  const loanIds = new Set(
    loans.filter((l) => !l.returned_date).map((l) => l.book_id),
  );
  return books
    .filter((b) => Boolean(b.is_wishlist) === wishlist)
    .filter((b) =>
      normalize(
        `${b.title} ${b.author} ${(b.genres || []).join(" ")}`,
      ).includes(normalize(search)),
    )
    .filter((b) => genre === "all" || b.genres?.includes(genre))
    .filter((b) => author === "all" || b.author === author)
    .filter(
      (b) =>
        status === "all" ||
        (status === "read" && b.is_read) ||
        (status === "gift" && b.is_gift) ||
        (status === "rated" && b.rating > 0) ||
        (status === "unread" && !b.is_read) ||
        (status === "current" && currentIds.has(b.id)) ||
        (status === "loaned" && loanIds.has(b.id)),
    )
    .sort((a, b) =>
      sort === "year"
        ? (b.year || 0) - (a.year || 0)
        : sort === "rating"
          ? (b.rating || 0) - (a.rating || 0)
          : sort === "recent"
            ? b.id - a.id
            : sort === "pages"
              ? (b.page_count || 0) - (a.page_count || 0)
              : String(a[sort] || a.title).localeCompare(
                  String(b[sort] || b.title),
                  "fr",
                ),
    );
}
export function bookPayload(form) {
  const title = form.title.trim(),
    author = form.author.trim(),
    genres = String(form.genres)
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean)
      .slice(0, 3);
  if (!title || !author || !genres.length)
    throw new Error("Titre, auteur et au moins un genre sont requis.");
  const page_count = form.page_count ? Number(form.page_count) : null;
  if (page_count !== null && (!Number.isInteger(page_count) || page_count < 1))
    throw new Error("Le nombre de pages doit être un entier positif.");
  const size = form.size ? Number(form.size) : null;
  if (size !== null && ![1, 2, 3].includes(size))
    throw new Error("Choisis une taille : petit, moyen ou grand.");
  return {
    title,
    author,
    genres,
    page_count,
    year: form.year ? Number(form.year) : null,
    color: form.color || null,
    size,
    is_gift: !!form.is_gift,
  };
}
export function progressValue(value, mode, total) {
  const number = Number(value);
  if (value === "" || !Number.isFinite(number) || number < 0)
    throw new Error("Indique une progression valide.");
  if (mode === "percent" && !total)
    throw new Error(
      "Renseigne le nombre de pages du livre avant de saisir un pourcentage.",
    );
  const page = mode === "percent" ? Math.round((number * total) / 100) : number;
  if (!Number.isInteger(page))
    throw new Error("Indique un numéro de page entier.");
  if (total && page > total)
    throw new Error(
      "La progression ne peut pas dépasser le nombre de pages du livre.",
    );
  return page;
}
export function statsFor(books, log) {
  const owned = books.filter((b) => !b.is_wishlist),
    read = owned.filter((b) => b.is_read),
    rated = owned.filter((b) => b.rating);
  const countBy = (key) =>
    Object.entries(
      owned.reduce((a, b) => {
        for (const v of key === "genres" ? b.genres || [] : [b[key]])
          a[v] = (a[v] || 0) + 1;
        return a;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
  return {
    owned: owned.length,
    read: read.length,
    unread: owned.length - read.length,
    totalPages: owned.reduce((s, b) => s + (b.page_count || 0), 0),
    readPages: read.reduce((s, b) => s + (b.page_count || 0), 0),
    knownPages: owned.filter((b) => b.page_count).length,
    averageRating: rated.length
      ? rated.reduce((s, b) => s + b.rating, 0) / rated.length
      : null,
    gifts: owned.filter((b) => b.is_gift).length,
    authors: countBy("author"),
    genres: countBy("genres"),
    loggedPages: log.reduce((s, d) => s + d.pages, 0),
    activeDays: log.filter((d) => d.pages > 0).length,
  };
}
export const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("fr-BE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : "—";
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const percent = (part, total) =>
  total ? Math.min(100, Math.round((part / total) * 100)) : 0;
export const palette = [
  "#86513d",
  "#345654",
  "#6b604e",
  "#564863",
  "#a46b35",
  "#395064",
  "#784947",
  "#586343",
];
export function coverColor(book) {
  return /^#[0-9a-f]{6}$/i.test(book.color || "")
    ? book.color
    : palette[Math.abs(book.id || book.title.length) % palette.length];
}

// Choose the higher contrast foreground for user-selected binding colours.
export function coverForeground(book) {
  const hex = coverColor(book).slice(1);
  const rgb = [0, 2, 4]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance > 0.179 ? "#171610" : "#ffffff";
}
