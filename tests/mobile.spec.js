import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures.js";
async function setup(page) {
  const data = structuredClone(fixture);
  const writes = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      name = url.pathname.split("/").pop();
    if (req.method() === "GET") {
      const result =
        name === "books.php"
          ? data.books
          : name === "loans.php"
            ? data.loans
            : name === "challenge.php"
              ? data.challenge
              : url.searchParams.get("action") === "heatmap"
                ? data.log
                : data.current;
      return route.fulfill({ json: result });
    }
    const body = req.postDataJSON();
    writes.push({
      name,
      method: req.method(),
      body,
      action: url.searchParams.get("action"),
    });
    if (name === "books.php") {
      if (req.method() === "POST")
        data.books.push({
          ...body,
          id: 99,
          is_read: false,
          is_wishlist: !!body.is_wishlist,
        });
      if (req.method() === "PUT")
        Object.assign(
          data.books.find((b) => b.id === body.id),
          body,
        );
      if (req.method() === "DELETE")
        data.books = data.books.filter((b) => b.id !== body.id);
    }
    if (name === "reading.php" && body.action === "update_page")
      data.current.find((b) => b.book_id === body.book_id).current_page =
        body.current_page;
    if (name === "reading.php" && body.action === "finish") {
      data.current = data.current.filter((b) => b.book_id !== body.book_id);
      data.books.find((b) => b.id === body.book_id).is_read = true;
    }
    if (name === "wishlist.php")
      data.books.find((b) => b.id === body.id).is_wishlist = false;
    if (name === "loans.php" && body.action === "return")
      data.loans.find((l) => l.id === body.id).returned_date = "2026-09-09";
    if (name === "loans.php" && req.method() === "POST" && !body.action) {
      const b = data.books.find((b) => b.id === body.book_id);
      data.loans.push({
        ...body,
        id: 99,
        title: b.title,
        author: b.author,
        returned_date: null,
      });
    }
    await route.fulfill({ json: { success: true, id: 99 } });
  });
  await page.goto("/");
  return { data, writes };
}
test("navigation mobile, filtre sans accents et retour navigateur", async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByRole("heading", { name: "Un chapitre à la fois." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Bibliothèque" })
    .click();
  await page.getByPlaceholder("Un titre, un auteur, un genre…").fill("ecume");
  await expect(
    page.getByRole("button", { name: "Ouvrir L’Écume des jours" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir Dune" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Ouvrir L’Écume des jours" }).click();
  await expect(
    page.getByRole("heading", { name: "L’Écume des jours", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByPlaceholder("Un titre, un auteur, un genre…"),
  ).toHaveValue("ecume");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("ajouter et modifier un livre conserve les champs PHP existants", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page
    .getByRole("button", { name: "Ajouter un livre", exact: true })
    .first()
    .click();
  await page.getByLabel("Titre", { exact: true }).fill("Mon nouveau livre");
  await page.getByLabel("Auteur", { exact: true }).fill("Alice");
  await page.getByLabel("Genres", { exact: true }).fill("Roman, Essai");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes[0].body.title).toBe("Mon nouveau livre");
  expect(writes[0].method).toBe("POST");
  await page.goto("/#/library");
  await page.getByRole("button", { name: "Ouvrir Mon nouveau livre" }).click();
  await page.getByRole("button", { name: "Modifier le livre" }).click();
  await page.getByLabel("Titre", { exact: true }).fill("Un autre titre");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un autre titre", exact: true }),
  ).toBeVisible();
  expect(writes.at(-1).method).toBe("PUT");
});
test("enregistrer la progression puis terminer une lecture", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page
    .getByRole("button", { name: "Mettre à jour ma lecture" })
    .first()
    .click();
  await page.getByLabel("Page actuelle").fill("150");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("150 / 320 pages", { exact: true }),
  ).toBeVisible();
  expect(writes[0].body.current_page).toBe(150);
  await page.goto("/#/book/1");
  await page.getByRole("button", { name: "Terminer ce livre" }).click();
  await expect(
    page.getByRole("button", { name: "Marquer non lu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Commencer la lecture" }),
  ).toHaveCount(0);
  expect(writes.at(-1).body.action).toBe("finish");
});
test("rendre un prêt et transformer un souhait en livre possédé", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page.goto("/#/loans");
  await page.getByRole("button", { name: "Marquer comme rendu" }).click();
  await expect(page.getByText("Aucun prêt en cours")).toBeVisible();
  expect(writes[0].body).toEqual({ action: "return", id: 1 });
  await page.goto("/#/wishlist");
  await page.getByRole("button", { name: "Ouvrir Une chambre à soi" }).click();
  await page.getByRole("button", { name: "Je l’ai acheté" }).click();
  await expect(
    page.getByRole("button", { name: "Commencer la lecture" }),
  ).toBeVisible();
  expect(writes.at(-1).name).toBe("wishlist.php");
});
test("une erreur de sauvegarde garde les données saisies et permet de réessayer", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/books.php", async (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 500,
          json: { error: "Enregistrement indisponible" },
        })
      : route.fallback(),
  );
  await page
    .getByRole("button", { name: "Ajouter un livre", exact: true })
    .first()
    .click();
  await page.getByLabel("Titre", { exact: true }).fill("À conserver");
  await page.getByLabel("Auteur", { exact: true }).fill("Alice");
  await page.getByLabel("Genres", { exact: true }).fill("Roman");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Enregistrement indisponible",
  );
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "À conserver",
  );
});
test("toutes les rubriques restent accessibles sur ordinateur", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  for (const path of [
    "library",
    "reading",
    "loans",
    "more",
    "wishlist",
    "challenge",
    "stats",
    "quiz",
  ]) {
    await page.goto(`/#/${path}`);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("le sélecteur de challenge attend la sauvegarde et affiche la véritable erreur", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/challenge.php?action=add_book", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      status: 500,
      json: { error: "Ajout au challenge indisponible" },
    });
  });
  await page.goto("/#/challenge");
  await page
    .locator("main")
    .getByRole("button", { name: "Ajouter un livre", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ouvrir La Vie devant soi" })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Annuler" }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "Ajout au challenge indisponible",
  );
});

