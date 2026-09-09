import {
  BookOpen,
  ArrowUpRight,
  Bookmark,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { coverColor, coverForeground, percent } from "../lib/library";

export function BookCover({ book, large = false }) {
  return (
    <div
      className={`book-cover ${large ? "book-cover-large" : ""}`}
      style={{
        "--cover": coverColor(book),
        "--cover-ink": coverForeground(book),
      }}
      aria-hidden="true"
    >
      <span className="cover-face">
        <span className="cover-author">{book.author}</span>
        <span className="cover-rule" />
        <strong className={book.title.length > 32 ? "cover-title-long" : ""}>
          {book.title}
        </strong>
        <span className="cover-ornament" />
        <span className="cover-genre">
          {book.genres?.[0] || "Bibliothèque personnelle"}
        </span>
      </span>
    </div>
  );
}
export function Rating({ value = 0, onChange, disabled = false }) {
  return (
    <div
      className="rating"
      role={onChange ? "group" : undefined}
      aria-label={onChange ? "Note du livre" : `${value} sur 5 étoiles`}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            disabled={disabled}
            type="button"
            aria-label={`Noter ${n} sur 5`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            <Star size={20} fill={n <= value ? "currentColor" : "none"} />
          </button>
        ) : (
          <Star key={n} size={13} fill={n <= value ? "currentColor" : "none"} />
        ),
      )}
    </div>
  );
}
export function BookCard({ book, onOpen, current, loan }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        className="book-card"
        onClick={() => onOpen(book.id)}
        aria-label={`Ouvrir ${book.title}`}
      >
        <BookCover book={book} />
        <div className="book-card-copy">
          <div className="book-card-meta">
            <span>{book.genres?.[0] || "Livre"}</span>
            {current ? (
              <Bookmark size={13} />
            ) : book.is_read ? (
              <span className="read-dot" title="Lu" />
            ) : null}
          </div>
          <h3>{book.title}</h3>
          <p>{book.author}</p>
          {loan ? (
            <span className="small-label">Prêté à {loan.person}</span>
          ) : book.rating ? (
            <Rating value={book.rating} />
          ) : (
            <span className="small-label">
              {current
                ? "En cours"
                : book.is_read
                  ? "Lu"
                  : book.is_wishlist
                    ? "À offrir à ma bibliothèque"
                    : "À lire"}
            </span>
          )}
        </div>
      </button>
    </Card>
  );
}
export function BookRow({ book, onOpen, children }) {
  return (
    <div className="book-row">
      <button
        type="button"
        className="book-row-main"
        onClick={() => onOpen(book.id)}
        aria-label={`Ouvrir ${book.title}`}
      >
        <BookCover book={book} />
        <span>
          <strong>{book.title}</strong>
          <small>{book.author}</small>
        </span>
      </button>
      {children}
    </div>
  );
}
export function ReadingCard({
  entry,
  book,
  onOpen,
  onProgress,
  featured = false,
}) {
  const pct = percent(entry.current_page, entry.page_count);
  return (
    <Card className={featured ? "featured-reading" : ""}>
      <CardContent className="reading-layout px-4 sm:px-6">
        <button
          className="reading-cover-button"
          onClick={() => onOpen(book.id)}
          aria-label={`Ouvrir ${book.title}`}
        >
          <BookCover book={book} large />
        </button>
        <div className="reading-copy">
          <span className="eyebrow">
            <span className="live-dot" /> EN COURS DE LECTURE
          </span>
          <h2>{book.title}</h2>
          <p className="reading-author">{book.author}</p>
          <div className="reading-genres">
            {book.genres?.map((g) => (
              <Badge key={g} variant="secondary">
                {g}
              </Badge>
            ))}
          </div>
          <div className="reading-progress">
            <div>
              <span>
                {entry.current_page} / {entry.page_count || "—"} pages
              </span>
              <strong>{entry.page_count ? `${pct} %` : "En cours"}</strong>
            </div>
            <Progress value={pct} aria-label={`Progression de ${book.title}`} />
          </div>
          <Button
            onClick={() => onProgress(book.id)}
            aria-label="Mettre à jour ma lecture"
          >
            Mettre à jour <ArrowUpRight size={16} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
export function Empty({
  icon: Icon = BookOpen,
  title,
  children,
  action,
  label,
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && (
        <Button onClick={action}>
          <Plus size={16} />
          {label || "Ajouter un livre"}
        </Button>
      )}
    </div>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children}
    </header>
  );
}
