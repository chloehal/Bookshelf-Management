import { useState } from "react";
import { safeCoverUrl } from "../../book-cover.mjs";
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
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import {
  coverColor,
  coverForeground,
  formatAudioDuration,
  percent,
} from "../lib/library";

export function BookCover({ book, large = false }) {
  book = {
    ...book,
    title: book.title || "Sans titre",
    author: book.author || "Auteur non renseigné",
  };
  const [failedUrl, setFailedUrl] = useState(null);
  const imageUrl = safeCoverUrl(book.cover_url);
  const coverDate =
    book.cover_retrieved_at ||
    book.metadata_snapshot?.cover_provenance?.retrieved_at ||
    book.metadata_snapshot?.cover_retrieved_at;
  const bnfCover =
    imageUrl?.startsWith("https://openapi.bnf.fr/") && imageUrl !== failedUrl;
  return (
    <div
      className={`book-cover ${large ? "book-cover-large" : ""}`}
      style={{
        "--cover": coverColor(book),
        "--cover-ink": coverForeground(book),
      }}
      aria-hidden="true"
    >
      {imageUrl && imageUrl !== failedUrl && (
        <img
          className="edition-cover"
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
        />
      )}
      {bnfCover && (
        <span className="cover-credit">
          BnF{coverDate ? ` · ${coverDate}` : ""}
        </span>
      )}
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
function CardAudioForm({ duration, onSave, busy }) {
  const [checked, setChecked] = useState(duration > 0);
  const [hours, setHours] = useState(Math.floor(duration / 60));
  const [minutes, setMinutes] = useState(duration % 60);
  const [error, setError] = useState("");
  const nextDuration = checked ? Number(hours) * 60 + Number(minutes) : null;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (
      checked &&
      (!Number.isInteger(nextDuration) ||
        nextDuration < 1 ||
        nextDuration > 4294967295)
    ) {
      setError("Indique une durée audio d’au moins une minute.");
      return;
    }
    try {
      await onSave(nextDuration);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <form onSubmit={submit} className="border-t p-3">
      <fieldset disabled={busy} className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              setError("");
            }}
          />
          Disponible en audio
        </label>
        {checked && (
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>Heures</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Minutes</span>
              <Input
                type="number"
                min="0"
                max="59"
                step="1"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </div>
        )}
        {nextDuration !== (duration || null) && (
          <Button type="submit" size="sm" variant="outline">
            Enregistrer l’audio
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}

export function BookCard({ book, onOpen, current, loan, onSaveAudio, busy }) {
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
          {book.audio_duration_minutes > 0 && (
            <span className="small-label">
              Audio · {formatAudioDuration(book.audio_duration_minutes)}
            </span>
          )}
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
      {onSaveAudio && (
        <CardAudioForm
          key={book.audio_duration_minutes ?? 0}
          duration={book.audio_duration_minutes ?? 0}
          onSave={onSaveAudio}
          busy={busy}
        />
      )}
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
