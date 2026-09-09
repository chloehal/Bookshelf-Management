import test from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/lib/api.js";

test("refuse une réponse HTTP en erreur même si elle contient du JSON", async () => {
  const api = createApi(
    async () =>
      new Response(JSON.stringify({ error: "Titre requis" }), { status: 400 }),
  );
  await assert.rejects(api.request("books.php"), /Titre requis/);
});
test("refuse une réponse HTML sans exposer le document serveur", async () => {
  const api = createApi(async () => new Response("<html>erreur privée</html>"));
  await assert.rejects(api.request("books.php"), /Réponse du serveur/);
});
test("préserve les méthodes et champs PHP pour progression, prêt et wishlist", async () => {
  const calls = [];
  const api = createApi(async (url, init) => {
    calls.push([url, init.method, JSON.parse(init.body)]);
    return Response.json({ success: true });
  });
  await api.progress(3, 120, "2026-09-09");
  await api.loan(3, "Alice", "2026-09-09");
  await api.buy(3);
  assert.deepEqual(calls, [
    [
      "/api/reading.php",
      "POST",
      {
        action: "update_page",
        book_id: 3,
        current_page: 120,
        log_date: "2026-09-09",
      },
    ],
    [
      "/api/loans.php",
      "POST",
      { book_id: 3, person: "Alice", loan_date: "2026-09-09" },
    ],
    ["/api/wishlist.php", "POST", { id: 3 }],
  ]);
});
test("charge les cinq ressources existantes sans mutation", async () => {
  const calls = [];
  const api = createApi(async (url, init) => {
    calls.push([url, init.method]);
    return Response.json(url.includes("challenge") ? null : []);
  });
  const data = await api.load();
  assert.equal(calls.length, 5);
  assert.ok(calls.every(([, method]) => method === "GET"));
  assert.deepEqual(data, {
    books: [],
    current: [],
    loans: [],
    challenge: null,
    log: [],
  });
});
