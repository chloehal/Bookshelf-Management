import { coverHtml } from './book-cover.mjs';
import { CATALOG_FIELDS, normalizeIsbn, comparisonRows, reconciliationPayload, hasValue } from './catalog.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const display = value => Array.isArray(value) ? value.join(', ') : String(value ?? '—');
const fieldInput = (key, value, prefix) => key === 'cover_url' ? `<input type="hidden" id="${prefix}-cover_url" value="${escape(value)}">` : `<label class="form-control"><span class="label">${CATALOG_FIELDS[key]}</span><input class="input w-full" id="${prefix}-${key}" value="${escape(Array.isArray(value) ? value.join(', ') : value)}" ${key === 'page_count' ? 'type="number" min="1" max="1000000"' : 'type="text"'} ${key === 'isbn' ? 'inputmode="numeric"' : ''}></label>`;

export function setupImportManagement({ getBooks, reloadBooks, api, showPage, refreshLibrary }) {
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-book-cover')) event.target.hidden = true;
  }, true);
  const $ = id => document.getElementById(id);
  let selected = null, candidate = null, searching = false, saving = false;
  let searchTarget = null;
  const resultGroups = { new: { items: [], target: null }, import: { items: [], target: null } };
  const status = (id, message, error = false) => {
    $(id).textContent = message;
    $(id).classList.toggle('text-error', error);
  };
  function duplicate(item, excludedId) {
    return getBooks().find(book => {
      if (book.id === excludedId) return false;
      if (book.metadata_source_id === item.source_id) return true;
      try { return item.isbn && book.isbn && normalizeIsbn(book.isbn) === normalizeIsbn(item.isbn); } catch { return false; }
    });
  }
  function renderList() {
    const filter = $('import-filter').value, query = $('import-filter-search').value.toLocaleLowerCase('fr');
    const all = getBooks();
    $('import-summary').textContent = `${all.filter(b => !b.metadata_source).length} fiches manuelles · ${all.filter(b => b.metadata_source).length} fiches liées à Open Library`;
    const visible = all.filter(b => (filter === 'all' || (filter === 'manual' ? !b.metadata_source : !!b.metadata_source)) && `${b.title} ${b.author} ${b.isbn || ''}`.toLocaleLowerCase('fr').includes(query));
    $('import-books').innerHTML = visible.length ? visible.map(book => `<article class="card card-border bg-base-100"><div class="card-body p-4 flex-row flex-wrap items-center justify-between gap-4">${coverHtml(book, true)}<div class="min-w-0 flex-1"><h3 class="font-medium">${escape(book.title)}</h3><p class="text-sm opacity-70">${escape(book.author)}${book.isbn ? ' · ISBN ' + escape(book.isbn) : ''}</p><p class="text-xs mt-1">${book.metadata_source ? 'Liée à Open Library' : 'Fiche manuelle'}${book.is_wishlist ? ' · Wishlist' : ''}${book.metadata_linked_at ? ' · Dernière liaison : ' + escape(book.metadata_linked_at) : ''}</p></div><button class="btn btn-outline btn-sm" data-select-book="${book.id}">${book.metadata_source ? 'Comparer à nouveau' : 'Rechercher une correspondance'}</button></div></article>`).join('') : '<p class="py-8 text-center opacity-60">Aucune fiche pour ce filtre.</p>';
  }
  function renderSearchTarget(book) {
    searchTarget = book;
    resultGroups.import = { items: [], target: book };
    $('import-results').replaceChildren();
    $('import-search-panel').hidden = false;
    $('import-target').textContent = `Associer « ${book.title} » à une édition`;
    $('import-isbn').value = book.isbn || '';
    $('import-title').value = book.title;
    $('import-author').value = book.author;
    status('import-search-status', 'Vérifie le titre, l’auteur et l’édition avant de choisir. Rien ne sera modifié sans validation.');
    $('import-search-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openComparison(item) {
    candidate = item;
    const existing = duplicate(item, selected?.id);
    showPage('reconciliation-page');
    $('reconciliation-heading').textContent = selected ? `Réconcilier « ${selected.title} »` : 'Vérifier le nouveau livre';
    $('reconciliation-content').hidden = false;
    $('reconciliation-empty').hidden = true;
    $('reconciliation-source').href = `https://openlibrary.org/books/${item.source_id}`;
    $('reconciliation-source').textContent = `Open Library · ${item.source_id}`;
    status('reconciliation-status', existing ? `Cette édition existe déjà dans ta bibliothèque : ${existing.title}` : '');
    $('reconciliation-save').disabled = !!existing;
    $('reconciliation-save').textContent = selected ? 'Enregistrer mes choix et lier la fiche' : 'Ajouter à la bibliothèque';
    $('reconciliation-fields').innerHTML = selected ? `<div class="overflow-x-auto"><table class="table"><caption class="text-left pb-3">Tes valeurs sont conservées par défaut. Les champs vides peuvent être complétés par l’API.</caption><thead><tr><th>Champ</th><th>Ma fiche</th><th>Open Library</th><th>Valeur à conserver</th></tr></thead><tbody>${comparisonRows(selected, item).map(row => `<tr><th scope="row">${row.label}${row.different && row.available ? '<span class="badge badge-warning badge-xs ml-2">Différent</span>' : ''}</th><td class="catalog-value">${row.key === 'cover_url' ? coverHtml(selected, true) : escape(display(row.current))}</td><td class="catalog-value">${row.available ? (row.key === 'cover_url' ? coverHtml(item, true) : escape(display(row.proposed))) : '<span class="opacity-50">Non renseigné</span>'}</td><td>${row.available && row.different ? `<fieldset class="flex flex-col gap-2"><legend class="sr-only">${row.label} : valeur à conserver</legend><label class="flex items-center gap-2"><input type="radio" class="radio radio-sm" name="reconcile-${row.key}" value="local" ${hasValue(row.current) ? 'checked' : ''}>Ma fiche</label><label class="flex items-center gap-2"><input type="radio" class="radio radio-sm" name="reconcile-${row.key}" value="api" ${!hasValue(row.current) ? 'checked' : ''}>API</label></fieldset>` : '<span class="text-sm opacity-60">' + (row.available ? 'Identique' : 'Ma fiche conservée') + '</span>'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="catalog-preview">${coverHtml(item)}<div><h3 class="font-medium">${escape(item.title)}</h3><p>${escape(item.author)}</p><p class="text-sm opacity-70">${escape([item.publisher, item.published_date, item.isbn].filter(Boolean).join(' · '))}</p></div></div><p class="text-sm mb-4">Vérifie les informations et complète-les si nécessaire. Genres : trois maximum, séparés par des virgules.</p><div class="grid gap-4 sm:grid-cols-2">${Object.keys(CATALOG_FIELDS).map(key => fieldInput(key, item[key], 'new-api')).join('')}</div>`;
    if (!existing) $('reconciliation-heading').focus();
  }
  function renderResults(results, resultItems, newBook) {
    results.innerHTML = resultItems.map((item, index) => `<article class="border border-base-300 rounded-lg p-4 mt-3"><div class="catalog-preview">${coverHtml({ ...item, cover_url: item.cover_url || `https://covers.openlibrary.org/b/olid/${item.source_id}-M.jpg?default=false` }, true)}<div><h4 class="font-medium">${escape(item.title)}</h4><p class="text-sm">${escape(item.author || 'Auteur non renseigné')}</p></div></div><p class="text-xs opacity-70 my-2">${escape([item.publisher, item.published_date, item.isbn, item.source_id].filter(Boolean).join(' · '))}</p><button type="button" class="btn btn-sm btn-primary" data-candidate="${index}" data-new="${newBook}">${newBook ? 'Vérifier avant ajout' : 'Comparer cette édition'}</button>${item.work_id ? `<button type="button" class="btn btn-sm btn-ghost" data-work="${escape(item.work_id)}" data-new="${newBook}">Voir les autres éditions</button>` : ''}</article>`).join('');
  }
  async function loadEditions(work, offset, newBook) {
    if (searching || saving) return;
    searching = true;
    const statusId = newBook ? 'isbn-status' : 'import-search-status';
    const results = $(newBook ? 'isbn-results' : 'import-results');
    status(statusId, 'Recherche des autres éditions…');
    try {
      const data = await api('catalog.php?' + new URLSearchParams({work, offset}));
      if (data.error) throw new Error(data.error);
      resultGroups[newBook ? 'new' : 'import'].items = data.items;
      renderResults(results, data.items, newBook);
      if (data.next_offset !== null && data.next_offset !== undefined) results.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-outline mt-4" data-work="${escape(work)}" data-offset="${data.next_offset}" data-new="${newBook}">Éditions suivantes</button>`);
      status(statusId, data.items.length ? 'Vérifie la langue, l’éditeur et la date de ton exemplaire. Le détail de l’auteur sera chargé au choix de l’édition.' : 'Aucune autre édition disponible. Essaie la recherche par ISBN.');
    } catch (error) { status(statusId, error.message, true); }
    finally { searching = false; }
  }
  async function search(mode) {
    if (searching || saving) return;
    searching = true;
    const newBook = mode === 'new';
    const statusId = newBook ? 'isbn-status' : 'import-search-status';
    const results = newBook ? $('isbn-results') : $('import-results');
    results.replaceChildren();
    document.querySelectorAll('[data-catalog-search]').forEach(button => { button.disabled = true; });
    status(statusId, 'Recherche dans Open Library…');
    try {
      let query;
      if (newBook || mode === 'isbn') {
        const isbn = normalizeIsbn($(newBook ? 'new-isbn' : 'import-isbn').value);
        query = 'isbn=' + isbn;
      } else {
        const title = $('import-title').value.trim(), author = $('import-author').value.trim();
        if (title.length < 2) throw new Error('Saisis au moins deux caractères de titre.');
        query = new URLSearchParams({ title, author }).toString();
      }
      const data = await api('catalog.php?' + query);
      if (data.error) throw new Error(data.error);
      const resultItems = data.items;
      resultGroups[newBook ? 'new' : 'import'] = { items: resultItems, target: newBook ? null : searchTarget };
      status(statusId, resultItems.length ? `${resultItems.length} édition(s) trouvée(s). Vérifie la bonne correspondance.` : 'Aucun résultat. Essaie un autre ISBN ou la recherche par titre et auteur dans Import Management. L’ajout manuel reste disponible.');
      renderResults(results, resultItems, newBook);
    } catch (error) { status(statusId, error.message || 'Recherche impossible. Réessaie.', true); }
    finally {
      searching = false;
      document.querySelectorAll('[data-catalog-search]').forEach(button => { button.disabled = false; });
    }
  }
  async function selectCandidate(index, newBook) {
    if (searching || saving) return;
    const group = resultGroups[newBook ? 'new' : 'import'];
    const item = group.items[index];
    if (!item) return;
    searching = true;
    const statusId = newBook ? 'isbn-status' : 'import-search-status';
    status(statusId, 'Chargement des informations de cette édition…');
    try {
      let full = item;
      if (!item.source) {
        const data = await api('catalog.php?olid=' + encodeURIComponent(item.source_id));
        if (data.error) throw new Error(data.error);
        full = data.items[0];
        if (!full) throw new Error('Cette édition ne fournit pas de fiche détaillée. Choisis une autre édition.');
      }
      selected = group.target ? getBooks().find(book => book.id === group.target.id) : null;
      if (group.target && !selected) throw new Error('Cette fiche n’existe plus. Recharge la bibliothèque.');
      openComparison(full);
    } catch (error) { status(statusId, error.message, true); }
    finally { searching = false; }
  }
  async function save() {
    if (!candidate || saving) return;
    saving = true;
    $('reconciliation-save').disabled = true;
    status('reconciliation-status', 'Enregistrement…');
    let saved = false;
    try {
      let payload;
      if (selected) {
        const choices = Object.fromEntries(Object.keys(CATALOG_FIELDS).map(key => [key, document.querySelector(`input[name="reconcile-${key}"]:checked`)?.value || 'local']));
        payload = reconciliationPayload(selected, candidate, choices);
      } else {
        const values = Object.fromEntries(Object.keys(CATALOG_FIELDS).map(key => [key, $('new-api-' + key).value.trim()]));
        values.genres = values.genres.split(',').map(g => g.trim()).filter(Boolean);
        if (values.genres.length > 3) throw new Error('Choisis au maximum trois genres.');
        if (!values.title || !values.author || !values.genres.length) throw new Error('Complète le titre, l’auteur et au moins un genre.');
        values.isbn = values.isbn ? normalizeIsbn(values.isbn) : null;
        if (values.page_count && (!/^\d+$/.test(values.page_count) || Number(values.page_count) < 1)) throw new Error('Le nombre de pages doit être un entier positif.');
        values.page_count = values.page_count ? Number(values.page_count) : null;
        payload = { candidate, values };
      }
      const result = await api('book-import.php', 'POST', payload);
      if (result.error) {
        if (result.code === 'conflict') await reloadBooks();
        throw new Error(result.error);
      }
      saved = true;
      candidate = null;
      // Close the save form immediately: a failed refresh must not invite a second INSERT.
      $('reconciliation-content').hidden = true;
      $('reconciliation-empty').hidden = false;
      await reloadBooks();
      refreshLibrary();
      $('import-search-panel').hidden = true;
      $('isbn-results').replaceChildren();
      $('new-isbn').value = '';
      status('isbn-status', '');
      status('import-feedback', 'Livre enregistré. Tes choix et la référence Open Library ont été conservés.');
      showPage('import-page');
      renderList();
    } catch (error) {
      if (saved) {
        status('import-feedback', 'Livre enregistré, mais le rafraîchissement a échoué. Recharge la page pour afficher les données à jour.', true);
        showPage('import-page');
      } else status('reconciliation-status', error.message || 'Enregistrement impossible.', true);
    } finally { saving = false; if (candidate) $('reconciliation-save').disabled = false; }
  }
  $('isbn-search-form').addEventListener('submit', e => { e.preventDefault(); search('new'); });
  $('import-isbn-form').addEventListener('submit', e => { e.preventDefault(); search('isbn'); });
  $('import-title-form').addEventListener('submit', e => { e.preventDefault(); search('title'); });
  $('reconciliation-form').addEventListener('submit', e => { e.preventDefault(); save(); });
  $('import-filter').addEventListener('change', renderList);
  $('import-filter-search').addEventListener('input', renderList);
  $('import-books').addEventListener('click', async e => {
    const button = e.target.closest('[data-select-book]');
    if (!button || searching || saving) return;
    const book = getBooks().find(b => b.id === Number(button.dataset.selectBook));
    if (!book) return;
    renderSearchTarget(book);
    if (book.metadata_source_id) {
      resultGroups.import = { items: [{ source_id: book.metadata_source_id }], target: book };
      await selectCandidate(0, false);
    }
  });
  for (const id of ['import-results', 'isbn-results']) $(id).addEventListener('click', e => {
    const editionsButton = e.target.closest('[data-work]');
    if (editionsButton) loadEditions(editionsButton.dataset.work, editionsButton.dataset.offset || 0, editionsButton.dataset.new === 'true');
    const button = e.target.closest('[data-candidate]');
    if (button) selectCandidate(Number(button.dataset.candidate), button.dataset.new === 'true');
  });
  $('reconciliation-cancel').addEventListener('click', () => {
    if (saving) return;
    candidate = null;
    $('reconciliation-content').hidden = true;
    $('reconciliation-empty').hidden = false;
    showPage(selected ? 'import-page' : 'list-page');
  });
  return { renderList };
}
