import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { BookRow } from "./books";
import { percent } from "../lib/library";
// All summaries derive from the existing book fields; time is explicitly an estimate.
export function StatsDetails({ books, openBook }) {
  const owned = books.filter((b) => !b.is_wishlist),
    read = owned.filter((b) => b.is_read),
    rated = owned.filter((b) => b.rating),
    gifts = owned.filter((b) => b.is_gift),
    known = owned
      .filter((b) => b.page_count)
      .sort((a, b) => a.page_count - b.page_count);
  const groups = new Map(),
    authors = new Map(),
    primary = new Map();
  for (const b of owned) {
    for (const genre of b.genres || []) {
      if (!groups.has(genre)) groups.set(genre, []);
      groups.get(genre).push(b);
    }
    const g = b.genres?.[0] || "Sans genre";
    primary.set(g, (primary.get(g) || 0) + 1);
    if (b.is_read) authors.set(b.author, (authors.get(b.author) || 0) + 1);
  }
  const genreRows = [...groups].map(([name, items]) => ({
    name,
    total: items.length,
    read: items.filter((b) => b.is_read).length,
    rated: items.filter((b) => b.rating),
    unread: items.filter((b) => !b.is_read).length,
  }));
  const averages = genreRows
    .filter((g) => g.rated.length)
    .map((g) => ({
      ...g,
      average: g.rated.reduce((sum, b) => sum + b.rating, 0) / g.rated.length,
    }))
    .sort((a, b) => b.average - a.average);
  const totalPages = known.reduce((sum, b) => sum + b.page_count, 0),
    readPages = read.reduce((sum, b) => sum + (b.page_count || 0), 0);
  const time = (pages) => {
    const mins = Math.round((pages * 70) / 60);
    return `${Math.floor(mins / 60).toLocaleString("fr")} h ${String(mins % 60).padStart(2, "0")}`;
  };
  const ranks = (items, title, kind) => (
    <section className="paper-card ranking-card">
      <h2>{title}</h2>
      {items.length ? (
        items.slice(0, 5).map((g) => (
          <div className="ranking-row" key={g.name}>
            <div>
              <span>{g.name}</span>
              <strong>
                {kind === "rating"
                  ? `${g.average.toFixed(1)} / 5 (${g.rated.length})`
                  : kind === "unread"
                    ? `${g.unread} / ${g.total}`
                    : `${percent(g.read, g.total)} % lu`}
              </strong>
            </div>
            <Progress
              value={
                kind === "rating"
                  ? g.average * 20
                  : kind === "unread"
                    ? percent(g.unread, g.total)
                    : percent(g.read, g.total)
              }
              aria-label={g.name}
            />
          </div>
        ))
      ) : (
        <p className="muted">Pas encore de données pour ce classement.</p>
      )}
    </section>
  );
  return (
    <details className="stats-details">
      <summary>Explorer ma bibliothèque en détail</summary>
      <div className="stats-columns">
        <section className="paper-card ranking-card">
          <h2>Le temps entre les pages</h2>
          <p className="field-hint">
            Estimation à 1 min 10 par page, comme dans ton suivi initial.
          </p>
          <dl className="estimate-list">
            <div>
              <dt>Livres lus</dt>
              <dd>{time(readPages)}</dd>
            </div>
            <div>
              <dt>Encore à lire</dt>
              <dd>{time(totalPages - readPages)}</dd>
            </div>
            <div>
              <dt>Toute la collection</dt>
              <dd>{time(totalPages)}</dd>
            </div>
          </dl>
        </section>
        <section className="paper-card ranking-card">
          <h2>Distribution des notes</h2>
          {[5, 4, 3, 2, 1].map((n) => {
            const count = rated.filter((b) => b.rating === n).length;
            return (
              <div key={n} className="ranking-row">
                <div>
                  <span>
                    {n} étoile{n > 1 ? "s" : ""}
                  </span>
                  <strong>{count}</strong>
                </div>
                <Progress
                  value={percent(count, rated.length)}
                  aria-label={`${count} livres notés ${n} sur 5`}
                />
              </div>
            );
          })}
        </section>
      </div>
      <div className="stats-columns">
        {ranks(averages, "Genres les mieux notés", "rating")}
        {ranks(
          [...averages].reverse().filter((g) => g.average < 4),
          "Genres les moins aimés",
          "rating",
        )}
        {ranks(
          [...genreRows]
            .filter((g) => g.unread)
            .sort((a, b) => b.unread - a.unread),
          "La pile à lire par genre",
          "unread",
        )}
        {ranks(
          [...genreRows]
            .filter((g) => percent(g.read, g.total) < 80)
            .sort((a, b) => a.read / a.total - b.read / b.total),
          "Genres à explorer",
          "read",
        )}
      </div>
      <div className="stats-columns">
        <section className="paper-card ranking-card">
          <h2>Genres terminés</h2>
          <div className="reading-genres">
            {genreRows
              .filter((g) => g.read === g.total)
              .map((g) => (
                <Badge key={g.name} variant="secondary">
                  {g.name} · {g.total}
                </Badge>
              ))}
          </div>
          {!genreRows.some((g) => g.read === g.total) && (
            <p className="muted">
              Encore des histoires à découvrir dans chaque genre.
            </p>
          )}
          <h2 className="secondary-stat-title">Genres principaux</h2>
          {[...primary]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => (
              <div className="session-row" key={name}>
                <span>{name}</span>
                <strong>{count}</strong>
              </div>
            ))}
        </section>
        <section className="paper-card ranking-card">
          <h2>Les petites et grandes lectures</h2>
          {known.length > 0 && (
            <>
              <p className="eyebrow">
                LE PLUS COURT · {known[0].page_count} PAGES
              </p>
              <BookRow book={known[0]} onOpen={openBook} />
              <p className="eyebrow secondary-stat-title">
                LE PLUS LONG · {known.at(-1).page_count} PAGES
              </p>
              <BookRow book={known.at(-1)} onOpen={openBook} />
            </>
          )}
          <h2 className="secondary-stat-title">Les auteurs les plus lus</h2>
          {[...authors]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => (
              <div className="session-row" key={name}>
                <span>{name}</span>
                <strong>{count} lus</strong>
              </div>
            ))}
        </section>
      </div>
      <div className="stats-columns">
        <section className="paper-card ranking-card">
          <h2>Les livres offerts</h2>
          <p className="muted">
            {gifts.length} reçus · {gifts.filter((b) => b.is_read).length} lus ·{" "}
            {gifts.filter((b) => !b.is_read).length} à découvrir
          </p>
          <Progress
            className="gift-progress"
            value={percent(gifts.filter((b) => b.is_read).length, gifts.length)}
            aria-label="Part des cadeaux lus"
          />
        </section>
        <section className="paper-card ranking-card">
          <h2>Littératures du monde</h2>
          {genreRows
            .filter((g) => g.name.toLocaleLowerCase().startsWith("littérature"))
            .map((g) => (
              <div className="session-row" key={g.name}>
                <span>
                  {g.name}
                  <small>{g.total} livres</small>
                </span>
                <strong>{percent(g.read, g.total)} % lu</strong>
              </div>
            ))}
          {!genreRows.some((g) =>
            g.name.toLocaleLowerCase().startsWith("littérature"),
          ) && (
            <p className="muted">
              Ce suivi utilise les genres commençant par « littérature ».
            </p>
          )}
        </section>
      </div>
    </details>
  );
}