test("un prêt ne propose que les livres disponibles", async ({ page }) => {
  const { writes } = await setup(page);
  await page.goto("/#/book/5");
  await page
    .getByRole("button", { name: "Prêter ce livre", exact: true })
    .click();
  await page.getByLabel("Prêté à", { exact: true }).fill("Alice");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Chez Alice", { exact: true })).toBeVisible();
  expect(writes[0].body.book_id).toBe(5);
  expect(writes[0].body.person).toBe("Alice");
});
test("supprimer un livre exige une confirmation et retire la fiche", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page.goto("/#/book/5");
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "La bibliothèque." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ouvrir Les Villes invisibles" }),
  ).toHaveCount(0);
  expect(writes[0].method).toBe("DELETE");
});
test("le quiz conserve les genres des livres lus et termine en sept choix maximum", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/quiz");
  await page.getByRole("button", { name: "Commencer le quiz" }).click();
  let seenReadGenre = false;
  for (let i = 0; i < 7; i++) {
    if (
      await page
        .getByRole("button", { name: "Recommencer", exact: true })
        .isVisible()
    )
      break;
    const buttons = page.locator(".quiz-duel button");
    const text = await buttons.allTextContents();
    const match = text.findIndex(
      (t) => t.includes("Science-fiction") || t.includes("Voyage"),
    );
    if (match >= 0) seenReadGenre = true;
    await buttons.nth(match >= 0 ? match : 0).click();
  }
  await expect(
    page.getByRole("button", { name: "Recommencer", exact: true }),
  ).toBeVisible();
  expect(seenReadGenre).toBe(true);
});
test("les états vides et les écrans étroits ne débordent pas", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of [
    "home",
    "library",
    "reading",
    "loans",
    "more",
    "wishlist",
    "challenge",
    "stats",
    "quiz",
    "book/1",
  ]) {
    await page.goto(`/#/${path}`);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("challenge") ? null : [],
    }),
  );
  await page.reload();
  await page.goto("/#/library");
  await expect(page.getByText("La première page est à écrire.")).toBeVisible();
});
