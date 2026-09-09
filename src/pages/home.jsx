import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  HandHeart,
  Plus,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { BookCard, ReadingCard, Empty, PageHeading } from "../components/books";
import { percent, statsFor } from "../lib/library";
export function HomePage({ data, navigate, openBook, openModal }) {
  const stats = statsFor(data.books, data.log),
    activeLoans = data.loans.filter((l) => !l.returned_date),
    next = data.books
      .filter(
        (b) =>
          !b.is_read &&
          !b.is_wishlist &&
          !data.current.some((c) => c.book_id === b.id),
      )
      .slice(0, 4),
    challengeRead = data.challenge?.books.filter((b) => b.is_read).length || 0;
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("fr-BE", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date())}
        title="Un chapitre à la fois."
        description="Heureuse de te retrouver entre les pages."
      >
        <Button
          variant="outline"
          onClick={() => openModal({ type: "add" })}
          aria-label="Ajouter un livre"
        >
          <Plus size={18} />
          <span className="desktop-label">Un nouveau livre</span>
        </Button>
      </PageHeading>
      <div className="home-layout">
        <section className="current-section">
          {data.current.length ? (
            data.current.slice(0, 2).map((entry, index) => (
              <ReadingCard
                key={entry.id}
                featured={index === 0}
                entry={entry}
                book={
                  data.books.find((b) => b.id === entry.book_id) || {
                    ...entry,
                    id: entry.book_id,
                  }
                }
                onOpen={openBook}
                onProgress={(id) => openModal({ type: "progress", bookId: id })}
              />
            ))
          ) : (
            <div className="paper-card">
              <Empty
                title="Quelle sera ta prochaine lecture ?"
                action={() => navigate("library")}
                label="Choisir dans ma bibliothèque"
              >
                Un livre, un moment pour toi.
              </Empty>
            </div>
          )}
          {data.current.length > 2 && (
            <Button variant="ghost" onClick={() => navigate("reading")}>
              Toutes mes lectures <ArrowRight size={16} />
            </Button>
          )}
        </section>
        <aside className="home-aside">
          <div className="challenge-card">
            <div className="section-kicker">
              <span className="eyebrow">
                CHALLENGE {data.challenge?.year || new Date().getFullYear()}
              </span>
              <BookOpen size={19} />
            </div>
            {data.challenge ? (
              <>
                <div className="challenge-number">
                  {challengeRead}
                  <span>/ {data.challenge.goal}</span>
                </div>
                <p>livres lus dans ton challenge</p>
                <Progress
                  value={percent(challengeRead, data.challenge.goal)}
                  aria-label="Progression du challenge"
                />
                <button
                  className="text-link"
                  onClick={() => navigate("challenge")}
                >
                  Mon challenge <ArrowUpRight size={16} />
                </button>
              </>
            ) : (
              <>
                <h2>Une année de découvertes.</h2>
                <p>Choisis ton objectif de lecture.</p>
                <Button
                  variant="outline"
                  onClick={() => openModal({ type: "challenge" })}
                >
                  Créer mon challenge
                </Button>
              </>
            )}
          </div>
          <button className="loan-summary" onClick={() => navigate("loans")}>
            <span className="loan-icon">
              <HandHeart size={22} />
            </span>
            <span>
              <strong>
                {activeLoans.length} livre{activeLoans.length !== 1 ? "s" : ""}{" "}
                en balade
              </strong>
              <small>
                {activeLoans.length
                  ? "Un petit tour chez tes proches."
                  : "Toute la bibliothèque est à la maison."}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        </aside>
      </div>
      <div className="collection-strip">
        <span>
          <strong>{stats.owned}</strong> livres à soi
        </span>
        <span>
          <strong>{stats.unread}</strong> histoires à découvrir
        </span>
        <span>
          <strong>{stats.read}</strong> livres lus
        </span>
        <button onClick={() => navigate("stats")}>
          Mes statistiques <ArrowRight size={15} />
        </button>
      </div>
      <section className="next-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">LA PILE À LIRE</p>
            <h2>Et après ?</h2>
          </div>
          <button className="text-link" onClick={() => navigate("library")}>
            Tout voir <ArrowRight size={16} />
          </button>
        </div>
        {next.length ? (
          <div className="book-grid home-books">
            {next.map((b) => (
              <BookCard
                book={b}
                key={b.id}
                onOpen={openBook}
                loan={activeLoans.find((l) => l.book_id === b.id)}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="La pile à lire est à jour."
            action={() => openModal({ type: "add" })}
          >
            Une place pour la prochaine découverte.
          </Empty>
        )}
      </section>
    </>
  );
}
