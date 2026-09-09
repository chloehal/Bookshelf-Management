import { useEffect, useRef, useState } from "react";
import { coverForeground } from "../lib/library";
import {
  getBookDisplayProps,
  getShelfItems,
  layoutShelves,
} from "../lib/shelf";

export function Bookshelf({ books, openBook }) {
  const container = useRef(null);
  const [width, setWidth] = useState(280);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const { items } = getShelfItems(books);
  const rows = layoutShelves(items, width);
  const spine = (book, flat = false) => {
    const props = getBookDisplayProps(book);
    return (
      <button
        key={book.id}
        type="button"
        className={flat ? "pile-book" : "book-spine"}
        data-read={Boolean(book.is_read)}
        style={{
          "--cover": props.color,
          "--cover-ink": coverForeground(book),
          width: flat ? props.height : props.width,
          height: flat ? props.width : props.height,
        }}
        title={`${book.title} — ${book.author} · ${flat ? "Lu" : "À lire"}`}
        aria-label={`Ouvrir ${book.title}`}
        onClick={() => openBook(book.id)}
      >
        <strong>{book.title}</strong>
        <span>{book.author}</span>
      </button>
    );
  };
  return (
    <div className="shelves">
      <p className="shelf-legend">
        Debout : à lire · Couchés : lus · Rangés par thème
      </p>
      <div ref={container}>
        {rows.map((row, i) => (
          <div className="shelf-row" key={i}>
            <div className="shelf">
              {row.map((item) =>
                item.type === "pile" ? (
                  <div
                    className="book-pile"
                    key={`pile-${item.books[0].book.id}`}
                    aria-label="Pile de livres lus"
                  >
                    {item.books.map(({ book }) => spine(book, true))}
                  </div>
                ) : (
                  <div className="shelf-standing" key={item.book.id}>
                    {spine(item.book)}
                  </div>
                ),
              )}
            </div>
            <div className="shelf-themes">
              {[
                ...new Set(
                  row
                    .filter((item) => item.type === "book")
                    .map((item) => item.book.genres?.[0] || "Sans genre"),
                ),
              ].map((theme) => (
                <span key={theme}>{theme}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
