import { StatsDetails } from "../components/stats-details";
import { useState } from "react";
import { PageHeading, Empty, BookRow } from "../components/books";
import { Choice } from "../components/forms";
import { Progress } from "../components/ui/progress";
import { statsFor, percent, dateLabel, todayISO } from "../lib/library";
export function StatsPage({ data, openBook }) {
  const s = statsFor(data.books, data.log),
    [year, setYear] = useState(String(new Date().getFullYear())),
    years = [
      ...new Set([
        new Date().getFullYear(),
        ...data.log.map((d) => Number(d.log_date.slice(0, 4))),
      ]),
    ].sort((a, b) => b - a),
    yearLog = data.log.filter((d) => d.log_date.startsWith(year)),
    map = new Map(yearLog.map((d) => [d.log_date, d])),
    days = [];
  const start = new Date(Number(year), 0, 1, 12),
    end = new Date(Number(year) + 1, 0, 1, 12);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const key = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ key, entry: map.get(key), future: key > todayISO() });
  }
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    label: new Intl.DateTimeFormat("fr", { month: "short" }).format(
      new Date(Number(year), i, 1),
    ),
    pages: yearLog
      .filter((d) => Number(d.log_date.slice(5, 7)) === i + 1)
      .reduce((sum, d) => sum + d.pages, 0),
  }));
  const max = Math.max(1, ...monthly.map((m) => m.pages)),
    owned = data.books.filter((b) => !b.is_wishlist),
    best = owned
      .filter((b) => b.rating)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5),
    longest = owned
      .filter((b) => b.page_count)
      .sort((a, b) => b.page_count - a.page_count)
      .slice(0, 3);
  return (
    <>
      <PageHeading
        eyebrow="LES TRACES DE TES LECTURES"
        title="La bibliothèque en chiffres."
      />
      {!s.owned ? (
        <Empty title="Ajoute des livres pour découvrir tes statistiques." />
      ) : (
        <>
          <div className="stats-overview">
            <div>
              <span className="eyebrow">LIVRES LUS</span>
              <strong>
                {s.read}
                <small> / {s.owned}</small>
              </strong>
              <Progress
                value={percent(s.read, s.owned)}
                aria-label="Part des livres lus"
              />
              <p>{s.unread} encore à découvrir</p>
            </div>
            <div>
              <span className="eyebrow">PAGES DES LIVRES LUS</span>
              <strong>{s.readPages.toLocaleString("fr")}</strong>
              <p>Sur {s.totalPages.toLocaleString("fr")} pages renseignées</p>
            </div>
            <div>
              <span className="eyebrow">NOTE MOYENNE</span>
              <strong>
                {s.averageRating ? s.averageRating.toFixed(1) : "—"}
                <small> / 5</small>
              </strong>
              <p>
                {s.gifts} livre{s.gifts !== 1 ? "s" : ""} reçu
                {s.gifts !== 1 ? "s" : ""} en cadeau
              </p>
            </div>
          </div>
          <section className="paper-card activity-card">
            <div className="section-title">
              <div>
                <p className="eyebrow">LES PETITS RENDEZ-VOUS</p>
                <h2>Mon rythme de lecture</h2>
              </div>
              <Choice
                label="Année des statistiques"
                value={year}
                onChange={setYear}
                options={years.map((y) => [String(y), String(y)])}
              />
            </div>
            <div className="activity-summary">
              <strong>
                {yearLog
                  .reduce((sum, d) => sum + d.pages, 0)
                  .toLocaleString("fr")}{" "}
                <span>pages enregistrées</span>
              </strong>
              <strong>
                {yearLog.filter((d) => d.pages > 0).length}{" "}
                <span>jours de lecture</span>
              </strong>
            </div>
            <div
              className="heatmap-scroll"
              tabIndex={0}
              role="region"
              aria-label="Calendrier de lecture, défilement horizontal"
            >
              <div
                className="heatmap"
                style={{ "--offset": (start.getDay() + 6) % 7 }}
              >
                {Array.from({ length: (start.getDay() + 6) % 7 }, (_, i) => (
                  <span className="heatmap-spacer" key={`empty${i}`} />
                ))}
                {days.map((d) => (
                  <span
                    key={d.key}
                    className={`heat-cell level-${d.future ? "future" : !d.entry?.pages ? 0 : d.entry.pages < 20 ? 1 : d.entry.pages < 50 ? 2 : d.entry.pages < 100 ? 3 : 4}`}
                    tabIndex={d.entry ? 0 : undefined}
                    aria-label={`${dateLabel(d.key)} : ${d.entry?.pages || 0} pages`}
                    title={`${dateLabel(d.key)} : ${d.entry?.pages || 0} pages${d.entry ? ` — ${d.entry.books.map((b) => `${b.title} (${b.pages} p.)`).join(", ")}` : ""}`}
                  />
                ))}
              </div>
            </div>
            <div className="heatmap-legend">
              <span>Moins</span>
              {[0, 1, 2, 3, 4].map((n) => (
                <i key={n} className={`heat-cell level-${n}`} />
              ))}
              <span>Plus</span>
            </div>
            <div className="month-chart">
              {monthly.map((m) => (
                <div key={m.label}>
                  <span>{m.pages || ""}</span>
                  <div className="bar-track">
                    <i style={{ height: `${(m.pages / max) * 100}%` }} />
                  </div>
                  <small>{m.label}</small>
                </div>
              ))}
            </div>
          </section>
          <div className="stats-columns">
            {[
              [s.genres, "Mes genres"],
              [s.authors, "Mes auteurs"],
            ].map(([items, title]) => (
              <section className="paper-card ranking-card" key={title}>
                <h2>{title}</h2>
                {items.slice(0, 6).map(([name, count]) => (
                  <div className="ranking-row" key={name}>
                    <div>
                      <span>{name}</span>
                      <strong>{count}</strong>
                    </div>
                    <Progress
                      value={percent(count, s.owned)}
                      aria-label={`${name} : ${count} livres`}
                    />
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="stats-columns">
            <section className="paper-card ranking-card">
              <h2>Les coups de cœur</h2>
              {best.length ? (
                best.map((b) => (
                  <BookRow key={b.id} book={b} onOpen={openBook}>
                    <span className="rating-number">{b.rating} ★</span>
                  </BookRow>
                ))
              ) : (
                <p className="muted">
                  Note tes livres pour retrouver tes favoris.
                </p>
              )}
            </section>
            <section className="paper-card ranking-card">
              <h2>Les grands voyages</h2>
              {longest.map((b) => (
                <BookRow key={b.id} book={b} onOpen={openBook}>
                  <span className="small-label">{b.page_count} p.</span>
                </BookRow>
              ))}
              <p className="field-hint">
                Pagination renseignée pour {s.knownPages} livres sur {s.owned}.
              </p>
            </section>
          </div>
          <StatsDetails books={data.books} openBook={openBook} />
          <section className="paper-card ranking-card">
            <h2>Dernières sessions</h2>
            {[...data.log]
              .sort((a, b) => b.log_date.localeCompare(a.log_date))
              .slice(0, 10)
              .map((d) => (
                <div className="session-row" key={d.log_date}>
                  <span>
                    {dateLabel(d.log_date)}
                    <small>{d.books.map((b) => b.title).join(" · ")}</small>
                  </span>
                  <strong>+{d.pages} p.</strong>
                </div>
              ))}
            {!data.log.length && (
              <p className="muted">
                Tes prochaines progressions apparaîtront ici.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
