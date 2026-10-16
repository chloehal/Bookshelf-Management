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
async function setup(
  page,
  { incomplete = false, provider = "openlibrary" } = {},
) {
  const data = structuredClone(fixture),
    writes = [];
  const provided =
    provider === "bnf"
      ? {
          ...candidate,
          source: "bnf",
          source_id: "cb485048536",
          title: "Lux",
          author: "Maxime Chattam",
          isbn: "9782266311281",
          page_count: 665,
          publisher: "Pocket",
          published_date: "2025",
          genres: ["thriller"],
          cover_url:
            "https://openapi.bnf.fr/couverture/image/image/recupererImage?idArk=ark%3A%2F12148%2Fcb485048536&couverture=1",
          cover_retrieved_at: "2026-10-16",
        }
      : provider === "sudoc"
        ? {
            ...candidate,
            source: "sudoc",
            source_id: "292390726",
            title: "Les passeurs de livres de Daraya",
            author: "Delphine Minoui",
            isbn: "9791041426027",
            page_count: 177,
            publisher: "Édition points",
            published_date: "2025",
            cover_url: null,
          }
        : candidate;
  const lookups = [];
  await page.route("https://openapi.bnf.fr/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#d5c69a"/></svg>',
    }),
  );
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
      lookups.push(url.search);
      if (failSearch)
        return route.fulfill({
          status: 502,
          json: { error: "API indisponible" },
        });
      const items = url.searchParams.has("editions")
        ? [
            {
              ...provided,
              source: undefined,
              edition_result: true,
              publisher: "Autre édition",
            },
          ]
        : url.searchParams.has("title")
          ? [{ ...provided, source: undefined, work_id: "OL42W" }]
          : url.searchParams.has("editions") || url.searchParams.has("work")
            ? [{ ...provided, source: undefined, publisher: "Autre édition" }]
            : [provided];
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
        book.metadata_source = body.candidate.source;
        book.metadata_source_id = body.candidate.source_id;
      } else
        data.books.push({
          ...body.values,
          id: 99,
          is_read: false,
          is_wishlist: false,
          metadata_source: body.candidate.source,
          metadata_snapshot: body.candidate,
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
    lookups,
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
      page.getByRole("region", { name: "Recherche bibliographique" }),
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

test("un ISBN absent d’Open Library peut être ajouté puis réconcilié depuis la BnF", async ({
  page,
}) => {
  const state = await setup(page, { provider: "bnf" });
  await page.getByLabel("ISBN-10 ou ISBN-13").fill("978-2-266-31128-1");
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier avant ajout" }).click();
  await expect(
    page.getByRole("link", { name: "Voir l’édition dans BnF" }),
  ).toHaveAttribute("href", "https://catalogue.bnf.fr/ark:/12148/cb485048536");
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue("Lux");
  await expect(page.getByLabel("Nombre de pages", { exact: true })).toHaveValue(
    "665",
  );
  await expect(page.locator(".cover-credit")).toContainText("BnF · 2026-10-16");
  await page
    .getByRole("button", { name: "Ajouter à la bibliothèque", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Afficher", exact: true })
    .selectOption("linked");
  await expect(
    page.getByRole("region", { name: "Fiches existantes" }),
  ).toContainText("Liée à BnF");
  expect(state.writes[0].candidate.source).toBe("bnf");
  await page.getByRole("button", { name: "Comparer à nouveau" }).click();
  await expect(
    page.getByRole("heading", { name: "Réconcilier « Lux »" }),
  ).toBeVisible();
  expect(
    state.lookups.some((query) => query.includes("bnf=cb485048536")),
  ).toBeTruthy();
});

test("une fiche Sudoc peut être ajoutée puis comparée à nouveau", async ({
  page,
}) => {
  const state = await setup(page, { provider: "sudoc" });
  await page.getByLabel("ISBN-10 ou ISBN-13").fill("9791041426027");
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier avant ajout" }).click();
  await expect(
    page.getByRole("link", { name: "Voir l’édition dans Sudoc" }),
  ).toHaveAttribute("href", "https://www.sudoc.fr/292390726");
  await expect(page.getByLabel("Nombre de pages", { exact: true })).toHaveValue(
    "177",
  );
  await page
    .getByRole("button", { name: "Ajouter à la bibliothèque", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Afficher", exact: true })
    .selectOption("linked");
  await expect(
    page.getByRole("region", { name: "Fiches existantes" }),
  ).toContainText("Liée à Sudoc");
  expect(state.writes[0].candidate.source).toBe("sudoc");
  await page.getByRole("button", { name: "Comparer à nouveau" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Réconcilier « Les passeurs de livres de Daraya »",
    }),
  ).toBeVisible();
  expect(
    state.lookups.some((query) => query.includes("sudoc=292390726")),
  ).toBeTruthy();
});

test("les autres éditions regroupent les catalogues et conservent les pages déjà chargées", async ({
  page,
}) => {
  await setup(page, { provider: "sudoc" });
  const bnf = {
    ...candidate,
    source: "bnf",
    source_id: "cb485048536",
    title: "Édition BnF",
    edition_result: true,
  };
  const sudoc = {
    ...candidate,
    source: "sudoc",
    source_id: "292390726",
    title: "Édition Sudoc",
    edition_result: true,
  };
  const calls = [];
  await page.route("**/api/catalog.php?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (!params.has("editions")) return route.fallback();
    calls.push(Object.fromEntries(params));
    const second = params.has("sudoc_offset");
    return route.fulfill({
      json: {
        items: second
          ? [bnf, sudoc]
          : [
              {
                ...candidate,
                title: "Édition Open Library",
                edition_result: true,
              },
              bnf,
            ],
        warnings: second
          ? []
          : ["Sudoc indisponible : les résultats sont incomplets."],
        next: second
          ? null
          : {
              editions: 1,
              title: "Les passeurs de livres de Daraya",
              author: "Delphine Minoui",
              openlibrary_offset: -1,
              bnf_offset: -1,
              sudoc_offset: 0,
            },
      },
    });
  });
  await page.getByLabel("ISBN-10 ou ISBN-13").fill("9791041426027");
  await page
    .getByRole("button", { name: "Rechercher par ISBN", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Voir les autres éditions", exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Recherche bibliographique",
  });
  await expect(results).toContainText("Édition Open Library");
  await expect(results).toContainText("Édition BnF");
  await expect(results).toContainText("Sudoc indisponible");
  expect(calls[0].title).toBe("Les passeurs de livres de Daraya");
  expect(calls[0].author).toBe("Delphine Minoui");
  await page
    .getByRole("button", { name: "Charger les éditions suivantes" })
    .click();
  await expect(results.locator(".import-result")).toHaveCount(3);
  await expect(results).toContainText("Édition Open Library");
  await expect(results).toContainText("Édition Sudoc");
  await expect(results).not.toContainText("Sudoc indisponible");
  await expect(
    page.getByRole("button", { name: "Charger les éditions suivantes" }),
  ).toHaveCount(0);
  await results
    .locator(".import-result")
    .filter({ hasText: "Édition Sudoc" })
    .getByRole("button", { name: "Vérifier avant ajout" })
    .click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Édition Sudoc",
  );
  await expect(
    page.getByRole("link", { name: "Voir l’édition dans Sudoc" }),
  ).toBeVisible();
});
