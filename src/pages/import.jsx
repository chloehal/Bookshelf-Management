import { useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { BookCover, Empty, PageHeading } from "../components/books";
import { Field } from "../components/forms";
import { api } from "../lib/api";
import {
  CATALOG_FIELDS,
  normalizeIsbn,
  comparisonRows,
  reconciliationPayload,
  hasValue,
  convertProgress,
  catalogSourceInfo,
} from "../../catalog.mjs";

const text = (value) =>
  Array.isArray(value) ? value.join(", ") : (value ?? "Non renseigné");
export function ImportPage({ data, route, navigate, mutate, busy, reload }) {
  const [target, setTarget] = useState(null),
    [candidate, setCandidate] = useState(null);
  const [items, setItems] = useState([]),
    [next, setNext] = useState(null);
  const [isbn, setIsbn] = useState(""),
    [title, setTitle] = useState(""),
    [author, setAuthor] = useState("");
  const [filter, setFilter] = useState("manual"),
    [query, setQuery] = useState("");
  const [choices, setChoices] = useState({}),
    [draft, setDraft] = useState({});
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const lock = useRef(false);
  const disabled = pending || busy;
  async function lookup(params, book = target) {
    if (lock.current || busy) return;
    lock.current = true;
    setPending(true);
    setError("");
    setMessage("Recherche dans les catalogues…");
    try {
      const result = await api.request(
        "catalog.php?" + new URLSearchParams(params),
      );
      setTarget(book);
      setItems(result.items);
      setNext(
        result.next_offset != null
          ? { work: params.work, offset: result.next_offset }
          : null,
      );
      setMessage(
        result.items.length
          ? "Vérifie l’édition, l’éditeur et la date avant de choisir."
          : "Aucun résultat. Essaie un autre ISBN ou un titre. L’ajout manuel reste disponible.",
      );
    } catch (e) {
      setError(e.message);
      setMessage("");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function select(item, book = target) {
    if (lock.current || busy) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const full = item.source
        ? item
        : (
            await api.request(
              "catalog.php?" +
                ({ bnf: "bnf=", sudoc: "sudoc=" }[item.lookup_source] ||
                  "olid=") +
                encodeURIComponent(item.source_id),
            )
          ).items[0];
      if (!full)
        throw new Error(
          "Cette édition n’a pas de fiche détaillée. Choisis une autre édition.",
        );
      const latest = book ? data.books.find((b) => b.id === book.id) : null;
      if (book && !latest)
        throw new Error("Ce livre n’existe plus. Recharge la bibliothèque.");
      const current =
        latest && data.current.find((c) => c.book_id === latest.id);
      const local = latest
        ? {
            ...latest,
            reading_id: current?.id ?? latest.reading_id,
            current_page: current?.current_page ?? latest.current_page,
          }
        : null;
      setTarget(local);
      setCandidate(full);
      setChoices(
        Object.fromEntries(
          comparisonRows(local || {}, full).map((r) => [
            r.key,
            r.available && !hasValue(r.current) ? "api" : "local",
          ]),
        ),
      );
      setDraft(
        Object.fromEntries(
          Object.keys(CATALOG_FIELDS).map((key) => [
            key,
            Array.isArray(full[key]) ? full[key].join(", ") : (full[key] ?? ""),
          ]),
        ),
      );
      navigate("reconciliation");
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function start(book) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTarget(book);
    setCandidate(null);
    setItems([]);
    setNext(null);
    setIsbn(book?.isbn || "");
    setTitle(book?.title || "");
    setAuthor(book?.author || "");
    setError("");
    setMessage("");
    if (book?.metadata_source_id)
      select(
        {
          source_id: book.metadata_source_id,
          lookup_source: book.metadata_source,
        },
        book,
      );
  }
  const duplicate =
    candidate &&
    data.books.find((book) => {
      if (book.id === target?.id) return false;
      if (
        book.metadata_source === candidate.source &&
        book.metadata_source_id === candidate.source_id
      )
        return true;
      try {
        return (
          book.isbn &&
          candidate.isbn &&
          normalizeIsbn(book.isbn) === normalizeIsbn(candidate.isbn)
        );
      } catch {
        return false;
      }
    });
  async function save(e) {
    e.preventDefault();
    if (lock.current || busy || duplicate) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      let payload;
      if (target) payload = reconciliationPayload(target, candidate, choices);
      else {
        const values = {
          ...draft,
          title: draft.title.trim(),
          author: draft.author.trim(),
          genres: draft.genres
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
          page_count: draft.page_count ? Number(draft.page_count) : null,
          isbn: draft.isbn ? normalizeIsbn(draft.isbn) : null,
        };
        if (!values.title || !values.author || !values.genres.length)
          throw new Error("Titre, auteur et au moins un genre requis.");
        if (values.genres.length > 3)
          throw new Error("Choisis au maximum trois genres.");
        if (
          values.page_count !== null &&
          (!Number.isInteger(values.page_count) || values.page_count < 1)
        )
          throw new Error("Le nombre de pages doit être un entier positif.");
        payload = { candidate, values };
      }
      await mutate(
        () => api.request("book-import.php", "POST", payload),
        "Livre enregistré et lié à sa source bibliographique.",
      );
      setCandidate(null);
      setItems([]);
      setTarget(null);
      setMessage("Livre enregistré. Tes choix ont été conservés.");
      navigate("import");
    } catch (e) {
      if (e.status === 409) await reload();
      setError(e.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (route === "reconciliation") {
    if (!candidate)
      return (
        <>
          <PageHeading title="Réconciliation" />
          <Empty
            title="Choisis d’abord une fiche ou un ISBN."
            action={() => navigate("import")}
            label="Ouvrir Import Management"
          />
        </>
      );
    const changesPages =
      target?.reading_id &&
      choices.page_count === "api" &&
      candidate.page_count &&
      candidate.page_count !== target.page_count;
    return (
      <>
        <PageHeading
          eyebrow={
            catalogSourceInfo(candidate.source, candidate.source_id).label
          }
          title={
            target
              ? `Réconcilier « ${target.title} »`
              : "Vérifier le nouveau livre"
          }
          description="Tes notes, tes emprunts et ton historique sont conservés."
        />
        <p className="mb-6">
          <a
            className="underline"
            href={catalogSourceInfo(candidate.source, candidate.source_id).url}
            target="_blank"
            rel="noreferrer"
          >
            Voir l’édition dans{" "}
            {catalogSourceInfo(candidate.source, candidate.source_id).label}
          </a>
        </p>
        <form className="paper-card import-form" onSubmit={save}>
          {!target ? (
            <>
              <div className="import-preview">
                <BookCover book={candidate} large />
                <div>
                  <h2>{candidate.title}</h2>
                  <p>{candidate.author}</p>
                  <p>
                    {candidate.publisher} · {candidate.published_date}
                  </p>
                </div>
              </div>
              <p>
                Vérifie et complète ces informations. Jusqu’à trois genres,
                séparés par des virgules.
              </p>
              <div className="form-grid">
                {Object.entries(CATALOG_FIELDS)
                  .filter(([key]) => key !== "cover_url")
                  .map(([key, label]) => (
                    <Field
                      key={key}
                      id={"api-" + key}
                      label={label}
                      value={draft[key]}
                      type={key === "page_count" ? "number" : "text"}
                      min={key === "page_count" ? 1 : undefined}
                      required={["title", "author", "genres"].includes(key)}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                    />
                  ))}
              </div>
            </>
          ) : (
            <>
              <p>
                Tes valeurs sont conservées par défaut. Les champs vides peuvent
                être complétés par l’API.
              </p>
              {comparisonRows(target, candidate).map((row) => (
                <fieldset key={row.key} className="reconciliation-field">
                  <legend>
                    {row.label}
                    {row.different && row.available ? " · Différent" : ""}
                  </legend>
                  <div className="reconciliation-values">
                    {[
                      ["local", "Ma fiche", row.current, target],
                      [
                        "api",
                        catalogSourceInfo(candidate.source, candidate.source_id)
                          .label,
                        row.proposed,
                        candidate,
                      ],
                    ].map(([value, label, field, book]) => (
                      <label key={value} className="reconciliation-value">
                        <span>
                          <input
                            type="radio"
                            name={"reconcile-" + row.key}
                            checked={choices[row.key] === value}
                            disabled={
                              disabled || (value === "api" && !row.available)
                            }
                            onChange={() =>
                              setChoices({ ...choices, [row.key]: value })
                            }
                          />{" "}
                          {label}
                        </span>
                        {row.key === "cover_url" ? (
                          <BookCover book={book} />
                        ) : (
                          <span>{text(field)}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}
          {changesPages ? (
            <p className="import-feedback" role="status">
              Progression adaptée automatiquement : page{" "}
              {target.current_page || 0}
              {target.page_count ? ` / ${target.page_count}` : ""} → page{" "}
              {convertProgress(
                target.current_page,
                target.page_count,
                candidate.page_count,
              )}{" "}
              / {candidate.page_count}.{" "}
              {target.page_count
                ? "Le pourcentage lu est conservé."
                : "Ancien total inconnu : la page est conservée dans la limite du nouveau total."}{" "}
              L’historique reste inchangé.
            </p>
          ) : null}
          {duplicate && (
            <p role="alert">Cette édition existe déjà : {duplicate.title}.</p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={disabled || !!duplicate} type="submit">
              {pending
                ? "Enregistrement…"
                : target
                  ? "Enregistrer mes choix et lier la fiche"
                  : "Ajouter à la bibliothèque"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setCandidate(null);
                setError("");
                navigate("import");
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      </>
    );
  }
  const visible = data.books.filter(
    (book) =>
      (filter === "all" ||
        (filter === "manual"
          ? !book.metadata_source
          : !!book.metadata_source)) &&
      `${book.title} ${book.author} ${book.isbn || ""}`
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr")),
  );
  return (
    <>
      <PageHeading
        eyebrow="ENRICHIR MA BIBLIOTHÈQUE"
        title="Import Management"
        description="Ajoute un livre par ISBN ou associe une fiche manuelle à son édition."
      />
      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => start(null)}
        >
          Nouveau livre par ISBN
        </Button>
        <Button variant="outline" onClick={() => navigate("library")}>
          Retour à l’ajout manuel
        </Button>
      </div>
      <section
        className="paper-card import-form"
        aria-label="Recherche bibliographique"
      >
        <h2>
          {target ? `Rechercher pour « ${target.title} »` : "Ajouter par ISBN"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              lookup({ isbn: normalizeIsbn(isbn) });
            } catch (e) {
              setError(e.message);
            }
          }}
          className="import-search"
        >
          <Field
            id="import-isbn"
            label="ISBN-10 ou ISBN-13"
            value={isbn}
            required
            maxLength={32}
            onChange={(e) => setIsbn(e.target.value)}
          />
          <Button disabled={disabled}>Rechercher par ISBN</Button>
        </form>
        {target && (
          <form
            className="import-search"
            onSubmit={(e) => {
              e.preventDefault();
              lookup({ title, author });
            }}
          >
            <Field
              id="import-title"
              label="Titre"
              value={title}
              required
              minLength={2}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Field
              id="import-author"
              label="Auteur"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <Button variant="outline" disabled={disabled}>
              Rechercher titre / auteur
            </Button>
          </form>
        )}
        <p role="status">{message}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {items.map((item, i) => (
          <article className="import-result" key={item.source_id + "-" + i}>
            <BookCover
              book={{
                ...item,
                cover_url:
                  item.cover_url ||
                  ((item.source || "openlibrary") === "openlibrary"
                    ? `https://covers.openlibrary.org/b/olid/${item.source_id}-M.jpg?default=false`
                    : null),
              }}
            />
            <div>
              <h3>{item.title}</h3>
              <p>{item.author}</p>
              <p>
                {[
                  item.publisher,
                  item.published_date,
                  item.isbn,
                  item.source_id,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button disabled={disabled} onClick={() => select(item)}>
                  {target ? "Comparer cette édition" : "Vérifier avant ajout"}
                </Button>
                {item.work_id && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => lookup({ work: item.work_id, offset: 0 })}
                  >
                    Voir les autres éditions
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
        {next && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => lookup(next)}
          >
            Éditions suivantes
          </Button>
        )}
      </section>
      <section className="mt-8" aria-label="Fiches existantes">
        <h2>Mes fiches</h2>
        <div className="import-search my-4">
          <label className="field">
            <span>Afficher</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="manual">Fiches manuelles</option>
              <option value="linked">Fiches liées à l’API</option>
              <option value="all">Toutes les fiches</option>
            </select>
          </label>
          <Field
            id="import-filter"
            label="Filtrer les fiches"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="paper-card">
          {visible.map((book) => (
            <article className="import-result" key={book.id}>
              <BookCover book={book} />
              <div>
                <h3>{book.title}</h3>
                <p>{book.author}</p>
                <p>
                  {book.metadata_source
                    ? `Liée à ${catalogSourceInfo(book.metadata_source, book.metadata_source_id).label}`
                    : "Fiche manuelle"}
                  {book.is_wishlist ? " · Wishlist" : ""}
                </p>
                <Button
                  variant="outline"
                  className="mt-3"
                  disabled={disabled}
                  onClick={() => start(book)}
                >
                  {book.metadata_source
                    ? "Comparer à nouveau"
                    : "Rechercher une correspondance"}
                </Button>
              </div>
            </article>
          ))}
          {!visible.length && (
            <p className="p-6">Aucune fiche pour ce filtre.</p>
          )}
        </div>
      </section>
    </>
  );
}
