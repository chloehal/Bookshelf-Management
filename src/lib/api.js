export function createApi(fetcher = (...args) => fetch(...args)) {
  async function request(endpoint, method = "GET", body) {
    let response;
    try {
      response = await fetcher(`/api/${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error(
        "Connexion impossible. Vérifie ta connexion puis réessaie.",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "Réponse du serveur illisible. Réessaie dans un instant.",
      );
    }
    if (!response.ok || result?.error || result?.success === false)
      throw new Error(result?.error || "L’action n’a pas pu être enregistrée.");
    return result;
  }
  return {
    request,
    async load() {
      const [books, current, loans, challenge, log] = await Promise.all([
        request("books.php"),
        request("reading.php?action=current"),
        request("loans.php"),
        request("challenge.php"),
        request("reading.php?action=heatmap"),
      ]);
      if (![books, current, loans, log].every(Array.isArray))
        throw new Error("Les données reçues sont incomplètes. Réessaie.");
      return { books, current, loans, challenge, log };
    },
    saveBook: (book, id) =>
      request("books.php", id ? "PUT" : "POST", {
        ...book,
        ...(id ? { id } : {}),
      }),
    deleteBook: (id) => request("books.php", "DELETE", { id }),
    toggleRead: (id) => request("read.php", "POST", { id }),
    rate: (id, rating) => request("rate.php", "POST", { id, rating }),
    buy: (id) => request("wishlist.php", "POST", { id }),
    reading: (action, book_id) =>
      request("reading.php", "POST", { action, book_id }),
    progress: (book_id, current_page, log_date) =>
      request("reading.php", "POST", {
        action: "update_page",
        book_id,
        current_page,
        log_date,
      }),
    loan: (book_id, person, loan_date) =>
      request("loans.php", "POST", { book_id, person, loan_date }),
    returnLoan: (id) => request("loans.php", "POST", { action: "return", id }),
    deleteLoan: (id) => request("loans.php", "DELETE", { id }),
    createChallenge: (goal) => request("challenge.php", "POST", { goal }),
    deleteChallenge: () => request("challenge.php", "DELETE"),
    challengeBook: (action, book_id) =>
      request(`challenge.php?action=${action}_book`, "POST", { book_id }),
  };
}
export const api = createApi();
