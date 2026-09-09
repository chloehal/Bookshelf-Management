import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Trash2,
  Shuffle,
  Trophy,
  BookOpen,
  Heart,
  ChartNoAxesCombined,
  ChevronRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Progress } from "../components/ui/progress";
import { PageHeading, ReadingCard, BookRow, Empty } from "../components/books";
import { percent, dateLabel } from "../lib/library";
import { api } from "../lib/api";
export function ReadingPage({ data, openBook, openModal, navigate }) {
  return (
    <>
      <PageHeading eyebrow="MON CARNET DE LECTURE" title="Au fil des pages." />
      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">
            En cours ({data.current.length})
          </TabsTrigger>
          <TabsTrigger value="read">Livres lus</TabsTrigger>
        </TabsList>
        <TabsContent value="current">
          <div className="reading-list">
            {data.current.map((c) => (
              <ReadingCard
                key={c.id}
                entry={c}
                book={
                  data.books.find((b) => b.id === c.book_id) || {
                    ...c,
                    id: c.book_id,
                  }
                }
                onOpen={openBook}
                onProgress={(id) => openModal({ type: "progress", bookId: id })}
              />
            ))}
          </div>
          {!data.current.length && (
            <Empty
              title="Une nouvelle histoire t’attend."
              action={() => navigate("library")}
              label="Choisir un livre"
            >
              Retrouve ici tes lectures en cours.
            </Empty>
          )}
        </TabsContent>
        <TabsContent value="read">
          <div className="paper-card">
            {data.books
              .filter((b) => b.is_read && !b.is_wishlist)
              .map((b) => (
                <BookRow key={b.id} book={b} onOpen={openBook} />
              ))}
            {!data.books.some((b) => b.is_read && !b.is_wishlist) && (
              <Empty title="Tes lectures terminées seront ici." />
            )}
          </div>
        </TabsContent>
      </Tabs>
      <div className="more-grid reading-links">
        <button onClick={() => navigate("challenge")}>
          <Trophy />
          <span>
            <strong>Mon challenge</strong>
            <small>Un objectif à ton rythme</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => navigate("stats")}>
          <ChartNoAxesCombined />
          <span>
            <strong>Mes statistiques</strong>
            <small>Ta bibliothèque en quelques chiffres</small>
          </span>
          <ChevronRight />
        </button>
      </div>
    </>
  );
}
export function LoansPage({ data, openBook, openModal, run, busy }) {
  const active = data.loans.filter((l) => !l.returned_date),
    history = data.loans.filter((l) => l.returned_date);
  const list = (loans) => (
    <div className="loans-list">
      {loans.map((l) => (
        <article key={l.id} className="loan-card">
          <div className="loan-person">
            <span className="person-avatar">
              {l.person.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{l.person}</strong>
              <p>Prêté le {dateLabel(l.loan_date)}</p>
            </div>
          </div>
          <BookRow
            book={
              data.books.find((b) => b.id === l.book_id) || {
                id: l.book_id,
                title: l.title,
                author: l.author,
              }
            }
            onOpen={openBook}
          />
          <div className="loan-card-actions">
            {l.returned_date ? (
              <span className="small-label">
                Rendu le {dateLabel(l.returned_date)}
              </span>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => api.returnLoan(l.id), "Le livre est de retour.")
                }
              >
                Marquer comme rendu
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Supprimer le prêt de ${l.title}`}
              onClick={() =>
                openModal({
                  type: "confirm",
                  title: "Supprimer ce prêt ?",
                  description:
                    "Cette entrée sera retirée de l’historique des prêts.",
                  action: () => api.deleteLoan(l.id),
                  success: "Prêt supprimé.",
                })
              }
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="LES LIVRES VOYAGENT AUSSI"
        title="Chez mes proches."
        description="Les belles histoires se partagent."
      >
        <Button
          onClick={() => openModal({ type: "loan" })}
          disabled={
            !data.books.some(
              (b) => !b.is_wishlist && !active.some((l) => l.book_id === b.id),
            )
          }
        >
          <Plus size={18} />
          Prêter un livre
        </Button>
      </PageHeading>
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">En cours ({active.length})</TabsTrigger>
          <TabsTrigger value="history">
            Historique ({history.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {active.length ? (
            list(active)
          ) : (
            <Empty title="Aucun prêt en cours">
              Tes livres sont à la maison.
            </Empty>
          )}
        </TabsContent>
        <TabsContent value="history">
          {history.length ? (
            list(history)
          ) : (
            <Empty title="Pas encore de livre rendu." />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
export function ChallengePage({ data, openBook, openModal, run, busy }) {
  const [result, setResult] = useState(null);
  const challenge = data.challenge,
    read = challenge?.books.filter((b) => b.is_read).length || 0;
  function draw() {
    const unread = challenge.books.filter((b) => !b.is_read);
    if (!unread.length) return;
    const pool = [
      ...unread,
      ...Array(Math.max(1, Math.floor(unread.length / 3))).fill(null),
    ];
    const b = pool[Math.floor(Math.random() * pool.length)];
    setResult(b ? { ...b, joker: false } : { joker: true });
  }
  return (
    <>
      <PageHeading
        eyebrow="À TON RYTHME"
        title={`Challenge ${challenge?.year || new Date().getFullYear()}.`}
      />
      {!challenge ? (
        <Empty
          icon={Trophy}
          title="Chaque livre compte."
          action={() => openModal({ type: "challenge" })}
          label="Créer mon challenge"
        >
          Choisis le nombre de livres que tu aimerais lire cette année.
        </Empty>
      ) : (
        <>
          <div className="challenge-banner">
            <div>
              <span className="eyebrow">MON OBJECTIF</span>
              <h2>
                {read}
                <span> / {challenge.goal} livres</span>
              </h2>
              <p>
                {read >= challenge.goal
                  ? "Objectif atteint. Bravo pour ces belles lectures !"
                  : `Encore ${challenge.goal - read} histoires pour atteindre ton objectif.`}
              </p>
            </div>
            <div>
              <Progress
                value={percent(read, challenge.goal)}
                aria-label="Progression du challenge"
              />
              <span>{percent(read, challenge.goal)} %</span>
            </div>
          </div>
          <div className="section-title">
            <h2>La sélection</h2>
            <Button
              variant="outline"
              onClick={() => openModal({ type: "selectChallenge" })}
            >
              <Plus size={16} />
              Ajouter un livre
            </Button>
          </div>
          <div className="paper-card">
            {challenge.books.map((b) => (
              <BookRow
                key={b.id}
                book={data.books.find((x) => x.id === b.id) || b}
                onOpen={openBook}
              >
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(() => api.toggleRead(b.id), "Statut enregistré.")
                  }
                >
                  {b.is_read ? "Lu ✓" : "Marquer lu"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Retirer ${b.title} du challenge`}
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => api.challengeBook("remove", b.id),
                      "Livre retiré du challenge.",
                    )
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </BookRow>
            ))}
            {!challenge.books.length && (
              <Empty title="Ta sélection commence ici." />
            )}
          </div>
          <section className="roulette-card">
            <Shuffle size={24} />
            <h2>Un peu de hasard ?</h2>
            <p>
              Un livre de ton challenge… ou un joker pour choisir librement.
            </p>
            <Button
              onClick={draw}
              disabled={!challenge.books.some((b) => !b.is_read)}
            >
              Tirer ma prochaine lecture
            </Button>
            {result && (
              <div className="roulette-result" aria-live="polite">
                <span className="eyebrow">
                  {result.joker ? "JOKER" : "TA PROCHAINE LECTURE"}
                </span>
                <h3>{result.joker ? "Carte blanche." : result.title}</h3>
                <p>
                  {result.joker
                    ? "Choisis le livre qui te fait envie."
                    : result.author}
                </p>
                {!result.joker && (
                  <Button variant="outline" onClick={() => openBook(result.id)}>
                    Voir le livre <ArrowUpRight size={16} />
                  </Button>
                )}
              </div>
            )}
          </section>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() =>
              openModal({
                type: "confirm",
                title: "Supprimer le challenge ?",
                description:
                  "L’objectif et sa sélection seront supprimés. Les livres restent dans ta bibliothèque.",
                action: () => api.deleteChallenge(),
                success: "Challenge supprimé.",
              })
            }
          >
            Supprimer le challenge
          </Button>
        </>
      )}
    </>
  );
}
export function QuizPage({ data, openBook }) {
  const genres = [
    ...new Set(
      data.books.filter((b) => !b.is_wishlist).flatMap((b) => b.genres || []),
    ),
  ];
  const [pool, setPool] = useState(null),
    [winner, setWinner] = useState(null),
    [round, setRound] = useState(0);
  function start() {
    const shuffled = [...genres];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setRound(0);
    setPool(shuffled);
    setWinner(shuffled.length === 1 ? shuffled[0] : null);
  }
  function choose(genre) {
    const next = [genre, ...pool.slice(2)];
    setRound(round + 1);
    if (next.length === 1 || round + 1 >= 7) setWinner(genre);
    else setPool(next);
  }
  return (
    <>
      <PageHeading
        eyebrow="SUIVRE SON ENVIE"
        title="Que lire ensuite ?"
        description="Choisis le genre qui t’attire, duel après duel."
      />
      {!genres.length ? (
        <Empty title="Ta pile à lire est vide." />
      ) : !pool ? (
        <div className="quiz-intro">
          <Shuffle size={32} />
          <h2>Plutôt ceci… ou cela ?</h2>
          <p>
            Quelques choix pour trouver ta prochaine lecture parmi tes livres.
          </p>
          <Button onClick={start}>Commencer le quiz</Button>
        </div>
      ) : winner ? (
        <>
          <div className="quiz-result">
            <span className="eyebrow">TON ENVIE DU MOMENT</span>
            <h2>{winner}</h2>
            <Button variant="outline" onClick={start}>
              Recommencer
            </Button>
          </div>
          <div className="paper-card">
            {data.books
              .filter((b) => !b.is_wishlist && b.genres.includes(winner))
              .map((b) => (
                <BookRow key={b.id} book={b} onOpen={openBook}>
                  {b.is_read && <span className="small-label">Lu</span>}
                </BookRow>
              ))}
          </div>
        </>
      ) : (
        <div className="quiz-duel">
          {pool.slice(0, 2).map((g, i) => (
            <button key={g} onClick={() => choose(g)}>
              <span className="eyebrow">{i ? "OU PLUTÔT" : "AUJOURD’HUI"}</span>
              <BookOpen size={32} />
              <strong>{g}</strong>
              <span>
                Ça me tente <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
