import { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen,
  LibraryBig,
  House,
  HandHeart,
  Ellipsis,
  Heart,
  Trophy,
  Shuffle,
  ChartNoAxesCombined,
  ChevronRight,
  ArrowUpRight,
  RefreshCw,
  X,
  Plus,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { FormModal } from "./components/forms";
import { PageHeading } from "./components/books";
import { HomePage } from "./pages/home";
import { LibraryPage, BookPage } from "./pages/library";
import {
  ReadingPage,
  LoansPage,
  ChallengePage,
  QuizPage,
} from "./pages/reading";
import { StatsPage } from "./pages/stats";
import { api } from "./lib/api";
const navigation = [
  ["home", "Aujourd’hui", House],
  ["library", "Bibliothèque", LibraryBig],
  ["reading", "Lectures", BookOpen],
  ["loans", "Prêts", HandHeart],
  ["more", "Plus", Ellipsis],
];
const defaultFilters = {
  search: "",
  status: "all",
  genre: "all",
  author: "all",
  sort: "title",
  view: "grid",
};
const routeNow = () => location.hash.replace(/^#\/?/, "") || "home";
export default function App() {
  const [route, setRoute] = useState(routeNow),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(null),
    [filters, setFilters] = useState(defaultFilters),
    [wishFilters, setWishFilters] = useState(defaultFilters),
    [loading, setLoading] = useState(true);
  const needsRefresh = useRef(false),
    lock = useRef(false),
    noticeTimer = useRef(null),
    mainRef = useRef(null),
    firstRoute = useRef(true);
  const notify = useCallback((message) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.load());
      needsRefresh.current = false;
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    return () => clearTimeout(noticeTimer.current);
  }, [load]);
  useEffect(() => {
    const handler = () => {
      setRoute(routeNow());
      setModal(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  function navigate(path) {
    location.hash = `/${path}`;
  }
  const openBook = (id) => navigate(`book/${id}`);
  async function mutate(operation, message) {
    if (needsRefresh.current)
      throw new Error("Recharge les données avant une nouvelle action.");
    if (lock.current) throw new Error("Une action est déjà en cours.");
    lock.current = true;
    setBusy(true);
    try {
      await operation();
      notify(message);
      try {
        setData(await api.load());
        needsRefresh.current = false;
        setError("");
      } catch {
        needsRefresh.current = true;
        setError(
          "La modification est enregistrée, mais l’affichage n’a pas pu être actualisé. Recharge les données avant une nouvelle action.",
        );
      }
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function run(operation, message) {
    try {
      await mutate(operation, message);
    } catch (e) {
      notify(e.message);
    }
  }
  const [page, id] = route.split("/");
  const active = ["wishlist", "challenge", "quiz", "stats"].includes(page)
    ? "more"
    : page === "book"
      ? "library"
      : page;
  const props = {
    data,
    navigate,
    openBook,
    openModal: setModal,
    run,
    busy,
    mutate,
  };
  const extra = [
    ["wishlist", "Mes envies", "Les livres que tu aimerais avoir", Heart],
    ["challenge", "Mon challenge", "Une année, des histoires", Trophy],
    ["stats", "Mes statistiques", "Retrouver ton rythme", ChartNoAxesCombined],
    ["quiz", "Que lire ensuite ?", "Laisser parler tes envies", Shuffle],
  ];
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Aller au contenu
      </a>
      <aside className="app-sidebar">
        <a href="#/home" className="brand">
          <span className="brand-symbol">
            <BookOpen size={23} />
          </span>
          <span>
            ma bibliothèque<span>LE GOÛT DES PAGES</span>
          </span>
        </a>
        <p className="sidebar-caption">MON ESPACE</p>
        <nav aria-label="Navigation principale">
          {navigation.map(([path, label, Icon]) => (
            <a
              key={path}
              href={`#/${path}`}
              className={active === path ? "active" : ""}
              aria-current={active === path ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shelf-doodle" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>
            Une place pour
            <br />
            <em>chaque histoire.</em>
          </p>
          <span>Ta bibliothèque personnelle</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="mobile-topbar">
          <a href="#/home" className="mobile-brand">
            <BookOpen size={20} />
            ma bibliothèque
          </a>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setModal({ type: "add" })}
            aria-label="Ajouter un livre"
          >
            <Plus size={21} />
          </Button>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1}>
          {import.meta.env.DEV && import.meta.env.VITE_DEMO === "true" && (
            <div className="demo-banner">
              Aperçu · bibliothèque de démonstration
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <Button variant="outline" disabled={loading} onClick={load}>
                <RefreshCw size={15} />
                Réessayer
              </Button>
            </div>
          )}
          {!data ? (
            loading ? (
              <div className="loading-state" role="status">
                <BookOpen size={30} />
                <h1>J’ouvre la bibliothèque…</h1>
                <span>Un petit instant.</span>
              </div>
            ) : (
              <div className="loading-state">
                <BookOpen size={32} />
                <h1>La bibliothèque attend ta connexion.</h1>
                <p>
                  Les livres apparaîtront dès que le serveur sera disponible.
                </p>
              </div>
            )
          ) : (
            <>
              {page === "home" && <HomePage {...props} />}
              {page === "library" && (
                <LibraryPage
                  {...props}
                  filters={filters}
                  setFilters={setFilters}
                />
              )}
              {page === "wishlist" && (
                <LibraryPage
                  {...props}
                  wishlist
                  filters={wishFilters}
                  setFilters={setWishFilters}
                />
              )}
              {page === "book" && <BookPage {...props} id={id} />}
              {page === "reading" && <ReadingPage {...props} />}
              {page === "loans" && <LoansPage {...props} />}
              {page === "challenge" && <ChallengePage {...props} />}
              {page === "quiz" && <QuizPage {...props} />}
              {page === "stats" && <StatsPage {...props} />}
              {page === "more" && (
                <>
                  <PageHeading
                    eyebrow="ENCORE QUELQUES PAGES"
                    title="Mon petit univers."
                  />
                  <div className="more-grid">
                    {extra.map(([path, title, description, Icon]) => (
                      <button key={path} onClick={() => navigate(path)}>
                        <Icon size={24} />
                        <span>
                          <strong>{title}</strong>
                          <small>{description}</small>
                        </span>
                        <ChevronRight size={19} />
                      </button>
                    ))}
                  </div>
                  <div className="about-card">
                    <BookOpen size={25} />
                    <h2>Ta bibliothèque, partout.</h2>
                    <p>
                      Depuis le menu de ton navigateur, ajoute cette application
                      à ton écran d’accueil pour la retrouver facilement.
                    </p>
                  </div>
                </>
              )}
              {![
                "home",
                "library",
                "wishlist",
                "book",
                "reading",
                "loans",
                "challenge",
                "quiz",
                "stats",
                "more",
              ].includes(page) && (
                <>
                  <PageHeading title="Cette page s’est égarée." />
                  <Button onClick={() => navigate("home")}>
                    Revenir à l’accueil
                  </Button>
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>MA BIBLIOTHÈQUE</span>
          <span>Le plaisir de lire, le soin de garder.</span>
        </footer>
      </div>
      {notice && (
        <div className="toast-message" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Fermer le message">
            <X size={16} />
          </button>
        </div>
      )}
      {modal && data && (
        <FormModal
          key={`${modal.type}-${modal.bookId || ""}`}
          modal={modal}
          data={data}
          onClose={() => setModal(null)}
          mutate={mutate}
        />
      )}
    </div>
  );
}
