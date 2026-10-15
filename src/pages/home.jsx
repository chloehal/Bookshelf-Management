import { ArrowRight, BookOpen, HandHeart, Plus, Trophy } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "../components/ui/card";
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
        title="Vue d’ensemble"
        description="Tes lectures, ta collection et les livres que tu prêtes."
      >
        <Button
          onClick={() => openModal({ type: "add" })}
          aria-label="Ajouter un livre"
        >
          <Plus />
          <span className="desktop-label">Ajouter un livre</span>
        </Button>
      </PageHeading>
      <div className="collection-strip">
        {[
          [stats.owned, "Livres dans la collection"],
          [stats.unread, "Livres à lire"],
          [stats.read, "Livres lus"],
        ].map(([value, label]) => (
          <Card key={label} className="gap-0 py-4">
            <CardContent className="px-4 sm:px-6">
              <p className="stat-tile-label">{label}</p>
              <p className="stat-tile-number">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="home-layout">
        <section className="current-section">
          {data.current.length ? (
            data.current
              .slice(0, 2)
              .map((entry, index) => (
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
                  onProgress={(id) =>
                    openModal({ type: "progress", bookId: id })
                  }
                />
              ))
          ) : (
            <Card>
              <CardContent>
                <Empty
                  title="Quelle sera ta prochaine lecture ?"
                  action={() => navigate("library")}
                  label="Choisir dans ma bibliothèque"
                >
                  Retrouve ici tes lectures en cours.
                </Empty>
              </CardContent>
            </Card>
          )}
          {data.current.length > 2 && (
            <Button variant="ghost" onClick={() => navigate("reading")}>
              Toutes mes lectures <ArrowRight />
            </Button>
          )}
        </section>
        <aside className="home-aside">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle>
                Challenge {data.challenge?.year || new Date().getFullYear()}
              </CardTitle>
              <CardDescription>Ton objectif de lecture annuel</CardDescription>
              <CardAction>
                <Trophy className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.challenge ? (
                <>
                  <div className="challenge-number">
                    {challengeRead}
                    <span>/ {data.challenge.goal}</span>
                  </div>
                  <p className="mt-2 mb-4 text-xs text-muted-foreground">
                    livres lus dans ta sélection
                  </p>
                  <Progress
                    value={percent(challengeRead, data.challenge.goal)}
                    aria-label="Progression du challenge"
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choisis le nombre de livres que tu souhaites lire cette année.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  data.challenge
                    ? navigate("challenge")
                    : openModal({ type: "challenge" })
                }
              >
                {data.challenge ? "Voir le challenge" : "Créer mon challenge"}
                <ArrowRight />
              </Button>
            </CardFooter>
          </Card>
          <button className="loan-summary" onClick={() => navigate("loans")}>
            <span className="loan-icon">
              <HandHeart size={20} />
            </span>
            <span>
              <strong>
                {activeLoans.length} prêt{activeLoans.length !== 1 ? "s" : ""}{" "}
                en cours
              </strong>
              <small>
                {activeLoans.length
                  ? "Suivre les livres chez tes proches"
                  : "Aucun livre prêté pour le moment"}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
        </aside>
      </div>
      <section className="next-section">
        <div className="section-title">
          <h2>Dans ta pile à lire</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("library")}>
            Tout voir <ArrowRight />
          </Button>
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
            Ajoute un livre à ta collection.
          </Empty>
        )}
      </section>
      <div className="mt-6 flex justify-end">
        <Button variant="link" onClick={() => navigate("stats")}>
          Toutes mes statistiques <ArrowRight />
        </Button>
      </div>
    </>
  );
}
