import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures.js";
import { convertProgress } from "../catalog.mjs";
const candidate = {
  source: "openlibrary",
  source_id: "OL123M",
  title: "L’Écume API",
  author: "Boris Vian",
  genres: ["Fiction"],
  page_count: 400,
  isbn: "9780306406157",
  publisher: "Gallimard",
  published_date: "2020",
  cover_url: "https://covers.openlibrary.org/b/id/123-M.jpg?default=false",
};
test.setTimeout(60000);
async function setup(page, { incomplete = false } = {}) {
  const data = structuredClone(fixture),
    writes = [];
  let failSearch = false,
    failSave = false;
  await page.route("https://covers.openlibrary.org/**", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      name = url.pathname.split("/").pop();
    if (name === "catalog.php") {
      if (failSearch)
        return route.fulfill({
          status: 502,
          json: { error: "API indisponible" },
        });
      const items = url.searchParams.has("title")
        ? [{ ...candidate, source: undefined, work_id: "OL42W" }]
        : url.searchParams.has("work")
          ? [{ ...candidate, source: undefined, publisher: "Autre édition" }]
          : [candidate];
      return route.fulfill({
        json: {
          items: incomplete
            ? items.map((item) => ({ ...item, title: null }))
            : items,
          next_offset: null,
        },
      });
    }
    if (req.method() === "GET")
      return route.fulfill({
        json:
          name === "books.php"
            ? data.books
            : name === "loans.php"
              ? data.loans
              : name === "challenge.php"
                ? data.challenge
                : url.searchParams.get("action") === "heatmap"
                  ? data.log
                  : data.current,
      });
    const body = req.postDataJSON();
    if (name === "book-import.php") {
      if (failSave)
        return route.fulfill({
          status: typeof failSave === "number" ? failSave : 500,
          json: { error: "Enregistrement impossible" },
        });
      writes.push(body);
      if (body.id) {
        const book = data.books.find((b) => b.id === body.id),
          oldTotal = book.page_count,
          current = data.current.find((b) => b.book_id === body.id);
        for (const [key, choice] of Object.entries(body.choices))
          if (choice === "api") book[key] = body.candidate[key];
        if (current) {
          current.current_page = convertProgress(
            current.current_page,
            oldTotal,
            book.page_count,
          );
          current.page_count = book.page_count;
        }
        book.metadata_source = "openlibrary";
        book.metadata_source_id = body.candidate.source_id;
      } else
        data.books.push({
          ...body.values,
          id: 99,
          is_read: false,
          is_wishlist: false,
          metadata_source: "openlibrary",
          metadata_source_id: body.candidate.source_id,
        });
    } else if (name === "books.php" && req.method() === "POST")
      data.books.push({ ...body, id: 100, is_read: false, is_wishlist: false });
    return route.fulfill({ json: { success: true, id: body.id || 99 } });
  });
  await page.goto("/#/import");
  await expect(
    page.getByRole("heading", { name: "Import Management", exact: true }),
  ).toBeVisible();
  return {
    data,
    writes,
    failSearch: (value) => {
      failSearch = value;
    },
    failSave: (value) => {
      failSave = value;
    },
  };
}
for (const width of [390, 1280])
  test(`import et réconciliation dans l’interface React à ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const state = await setup(page),
      log = structuredClone(state.data.log);
    await page
      .locator(".import-result")
      .filter({ hasText: "L’Écume des jours" })
      .getByRole("button", { name: "Rechercher une correspondance" })
      .click();
    await page
      .getByRole("button", { name: "Rechercher titre / auteur" })
      .click();
    await page
      .getByRole("button", { name: "Voir les autres éditions" })
      .click();
    await expect(
      page.getByRole("region", { name: "Recherche Open Library" }),
    ).toContainText("Autre édition");
    await page.getByRole("button", { name: "Comparer cette édition" }).click();
    await expect(
      page.getByRole("heading", { name: "Réconcilier « L’Écume des jours »" }),
    ).toBeVisible();
    await expect(
      page.locator('input[name="reconcile-title"]').first(),
    ).toBeChecked();
    await page.locator('input[name="reconcile-page_count"]').nth(1).check();
    await expect(
      page.getByRole("status").filter({ hasText: "Progression adaptée" }),
    ).toContainText("112 / 320 → page 140 / 400");
    state.failSave(true);
    await page
      .getByRole("button", { name: "Enregistrer mes choix et lier la fiche" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Enregistrement impossible",
    );
    state.failSave(false);
    await page
      .getByRole("button", { name: "Enregistrer mes choix et lier la fiche" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Import Management", exact: true }),
    ).toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].choices.title).toBe("local");
    expect(state.writes[0].choices.page_count).toBe("api");
    expect(state.data.current[0].current_page).toBe(140);
    expect(state.data.log).toEqual(log);
    await page
      .getByRole("combobox", { name: "Afficher", exact: true })
      .selectOption("linked");
    await page.getByRole("button", { name: "Comparer à nouveau" }).click();
    await expect(
      page.getByRole("heading", { name: "Réconcilier « L’Écume des jours »" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByLabel("ISBN-10 ou ISBN-13").fill(candidate.isbn);
    await page.getByRole("button", { name: "Nouveau livre par ISBN" }).click();
    await page.getByLabel("ISBN-10 ou ISBN-13").fill(candidate.isbn);
    await page
      .getByRole("button", { name: "Rechercher par ISBN", exact: true })
      .click();
    await page.getByRole("button", { name: "Vérifier avant ajout" }).click();
    await expect(page.getByRole("alert")).toContainText("existe déjà");
    await expect(
      page.getByRole("button", {
        name: "Ajouter à la bibliothèque",
        exact: true,
      }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
test("ISBN, erreur réseau, nouveau livre et ajout manuel restent disponibles", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByLabel("ISBN-10 ou ISBN-13").fill("9780306406158");
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("valide");
  await page.getByLabel("ISBN-10 ou ISBN-13").fill(candidate.isbn);
  state.failSearch(true);
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("API indisponible");
  state.failSearch(false);
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier avant ajout" }).click();
  await page.getByLabel("Genres", { exact: true }).fill("SF, Aventure");
  await page
    .getByRole("button", { name: "Ajouter à la bibliothèque", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import Management", exact: true }),
  ).toBeVisible();
  expect(state.writes[0].values.genres).toEqual(["SF", "Aventure"]);
  expect(state.writes[0].candidate.genres).toEqual(["Fiction"]);
  await page.getByRole("button", { name: "Retour à l’ajout manuel" }).click();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Ajouter un livre", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre", { exact: true }).fill("Livre manuel");
  await dialog.getByLabel("Auteur", { exact: true }).fill("Mon auteur");
  await dialog.getByLabel("Genres", { exact: true }).fill("Roman");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(state.data.books.some((b) => b.title === "Livre manuel")).toBeTruthy();
});

test("une fiche API sans titre reste complétable sans casser les couvertures", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page, { incomplete: true });
  await page.getByLabel("ISBN-10 ou ISBN-13").fill(candidate.isbn);
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier avant ajout" }).click();
  await expect(
    page.getByRole("heading", { name: "Vérifier le nouveau livre" }),
  ).toBeVisible();
  await page.getByLabel("Titre", { exact: true }).fill("Titre complété");
  await page
    .getByRole("button", { name: "Ajouter à la bibliothèque", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import Management", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("un conflit recharge la fiche pour permettre une nouvelle comparaison", async ({
  page,
}) => {
  const state = await setup(page);
  const choose = () =>
    page
      .locator(".import-result")
      .filter({ hasText: "L’Écume des jours" })
      .getByRole("button", { name: "Rechercher une correspondance" })
      .click();
  await choose();
  await page.getByRole("button", { name: "Rechercher titre / auteur" }).click();
  await page.getByRole("button", { name: "Comparer cette édition" }).click();
  state.data.books[0].author = "Auteur corrigé ailleurs";
  state.failSave(409);
  await page
    .getByRole("button", { name: "Enregistrer mes choix et lier la fiche" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Enregistrement impossible",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await choose();
  await page.getByRole("button", { name: "Rechercher titre / auteur" }).click();
  await page.getByRole("button", { name: "Comparer cette édition" }).click();
  await expect(
    page.getByRole("group", { name: "Auteur · Différent", exact: true }),
  ).toBeVisible();
});
