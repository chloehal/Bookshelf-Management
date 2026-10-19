import { useEffect, useRef, useState } from "react";
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
  mergeEditionResults,
  rankEditionResults,
  groupEditionResults,
  identityConflict,
  editionLanguageLabel,
} from "../../catalog.mjs";

const SOURCES = { openlibrary: "Open Library", bnf: "BnF", sudoc: "Sudoc" };
const DRAFT_KEY = "bookshelf-import-draft-v1";
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
  const [warnings, setWarnings] = useState([]);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [sourceStates, setSourceStates] = useState({});
  const [language, setLanguage] = useState("all");
  const [confirmedIdentity, setConfirmedIdentity] = useState(false);
  const [searchContext, setSearchContext] = useState(null);
  const generation = useRef(0);
  const [savedDraft, setSavedDraft] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    } catch {
      return null;
    }
  });
  const [draftActive, setDraftActive] = useState(false);
  const lock = useRef(false);
  const conflict = candidate && identityConflict(target, candidate);
  useEffect(() => {
    if (!draftActive) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          target,
          candidate,
          choices,
          draft,
          isbn,
          title,
          author,
          items,
          next,
          searchContext,
        }),
      );
    } catch {
      /* Storage may be unavailable. */
    }
  }, [
    draftActive,
    target,
    candidate,
    choices,
    draft,
    isbn,
    title,
    author,
    items,
    next,
    searchContext,
  ]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const disabled = pending || busy;
  async function lookup(params, book = target, append = false) {
    if (lock.current || busy) return;
    const requestId = ++generation.current;
    lock.current = true;
    setPending(true);
    setDraftActive(true);
    setError("");
    setWarnings([]);
    setTarget(book);
    if (!append) {
      setItems([]);
      setNext(null);
      setSearchContext(params);
    }
    setMessage(
      "Recherche dans les trois catalogues… Les résultats apparaissent au fur et à mesure.",
    );
    // Edition expansion retains its independent legacy cursors.
    if (params.editions || params.work) {
      try {
        const result = await api.request(
          "catalog.php?" + new URLSearchParams(params),
        );
        if (requestId !== generation.current) return;
        setItems((current) =>
          append ? mergeEditionResults(current, result.items) : result.items,
        );
        setWarnings(result.warnings || []);
        setNext(result.next || null);
        setMessage(
          result.items.length
            ? "Correspondances proposées : vérifie la langue, le format et l’ISBN."
            : "Aucune nouvelle édition trouvée.",
        );
      } catch (e) {
        if (requestId === generation.current) setError(e.message);
      } finally {
        if (requestId === generation.current) {
          lock.current = false;
          setPending(false);
        }
      }
      return;
    }
    const requests =
      append && params.requests
        ? params.requests
        : Object.keys(SOURCES).map((source) => ({ ...params, source }));
    const requestedSources = requests.map((q) => q.source);
    setSourceStates((current) => ({
      ...(!append ? {} : current),
      ...Object.fromEntries(
        requestedSources.map((source) => [source, "recherche en cours"]),
      ),
    }));
    let count = 0,
      failures = 0;
    const cursors = append ? { ...(next?.cursors || {}) } : {};
    await Promise.all(
      requests.map(async (query) => {
        try {
          const result = await api.request(
            "catalog.php?" + new URLSearchParams(query),
          );
          if (requestId !== generation.current) return;
          count += result.items.length;
          setItems((current) => mergeEditionResults(current, result.items));
          setSourceStates((current) => ({
            ...current,
            [query.source]: result.items.length
              ? `${result.items.length} notice(s) reçue(s)`
              : "aucun résultat",
          }));
          if (result.next) cursors[query.source] = result.next;
          else delete cursors[query.source];
        } catch (e) {
          if (requestId !== generation.current) return;
          failures++;
          cursors[query.source] = query;
          setSourceStates((current) => ({
            ...current,
            [query.source]: "indisponible",
          }));
        }
      }),
    );
    if (requestId !== generation.current) return;
    const remaining = Object.values(cursors);
    setNext(remaining.length ? { requests: remaining, cursors } : null);
    setMessage(
      count
        ? "Vérifie la langue, le format et l’ISBN avant de choisir. Les éditions françaises sont prioritaires."
        : failures
          ? "Résultats incomplets : relance les catalogues indisponibles."
          : append
            ? "Aucune nouvelle notice sur cette page."
            : "Aucun résultat dans les catalogues consultés. Essaie le titre et l’auteur, élargis la recherche ou complète une fiche manuelle.",
    );
    lock.current = false;
    setPending(false);
  }
  async function select(item, book = target) {
    if (busy) return;
    const requestId = ++generation.current;
    setSourceStates((current) =>
      Object.fromEntries(
        Object.entries(current).map(([source, state]) => [
          source,
          state === "recherche en cours" ? "recherche interrompue" : state,
        ]),
      ),
    );
    lock.current = true;
    setPending(true);
    setError("");
    try {
      let full = item.source
        ? item
        : (
            await api.request(
              "catalog.php?" +
                ({ bnf: "bnf=", sudoc: "sudoc=" }[item.lookup_source] ||
                  "olid=") +
                encodeURIComponent(item.source_id),
            )
          ).items[0];
      if (requestId !== generation.current) return;
      if (!full)
        throw new Error(
          "Cette édition n’a pas de fiche détaillée. Choisis une autre édition.",
        );
      full = {
        ...item,
        ...full,
        languages: full.languages?.length
          ? full.languages
          : item.languages || [],
        format: full.format || item.format,
      };
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
      setConfirmedIdentity(false);
      setDraftActive(true);
      setChoices(
        Object.fromEntries(
          comparisonRows(local || {}, full).map((r) => [
            r.key,
            r.available &&
            !hasValue(r.current) &&
            !identityConflict(local, full)
              ? "api"
              : "local",
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
      if (requestId === generation.current) setError(e.message);
    } finally {
      if (requestId === generation.current) {
        lock.current = false;
        setPending(false);
      }
    }
  }
  function start(book) {
    generation.current++;
    lock.current = false;
    setPending(false);
    setDraftActive(true);
    setSourceStates({});
    setWarnings([]);
    setSearchContext(null);
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
  const editedIsbn = !target && candidate ? draft.isbn : candidate?.isbn;
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
          editedIsbn &&
          normalizeIsbn(book.isbn) === normalizeIsbn(editedIsbn)
        );
      } catch {
        return false;
      }
    });
  async function save(e) {
    e.preventDefault();
    if (lock.current || busy || duplicate || (conflict && !confirmedIdentity))
      return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      let payload;
      if (target)
        payload = {
          ...reconciliationPayload(target, candidate, choices),
          confirm_identity: confirmedIdentity,
        };
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
        payload =
          candidate.source === "manual"
            ? { manual: true, values }
            : { candidate, values };
      }
      await mutate(
        () => api.request("book-import.php", "POST", payload),
        candidate.source === "manual"
          ? "Fiche manuelle enregistrée avec son ISBN."
          : "Livre enregistré et lié à sa source bibliographique.",
      );
      setDraftActive(false);
      setSavedDraft(null);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
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
  function resumeDraft() {
    const d = savedDraft;
    if (d.target && !data.books.some((b) => b.id === d.target.id)) {
      setError("Ce livre n’existe plus.");
      return;
    }
    setTarget(d.target);
    setCandidate(d.candidate);
    setChoices(d.choices || {});
    setDraft(d.draft || {});
    setIsbn(d.isbn || "");
    setTitle(d.title || "");
    setAuthor(d.author || "");
    setItems(d.items || []);
    setNext(d.next || null);
    setSearchContext(d.searchContext);
    setDraftActive(true);
    setConfirmedIdentity(false);
    if (d.candidate) navigate("reconciliation");
  }
  if (route === "reconciliation") {
    if (!candidate)
      return (
        <>
          <PageHeading title="Vérifier les modifications" />
          <Empty
            title="Choisis d’abord une fiche ou un ISBN."
            action={savedDraft ? resumeDraft : () => navigate("import")}
            label={
              savedDraft
                ? "Reprendre le brouillon"
                : "Ajouter ou compléter mes livres"
            }
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
            candidate.source === "manual"
              ? "Fiche manuelle"
              : catalogSourceInfo(candidate.source, candidate.source_id).label
          }
          title={
            target
              ? `Réconcilier « ${target.title} »`
              : "Vérifier le nouveau livre"
          }
          description="Tes notes, tes emprunts et ton historique sont conservés."
        />
        {candidate.source !== "manual" && (
          <p className="mb-6">
            <a
              className="underline"
              href={
                catalogSourceInfo(candidate.source, candidate.source_id).url
              }
              target="_blank"
              rel="noreferrer"
            >
              Voir l’édition dans{" "}
              {catalogSourceInfo(candidate.source, candidate.source_id).label}
            </a>
          </p>
        )}
        <form className="paper-card import-form" onSubmit={save}>
          {conflict && (
            <div className="import-feedback" role="alert">
              <strong>
                Cette proposition semble correspondre à une autre œuvre.
              </strong>
              <p>
                Ma fiche : {target.title} — {target.author}. Proposition :{" "}
                {candidate.title} — {candidate.author}.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmedIdentity}
                  onChange={(e) => setConfirmedIdentity(e.target.checked)}
                />{" "}
                Je confirme vouloir associer ces deux fiches
              </label>
            </div>
          )}
          <p>
            {editionLanguageLabel(candidate)} ·{" "}
            {candidate.format || "Format inconnu"}
            {candidate.collection ? ` · ${candidate.collection}` : ""}
          </p>
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
              <p role="status">
                {
                  comparisonRows(target, candidate).filter(
                    (r) =>
                      r.available && r.different && choices[r.key] === "api",
                  ).length
                }{" "}
                modification(s) sélectionnée(s). La pagination conserve les
                valeurs locales par défaut.
              </p>
              {comparisonRows(target, candidate)
                .filter((row) => row.different)
                .map((row) => (
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
                          catalogSourceInfo(
                            candidate.source,
                            candidate.source_id,
                          ).label,
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
              <details>
                <summary>
                  Champs identiques (
                  {
                    comparisonRows(target, candidate).filter(
                      (r) => !r.different,
                    ).length
                  }
                  )
                </summary>
                {comparisonRows(target, candidate)
                  .filter((r) => !r.different)
                  .map((r) => (
                    <p key={r.key}>
                      {r.label} : {text(r.current)}
                    </p>
                  ))}
              </details>
              <p>
                Changements :{" "}
                {comparisonRows(target, candidate)
                  .filter(
                    (r) =>
                      r.available && r.different && choices[r.key] === "api",
                  )
                  .map((r) => r.label)
                  .join(", ") || "aucun champ remplacé"}
                . La source sera liée à la fiche.
              </p>
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
            <Button
              disabled={
                disabled || !!duplicate || (!!conflict && !confirmedIdentity)
              }
              type="submit"
            >
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
        title="Ajouter ou compléter mes livres"
        description="Ajoute un livre par ISBN ou associe une fiche manuelle à son édition."
      />
      {savedDraft && !draftActive && (
        <div className="paper-card p-4 mb-4">
          <p>Une recherche ou une comparaison peut être reprise.</p>
          <Button onClick={resumeDraft}>Reprendre le brouillon</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSavedDraft(null);
              try {
                sessionStorage.removeItem(DRAFT_KEY);
              } catch {}
            }}
          >
            Oublier le brouillon
          </Button>
        </div>
      )}
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
        {
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
        }
        <p role="status">{message}</p>
        <ul aria-label="État des catalogues" aria-live="polite">
          {Object.entries(sourceStates).map(([source, state]) => (
            <li key={source}>
              {SOURCES[source]} : {state}
            </li>
          ))}
        </ul>
        <p>
          ISBN exact d’abord, puis éditions françaises, langues inconnues et
          autres langues.
        </p>
        <label className="field">
          <span>Langues des éditions</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="all">
              Toutes les langues · français prioritaire
            </option>
            <option value="fr">Français et langue inconnue</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-3 my-4">
          <Button
            variant="outline"
            disabled={disabled || !title.trim()}
            onClick={() =>
              lookup({ title: title.split(/[:：]/)[0], author: "" })
            }
          >
            Élargir sans auteur ni sous-titre
          </Button>
          {!target && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const manual = {
                  source: "manual",
                  title,
                  author,
                  isbn,
                  genres: [],
                  page_count: null,
                  publisher: "",
                  published_date: "",
                  cover_url: null,
                };
                setTarget(null);
                setCandidate(manual);
                setConfirmedIdentity(false);
                setDraftActive(true);
                setError("");
                setDraft(
                  Object.fromEntries(
                    Object.keys(CATALOG_FIELDS).map((key) => [
                      key,
                      Array.isArray(manual[key])
                        ? manual[key].join(", ")
                        : (manual[key] ?? ""),
                    ]),
                  ),
                );
                navigate("reconciliation");
              }}
            >
              Créer une fiche manuelle préremplie
            </Button>
          )}
          <a
            className="underline"
            target="_blank"
            rel="noreferrer"
            href={`https://www.goodreads.com/search?q=${encodeURIComponent(isbn || [title, author].filter(Boolean).join(" "))}`}
          >
            Chercher sur Goodreads
          </a>
        </div>
        {warnings.map((warning) => (
          <p role="status" key={warning}>
            {warning}
          </p>
        ))}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {groupEditionResults(
          rankEditionResults(
            items.filter(
              (item) =>
                language === "all" ||
                !item.languages?.length ||
                item.languages.includes("fr"),
            ),
            searchContext?.isbn,
          ),
        ).map((group) => (
          <div key={group.key} className="my-4">
            {group.notices.length > 1 && (
              <p>
                {group.notices.length} notices pour le même ISBN · sources
                conservées séparément.
              </p>
            )}
            {group.conflicts.length > 0 && (
              <p role="status">
                Informations contradictoires :{" "}
                {group.conflicts
                  .map(
                    (k) =>
                      CATALOG_FIELDS[k] ||
                      { format: "Format", languages: "Langue" }[k],
                  )
                  .join(", ")}
                . Choisis la notice à vérifier ; aucune fusion automatique.
              </p>
            )}
            {group.notices.map((item, i) => (
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
                    {editionLanguageLabel(item)} ·{" "}
                    {item.format || "Format inconnu"}
                    {item.collection ? ` · ${item.collection}` : ""}
                    {item.page_count ? ` · ${item.page_count} pages` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {
                      catalogSourceInfo(
                        item.source || item.lookup_source || "openlibrary",
                        item.source_id,
                      ).label
                    }
                  </p>
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
                    <Button disabled={busy} onClick={() => select(item)}>
                      {target
                        ? "Comparer cette édition"
                        : "Vérifier avant ajout"}
                    </Button>
                    {item.title && (!item.edition_result || item.work_id) && (
                      <Button
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          lookup({
                            editions: 1,
                            title: item.title,
                            author: item.author || "",
                            ...(item.work_id ? { work: item.work_id } : {}),
                          })
                        }
                      >
                        Voir les autres éditions
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
        {next && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => lookup(next, target, true)}
          >
            Charger les éditions suivantes
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
              <option value="linked">Fiches avec édition liée</option>
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
