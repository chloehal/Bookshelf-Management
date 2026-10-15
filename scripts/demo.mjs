// Serveur local de démonstration : état uniquement en mémoire, aucun accès à la BDD.
import http from "node:http";
import { fixture } from "../tests/fixtures.js";
const data = structuredClone(fixture);
let sequence = 100;
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url, "http://127.0.0.1"),
      name = url.pathname.split("/").pop(),
      action = url.searchParams.get("action");
    if (req.method === "GET") {
      const result =
        name === "books.php"
          ? data.books
          : name === "loans.php"
            ? data.loans
            : name === "challenge.php"
              ? data.challenge
              : action === "heatmap"
                ? data.log
                : data.current;
      return res.end(JSON.stringify(result));
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      const body = raw ? JSON.parse(raw) : {},
        book = data.books.find((b) => b.id === (body.id || body.book_id));
      if (name === "books.php") {
        if (req.method === "POST")
          data.books.push({
            ...body,
            id: sequence++,
            is_read: false,
            is_wishlist: !!body.is_wishlist,
          });
        if (req.method === "PUT" && book) Object.assign(book, body);
        if (req.method === "DELETE") {
          data.books = data.books.filter((b) => b.id !== body.id);
          data.current = data.current.filter((b) => b.book_id !== body.id);
          data.loans = data.loans.filter((b) => b.book_id !== body.id);
          if (data.challenge)
            data.challenge.books = data.challenge.books.filter(
              (b) => b.id !== body.id,
            );
        }
      }
      if (name === "rate.php" && book) book.rating = body.rating || null;
      if (name === "read.php" && book) book.is_read = !book.is_read;
      if (name === "wishlist.php" && book) book.is_wishlist = false;
      if (name === "reading.php") {
        if (
          body.action === "start" &&
          !data.current.some((c) => c.book_id === body.book_id)
        )
          data.current.push({
            ...book,
            id: sequence++,
            book_id: book.id,
            current_page: 0,
            started_at: new Date().toISOString().slice(0, 10),
          });
        if (body.action === "update_page")
          data.current.find((c) => c.book_id === body.book_id).current_page =
            body.current_page;
        if (["finish", "dnf"].includes(body.action)) {
          data.current = data.current.filter((c) => c.book_id !== body.book_id);
          if (body.action === "finish") book.is_read = true;
        }
      }
      if (name === "loans.php") {
        if (req.method === "DELETE")
          data.loans = data.loans.filter((l) => l.id !== body.id);
        else if (body.action === "return")
          data.loans.find((l) => l.id === body.id).returned_date = new Date()
            .toISOString()
            .slice(0, 10);
        else
          data.loans.push({
            ...body,
            id: sequence++,
            title: book.title,
            author: book.author,
            returned_date: null,
          });
      }
      if (name === "challenge.php") {
        if (req.method === "DELETE") data.challenge = null;
        else if (action === "add_book") data.challenge.books.push(book);
        else if (action === "remove_book")
          data.challenge.books = data.challenge.books.filter(
            (b) => b.id !== body.book_id,
          );
        else
          data.challenge = {
            id: sequence++,
            year: new Date().getFullYear(),
            goal: body.goal,
            books: [],
          };
      }
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Action de démonstration invalide." }));
    }
  })
  .listen(8018, "127.0.0.1", () =>
    console.log("Bibliothèque de démonstration : API locale sur 8018"),
  );
