import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { bookPayload, progressValue, todayISO } from "../lib/library";
import { api } from "../lib/api";
import { BookRow } from "./books";

export function Choice({ label, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Field({ label, id, ...props }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <Input id={id} {...props} />
    </label>
  );
}
export function FormModal({ modal, onClose, data, mutate }) {
  const book = data.books.find((b) => b.id === modal.bookId);
  const current = data.current.find((c) => c.book_id === modal.bookId);
  const [form, setForm] = useState({
    title: book?.title || "",
    author: book?.author || "",
    genres: book?.genres?.join(", ") || "",
    page_count: book?.page_count || "",
    year: book?.year || "",
    size: book?.size || "",
    color: book?.color || "",
    is_gift: book?.is_gift || false,
  });
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [value, setValue] = useState(current?.current_page ?? ""),
    [mode, setMode] = useState("pages"),
    [date, setDate] = useState(todayISO()),
    [person, setPerson] = useState(""),
    [selected, setSelected] = useState(String(modal.bookId || "")),
    [query, setQuery] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const titles = {
    add: modal.wishlist ? "Ajouter à mes envies" : "Ajouter un livre",
    edit: "Modifier le livre",
    progress: "Un peu plus loin.",
    loan: "Prêter un livre",
    challenge: "Mon objectif de lecture",
    selectChallenge: "Ajouter au challenge",
    confirm: modal.title,
  };
  async function submit(event) {
    event?.preventDefault();
    if (modal.type === "selectChallenge") return;
    setError("");
    setSaving(true);
    try {
      let operation;
      if (modal.type === "add" || modal.type === "edit") {
        const payload = bookPayload(form);
        if (modal.type === "add") payload.is_wishlist = !!modal.wishlist;
        operation = () =>
          api.saveBook(payload, modal.type === "edit" ? book.id : undefined);
      }
      if (modal.type === "progress") {
        const page = progressValue(value, mode, book.page_count);
        if (page < (current?.current_page || 0))
          throw new Error(
            "La progression ne peut pas diminuer avec le suivi actuel.",
          );
        operation = () => api.progress(book.id, page, date);
      }
      if (modal.type === "loan") {
        if (!selected || !person.trim())
          throw new Error("Choisis un livre et indique à qui tu le prêtes.");
        operation = () => api.loan(Number(selected), person.trim(), date);
      }
      if (modal.type === "challenge") {
        const goal = Number(value);
        if (!Number.isInteger(goal) || goal < 1)
          throw new Error("Choisis un objectif supérieur à zéro.");
        operation = () => api.createChallenge(goal);
      }
      if (modal.type === "confirm") operation = modal.action;
      await mutate(operation, modal.success || "C’est enregistré.");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const loaned = new Set(
    data.loans.filter((l) => !l.returned_date).map((l) => l.book_id),
  );
  const candidates = data.books
    .filter(
      (b) =>
        !b.is_wishlist &&
        (modal.type !== "loan" || !loaned.has(b.id)) &&
        (modal.type !== "selectChallenge" ||
          !data.challenge?.books.some((c) => c.id === b.id)),
    )
    .filter((b) =>
      `${b.title} ${b.author}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    );
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        className="app-dialog"
        onPointerDownOutside={(e) => saving && e.preventDefault()}
        onEscapeKeyDown={(e) => saving && e.preventDefault()}
      >
        <DialogHeader>
          <span className="eyebrow">MA BIBLIOTHÈQUE</span>
          <DialogTitle>{titles[modal.type]}</DialogTitle>
          <DialogDescription>
            {modal.type === "confirm"
              ? modal.description
              : modal.type === "progress"
                ? book.title
                : modal.type === "edit"
                  ? "Les détails qui rendent ce livre unique."
                  : modal.type === "selectChallenge"
                    ? "Choisis parmi les livres de ta bibliothèque."
                    : "Quelques détails, et le tour est joué."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="modal-form">
          {(modal.type === "add" || modal.type === "edit") && (
            <>
              <Field
                id="book-title"
                label="Titre"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                required
                maxLength={255}
                autoFocus
              />
              <Field
                id="book-author"
                label="Auteur"
                value={form.author}
                onChange={(e) => update("author", e.target.value)}
                required
                maxLength={255}
              />
              <Field
                id="book-genres"
                label="Genres"
                value={form.genres}
                onChange={(e) => update("genres", e.target.value)}
                placeholder="Roman, fantasy…"
                required
              />
              <p className="field-hint">
                Jusqu’à 3 genres, séparés par des virgules.
              </p>
              <details className="form-details" open={modal.type === "edit"}>
                <summary>Pages, année et apparence</summary>
                <div className="form-grid">
                  <Field
                    id="book-pages"
                    label="Nombre de pages"
                    type="number"
                    min="1"
                    step="1"
                    value={form.page_count}
                    onChange={(e) => update("page_count", e.target.value)}
                  />
                  <Field
                    id="book-year"
                    label="Année d’acquisition"
                    type="number"
                    min="1"
                    max="9999"
                    value={form.year}
                    onChange={(e) => update("year", e.target.value)}
                  />
                  <label className="field">
                    <span>Taille sur l’étagère</span>
                    <Choice
                      label="Taille sur l’étagère"
                      value={String(form.size || "auto")}
                      onChange={(v) => update("size", v === "auto" ? "" : v)}
                      options={[
                        ["auto", "Automatique"],
                        ["1", "Petit"],
                        ["2", "Moyen"],
                        ["3", "Grand"],
                      ]}
                    />
                  </label>
                  <label className="field">
                    <span>Couleur de reliure</span>
                    <input
                      aria-label="Couleur de reliure"
                      type="color"
                      value={form.color || "#86513d"}
                      onChange={(e) => update("color", e.target.value)}
                    />
                  </label>
                </div>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={form.is_gift}
                    onChange={(e) => update("is_gift", e.target.checked)}
                  />
                  Ce livre est un cadeau
                </label>
              </details>
            </>
          )}
          {modal.type === "progress" && (
            <>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={mode === "pages"}
                  onClick={() => {
                    setMode("pages");
                    setValue(current.current_page);
                  }}
                >
                  En pages
                </button>
                <button
                  type="button"
                  disabled={!book.page_count}
                  aria-pressed={mode === "percent"}
                  onClick={() => {
                    setMode("percent");
                    setValue(
                      Math.ceil((current.current_page / book.page_count) * 100),
                    );
                  }}
                >
                  En pourcentage
                </button>
              </div>
              <Field
                id="progress-value"
                label={mode === "pages" ? "Page actuelle" : "Pourcentage lu"}
                type="number"
                min="0"
                max={mode === "pages" ? book.page_count || undefined : 100}
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
              />
              <Field
                id="progress-date"
                label="Date de lecture"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </>
          )}
          {modal.type === "loan" && (
            <>
              <label className="field">
                <span>Livre à prêter</span>
                <Choice
                  label="Livre à prêter"
                  value={selected}
                  onChange={setSelected}
                  options={candidates.map((b) => [String(b.id), b.title])}
                />
              </label>
              <Field
                id="loan-person"
                label="Prêté à"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="Prénom"
                required
                maxLength={255}
              />
              <Field
                id="loan-date"
                label="Date du prêt"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </>
          )}
          {modal.type === "challenge" && (
            <Field
              id="challenge-goal"
              label="Nombre de livres à lire"
              type="number"
              min="1"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              autoFocus
            />
          )}
          {modal.type === "selectChallenge" && (
            <>
              <Input
                aria-label="Rechercher un livre"
                placeholder="Rechercher un livre…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="selector-list">
                {candidates.map((b) => (
                  <BookRow
                    key={b.id}
                    book={b}
                    onOpen={async (id) => {
                      if (saving) return;
                      setSaving(true);
                      try {
                        await mutate(
                          () => api.challengeBook("add", id),
                          "Livre ajouté au challenge.",
                        );
                        onClose();
                      } catch (e) {
                        setError(e.message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                ))}
                {!candidates.length && <p>Aucun livre à ajouter.</p>}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Annuler
            </Button>
            {modal.type !== "selectChallenge" && (
              <Button
                type="submit"
                variant={modal.type === "confirm" ? "destructive" : "default"}
                disabled={saving}
              >
                {saving
                  ? "Enregistrement…"
                  : modal.type === "confirm"
                    ? "Confirmer"
                    : "Enregistrer"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
