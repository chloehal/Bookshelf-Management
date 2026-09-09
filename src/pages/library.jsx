import { useState } from "react";
import {
  Search,
  Plus,
  LayoutGrid,
  LibraryBig,
  SlidersHorizontal,
  X,
  ArrowLeft,
  Gift,
  HandHeart,
  Pencil,
  Trash2,
  BookOpen,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  BookCard,
  BookCover,
  ReadingCard,
  Rating,
  Empty,
  PageHeading,
} from "../components/books";
import { Choice } from "../components/forms";
import {
  filterBooks,
  coverColor,
  coverForeground,
  dateLabel,
} from "../lib/library";
import { api } from "../lib/api";
export function LibraryPage({
  data,
  openBook,
  openModal,
  filters,
  setFilters,
  wishlist = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const source = data.books.filter((b) => Boolean(b.is_wishlist) === wishlist),
    genres = [...new Set(source.flatMap((b) => b.genres || []))].sort(),
    authors = [...new Set(source.map((b) => b.author))].sort();
  const books = filterBooks(data.books, {
    ...filters,
    wishlist,
    current: data.current,
    loans: data.loans,
  });
  const set = (key, value) => setFilters({ ...filters, [key]: value });
  return (
    <>
      <PageHeading
        eyebrow={wishlist ? "LES PROCHAINES HISTOIRES" : "MA COLLECTION"}
        title={wishlist ? "Mes envies." : "La bibliothèque."}
        description={`${source.length} livre${source.length !== 1 ? "s" : ""} ${wishlist ? "à découvrir" : "à soi"}.`}
      >
        <Button
          onClick={() => openModal({ type: "add", wishlist })}
          aria-label={wishlist ? "Ajouter un souhait" : "Ajouter un livre"}
        >
          <Plus size={18} />
          <span className="desktop-label">
            {wishlist ? "Ajouter une envie" : "Ajouter un livre"}
          </span>
        </Button>
      </PageHeading>
      <div className="catalogue-tools">
        <div className="search-field">
          <Search size={18} />
          <Input
            placeholder="Un titre, un auteur, un genre…"
            aria-label="Rechercher dans la bibliothèque"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
          {filters.search && (
            <button
              aria-label="Effacer la recherche"
              onClick={() => set("search", "")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} />
          <span className="desktop-label">Filtres</span>
        </Button>
      </div>
      <div className="catalogue-bar">
        <div className="filter-pills">
          {(wishlist
            ? [["all", "Toutes mes envies"]]
            : [
                ["all", "Tous"],
                ["unread", "À lire"],
                ["current", "En cours"],
                ["read", "Lus"],
                ["loaned", "Prêtés"],
                ["gift", "Cadeaux"],
                ["rated", "Notés"],
              ]
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={filters.status === key}
              onClick={() => set("status", key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="view-switch"
          role="group"
          aria-label="Affichage du catalogue"
        >
          <button
            aria-label="Vue cartes"
            aria-pressed={filters.view !== "shelf"}
            onClick={() => set("view", "grid")}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            aria-label="Vue étagère"
            aria-pressed={filters.view === "shelf"}
            onClick={() => set("view", "shelf")}
          >
            <LibraryBig size={18} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="filter-panel">
          <Choice
            label="Genre"
            value={filters.genre}
            onChange={(v) => set("genre", v)}
            options={[["all", "Tous les genres"], ...genres.map((g) => [g, g])]}
          />
          <Choice
            label="Auteur"
            value={filters.author}
            onChange={(v) => set("author", v)}
            options={[
              ["all", "Tous les auteurs"],
              ...authors.map((a) => [a, a]),
            ]}
          />
          <Choice
            label="Trier les livres"
            value={filters.sort}
            onChange={(v) => set("sort", v)}
            options={[
              ["title", "Titre A → Z"],
              ["author", "Auteur A → Z"],
              ["recent", "Derniers ajouts"],
              ["year", "Année d’acquisition"],
              ["rating", "Meilleures notes"],
              ["pages", "Nombre de pages"],
            ]}
          />
          <Button
            variant="ghost"
            onClick={() =>
              setFilters({
                ...filters,
                status: "all",
                genre: "all",
                author: "all",
                search: "",
                sort: "title",
              })
            }
          >
            Réinitialiser
          </Button>
        </div>
      )}
      <div className="section-caption">
        <span>
          {books.length} livre{books.length !== 1 ? "s" : ""}
        </span>
        <span>
          {filters.view === "shelf" ? "Sur les étagères" : "Entre les pages"}
        </span>
      </div>
      {!books.length ? (
        <Empty
          icon={Search}
          title={
            source.length
              ? "Aucun livre ne correspond"
              : "La première page est à écrire."
          }
          action={
            !source.length
              ? () => openModal({ type: "add", wishlist })
              : undefined
          }
        >
          {source.length
            ? "Essaie un autre titre ou ajuste les filtres."
            : "Ajoute ton premier livre à la collection."}
        </Empty>
      ) : filters.view === "shelf" ? (
        <div className="shelves">
          {Array.from({ length: Math.ceil(books.length / 9) }, (_, i) => (
            <div className="shelf" key={i}>
              {books.slice(i * 9, i * 9 + 9).map((b) => (
                <button
                  className="book-spine"
                  style={{
                    "--cover": coverColor(b),
                    "--cover-ink": coverForeground(b),
                    height: `${150 + (b.size || (b.id % 3) + 1) * 16}px`,
                  }}
                  onClick={() => openBook(b.id)}
                  key={b.id}
                  aria-label={`Ouvrir ${b.title}`}
                >
                  <span>{b.author}</span>
                  <strong>{b.title}</strong>
                  <BookOpen size={14} />
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="book-grid">
          {books.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              onOpen={openBook}
              current={data.current.some((c) => c.book_id === b.id)}
              loan={data.loans.find(
                (l) => l.book_id === b.id && !l.returned_date,
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
export function BookPage({ id, data, openModal, run, busy, navigate }) {
  const book = data.books.find((b) => b.id === Number(id));
  if (!book)
    return (
      <>
        <PageHeading title="Livre introuvable." />
        <Button onClick={() => navigate("library")}>
          Retour à la bibliothèque
        </Button>
      </>
    );
  const current = data.current.find((c) => c.book_id === book.id),
    loan = data.loans.find((l) => l.book_id === book.id && !l.returned_date);
  return (
    <>
      <button
        className="back-link"
        onClick={() => navigate(book.is_wishlist ? "wishlist" : "library")}
      >
        <ArrowLeft size={17} />
        La bibliothèque
      </button>
      <article className="book-detail">
        <div className="detail-cover">
          <BookCover book={book} large />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">
            {book.is_wishlist
              ? "DANS MES ENVIES"
              : current
                ? "EN COURS DE LECTURE"
                : book.is_read
                  ? "DÉJÀ LU"
                  : "DANS MA BIBLIOTHÈQUE"}
          </p>
          <h1>{book.title}</h1>
          <p className="detail-author">{book.author}</p>
          <div className="reading-genres">
            {book.genres?.map((g) => (
              <Badge variant="secondary" key={g}>
                {g}
              </Badge>
            ))}
          </div>
          <Rating
            value={book.rating || 0}
            disabled={busy}
            onChange={(rating) =>
              run(() => api.rate(book.id, rating), "Note enregistrée.")
            }
          />
          <dl className="book-facts">
            <div>
              <dt>Pages</dt>
              <dd>{book.page_count || "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Acquisition</dt>
              <dd>
                {book.is_gift ? (
                  <>
                    <Gift size={15} />
                    Cadeau
                  </>
                ) : (
                  book.year || "Non renseignée"
                )}
              </dd>
            </div>
            <div>
              <dt>Disponibilité</dt>
              <dd>
                {book.is_wishlist
                  ? "À acquérir"
                  : loan
                    ? `Chez ${loan.person}`
                    : "À la maison"}
              </dd>
            </div>
          </dl>
          <div className="detail-actions">
            {book.is_wishlist ? (
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.buy(book.id),
                    "Le livre rejoint ta bibliothèque.",
                  )
                }
              >
                Je l’ai acheté
              </Button>
            ) : (
              <>
                {current ? (
                  <>
                    <Button
                      onClick={() =>
                        openModal({ type: "progress", bookId: book.id })
                      }
                    >
                      Mettre à jour ma lecture
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api.reading("finish", book.id),
                          "Lecture terminée !",
                        )
                      }
                    >
                      Terminer ce livre
                    </Button>
                  </>
                ) : (
                  <>
                    {!book.is_read && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api.reading("start", book.id),
                            "Bonne lecture !",
                          )
                        }
                      >
                        <BookOpen size={17} />
                        Commencer la lecture
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api.toggleRead(book.id),
                          "Statut de lecture enregistré.",
                        )
                      }
                    >
                      {book.is_read ? "Marquer non lu" : "Marquer comme lu"}
                    </Button>
                  </>
                )}
                {loan ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.returnLoan(loan.id),
                        "Le livre est de retour.",
                      )
                    }
                  >
                    Marquer comme rendu
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => openModal({ type: "loan", bookId: book.id })}
                  >
                    <HandHeart size={17} />
                    Prêter ce livre
                  </Button>
                )}
              </>
            )}
          </div>
          {current && (
            <p className="detail-note">
              Page {current.current_page}
              {book.page_count ? ` sur ${book.page_count}` : ""} · commencé le{" "}
              {dateLabel(current.started_at)}
            </p>
          )}
          <div className="detail-secondary">
            <Button
              variant="ghost"
              onClick={() => openModal({ type: "edit", bookId: book.id })}
              aria-label="Modifier le livre"
            >
              <Pencil size={15} />
              Modifier
            </Button>
            {current && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.reading("dnf", book.id),
                    "Lecture retirée des lectures en cours.",
                  )
                }
              >
                Arrêter la lecture
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() =>
                openModal({
                  type: "confirm",
                  title: "Supprimer ce livre ?",
                  description:
                    "Le livre et les historiques associés seront supprimés définitivement.",
                  action: async () => {
                    await api.deleteBook(book.id);
                    navigate(book.is_wishlist ? "wishlist" : "library");
                  },
                  success: "Livre supprimé.",
                })
              }
            >
              <Trash2 size={15} />
              Supprimer
            </Button>
          </div>
        </div>
      </article>
    </>
  );
}
