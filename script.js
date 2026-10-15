import { coverHtml, escapeHtml } from './book-cover.mjs';
import { setupImportManagement } from './import-management.mjs';
let importManagement;
// --- État global ---
let books = [];
let challenge = null;
let editMode = false;
let editRating = 0;
let currentlyReading = [];
let readingLog = [];

// --- Filtres & tri pour "Tous mes livres" ---
let bookFilter = { status: 'all', genre: 'all', author: 'all', search: '' };
let bookSort = { key: 'title', dir: 'asc' };

// --- Constantes pour la bibliothèque visuelle ---
const BOOK_COLORS = [
  '#2c2c2c', // noir
  '#f5f0e0', // crème
  '#b03a3a', // rouge
  '#2b4570', // bleu marine
  '#5a8a5c', // vert
  '#d4a84b', // jaune moutarde
  '#f0d8c4', // pêche clair
  '#7b3f6a', // violet
  '#3a7d8c', // bleu canard
  '#c25b28', // orange brûlé
  '#8c7a5a', // taupe
  '#4a7a4a', // vert forêt
  '#d48a8a', // rose poudré
  '#5c5c8a', // lavande foncé
  '#c4b078', // doré pâle
  '#a0522d', // terre de sienne
  '#6a8fa0', // bleu gris
  '#e8dcc8', // sable
  '#7a3b3b', // bordeaux
  '#3a5a3a', // vert sombre
];

// --- API helper ---
async function api(endpoint, method = 'GET', body = null) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch('/api/' + endpoint, options);
  const data = await res.json();
  if (!res.ok && !data.error) throw new Error('La requête a échoué. Réessaie.');
  return data;
}

// --- Chargement des données ---
async function loadBooks() {
  const result = await api('books.php');
  if (!Array.isArray(result)) throw new Error(result.error || 'Chargement des livres impossible');
  books = result;
}

async function loadChallengeData() {
  challenge = await api('challenge.php');
}

async function loadCurrentlyReading() {
  currentlyReading = await api('reading.php?action=current');
}

async function loadReadingLog() {
  readingLog = await api('reading.php?action=heatmap');
}

// --- Helpers ---
function libraryBooks() {
  return books.filter((b) => !b.is_wishlist);
}

function wishlistBooks() {
  return books.filter((b) => b.is_wishlist);
}

const giftSvg = (cls = "w-4 h-4") =>
  `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 13h18"/><path d="M12 8c-1.5-2-4-2.5-5-1s.5 3.5 5 5c4.5-1.5 6-3.5 5-5s-3.5-1-5 1z"/></svg>`;

function starsHtml(bookId, rating, interactive = true) {
  let html = '<div class="flex items-center gap-0.5">';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= (rating || 0);
    if (interactive) {
      html += `<button onclick="rateBook(${bookId}, ${i})" class="cursor-pointer hover:scale-110 transition-transform" title="${i}/5">`;
    }
    html += `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 ${filled ? "text-warning" : "text-base-300"}" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    if (interactive) {
      html += `</button>`;
    }
    }
  html += '</div>';
  return html;
}

// --- Helpers bibliothèque visuelle ---
function seededRandom(seed) {
  let x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// 3 fixed heights: 1=petit (160px), 2=moyen (180px), 3=grand (200px)
const SIZE_HEIGHTS = { 1: 160, 2: 180, 3: 200 };

function getBookDisplayProps(book) {
  const s1 = seededRandom(book.id);
  const s2 = seededRandom(book.id + 1000);
  const s3 = seededRandom(book.id + 2000);

  const pageCount = book.page_count || Math.floor(100 + s1 * 600);
  const size = book.size || ([1, 2, 3][Math.floor(s2 * 3)]);
  const color = book.color || BOOK_COLORS[Math.floor(s3 * BOOK_COLORS.length)];

  // Width: 18px (80 pages) to 55px (800+ pages)
  const width = Math.max(18, Math.min(55, 18 + ((pageCount - 80) / 720) * 37));

  // Height: strictly one of 3 fixed values
  const height = SIZE_HEIGHTS[size] || 170;

  return { pageCount, size, color, width, height };
}

function getContrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.45 ? '#1a1a1a' : '#f0f0f0';
}

function getLastName(author) {
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function buildReadPiles(readBooks, maxPileHeight) {
  // Group read books by exact height (3 fixed sizes: 130, 170, 210)
  const heightGroups = {};
  readBooks.forEach(b => {
    const props = getBookDisplayProps(b);
    if (!heightGroups[props.height]) heightGroups[props.height] = [];
    heightGroups[props.height].push({ book: b, props });
  });

  // Split groups into piles that don't exceed maxPileHeight
  const piles = [];
  Object.entries(heightGroups).forEach(([h, books]) => {
    const bookHeight = parseInt(h);
    let currentPile = [];
    let currentPileThickness = 0;

    books.forEach(item => {
      // Each book adds its width (thickness) to the pile height
      if (currentPileThickness + item.props.width > maxPileHeight && currentPile.length > 0) {
        piles.push({ type: 'pile', books: currentPile, bookHeight });
        currentPile = [];
        currentPileThickness = 0;
      }
      currentPile.push(item);
      currentPileThickness += item.props.width;
    });

    if (currentPile.length > 0) {
      piles.push({ type: 'pile', books: currentPile, bookHeight });
    }
  });

  return piles;
}

function getShelfItems() {
  const lib = libraryBooks();
  const readBooks = lib.filter(b => b.is_read);
  const unreadBooks = lib.filter(b => !b.is_read);

  // Find max standing book height (for pile height limit)
  let maxHeight = 0;
  lib.forEach(b => {
    const h = getBookDisplayProps(b).height;
    if (h > maxHeight) maxHeight = h;
  });

  // Build unread items grouped by genre (with label on first book of each group)
  const genreGroups = {};
  unreadBooks.forEach(b => {
    const firstGenre = (b.genres && b.genres[0]) || 'Sans genre';
    if (!genreGroups[firstGenre]) genreGroups[firstGenre] = [];
    genreGroups[firstGenre].push(b);
  });

  // Alternate big/small genre groups so labels don't overlap
  const genresBySize = Object.keys(genreGroups).sort((a, b) => genreGroups[b].length - genreGroups[a].length);
  const ordered = [];
  let left = 0, right = genresBySize.length - 1;
  while (left <= right) {
    if (left === right) { ordered.push(genresBySize[left]); break; }
    ordered.push(genresBySize[left++]);
    ordered.push(genresBySize[right--]);
  }

  // Build genre groups as blocks (each block = array of book items)
  const genreBlocks = ordered.map(genre => {
    return genreGroups[genre].map((b, i) => ({
      type: 'book', book: b, genreLabel: i === 0 ? genre : null
    }));
  });

  // Build read piles
  const piles = buildReadPiles(readBooks, maxHeight);

  // Insert piles only BETWEEN genre blocks (not inside)
  // Available slots: before first block, between blocks, after last block
  const slots = genreBlocks.length + 1; // 0..genreBlocks.length
  const pilesPerSlot = {};

  piles.forEach((pile, i) => {
    const slot = Math.floor(seededRandom(i + 7777) * slots);
    if (!pilesPerSlot[slot]) pilesPerSlot[slot] = [];
    pilesPerSlot[slot].push(pile);
  });

  // Assemble: slot 0 piles, block 0, slot 1 piles, block 1, ...
  const allItems = [];
  for (let i = 0; i <= genreBlocks.length; i++) {
    if (pilesPerSlot[i]) {
      pilesPerSlot[i].forEach(p => allItems.push(p));
    }
    if (i < genreBlocks.length) {
      genreBlocks[i].forEach(item => allItems.push(item));
    }
  }

  return { items: allItems, totalBooks: lib.length, readCount: readBooks.length };
}

function displayShelf() {
  const container = document.getElementById('bookshelf-container');
  const { items, totalBooks, readCount } = getShelfItems();

  if (totalBooks === 0) {
    container.innerHTML = `
      <div class="text-center py-16 opacity-50">
        <div class="text-5xl mb-4">📚</div>
        <p class="text-sm">Votre bibliothèque est vide</p>
      </div>
    `;
    return;
  }

  // Measure container width
  const containerWidth = container.clientWidth || 1100;
  const padding = 24;
  const usableWidth = containerWidth - padding;
  const gap = 2;

  // Pre-compute slot widths
  const enrichedItems = items.map(item => {
    if (item.type === 'pile') {
      return { ...item, slotWidth: item.bookHeight + gap };
    }
    // Standing book
    const props = getBookDisplayProps(item.book);
    return { ...item, props, slotWidth: props.width + gap };
  });

  // Distribute onto shelves
  const shelves = [[]];
  let currentWidth = 0;

  enrichedItems.forEach(item => {
    if (currentWidth + item.slotWidth > usableWidth && shelves[shelves.length - 1].length > 0) {
      shelves.push([]);
      currentWidth = 0;
    }
    shelves[shelves.length - 1].push(item);
    currentWidth += item.slotWidth;
  });

  // Render
  const editClass = editMode ? 'edit-mode' : '';
  let html = `<div class="bookshelf ${editClass}">`;

  shelves.forEach(shelf => {
    html += '<div class="shelf">';
    html += '<div class="shelf-books">';

    // Track cumulative width to position labels on the shelf board
    let cumulativeWidth = 12; // shelf padding-left
    const labels = [];
    let itemIndex = 0;

    shelf.forEach(item => {
      // Record label position if this item starts a genre group
      if (item.genreLabel) {
        labels.push({ label: item.genreLabel, left: cumulativeWidth });
      }
      // item actual width (without gap) + gap between items
      const itemWidth = item.slotWidth - gap;
      cumulativeWidth += itemWidth + (itemIndex < shelf.length - 1 ? gap : 0);
      itemIndex++;

      if (item.type === 'pile') {
        const pileHeight = item.books.reduce((sum, b) => sum + b.props.width, 0);
        html += `<div class="book-pile" style="width: ${item.bookHeight}px; height: ${pileHeight}px;">`;

        item.books.forEach(({ book, props }) => {
          const textColor = getContrastColor(props.color);
          const textColorDim = textColor === '#f0f0f0' ? 'rgba(240,240,240,0.55)' : 'rgba(26,26,26,0.45)';
          // Thin books get smaller font, thick books get bigger
          const fontSize = props.width < 22 ? 5 : props.width < 30 ? 7 : Math.min(10, props.width * 0.3);
          const clickHandler = editMode ? `onclick="openEditModal(${book.id})"` : '';

          // Stars vertical on the left
          let starsHtml = '';
          if (book.rating) {
            starsHtml = '<div class="pile-book-stars">';
            for (let s = 1; s <= 5; s++) {
              starsHtml += `<span class="star ${s <= book.rating ? 'filled' : ''}"></span>`;
            }
            starsHtml += '</div>';
          }

          html += `
            <div class="pile-book"
                 style="height: ${props.width}px; background-color: ${props.color}; color: ${textColor}; font-size: ${fontSize}px;"
                 ${clickHandler}
                 title="${escapeHtml(book.title)} — ${escapeHtml(book.author)}">
              ${starsHtml}
              <span class="pile-book-title">${escapeHtml(book.title)}</span>
              <span class="pile-book-author" style="color: ${textColorDim};">${escapeHtml(getLastName(book.author))}</span>
            </div>
          `;
        });

        html += '</div>';
        return;
      }

      // Standing book (unread)
      const { book, props } = item;
      const textColor = getContrastColor(props.color);
      const textColorDim = textColor === '#f0f0f0' ? 'rgba(240,240,240,0.7)' : 'rgba(26,26,26,0.6)';
      const fontSize = props.width < 22 ? 6 : props.width < 30 ? 8 : Math.min(11, props.width * 0.22);
      const authorFontSize = props.width < 22 ? 4 : Math.max(5, Math.min(7, props.width * 0.15));
      const clickHandler = editMode ? `onclick="openEditModal(${book.id})"` : '';

      // Horizontal stars at top
      let ratingHtml = '';
      if (book.rating) {
        ratingHtml = '<div class="book-rating-stars">';
        for (let i = 1; i <= 5; i++) {
          ratingHtml += `<span class="star ${i <= book.rating ? 'filled' : ''}"></span>`;
        }
        ratingHtml += '</div>';
      }

      html += `
        <div class="book-spine"
             style="width: ${props.width}px; height: ${props.height}px; background-color: ${props.color}; color: ${textColor};"
             ${clickHandler}
             title="${escapeHtml(book.title)} — ${escapeHtml(book.author)}">
          <div class="book-author-vertical" style="font-size: ${authorFontSize}px; color: ${textColorDim};">
            ${escapeHtml(getLastName(book.author))}
          </div>
          <div class="book-title-vertical" style="font-size: ${fontSize}px;">
            ${escapeHtml(book.title)}
          </div>
          ${ratingHtml}
        </div>
      `;
    });

    html += '</div>';
    html += '<div class="shelf-board">';
    labels.forEach(({ label, left }) => {
      html += `<span class="shelf-label" style="left: ${left}px;">${label}</span>`;
    });
    html += '</div>';
    html += '<div class="shelf-support"></div>';
    html += '</div>';
  });

  html += '</div>';
  container.innerHTML = html;

  // Update legend
  const unreadCount = totalBooks - readCount;
  document.getElementById('shelf-legend').textContent =
    `${totalBooks} livres — ${readCount} lus, ${unreadCount} non lus`;
}

// --- Mode édition ---
function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('edit-mode-btn');
  if (editMode) {
    btn.classList.remove('opacity-40');
    btn.classList.add('btn-primary', 'opacity-100');
    btn.querySelector('span').textContent = 'Done';
  } else {
    btn.classList.add('opacity-40');
    btn.classList.remove('btn-primary', 'opacity-100');
    btn.querySelector('span').textContent = 'Edit';
  }
  displayShelf();
}

function openEditModal(bookId) {
  if (!editMode) return;
  const book = books.find(b => b.id === bookId);
  if (!book) return;

  const props = getBookDisplayProps(book);

  document.getElementById('edit-book-id').value = bookId;
  document.getElementById('edit-book-title').value = book.title;
  document.getElementById('edit-book-author').value = book.author;
  document.getElementById('edit-book-genres').value = (book.genres || []).join(', ');
  document.getElementById('edit-book-pages').value = book.page_count || props.pageCount;
  document.getElementById('edit-book-year').value = book.year || '';
  document.getElementById('edit-book-size').value = book.size || props.size;
  document.getElementById('edit-book-gift').checked = book.is_gift || false;
  const currentColor = book.color || props.color;
  document.getElementById('edit-book-color').value = currentColor;
  renderColorSwatches(currentColor);

  editRating = book.rating || 0;
  renderEditRatingStars();

  document.getElementById('edit-book-modal').showModal();
}

function renderColorSwatches(selectedColor) {
  const container = document.getElementById('edit-color-swatches');
  container.innerHTML = BOOK_COLORS.map(c => {
    const isSelected = c.toLowerCase() === selectedColor.toLowerCase();
    return `<button type="button" onclick="selectColorSwatch('${c}')"
      style="background: ${c}; width: 24px; height: 24px; border: 2px solid ${isSelected ? '#fff' : 'transparent'}; outline: ${isSelected ? '2px solid #6b5c4a' : 'none'}; cursor: pointer;"
      title="${c}"></button>`;
  }).join('');
}

function selectColorSwatch(color) {
  document.getElementById('edit-book-color').value = color;
  renderColorSwatches(color);
}

function renderEditRatingStars() {
  const container = document.getElementById('edit-book-rating');
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= editRating;
    html += `<button type="button" onclick="setEditRating(${i})" class="cursor-pointer hover:scale-110 transition-transform">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 ${filled ? 'text-warning' : 'text-base-300'}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    </button>`;
  }
  container.innerHTML = html;
}

function setEditRating(rating) {
  editRating = editRating === rating ? 0 : rating;
  renderEditRatingStars();
}

function closeEditModal() {
  document.getElementById('edit-book-modal').close();
}

async function saveBookEdit() {
  const id = parseInt(document.getElementById('edit-book-id').value);
  const title = document.getElementById('edit-book-title').value.trim();
  const author = document.getElementById('edit-book-author').value.trim();
  const genresInput = document.getElementById('edit-book-genres').value.trim();
  const page_count = parseInt(document.getElementById('edit-book-pages').value) || null;
  const year = parseInt(document.getElementById('edit-book-year').value) || null;
  const size = parseInt(document.getElementById('edit-book-size').value) || 2;
  const is_gift = document.getElementById('edit-book-gift').checked ? 1 : 0;
  const color = document.getElementById('edit-book-color').value;
  const rating = editRating;

  if (!title || !author) return;

  const genres = genresInput.split(',').map(g => g.trim()).filter(g => g).slice(0, 3);

  await api('books.php', 'PUT', {
    id, title, author, genres, page_count, size, is_gift, year, color, rating
  });

  closeEditModal();
  await loadBooks();
  displayShelf();
}

// --- Navigation ---
function showPage(pageId) {
  if (pageId === 'import-page') importManagement?.renderList();
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });
  document.querySelectorAll("[role='tab']").forEach((tab) => {
    tab.classList.remove("tab-active");
  });
  document.getElementById(pageId).classList.add("active");
  document.querySelectorAll("[role='tab']").forEach(tab => {
    const active = tab.getAttribute('onclick') === `showPage('${pageId}')`;
    if (active) tab.classList.add('tab-active');
    tab.setAttribute('aria-selected', String(active));
  });

  if (pageId === "home-page") {
    loadCurrentlyReading().then(() => displayCurrentlyReading());
    displayShelf();
  }
  if (pageId === "random-page") {
    startGenreQuiz();
  }
  if (pageId === "list-page") {
    displayBooks();
  }
  if (pageId === "wishlist-page") {
    displayWishlist();
  }
  if (pageId === "stats-page") {
    displayStats();
  }
  if (pageId === "challenge-page") {
    displayChallenge();
  }
  if (pageId === "loans-page") {
    loadLoans().then(() => displayLoans());
  }
}

// --- Affichage des livres ---
function applyBookFilter(key, value) {
  bookFilter[key] = value;
  displayBooks();
}

function applyBookSort(value) {
  const [key, dir] = value.split('-');
  bookSort.key = key;
  bookSort.dir = dir;
  displayBooks();
}

function clearBookFilter(key) {
  bookFilter[key] = key === 'search' ? '' : 'all';
  displayBooks();
}

function displayBooks() {
  const container = document.getElementById("books-container");
  const stats = document.getElementById("stats");
  const lib = libraryBooks();

  if (lib.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 opacity-50">
        <div class="text-5xl mb-4">📚</div>
        <p class="text-sm">Votre bibliothèque est vide</p>
      </div>
    `;
    stats.textContent = "";
    return;
  }

  // Collect all genres & authors for filter dropdowns
  const allGenres = new Set();
  const allAuthors = new Set();
  lib.forEach(b => {
    b.genres.forEach(g => allGenres.add(g));
    allAuthors.add(b.author);
  });
  const sortedGenres = [...allGenres].sort((a, b) => a.localeCompare(b, 'fr'));
  const sortedAuthors = [...allAuthors].sort((a, b) => a.localeCompare(b, 'fr'));

  // Apply filters
  let filtered = lib.filter(b => {
    if (bookFilter.status === 'read' && !b.is_read) return false;
    if (bookFilter.status === 'unread' && b.is_read) return false;
    if (bookFilter.status === 'rated' && !b.rating) return false;
    if (bookFilter.status === 'gift' && !b.is_gift) return false;
    if (bookFilter.genre !== 'all' && !b.genres.includes(bookFilter.genre)) return false;
    if (bookFilter.author !== 'all' && b.author !== bookFilter.author) return false;
    if (bookFilter.search) {
      const q = bookFilter.search.toLowerCase();
      if (!b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Apply sort
  const dir = bookSort.dir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    switch (bookSort.key) {
      case 'title': return dir * a.title.localeCompare(b.title, 'fr');
      case 'author': return dir * a.author.localeCompare(b.author, 'fr');
      case 'rating': return dir * ((a.rating || 0) - (b.rating || 0));
      case 'pages': return dir * ((a.page_count || 0) - (b.page_count || 0));
      case 'year': return dir * ((a.year || 0) - (b.year || 0));
      default: return 0;
    }
  });

  const sortValue = `${bookSort.key}-${bookSort.dir}`;
  const hasActiveFilter = bookFilter.status !== 'all' || bookFilter.genre !== 'all' || bookFilter.author !== 'all' || bookFilter.search;

  // Active filter badges
  const filterLabels = { read: 'Lus', unread: 'Non lus', rated: 'Notés', gift: 'Cadeaux' };
  let activeBadges = '';
  if (bookFilter.status !== 'all') activeBadges += `<span class="badge badge-sm gap-1">${filterLabels[bookFilter.status]}<button onclick="clearBookFilter('status')" class="text-error font-bold">×</button></span>`;
  if (bookFilter.genre !== 'all') activeBadges += `<span class="badge badge-sm gap-1">${escapeHtml(bookFilter.genre)}<button onclick="clearBookFilter('genre')" class="text-error font-bold">×</button></span>`;
  if (bookFilter.author !== 'all') activeBadges += `<span class="badge badge-sm gap-1">${escapeHtml(bookFilter.author)}<button onclick="clearBookFilter('author')" class="text-error font-bold">×</button></span>`;
  if (bookFilter.search) activeBadges += `<span class="badge badge-sm gap-1">"${escapeHtml(bookFilter.search)}"<button onclick="clearBookFilter('search')" class="text-error font-bold">×</button></span>`;

  stats.innerHTML = `
    <div class="flex flex-col gap-3 w-full mb-4">
      <div class="flex flex-wrap items-center gap-2">
        <label class="input input-sm flex items-center gap-2 flex-1 min-w-48 max-w-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Rechercher un titre ou auteur..." value="${escapeHtml(bookFilter.search)}" oninput="applyBookFilter('search', this.value)" class="grow bg-transparent outline-none text-sm" />
        </label>
        <select class="select select-sm" onchange="applyBookFilter('status', this.value)">
          <option value="all" ${bookFilter.status === 'all' ? 'selected' : ''}>Statut</option>
          <option value="read" ${bookFilter.status === 'read' ? 'selected' : ''}>Lus</option>
          <option value="unread" ${bookFilter.status === 'unread' ? 'selected' : ''}>Non lus</option>
          <option value="rated" ${bookFilter.status === 'rated' ? 'selected' : ''}>Notés</option>
          <option value="gift" ${bookFilter.status === 'gift' ? 'selected' : ''}>Cadeaux</option>
        </select>
        <select class="select select-sm" onchange="applyBookFilter('genre', this.value)">
          <option value="all" ${bookFilter.genre === 'all' ? 'selected' : ''}>Genre</option>
          ${sortedGenres.map(g => `<option value="${escapeHtml(g)}" ${bookFilter.genre === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
        </select>
        <select class="select select-sm" onchange="applyBookFilter('author', this.value)">
          <option value="all" ${bookFilter.author === 'all' ? 'selected' : ''}>Auteur</option>
          ${sortedAuthors.map(a => `<option value="${escapeHtml(a)}" ${bookFilter.author === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
        </select>
        <select class="select select-sm" onchange="applyBookSort(this.value)">
          <option value="title-asc" ${sortValue === 'title-asc' ? 'selected' : ''}>Titre A → Z</option>
          <option value="title-desc" ${sortValue === 'title-desc' ? 'selected' : ''}>Titre Z → A</option>
          <option value="author-asc" ${sortValue === 'author-asc' ? 'selected' : ''}>Auteur A → Z</option>
          <option value="author-desc" ${sortValue === 'author-desc' ? 'selected' : ''}>Auteur Z → A</option>
          <option value="rating-desc" ${sortValue === 'rating-desc' ? 'selected' : ''}>Meilleures notes</option>
          <option value="rating-asc" ${sortValue === 'rating-asc' ? 'selected' : ''}>Notes les plus basses</option>
          <option value="pages-desc" ${sortValue === 'pages-desc' ? 'selected' : ''}>Plus de pages</option>
          <option value="pages-asc" ${sortValue === 'pages-asc' ? 'selected' : ''}>Moins de pages</option>
          <option value="year-desc" ${sortValue === 'year-desc' ? 'selected' : ''}>Plus récents</option>
          <option value="year-asc" ${sortValue === 'year-asc' ? 'selected' : ''}>Plus anciens</option>
        </select>
      </div>
      ${hasActiveFilter ? `
        <div class="flex flex-wrap items-center gap-2">
          ${activeBadges}
          <button onclick="bookFilter = { status: 'all', genre: 'all', author: 'all', search: '' }; displayBooks();" class="text-xs text-error opacity-60 hover:opacity-100">Tout effacer</button>
        </div>
      ` : ''}
      <div class="text-xs opacity-50">${filtered.length}${filtered.length !== lib.length ? ` / ${lib.length}` : ''} livre${filtered.length > 1 ? 's' : ''}</div>
    </div>
  `;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 opacity-50">
        <div class="text-3xl mb-3">🔍</div>
        <p class="text-sm">Aucun livre ne correspond aux filtres</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map(
      (book) => `
        <div class="card card-border bg-base-100 transition-all hover:border-primary hover:-translate-y-0.5 ${book.is_read ? "opacity-50" : ""}">
          <div class="card-body p-5">
            <div class="catalog-preview">${coverHtml(book)}<div class="min-w-0 flex-1"><h3 class="font-medium">${escapeHtml(book.title)}</h3><p class="text-sm opacity-60">${escapeHtml(book.author)}</p>${book.isbn ? `<p class="text-xs mt-2">ISBN ${escapeHtml(book.isbn)}</p>` : ''}${book.publisher ? `<p class="text-xs opacity-70">${escapeHtml(book.publisher)}${book.published_date ? ' · ' + escapeHtml(book.published_date) : ''}</p>` : ''}</div></div>
            <div class="flex justify-between items-start gap-2">
              <div class="flex items-center gap-1 shrink-0">
                <button onclick="toggleRead(${book.id})" class="btn btn-xs ${book.is_read ? "btn-success" : "btn-outline"}" title="${book.is_read ? "Marquer non lu" : "Marquer comme lu"}">
                  ${book.is_read ? "✓ Lu" : "Marquer lu"}
                </button>
                <button onclick="deleteBook(${book.id})" class="btn btn-ghost btn-xs text-error" title="Supprimer">
                  ×
                </button>
              </div>
            </div>
            <div class="flex justify-between items-center">

              ${!book.is_read && (book.is_gift || book.year) ? `
              <div class="flex items-center gap-2 text-sm opacity-70">
                ${book.is_gift ? giftSvg() : ""}
                ${book.year ? `<span>${book.year}</span>` : ""}
              </div>` : ""}
            </div>
            <div class="flex flex-wrap gap-1 mt-1">
              ${book.genres
                .map(
                  (genre) =>
                    `<span class="badge badge-outline badge-sm">${escapeHtml(genre)}</span>`
                )
                .join("")}
            </div>
            ${book.is_read ? `<div class="mt-2">${starsHtml(book.id, book.rating)}</div>` : ""}
          </div>
        </div>
      `
    )
    .join("");
}

// --- En cours de lecture ---
function displayCurrentlyReading() {
  const container = document.getElementById("currently-reading-section");
  if (!container) return;

  const addBtn = `
    <button onclick="openReadingSelector()" class="btn btn-ghost btn-sm gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span class="text-xs">Ajouter</span>
    </button>
  `;

  if (!currentlyReading || currentlyReading.length === 0) {
    container.innerHTML = `
      <div class="card card-border bg-base-100 mb-2">
        <div class="card-body p-5">
          <div class="flex justify-between items-center">
            <h2 class="text-sm font-medium opacity-60 uppercase tracking-wide">En cours de lecture</h2>
            ${addBtn}
          </div>
          <div class="text-center py-6 opacity-40">
            <div class="text-3xl mb-2">📖</div>
            <p class="text-sm">Aucun livre en cours</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const cardsHtml = currentlyReading.map(cr => {
    const totalPages = cr.page_count || 0;
    const pct = totalPages > 0 ? Math.round((cr.current_page / totalPages) * 100) : 0;
    const pctClamped = Math.min(100, pct);
    const color = cr.color || '#2b4570';
    const startDate = new Date(cr.started_at);
    const days = Math.max(1, Math.ceil((Date.now() - startDate) / 86400000));

    return `
      <div class="card card-border bg-base-100 transition-all hover:border-primary hover:-translate-y-0.5">
        <div class="card-body p-4">
          <div class="flex items-start gap-3">
            <div class="w-3 rounded-sm self-stretch flex-shrink-0" style="background:${color};"></div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-sm truncate">${escapeHtml(cr.title)}</h3>
              <p class="text-xs opacity-50">${escapeHtml(cr.author)}</p>
              <div class="flex items-center gap-2 mt-2">
                <div class="flex-1 bg-base-300 h-2 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500" style="width:${pctClamped}%;background:${color};"></div>
                </div>
                <span class="text-xs font-medium tabular-nums">${pctClamped}%</span>
              </div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-[10px] opacity-40">${cr.current_page}${totalPages ? ' / ' + totalPages + ' pages' : ' pages'}</span>
                <span class="text-[10px] opacity-40">Jour ${days}</span>
              </div>
              <div class="flex items-center gap-1 mt-3">
                <button onclick="openProgressModal(${cr.book_id}, ${escapeHtml(JSON.stringify(cr.title))}, ${cr.current_page}, ${totalPages})" class="btn btn-xs btn-ghost">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Avancée
                </button>
                <button onclick="finishReading(${cr.book_id})" class="btn btn-xs btn-success btn-ghost" title="Terminé">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Terminé
                </button>
                <button onclick="dnfReading(${cr.book_id})" class="btn btn-xs btn-error btn-ghost" title="Abandonner">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  DNF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card card-border bg-base-100 mb-2">
      <div class="card-body p-5">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-sm font-medium opacity-60 uppercase tracking-wide">En cours de lecture</h2>
          ${addBtn}
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          ${cardsHtml}
        </div>
      </div>
    </div>
  `;
}

// --- Sélecteur de livres pour lecture en cours ---
function openReadingSelector() {
  const modal = document.getElementById('reading-selector-modal');
  document.getElementById('reading-selector-search').value = '';
  renderReadingSelectorList('');
  modal.showModal();
}

function closeReadingSelector() {
  document.getElementById('reading-selector-modal').close();
}

function filterReadingSelector() {
  const q = document.getElementById('reading-selector-search').value.toLowerCase();
  renderReadingSelectorList(q);
}

function renderReadingSelectorList(query) {
  const container = document.getElementById('reading-selector-list');
  const crIds = new Set(currentlyReading.map(cr => cr.book_id));
  const eligible = libraryBooks().filter(b => !b.is_read && !crIds.has(b.id));
  const filtered = query
    ? eligible.filter(b => b.title.toLowerCase().includes(query) || b.author.toLowerCase().includes(query))
    : eligible;

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center opacity-50 py-4 text-sm">Aucun livre disponible</p>';
    return;
  }

  container.innerHTML = filtered.map(b => `
    <div class="flex items-center justify-between p-2 hover:bg-base-200 cursor-pointer" onclick="startReading(${b.id})">
      <div class="min-w-0">
        <div class="text-sm font-medium truncate">${escapeHtml(b.title)}</div>
        <div class="text-xs opacity-50">${escapeHtml(b.author)}${b.page_count ? ' · ' + b.page_count + ' p.' : ''}</div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-30 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
  `).join('');
}

async function startReading(bookId) {
  await api('reading.php', 'POST', { action: 'start', book_id: bookId });
  await loadCurrentlyReading();
  closeReadingSelector();
  displayCurrentlyReading();
}

// --- Modal progression ---
let progressMode = 'pages'; // 'pages' or 'pct'

function openProgressModal(bookId, title, currentPage, totalPages) {
  document.getElementById('progress-book-id').value = bookId;
  document.getElementById('progress-total-pages').value = totalPages || 0;
  document.getElementById('progress-book-title').textContent = title + (totalPages ? ` (${totalPages} pages)` : '');
  document.getElementById('progress-date').value = '';
  setProgressMode('pages');
  document.getElementById('progress-page').value = currentPage;
  // Hide % toggle if no page count
  document.getElementById('progress-mode-toggle').style.display = totalPages ? '' : 'none';
  document.getElementById('reading-progress-modal').showModal();
}

function setProgressMode(mode) {
  progressMode = mode;
  const pageInput = document.getElementById('progress-page');
  const totalPages = parseInt(document.getElementById('progress-total-pages').value) || 0;
  const btnPages = document.getElementById('progress-mode-pages');
  const btnPct = document.getElementById('progress-mode-pct');

  if (mode === 'pages') {
    btnPages.className = 'px-2 py-0.5 rounded-md bg-primary text-primary-content font-medium transition-all';
    btnPct.className = 'px-2 py-0.5 rounded-md transition-all';
    // Convert current % value back to pages
    if (pageInput.dataset.wasPct === '1' && totalPages) {
      const pct = parseFloat(pageInput.value) || 0;
      pageInput.value = Math.round((pct / 100) * totalPages);
    }
    pageInput.placeholder = 'Numéro de page';
    pageInput.max = totalPages || '';
    pageInput.min = 0;
    pageInput.dataset.wasPct = '0';
  } else {
    btnPct.className = 'px-2 py-0.5 rounded-md bg-primary text-primary-content font-medium transition-all';
    btnPages.className = 'px-2 py-0.5 rounded-md transition-all';
    // Convert current page value to %
    if (totalPages) {
      const currentPage = parseInt(pageInput.value) || 0;
      pageInput.value = Math.round((currentPage / totalPages) * 100);
    }
    pageInput.placeholder = 'Pourcentage';
    pageInput.max = 100;
    pageInput.min = 0;
    pageInput.dataset.wasPct = '1';
  }
}

function closeProgressModal() {
  document.getElementById('reading-progress-modal').close();
}

async function saveProgress() {
  const bookId = parseInt(document.getElementById('progress-book-id').value);
  const totalPages = parseInt(document.getElementById('progress-total-pages').value) || 0;
  const rawValue = parseFloat(document.getElementById('progress-page').value) || 0;
  const logDate = document.getElementById('progress-date').value || null;

  // Convert % to page number if needed
  let page;
  if (progressMode === 'pct' && totalPages) {
    page = Math.round((Math.min(100, rawValue) / 100) * totalPages);
  } else {
    page = Math.round(rawValue);
  }

  await api('reading.php', 'POST', { action: 'update_page', book_id: bookId, current_page: page, log_date: logDate });
  closeProgressModal();
  await loadCurrentlyReading();
  displayCurrentlyReading();
}

async function finishReading(bookId) {
  await api('reading.php', 'POST', { action: 'finish', book_id: bookId });
  await Promise.all([loadBooks(), loadCurrentlyReading()]);
  displayCurrentlyReading();
  displayShelf();
}

async function dnfReading(bookId) {
  await api('reading.php', 'POST', { action: 'dnf', book_id: bookId });
  await loadCurrentlyReading();
  displayCurrentlyReading();
}

// --- Statistiques ---
// SVG helper: radial gauge (arc from 0 to pct%)
function svgGauge(pct, label, sublabel, size = 100, color = '#4ade80') {
  const r = (size - 10) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="block">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="currentColor" stroke-width="6" class="text-base-300" />
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 ${c} ${c})" style="transition: stroke-dashoffset 0.6s ease;" />
      <text x="${c}" y="${c - 4}" text-anchor="middle" class="fill-current" style="font-size:${size * 0.22}px; font-weight:700;">${label}</text>
      <text x="${c}" y="${c + 12}" text-anchor="middle" class="fill-current opacity-50" style="font-size:${size * 0.1}px;">${sublabel}</text>
    </svg>
  `;
}

async function displayStats() {
  await loadReadingLog();
  const container = document.getElementById("stats-content");
  const lib = libraryBooks();

  if (lib.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 opacity-50">
        <div class="text-5xl mb-4">📊</div>
        <p class="text-sm">Ajoutez des livres pour voir vos statistiques</p>
      </div>
    `;
    return;
  }

  const readBooks = lib.filter((b) => b.is_read);
  const readCount = readBooks.length;
  const unreadCount = lib.length - readCount;
  const readPct = lib.length > 0 ? Math.round((readCount / lib.length) * 100) : 0;
  const ratedBooks = lib.filter((b) => b.rating);
  const avgRating = ratedBooks.length > 0
    ? (ratedBooks.reduce((s, b) => s + b.rating, 0) / ratedBooks.length).toFixed(1)
    : null;
  const giftCount = lib.filter((b) => b.is_gift).length;

  // Page counts (only books with actual page_count encoded)
  const libWithPages = lib.filter(b => b.page_count);
  const readWithPages = readBooks.filter(b => b.page_count);
  const totalPages = libWithPages.reduce((sum, b) => sum + b.page_count, 0);
  const readPages = readWithPages.reduce((sum, b) => sum + b.page_count, 0);
  const readPagesPct = totalPages > 0 ? Math.round((readPages / totalPages) * 100) : 0;
  const unreadPages = totalPages - readPages;
  const encodedPagesPct = lib.length > 0 ? Math.round((libWithPages.length / lib.length) * 100) : 0;

  // Time stats: 1 page = 70 seconds (1min10)
  const SEC_PER_PAGE = 70;
  const totalMinutes = Math.round((totalPages * SEC_PER_PAGE) / 60);
  const readMinutes = Math.round((readPages * SEC_PER_PAGE) / 60);
  const unreadMinutes = totalMinutes - readMinutes;
  function formatTime(mins) {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}j ${rh}h` : `${d} jours`;
  }

  // Authors
  const uniqueAuthors = new Set(lib.map(b => b.author)).size;
  const authorCounts = {};
  lib.forEach(b => { authorCounts[b.author] = (authorCounts[b.author] || 0) + 1; });
  const authorReadCounts = {};
  readBooks.forEach(b => { authorReadCounts[b.author] = (authorReadCounts[b.author] || 0) + 1; });
  const topAuthorsOwned = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topAuthorsRead = Object.entries(authorReadCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Genres
  const allGenres = new Set();
  lib.forEach(b => b.genres.forEach(g => allGenres.add(g)));

  const genreData = {};
  lib.forEach((book) => {
    book.genres.forEach((g) => {
      if (!genreData[g]) genreData[g] = { total: 0, read: 0, unread: 0, ratingSum: 0, ratingCount: 0, books: [] };
      genreData[g].total++;
      if (book.is_read) genreData[g].read++;
      else genreData[g].unread++;
      if (book.rating) { genreData[g].ratingSum += book.rating; genreData[g].ratingCount++; }
      genreData[g].books.push(book);
    });
  });

  // Primary genre (first genre only)
  const primaryGenreData = {};
  lib.forEach((book) => {
    const pg = (book.genres && book.genres[0]) || 'Sans genre';
    if (!primaryGenreData[pg]) primaryGenreData[pg] = { total: 0, read: 0 };
    primaryGenreData[pg].total++;
    if (book.is_read) primaryGenreData[pg].read++;
  });

  // Rankings
  const byRating = Object.entries(genreData)
    .filter(([, s]) => s.ratingCount > 0)
    .map(([g, s]) => [g, s.ratingSum / s.ratingCount, s.ratingCount])
    .sort((a, b) => b[1] - a[1]);
  const byWorstRating = [...byRating].sort((a, b) => a[1] - b[1]);
  const byUnread = Object.entries(genreData)
    .filter(([, s]) => s.unread > 0)
    .sort((a, b) => b[1].unread - a[1].unread);
  const byLeastRead = Object.entries(genreData)
    .filter(([, s]) => s.total >= 2)
    .map(([g, s]) => [g, s, Math.round((s.read / s.total) * 100)])
    .sort((a, b) => a[2] - b[2]);
  const fullyRead = Object.entries(genreData).filter(([, s]) => s.read === s.total && s.total > 0);

  // Fun numbers
  const avgPagesPerBook = libWithPages.length > 0 ? Math.round(totalPages / libWithPages.length) : 0;
  const longestBook = libWithPages.reduce((best, b) => {
    return b.page_count > (best.pages || 0) ? { book: b, pages: b.page_count } : best;
  }, {});
  const shortestBook = libWithPages.reduce((best, b) => {
    return (best.pages === undefined || b.page_count < best.pages) ? { book: b, pages: b.page_count } : best;
  }, {});

  // Rating distribution
  const ratingDist = [0, 0, 0, 0, 0];
  ratedBooks.forEach(b => { ratingDist[b.rating - 1]++; });
  const maxRatingCount = Math.max(...ratingDist, 1);

  // Storage bar colors
  const storageColors = [
    '#b03a3a', '#2b4570', '#5a8a5c', '#d4a84b', '#7b3f6a',
    '#3a7d8c', '#c25b28', '#8c7a5a', '#5c5c8a', '#a0522d',
    '#6a8fa0', '#4a7a4a', '#d48a8a', '#c4b078', '#3a5a3a'
  ];
  const primarySorted = Object.entries(primaryGenreData).sort((a, b) => b[1].total - a[1].total);
  const storageSegments = primarySorted.map(([genre, s], i) => ({
    genre, pct: (s.total / lib.length) * 100,
    color: storageColors[i % storageColors.length], count: s.total
  }));

  // Waffle chart: 10x10 grid, each cell = 1% of collection
  const waffleSize = 100;
  const readCells = Math.round((readCount / lib.length) * waffleSize);
  let waffleHtml = '';
  for (let i = 0; i < waffleSize; i++) {
    const isRead = i < readCells;
    waffleHtml += `<div class="w-2 h-2 ${isRead ? 'bg-success' : 'bg-base-300'}" style="transition: background 0.3s ${i * 8}ms;"></div>`;
  }

  // ========== BUILD HTML ==========

  // --- Row 1: Hero gauges ---
  const heroHtml = `
    <div class="card card-border bg-base-100">
      <div class="card-body p-6">
        <div class="flex items-center justify-around flex-wrap gap-6">
          <div class="flex flex-col items-center gap-2">
            ${svgGauge(readPct, `${readPct}%`, `${readCount}/${lib.length} livres`, 120, '#4ade80')}
            <span class="text-xs font-medium opacity-60 uppercase tracking-wide">Livres lus</span>
          </div>
          <div class="flex flex-col items-center gap-2">
            ${svgGauge(readPagesPct, `${readPagesPct}%`, `${readPages.toLocaleString('fr-FR')} p.`, 120, '#60a5fa')}
            <span class="text-xs font-medium opacity-60 uppercase tracking-wide">Pages lues</span>
            ${libWithPages.length < lib.length ? `<span class="text-[9px] opacity-35">${libWithPages.length}/${lib.length} livres renseignés</span>` : ''}
          </div>
          <div class="flex flex-col items-center gap-2">
            ${svgGauge(avgRating ? (avgRating / 5 * 100) : 0, avgRating || '—', `${ratedBooks.length} avis`, 120, '#fbbf24')}
            <span class="text-xs font-medium opacity-60 uppercase tracking-wide">Note moyenne</span>
          </div>
          <div class="flex flex-col items-center gap-2">
            ${svgGauge(totalMinutes > 0 ? Math.round((readMinutes / totalMinutes) * 100) : 0, formatTime(readMinutes), `/ ${formatTime(totalMinutes)}`, 120, '#a78bfa')}
            <span class="text-xs font-medium opacity-60 uppercase tracking-wide">Temps lu</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Row 2: Key numbers (horizontal ticker) ---
  const tickerHtml = `
    <div class="flex gap-3 overflow-x-auto pb-2 mb-2 scrollbar-none">
      ${[
        { val: lib.length, label: 'Livres' },
        { val: uniqueAuthors, label: 'Auteurs' },
        { val: allGenres.size, label: 'Genres' },
        ...(libWithPages.length > 0 ? [
          { val: totalPages.toLocaleString('fr-FR'), label: 'Pages' },
          { val: avgPagesPerBook, label: 'Pages / livre' },
          { val: formatTime(readMinutes), label: 'Temps lu' },
          { val: formatTime(unreadMinutes), label: 'Reste à lire' },
        ] : []),
        { val: giftCount, label: 'Cadeaux' },
      ].map(t => `
        <div class="card card-border bg-base-100 flex-shrink-0">
          <div class="card-body p-3 px-5 text-center">
            <div class="text-lg font-bold">${t.val}</div>
            <div class="text-[10px] opacity-50 uppercase tracking-wider">${t.label}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // --- Waffle + rating dist side by side ---
  const wafflePanelHtml = `
    <div class="card card-border bg-base-100">
      <div class="card-body p-5">
        <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Progression visuelle</h3>
        <div class="flex items-center gap-4">
          <div class="grid grid-cols-10 gap-[3px]">${waffleHtml}</div>
          <div class="flex flex-col gap-1 text-xs">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 bg-success inline-block"></span>
              <span>Lus · ${readCount}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 bg-base-300 inline-block"></span>
              <span>Non lus · ${unreadCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let ratingDistHtml = "";
  if (ratedBooks.length > 0) {
    ratingDistHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Distribution des notes</h3>
          <div class="flex items-end gap-1.5" style="height:80px;">
            ${ratingDist.map((count, i) => {
              const h = Math.max(6, (count / maxRatingCount) * 100);
              return `
                <div class="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <span class="text-[10px] opacity-50">${count}</span>
                  <div class="w-full rounded-sm" style="height:${h}%; background: ${['#ef4444','#f97316','#eab308','#84cc16','#22c55e'][i]};"></div>
                  <span class="text-[10px] font-medium">${i + 1}★</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  // --- Storage bar (full width) ---
  const storageHtml = `
    <div class="card card-border bg-base-100">
      <div class="card-body p-5">
        <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Bibliothèque par genre principal</h3>
        <div class="flex w-full h-8 overflow-hidden mb-3">
          ${storageSegments.map(s =>
            `<div style="width:${s.pct}%;background:${s.color};min-width:${s.pct > 2 ? '0' : '3px'};" class="h-full relative group">
              <div class="absolute inset-0 flex items-center justify-center text-white text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style="text-shadow:0 0 3px rgba(0,0,0,0.5);">${s.count}</div>
            </div>`
          ).join("")}
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          ${storageSegments.map(s => `
            <div class="flex items-center gap-1.5 text-xs">
              <span class="w-2 h-2 flex-shrink-0" style="background:${s.color};"></span>
              <span>${escapeHtml(s.genre)}</span>
              <span class="opacity-40">${s.count} · ${Math.round(s.pct)}%</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  // --- Records: longest / shortest / top author (visual cards) ---
  let recordsHtml = `
    <div class="card card-border bg-base-100">
      <div class="card-body p-5">
        <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Records</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">`;
  if (longestBook.book) {
    recordsHtml += `
          <div class="bg-base-200 p-4 text-center">
            <div class="text-2xl font-bold">${longestBook.pages}</div>
            <div class="text-[10px] uppercase opacity-50 tracking-wide mb-1">pages</div>
            <div class="text-xs font-medium truncate">${escapeHtml(longestBook.book.title)}</div>
            <div class="text-[10px] opacity-40">Le plus long</div>
          </div>`;
  }
  if (shortestBook.book) {
    recordsHtml += `
          <div class="bg-base-200 p-4 text-center">
            <div class="text-2xl font-bold">${shortestBook.pages}</div>
            <div class="text-[10px] uppercase opacity-50 tracking-wide mb-1">pages</div>
            <div class="text-xs font-medium truncate">${escapeHtml(shortestBook.book.title)}</div>
            <div class="text-[10px] opacity-40">Le plus court</div>
          </div>`;
  }
  if (topAuthorsRead.length > 0) {
    recordsHtml += `
          <div class="bg-base-200 p-4 text-center">
            <div class="text-2xl font-bold">${topAuthorsRead[0][1]}</div>
            <div class="text-[10px] uppercase opacity-50 tracking-wide mb-1">livres lus</div>
            <div class="text-xs font-medium truncate">${topAuthorsRead[0][0]}</div>
            <div class="text-[10px] opacity-40">Auteur le plus lu</div>
          </div>`;
  }
  recordsHtml += `</div></div></div>`;

  // --- Time card ---
  const avgMinPerBook = readCount > 0 ? Math.round(readMinutes / readCount) : 0;
  // Fun comparisons (all fixed-duration)
  const timeComparisons = [
    { mins: 480, label: 'vols Paris→New York', icon: '✈️' },
    { mins: 70, label: 'matchs de field hockey', icon: '🏑' },  // 2×35 min
    { mins: 9498, label: 'binges de Gilmore Girls', icon: '☕' },  // 153 ep × 42min + 4 ep × 88min (revival)
    { mins: 480, label: 'nuits de sommeil', icon: '🛏️' },
    { mins: 5, label: 'infusions de thé', icon: '🍵' },
  ].map(c => {
    const val = readMinutes / c.mins;
    return { ...c, val };
  }).filter(c => c.val >= 0.1)
    .map(c => ({
      ...c,
      display: c.val >= 100 ? Math.round(c.val).toLocaleString('fr-FR') : c.val >= 10 ? Math.round(c.val).toString() : c.val.toFixed(1).replace('.0', '')
    }));

  // Precise human-readable duration down to the second
  function preciseDuration(totalSecs) {
    const parts = [];
    let rem = Math.floor(totalSecs);
    const y = Math.floor(rem / (365.25 * 86400));
    if (y > 0) { parts.push(`${y} an${y > 1 ? 's' : ''}`); rem -= Math.floor(y * 365.25 * 86400); }
    const mo = Math.floor(rem / (30.44 * 86400));
    if (mo > 0) { parts.push(`${mo} mois`); rem -= Math.floor(mo * 30.44 * 86400); }
    const d = Math.floor(rem / 86400);
    if (d > 0) { parts.push(`${d} jour${d > 1 ? 's' : ''}`); rem -= d * 86400; }
    const h = Math.floor(rem / 3600);
    if (h > 0) { parts.push(`${h}h`); rem -= h * 3600; }
    const m = Math.floor(rem / 60);
    if (m > 0) { parts.push(`${m}min`); rem -= m * 60; }
    if (rem > 0 || parts.length === 0) { parts.push(`${rem}s`); }
    return parts.join(' ');
  }
  const readDurationLabel = preciseDuration(readPages * SEC_PER_PAGE);
  const totalDurationLabel = preciseDuration(totalPages * SEC_PER_PAGE);

  const timeHtml = `
    <div class="card card-border bg-base-100">
      <div class="card-body p-5">
        <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Temps de lecture (1 page = 1min10)</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div class="bg-base-200 p-3 text-center">
            <div class="text-lg font-bold">${formatTime(readMinutes)}</div>
            <div class="text-[10px] opacity-50 uppercase">déjà lu</div>
            <div class="text-[10px] opacity-35 mt-0.5">${readDurationLabel}</div>
          </div>
          <div class="bg-base-200 p-3 text-center">
            <div class="text-lg font-bold">${formatTime(unreadMinutes)}</div>
            <div class="text-[10px] opacity-50 uppercase">reste à lire</div>
          </div>
          <div class="bg-base-200 p-3 text-center">
            <div class="text-lg font-bold">${formatTime(avgMinPerBook)}</div>
            <div class="text-[10px] opacity-50 uppercase">moy. / livre</div>
          </div>
          <div class="bg-base-200 p-3 text-center">
            <div class="text-lg font-bold">${formatTime(totalMinutes)}</div>
            <div class="text-[10px] opacity-50 uppercase">total</div>
            <div class="text-[10px] opacity-35 mt-0.5">${totalDurationLabel}</div>
          </div>
        </div>
        ${timeComparisons.length > 0 ? `
          <div class="text-[10px] uppercase opacity-40 tracking-wide mb-2">Ton temps de lecture équivaut à...</div>
          <div class="flex flex-wrap gap-3">
            ${timeComparisons.map(c => `
              <div class="flex items-center gap-2 bg-base-200 px-3 py-2">
                <span class="text-base">${c.icon}</span>
                <span class="text-sm font-bold">${c.display}</span>
                <span class="text-xs opacity-60">${c.label}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // --- Top auteurs (horizontal bars) ---
  let topAuthorsHtml = '';
  if (topAuthorsOwned.length > 0) {
    const maxAuthorCount = topAuthorsOwned[0][1];
    topAuthorsHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Top auteurs</h3>
          <div class="flex flex-col gap-2">
            ${topAuthorsOwned.map(([author, count]) => {
              const w = Math.max(8, (count / maxAuthorCount) * 100);
              const readByAuthor = authorReadCounts[author] || 0;
              return `
                <div class="flex items-center gap-3">
                  <span class="text-xs w-24 truncate text-right flex-shrink-0">${escapeHtml(author)}</span>
                  <div class="flex-1 bg-base-200 h-5 relative overflow-hidden">
                    <div class="h-full bg-primary/30" style="width:${w}%;"></div>
                    <div class="h-full bg-primary/70 absolute top-0 left-0" style="width:${Math.max(2, (readByAuthor / maxAuthorCount) * 100)}%;"></div>
                  </div>
                  <span class="text-xs opacity-60 w-10 flex-shrink-0">${readByAuthor}/${count}</span>
                </div>
              `;
            }).join('')}
            <div class="flex items-center gap-3 mt-1 text-[10px] opacity-50">
              <span class="w-24"></span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 bg-primary/70 inline-block"></span> lus</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 bg-primary/30 inline-block"></span> possédés</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Best / Worst rated (visual star bars) ---
  const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-warning inline-block" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  function ratingRankCard(title, items) {
    if (items.length === 0) return '';
    return `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">${title}</h3>
          <div class="flex flex-col gap-2">
            ${items.map(([genre, avg, count], i) => {
              const filled = Math.round(avg);
              let stars = '';
              for (let s = 1; s <= 5; s++) {
                stars += `<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 ${s <= filled ? 'text-warning' : 'text-base-300'}" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
              }
              return `
                <div class="flex items-center justify-between p-2 ${i === 0 ? 'bg-warning/8' : 'bg-base-200'}">
                  <span class="text-sm font-medium">${escapeHtml(genre)}</span>
                  <div class="flex items-center gap-1">
                    <div class="flex">${stars}</div>
                    <span class="text-xs font-medium ml-1">${avg.toFixed(1)}</span>
                    <span class="text-[10px] opacity-40">(${count})</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  const bestRatedHtml = ratingRankCard("Genres les mieux notés", byRating.slice(0, 5));
  const worstItems = byWorstRating.filter(([, avg]) => avg < 4).slice(0, 5);
  const worstRatedHtml = ratingRankCard("Genres les moins aimés", worstItems);

  // --- Backlog (horizontal bar chart) ---
  let backlogHtml = '';
  if (byUnread.length > 0) {
    const top5 = byUnread.slice(0, 5);
    const maxUnread = top5[0][1].unread;
    backlogHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Plus gros backlog</h3>
          <div class="flex flex-col gap-2">
            ${top5.map(([genre, s]) => `
              <div class="flex items-center gap-3">
                <span class="text-xs w-20 truncate text-right flex-shrink-0">${escapeHtml(genre)}</span>
                <div class="flex-1 bg-base-200 h-4 overflow-hidden">
                  <div class="h-full bg-error/50" style="width:${(s.unread / maxUnread) * 100}%;"></div>
                </div>
                <span class="text-xs opacity-60 w-12 flex-shrink-0">${s.unread} / ${s.total}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --- Least explored (mini gauges row) ---
  let leastExploredHtml = '';
  if (byLeastRead.length > 0) {
    const toExplore = byLeastRead.filter(([, , pct]) => pct < 80).slice(0, 5);
    if (toExplore.length > 0) {
      leastExploredHtml = `
        <div class="card card-border bg-base-100">
          <div class="card-body p-5">
            <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Genres les moins explorés</h3>
            <div class="flex items-center justify-around flex-wrap gap-4">
              ${toExplore.map(([genre, , pct]) =>
                `<div class="flex flex-col items-center gap-1">
                  ${svgGauge(pct, `${pct}%`, '', 64, '#8b5cf6')}
                  <span class="text-[10px] font-medium text-center max-w-16 truncate">${escapeHtml(genre)}</span>
                </div>`
              ).join('')}
            </div>
          </div>
        </div>
      `;
    }
  }

  // --- Fully read genres (badge strip) ---
  let fullyReadHtml = '';
  if (fullyRead.length > 0) {
    fullyReadHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Genres terminés</h3>
          <div class="flex flex-wrap gap-2">
            ${fullyRead.map(([genre, s]) => `
              <span class="badge badge-success gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                ${escapeHtml(genre)} (${s.total})
              </span>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --- Littératures (tags starting with "littérature") ---
  const litPrefix = 'littérature';
  const litData = {};
  lib.forEach(book => {
    book.genres.filter(g => g.toLowerCase().startsWith(litPrefix)).forEach(g => {
      const label = g.replace(/^littérature\s*/i, '').trim();
      const key = label || g;
      if (!litData[key]) litData[key] = { total: 0, read: 0, ratingSum: 0, ratingCount: 0, pages: 0 };
      litData[key].total++;
      if (book.is_read) litData[key].read++;
      if (book.rating) { litData[key].ratingSum += book.rating; litData[key].ratingCount++; }
      if (book.page_count) litData[key].pages += book.page_count;
    });
  });

  let litHtml = '';
  const litEntries = Object.entries(litData).sort((a, b) => b[1].total - a[1].total);
  if (litEntries.length > 0) {
    const litTotal = litEntries.reduce((s, [, d]) => s + d.total, 0);
    const litColors = [
      '#2b4570', '#b03a3a', '#5a8a5c', '#d4a84b', '#7b3f6a',
      '#3a7d8c', '#c25b28', '#8c7a5a', '#5c5c8a', '#a0522d',
      '#6a8fa0', '#4a7a4a', '#d48a8a', '#c4b078', '#3a5a3a'
    ];
    const litSegments = litEntries.map(([label, d], i) => ({
      label, pct: (d.total / litTotal) * 100,
      color: litColors[i % litColors.length], ...d
    }));

    litHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Littératures du monde</h3>
          <div class="flex w-full h-6 overflow-hidden mb-3">
            ${litSegments.map(s =>
              `<div style="width:${s.pct}%;background:${s.color};min-width:${s.pct > 2 ? '0' : '3px'};" class="h-full relative group">
                <div class="absolute inset-0 flex items-center justify-center text-white text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style="text-shadow:0 0 3px rgba(0,0,0,0.5);">${s.total}</div>
              </div>`
            ).join('')}
          </div>
          <div class="flex flex-col gap-2">
            ${litSegments.map(s => {
              const readPctLit = s.total > 0 ? Math.round((s.read / s.total) * 100) : 0;
              const avgR = s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(1) : null;
              return `
                <div class="flex items-center gap-3 bg-base-200 p-2 px-3">
                  <span class="w-2.5 h-2.5 flex-shrink-0 rounded-sm" style="background:${s.color};"></span>
                  <span class="text-sm font-medium flex-1 capitalize">${s.label}</span>
                  <span class="text-xs opacity-60">${s.total} livre${s.total > 1 ? 's' : ''}</span>
                  <span class="text-xs font-medium ${readPctLit === 100 ? 'text-success' : ''}">${readPctLit}% lu</span>
                  ${avgR ? `<span class="text-xs opacity-50">${avgR}★</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
          <div class="flex items-center gap-4 mt-3 text-xs opacity-50">
            <span>${litTotal} livre${litTotal > 1 ? 's' : ''} tagué${litTotal > 1 ? 's' : ''}</span>
            <span>${Math.round((litTotal / lib.length) * 100)}% de la bibliothèque</span>
          </div>
        </div>
      </div>
    `;
  }

  // --- Gift stats (mini card) ---
  let giftHtml = '';
  if (giftCount > 0) {
    const giftRead = lib.filter((b) => b.is_gift && b.is_read).length;
    const giftPct = Math.round((giftRead / giftCount) * 100);
    giftHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide mb-3">Cadeaux</h3>
          <div class="flex items-center gap-6">
            ${svgGauge(giftPct, `${giftPct}%`, `${giftRead}/${giftCount}`, 80, '#f472b6')}
            <div class="flex flex-col gap-1 text-sm">
              <span><b>${giftCount}</b> reçus</span>
              <span><b class="text-success">${giftRead}</b> lus</span>
              <span><b>${giftCount - giftRead}</b> en attente</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Heatmap de lecture ---
  let heatmapHtml = '';
  if (readingLog && readingLog.length > 0) {
    // Build a map of date -> {pages, books}
    const logMap = {};
    readingLog.forEach(entry => {
      logMap[entry.log_date] = {
        pages: parseInt(entry.pages) || 0,
        books: entry.books || []
      };
    });

    // Extract available years from reading data
    const availableYears = [...new Set(readingLog.map(e => new Date(e.log_date).getFullYear()))].sort((a, b) => b - a);
    const currentYear = new Date().getFullYear();
    const defaultYear = availableYears.includes(currentYear) ? currentYear : availableYears[0];

    function buildHeatmapGrid(year) {
      const today = new Date();
      const isCurrentYear = year === today.getFullYear();
      const startDate = new Date(year, 0, 1);
      const endDate = isCurrentYear ? today : new Date(year, 11, 31);

      // Align to start of week (Monday)
      const startDay = startDate.getDay();
      const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
      startDate.setDate(startDate.getDate() + mondayOffset);

      const weeks = [];
      let currentWeek = [];
      const dayLabels = ['L', '', 'M', '', 'V', '', ''];
      const d = new Date(startDate);

      // Filter pages for this year only for stats
      const yearPages = Object.entries(logMap)
        .filter(([date]) => new Date(date).getFullYear() === year)
        .map(([, v]) => v.pages);
      const maxPages = yearPages.length > 0 ? Math.max(...yearPages) : 1;
      const totalLoggedPages = yearPages.reduce((s, p) => s + p, 0);
      const activeDays = yearPages.filter(p => p > 0).length;

      while (d <= endDate || currentWeek.length > 0) {
        if (d > endDate && currentWeek.length < 7) {
          while (currentWeek.length < 7) currentWeek.push(null);
        }
        if (d <= endDate) {
          const dateStr = d.toISOString().split('T')[0];
          const entry = logMap[dateStr] || { pages: 0, books: [] };
          currentWeek.push({ date: dateStr, pages: entry.pages, books: entry.books });
          d.setDate(d.getDate() + 1);
        }
        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }
      }

      function heatColor(pages) {
        if (pages === 0) return 'var(--color-base-300, #e5e7eb)';
        const intensity = Math.min(1, pages / Math.max(maxPages * 0.6, 1));
        if (intensity < 0.25) return '#c6e48b';
        if (intensity < 0.5) return '#7bc96f';
        if (intensity < 0.75) return '#239a3b';
        return '#196127';
      }

      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
      let monthLabelsHtml = '<div class="flex" style="margin-left:20px;">';
      let lastMonth = -1;
      weeks.forEach((week, wi) => {
        const firstDay = week.find(c => c !== null);
        if (firstDay) {
          const m = new Date(firstDay.date).getMonth();
          if (m !== lastMonth) {
            monthLabelsHtml += `<span class="text-[9px] opacity-40" style="width:13px;position:absolute;left:${20 + wi * 13}px;">${monthNames[m]}</span>`;
            lastMonth = m;
          }
        }
      });
      monthLabelsHtml += '</div>';

      const cellsHtml = weeks.map(week =>
        `<div class="flex flex-col gap-[2px]">${week.map(cell => {
          if (cell === null) return '<div style="width:10px;height:10px;"></div>';
          const bg = heatColor(cell.pages);
          const booksAttr = cell.books.length > 0 ? ` data-books="${cell.books.map(b => `${escapeHtml(b.title)} (${b.pages}p)`).join('||').replace(/"/g, '&quot;')}"` : '';
          return `<div class="heatmap-cell" style="width:10px;height:10px;background:${bg};border-radius:2px;" data-date="${cell.date}" data-pages="${cell.pages}"${booksAttr}></div>`;
        }).join('')}</div>`
      ).join('');

      return { monthLabelsHtml, cellsHtml, dayLabels, totalLoggedPages, activeDays };
    }

    const initial = buildHeatmapGrid(defaultYear);

    const yearOptionsHtml = availableYears.map(y =>
      `<option value="${y}"${y === defaultYear ? ' selected' : ''}>${y}</option>`
    ).join('');

    heatmapHtml = `
      <div class="card card-border bg-base-100">
        <div class="card-body p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <h3 class="text-xs font-medium opacity-60 uppercase tracking-wide">Heatmap de lecture</h3>
              <select id="heatmap-year-select" class="select select-xs select-bordered text-xs" style="min-height:0;height:24px;padding:0 20px 0 8px;">
                ${yearOptionsHtml}
              </select>
            </div>
            <div class="flex items-center gap-3 text-[10px] opacity-50" id="heatmap-stats">
              <span>${initial.totalLoggedPages.toLocaleString('fr-FR')} pages</span>
              <span>${initial.activeDays} jour${initial.activeDays > 1 ? 's' : ''} actif${initial.activeDays > 1 ? 's' : ''}</span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <div id="heatmap-grid" style="position:relative;padding-top:16px;">
              ${initial.monthLabelsHtml}
              <div class="flex gap-[2px]" style="margin-top:4px;">
                <div class="flex flex-col gap-[2px] mr-1" style="width:14px;">
                  ${initial.dayLabels.map(l => `<div style="height:10px;line-height:10px;" class="text-[9px] opacity-40">${l}</div>`).join('')}
                </div>
                ${initial.cellsHtml}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 mt-3 justify-end text-[9px] opacity-40">
            <span>Moins</span>
            <div style="width:10px;height:10px;background:var(--color-base-300, #e5e7eb);border-radius:2px;"></div>
            <div style="width:10px;height:10px;background:#c6e48b;border-radius:2px;"></div>
            <div style="width:10px;height:10px;background:#7bc96f;border-radius:2px;"></div>
            <div style="width:10px;height:10px;background:#239a3b;border-radius:2px;"></div>
            <div style="width:10px;height:10px;background:#196127;border-radius:2px;"></div>
            <span>Plus</span>
          </div>
        </div>
      </div>
    `;

    // Store buildHeatmapGrid on window so the event listener can access it after innerHTML is set
    window._heatmapBuildGrid = buildHeatmapGrid;
  }

  // ========== ASSEMBLE DASHBOARD ==========
  container.innerHTML = `
    <div class="max-w-5xl mx-auto flex flex-col gap-4">
      ${heroHtml}
      ${heatmapHtml}
      ${tickerHtml}
      <div class="grid gap-4 md:grid-cols-2">
        ${wafflePanelHtml}
        ${ratingDistHtml}
      </div>
      ${storageHtml}
      ${recordsHtml}
      ${timeHtml}
      <div class="grid gap-4 md:grid-cols-2">
        ${topAuthorsHtml}
        ${backlogHtml}
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        ${bestRatedHtml}
        ${worstRatedHtml}
      </div>
      ${leastExploredHtml}
      ${litHtml}
      <div class="grid gap-4 md:grid-cols-2">
        ${fullyReadHtml}
        ${giftHtml}
      </div>
    </div>
  `;

  // --- Heatmap tooltip ---
  const heatmapTooltip = document.createElement('div');
  heatmapTooltip.className = 'heatmap-tooltip';
  heatmapTooltip.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:9999;background:var(--color-base-100,#1f2937);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:220px;color:var(--color-base-content,#e5e7eb);';
  document.body.appendChild(heatmapTooltip);

  container.addEventListener('mouseover', e => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell) return;
    const date = cell.dataset.date;
    const pages = parseInt(cell.dataset.pages);
    const booksRaw = cell.dataset.books;

    const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    let html = `<div style="font-weight:600;margin-bottom:2px;">${dateFormatted}</div>`;
    if (pages === 0) {
      html += `<div style="opacity:.5;">Aucune lecture</div>`;
    } else {
      html += `<div style="opacity:.6;margin-bottom:4px;">${pages} page${pages !== 1 ? 's' : ''} lue${pages !== 1 ? 's' : ''}</div>`;
      if (booksRaw) {
        const books = booksRaw.split('||');
        books.forEach(b => {
          html += `<div style="padding-left:6px;border-left:2px solid #7bc96f;margin-top:2px;">${b}</div>`;
        });
      }
    }
    heatmapTooltip.innerHTML = html;
    heatmapTooltip.style.display = 'block';

    const rect = cell.getBoundingClientRect();
    heatmapTooltip.style.left = (rect.left + rect.width / 2 - heatmapTooltip.offsetWidth / 2) + 'px';
    heatmapTooltip.style.top = (rect.top - heatmapTooltip.offsetHeight - 6) + 'px';
  });

  container.addEventListener('mouseout', e => {
    if (e.target.closest('.heatmap-cell')) {
      heatmapTooltip.style.display = 'none';
    }
  });

  // --- Heatmap year selector ---
  const yearSelect = document.getElementById('heatmap-year-select');
  if (yearSelect && window._heatmapBuildGrid) {
    const dayLabels = ['L', '', 'M', '', 'V', '', ''];
    yearSelect.addEventListener('change', () => {
      const year = parseInt(yearSelect.value);
      const result = window._heatmapBuildGrid(year);
      const gridEl = document.getElementById('heatmap-grid');
      const statsEl = document.getElementById('heatmap-stats');
      if (gridEl) {
        gridEl.innerHTML = `
          ${result.monthLabelsHtml}
          <div class="flex gap-[2px]" style="margin-top:4px;">
            <div class="flex flex-col gap-[2px] mr-1" style="width:14px;">
              ${dayLabels.map(l => `<div style="height:10px;line-height:10px;" class="text-[9px] opacity-40">${l}</div>`).join('')}
            </div>
            ${result.cellsHtml}
          </div>
        `;
      }
      if (statsEl) {
        statsEl.innerHTML = `
          <span>${result.totalLoggedPages.toLocaleString('fr-FR')} pages</span>
          <span>${result.activeDays} jour${result.activeDays > 1 ? 's' : ''} actif${result.activeDays > 1 ? 's' : ''}</span>
        `;
      }
    });
  }
}

// --- Wishlist ---
function displayWishlist() {
  const container = document.getElementById("wishlist-container");
  const wish = wishlistBooks();

  if (wish.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 opacity-50">
        <div class="text-5xl mb-4">💫</div>
        <p class="text-sm">Votre wishlist est vide</p>
      </div>
    `;
    return;
  }

  container.innerHTML = wish
    .map(
      (book) => `
        <div class="card card-border bg-base-100 transition-all hover:border-primary hover:-translate-y-0.5">
          <div class="card-body p-5">
            <div class="flex justify-between items-start gap-2">
              ${coverHtml(book, true)}<h3 class="card-title text-base">${escapeHtml(book.title)}</h3>
              <div class="flex items-center gap-1 shrink-0">
                <button onclick="markAsBought(${book.id})" class="btn btn-xs btn-primary" title="Marquer comme acheté">
                  Acheté
                </button>
                <button onclick="deleteBook(${book.id}, true)" class="btn btn-ghost btn-xs text-error" title="Supprimer">
                  ×
                </button>
              </div>
            </div>
            <p class="text-sm opacity-60">${escapeHtml(book.author)}</p>
            <div class="flex flex-wrap gap-1 mt-1">
              ${book.genres
                .map(
                  (genre) =>
                    `<span class="badge badge-outline badge-sm">${escapeHtml(genre)}</span>`
                )
                .join("")}
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

async function addWishlistBook() {
  const titleEl = document.getElementById("wish-title");
  const authorEl = document.getElementById("wish-author");
  const genresEl = document.getElementById("wish-genres");
  const title = titleEl.value.trim();
  const author = authorEl.value.trim();
  const genresInput = genresEl.value.trim();

  titleEl.classList.remove("input-error");
  authorEl.classList.remove("input-error");
  genresEl.classList.remove("input-error");

  if (!title || !author || !genresInput) {
    if (!title) titleEl.classList.add("input-error");
    if (!author) authorEl.classList.add("input-error");
    if (!genresInput) genresEl.classList.add("input-error");
    setTimeout(() => {
      titleEl.classList.remove("input-error");
      authorEl.classList.remove("input-error");
      genresEl.classList.remove("input-error");
    }, 2000);
    return;
  }

  const genres = genresInput.split(",").map((g) => g.trim()).filter((g) => g).slice(0, 3);

  const result = await api('books.php', 'POST', { title, author, genres, is_wishlist: true });

  if (result.error) {
    alert(result.error);
    return;
  }

  titleEl.value = "";
  authorEl.value = "";
  genresEl.value = "";

  await loadBooks();
  displayWishlist();

  const btn = event.target.closest(".btn") || event.target;
  const originalText = btn.innerHTML;
  btn.innerHTML = "✓ Ajouté";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-success");
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove("btn-success");
    btn.classList.add("btn-primary");
  }, 1500);
}

async function markAsBought(bookId) {
  await api('wishlist.php', 'POST', { id: bookId });
  await loadBooks();
  displayWishlist();
}

// --- Note par étoiles ---
async function rateBook(bookId, rating) {
  const book = books.find((b) => b.id === bookId);
  const newRating = book && book.rating === rating ? 0 : rating;
  await api('rate.php', 'POST', { id: bookId, rating: newRating });
  await loadBooks();
  displayBooks();
}

// --- Marquer comme lu ---
async function toggleRead(bookId) {
  await api('read.php', 'POST', { id: bookId });
  await loadBooks();
  displayBooks();
}

// --- Voir plus / moins dans le formulaire d'ajout ---
function toggleAddExtras() {
  const extras = document.getElementById("add-extras");
  const btn = document.getElementById("add-extras-btn");
  const isHidden = extras.classList.toggle("hidden");
  btn.textContent = isHidden ? "+ Voir plus" : "- Voir moins";
  if (!isHidden) renderAddColorSwatches();
}

function renderAddColorSwatches() {
  const container = document.getElementById('add-color-swatches');
  const colorInput = document.getElementById('book-color');
  container.innerHTML = BOOK_COLORS.map(c => {
    const isSelected = c.toLowerCase() === colorInput.value.toLowerCase();
    return `<button type="button" onclick="selectAddColorSwatch('${c}')"
      style="background: ${c}; width: 24px; height: 24px; border: 2px solid ${isSelected ? '#fff' : 'transparent'}; outline: ${isSelected ? '2px solid #6b5c4a' : 'none'}; cursor: pointer;"
      class="rounded-sm"></button>`;
  }).join('');
}

function selectAddColorSwatch(color) {
  document.getElementById('book-color').value = color;
  renderAddColorSwatches();
}

// --- Ajouter un livre ---
async function addBook(button) {
  const btn = button || document.querySelector('[onclick="addBook(this)"]');
  const titleEl = document.getElementById("book-title");
  const authorEl = document.getElementById("book-author");
  const genresEl = document.getElementById("book-genres");
  const giftEl = document.getElementById("book-gift");
  const yearEl = document.getElementById("book-year");
  const title = titleEl.value.trim();
  const author = authorEl.value.trim();
  const genresInput = genresEl.value.trim();
  const is_gift = giftEl.checked;
  const year = !is_gift && yearEl.value ? parseInt(yearEl.value) : null;

  const pagesEl = document.getElementById("book-pages");
  const sizeEl = document.getElementById("book-size");
  const colorEl = document.getElementById("book-color");
  const extrasVisible = !document.getElementById("add-extras").classList.contains("hidden");
  const page_count = pagesEl.value ? parseInt(pagesEl.value) : null;
  const size = sizeEl.value ? parseInt(sizeEl.value) : null;
  const color = extrasVisible ? colorEl.value : null;

  titleEl.classList.remove("input-error");
  authorEl.classList.remove("input-error");
  genresEl.classList.remove("input-error");

  if (!title || !author || !genresInput) {
    if (!title) titleEl.classList.add("input-error");
    if (!author) authorEl.classList.add("input-error");
    if (!genresInput) genresEl.classList.add("input-error");

    setTimeout(() => {
      titleEl.classList.remove("input-error");
      authorEl.classList.remove("input-error");
      genresEl.classList.remove("input-error");
    }, 2000);
    return;
  }

  const genres = genresInput
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g)
    .slice(0, 3);

  const result = await api('books.php', 'POST', { title, author, genres, year, is_gift, page_count, size, color });

  if (result.error) {
    alert(result.error);
    return;
  }

  titleEl.value = "";
  authorEl.value = "";
  genresEl.value = "";
  giftEl.checked = false;
  yearEl.value = "";
  yearEl.disabled = false;
  pagesEl.value = "";
  sizeEl.selectedIndex = 0;
  colorEl.value = "#2c2c2c";
  document.getElementById("add-extras").classList.add("hidden");
  document.getElementById("add-extras-btn").textContent = "+ Voir plus";

  await loadBooks();
  displayBooks();

  const originalText = btn.innerHTML;
  btn.innerHTML = "✓ Ajouté";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-success");
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove("btn-success");
    btn.classList.add("btn-primary");
  }, 1500);
}

// --- Supprimer un livre ---
async function deleteBook(bookId, fromWishlist = false) {
  await api('books.php', 'DELETE', { id: bookId });
  await loadBooks();
  if (fromWishlist) {
    displayWishlist();
  } else {
    displayBooks();
  }
}

// --- Quiz de genre ---
let quizState = null;

function startGenreQuiz() {
  const allGenres = new Set();
  libraryBooks().forEach(b => b.genres.forEach(g => allGenres.add(g)));
  const genres = [...allGenres];

  if (genres.length < 2) {
    document.getElementById("quiz-container").innerHTML = `
      <div class="card card-border bg-base-100"><div class="card-body text-center">
        <p class="opacity-60">Il faut au moins 2 genres dans ta bibliothèque pour lancer le quiz.</p>
      </div></div>`;
    return;
  }

  // Shuffle genres and pick challengers from the pool
  const shuffled = [...genres].sort(() => Math.random() - 0.5);
  const champion = shuffled[0];
  const challengers = shuffled.slice(1);

  quizState = { champion, challengers, round: 0, totalRounds: 7 };
  showQuizRound();
}

function showQuizRound() {
  const container = document.getElementById("quiz-container");
  const { champion, challengers, round, totalRounds } = quizState;

  if (round >= totalRounds || challengers.length === 0) {
    showQuizResults();
    return;
  }

  // Pick a random challenger (different from champion)
  const idx = Math.floor(Math.random() * challengers.length);
  const challenger = challengers[idx];

  // Randomize display order so champion isn't always on top
  const swap = Math.random() > 0.5;
  const top = swap ? challenger : champion;
  const bottom = swap ? champion : challenger;

  quizState.currentDisplay = [top, bottom];
  quizState.challengerIdx = idx;

  const progress = (round / totalRounds) * 100;

  container.innerHTML = `
    <div class="card card-border bg-base-100">
      <div class="card-body">
        <div class="flex justify-between items-center mb-2">
          <h2 class="card-title text-lg">Quel genre te tente ?</h2>
          <span class="text-xs opacity-50">Question ${round + 1} / ${totalRounds}</span>
        </div>
        <progress class="progress progress-primary w-full mb-6" value="${progress}" max="100"></progress>

        <div class="flex flex-col gap-3">
          <button onclick="pickQuizGenre('${top.replace(/'/g, "\\'")}')" class="btn btn-outline btn-lg justify-start text-left h-auto py-4 normal-case">
            <span class="text-base">${top}</span>
          </button>
          <div class="text-center text-xs opacity-40 font-bold">OU</div>
          <button onclick="pickQuizGenre('${bottom.replace(/'/g, "\\'")}')" class="btn btn-outline btn-lg justify-start text-left h-auto py-4 normal-case">
            <span class="text-base">${bottom}</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function pickQuizGenre(chosen) {
  const { champion, challengers, challengerIdx } = quizState;

  // The winner becomes the new champion
  quizState.champion = chosen;

  // Remove the used challenger from the pool
  challengers.splice(challengerIdx, 1);

  quizState.round++;
  showQuizRound();
}

function showQuizResults() {
  const container = document.getElementById("quiz-container");
  const winnerGenre = quizState.champion;

  const matchingBooks = libraryBooks().filter(b => b.genres.includes(winnerGenre));

  let booksHtml = '';
  if (matchingBooks.length === 0) {
    booksHtml = `<p class="opacity-60 text-center py-4">Aucun livre trouvé pour ce genre.</p>`;
  } else {
    booksHtml = matchingBooks.map(book => `
      <div class="flex justify-between items-center p-3 bg-base-200 rounded-sm border border-base-300 ${book.is_read ? 'opacity-50' : ''}">
        <div class="flex-1">
          <div class="font-medium text-sm flex items-center gap-2">
            <span>${escapeHtml(book.title)}</span>
            ${book.is_read ? '<span class="text-xs text-success">Lu</span>' : ''}
          </div>
          <div class="text-xs opacity-60">${escapeHtml(book.author)}</div>
        </div>
        ${book.rating ? `<div class="text-xs opacity-60">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>` : ''}
      </div>
    `).join('');
  }

  container.innerHTML = `
    <div class="card card-border bg-base-100 mb-4">
      <div class="card-body text-center">
        <div class="text-3xl mb-2">🏆</div>
        <h2 class="card-title justify-center text-xl mb-1">${winnerGenre}</h2>
        <p class="text-sm opacity-60 mb-4">Le genre qui te tente le plus aujourd'hui !</p>
        <button onclick="startGenreQuiz()" class="btn btn-primary btn-sm">Recommencer le quiz</button>
      </div>
    </div>

    <div class="card card-border bg-base-100">
      <div class="card-body">
        <h3 class="font-medium text-sm opacity-60 mb-3">${matchingBooks.length} livre${matchingBooks.length > 1 ? 's' : ''} en ${winnerGenre}</h3>
        <div class="flex flex-col gap-2">
          ${booksHtml}
        </div>
      </div>
    </div>
  `;
}

// --- Challenge de lecture ---
async function createChallenge() {
  const input = document.getElementById("challenge-goal");
  const goal = parseInt(input.value);
  if (!goal || goal < 1) {
    input.classList.add("input-error");
    setTimeout(() => {
      input.classList.remove("input-error");
    }, 2000);
    return;
  }
  await api('challenge.php', 'POST', { goal });
  await loadChallengeData();
  displayChallenge();
}

async function deleteChallenge() {
  if (!confirm("Supprimer le challenge en cours ?")) return;
  await api('challenge.php', 'DELETE');
  challenge = null;
  displayChallenge();
}

async function addToChallenge(bookId) {
  if (!challenge) return;
  await api('challenge.php?action=add_book', 'POST', { book_id: bookId });
  await loadChallengeData();
  displayChallenge();
}

async function removeFromChallenge(bookId) {
  if (!challenge) return;
  await api('challenge.php?action=remove_book', 'POST', { book_id: bookId });
  await loadChallengeData();
  displayChallenge();
}

function displayChallenge() {
  const container = document.getElementById("challenge-content");

  if (!challenge) {
    container.innerHTML = `
      <div class="max-w-md mx-auto">
        <div class="card card-border bg-base-100">
          <div class="card-body text-center">
            <h2 class="card-title justify-center">Créer un challenge de lecture</h2>
            <p class="opacity-60">Combien de livres souhaitez-vous lire cette année ?</p>
            <div class="flex items-center justify-center gap-2 mt-4">
              <input type="number" id="challenge-goal" class="input w-24 text-center text-lg" min="1" placeholder="10" />
              <button onclick="createChallenge()" class="btn btn-primary">Créer mon challenge</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const challengeBooks = challenge.books || [];
  const readCount = challengeBooks.filter((b) => b.is_read).length;
  const unreadChallengeBooks = challengeBooks.filter((b) => !b.is_read);
  const pct =
    challenge.goal > 0
      ? Math.min(100, Math.round((readCount / challenge.goal) * 100))
      : 0;

  let bookListHtml = "";
  if (challengeBooks.length === 0) {
    bookListHtml = `
      <div class="text-center py-8 opacity-50">
        <div class="text-4xl mb-3">📖</div>
        <p class="text-sm">Aucun livre dans le challenge. Ajoutez des livres depuis votre bibliothèque !</p>
      </div>
    `;
  } else {
    bookListHtml = challengeBooks
      .map(
        (book) => `
        <div class="flex justify-between items-center p-3 bg-base-200 rounded-sm mb-2 border border-base-300 ${book.is_read ? "opacity-50" : ""}">
          <div class="flex-1">
            <div class="font-medium text-sm flex items-center gap-2">
              <span>${escapeHtml(book.title)}</span>
              ${!book.is_read && book.is_gift ? giftSvg("w-3.5 h-3.5 opacity-70") : ""}
              ${!book.is_read && book.year ? `<span class="text-xs opacity-70 font-normal">${book.year}</span>` : ""}
              ${book.is_read ? '<span class="text-xs font-normal text-success"> — Lu</span>' : ""}
            </div>
            <div class="text-xs opacity-60">${escapeHtml(book.author)}</div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="toggleReadAndRefreshChallenge(${book.id})" class="btn btn-xs ${book.is_read ? "btn-success" : "btn-outline"}" title="${book.is_read ? "Marquer non lu" : "Marquer lu"}">
              ${book.is_read ? "✓ Lu" : "Marquer lu"}
            </button>
            <button onclick="removeFromChallenge(${book.id})" class="btn btn-ghost btn-xs text-error" title="Retirer du challenge">
              ✕
            </button>
          </div>
        </div>
      `
      )
      .join("");
  }

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <div class="card card-border bg-base-100">
        <div class="card-body">
          <div class="flex justify-between items-center mb-4">
            <h2 class="card-title">Challenge ${challenge.year}</h2>
            <button onclick="deleteChallenge()" class="btn btn-outline btn-error btn-xs">Supprimer le challenge</button>
          </div>

          <div class="mb-6">
            <div class="flex justify-between text-sm mb-2">
              <span><strong class="text-lg">${readCount}</strong> / ${challenge.goal} livres lus</span>
              <span>${pct}%</span>
            </div>
            <progress class="progress progress-primary w-full" value="${pct}" max="100"></progress>
          </div>

          <div class="mb-4">
            <button onclick="openBookSelector()" class="btn btn-primary">
              Ajouter un livre au challenge
            </button>
          </div>

          ${bookListHtml}

          ${unreadChallengeBooks.length > 0 ? `
          <div class="divider"></div>
          <div class="text-center">
            <button onclick="spinRoulette()" class="btn btn-secondary">
              Tirer au sort ma prochaine lecture
            </button>
            <div id="roulette-result" class="mt-4 hidden">
              <div class="card card-border bg-base-200">
                <div class="card-body p-4 text-center">
                  <div class="text-xs uppercase tracking-wide text-secondary mb-2">Tu vas lire...</div>
                  <div id="roulette-book-title" class="font-medium text-lg"></div>
                  <div id="roulette-book-author" class="text-sm opacity-60"></div>
                </div>
              </div>
            </div>
          </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

function spinRoulette() {
  const unread = (challenge.books || []).filter((b) => !b.is_read);
  if (unread.length === 0) return;

  // Add jokers to the pool (1 joker per 3 real books, minimum 1)
  const jokerCount = Math.max(1, Math.floor(unread.length / 3));
  const pool = [
    ...unread.map(b => ({ type: 'book', title: b.title, author: b.author })),
    ...Array(jokerCount).fill({ type: 'joker', title: 'JOKER', author: 'Choisis librement dans ta bibliothèque !' })
  ];

  const resultDiv = document.getElementById("roulette-result");
  const titleDiv = document.getElementById("roulette-book-title");
  const authorDiv = document.getElementById("roulette-book-author");

  resultDiv.classList.add("hidden");

  let count = 0;
  const totalSpins = 15;
  const interval = setInterval(() => {
    const random = pool[Math.floor(Math.random() * pool.length)];
    titleDiv.textContent = random.title;
    authorDiv.textContent = random.author;
    resultDiv.classList.remove("hidden");

    if (random.type === 'joker') {
      titleDiv.innerHTML = `<span class="text-warning">🃏 JOKER</span>`;
    }

    count++;
    if (count >= totalSpins) {
      clearInterval(interval);
      if (random.type === 'joker') {
        titleDiv.innerHTML = `<span class="text-warning text-2xl">🃏 JOKER !</span>`;
        authorDiv.textContent = 'Tu peux choisir n\'importe quel livre de ta bibliothèque !';
      }
    }
  }, 100);
}

function launchConfetti(withGifts = false) {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;";
  document.body.appendChild(container);

  const confettiChars = ["●", "■", "▲", "★", "♦", "◆", "✦"];
  const colors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444"];
  const giftChars = ["🎁", "🎀", "🎊"];
  const count = withGifts ? 60 : 40;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    let char, size;

    if (withGifts) {
      char = giftChars[Math.floor(Math.random() * giftChars.length)];
      size = 18 + Math.random() * 14;
    } else {
      char = confettiChars[Math.floor(Math.random() * confettiChars.length)];
      size = 10 + Math.random() * 14;
    }

    el.textContent = char;
    el.style.cssText = `
      position:absolute;
      left:${Math.random() * 100}%;
      top:-20px;
      font-size:${size}px;
      color:${colors[Math.floor(Math.random() * colors.length)]};
      opacity:${0.7 + Math.random() * 0.3};
      animation:confetti-fall ${1.5 + Math.random() * 2}s ease-in forwards;
      animation-delay:${Math.random() * 0.5}s;
    `;
    container.appendChild(el);
  }

  setTimeout(() => container.remove(), 4000);
}

async function toggleReadAndRefreshChallenge(bookId) {
  const wasRead = (challenge.books || []).find((b) => b.id === bookId)?.is_read;
  await api('read.php', 'POST', { id: bookId });
  await Promise.all([loadBooks(), loadChallengeData()]);

  if (!wasRead) {
    const readCount = (challenge.books || []).filter((b) => b.is_read).length;
    const withGifts = readCount % 3 === 0;
    launchConfetti(withGifts);
  }

  displayChallenge();
}

// --- Sélecteur de livres pour le challenge ---
function openBookSelector() {
  const modal = document.getElementById("book-selector-modal");
  document.getElementById("book-selector-search").value = "";
  renderBookSelectorList("");
  modal.showModal();
}

function closeBookSelector() {
  document.getElementById("book-selector-modal").close();
}

function filterBookSelector() {
  const query = document
    .getElementById("book-selector-search")
    .value.trim()
    .toLowerCase();
  renderBookSelectorList(query);
}

function renderBookSelectorList(query) {
  const list = document.getElementById("book-selector-list");
  const challengeBookIds = challenge && challenge.books
    ? challenge.books.map((b) => b.id)
    : [];

  const available = libraryBooks().filter(
    (b) =>
      !b.is_read &&
      !challengeBookIds.includes(b.id) &&
      (b.title.toLowerCase().includes(query) ||
        b.author.toLowerCase().includes(query))
  );

  if (available.length === 0) {
    list.innerHTML =
      '<p class="text-center opacity-60 py-4">Aucun livre disponible</p>';
    return;
  }

  list.innerHTML = available
    .map(
      (book) => `
      <div class="flex justify-between items-center p-3 rounded-sm mb-1 cursor-pointer transition-all border border-base-300 hover:border-primary" onclick="addToChallenge(${book.id}); closeBookSelector();">
        <div>
          <div class="font-medium text-sm">${escapeHtml(book.title)}</div>
          <div class="text-xs opacity-60">${escapeHtml(book.author)}</div>
        </div>
        <span class="text-primary text-lg">+</span>
      </div>
    `
    )
    .join("");
}

// --- Toggle cadeau / année ---
function toggleGiftInput() {
  const giftEl = document.getElementById("book-gift");
  const yearEl = document.getElementById("book-year");
  if (giftEl.checked) {
    yearEl.value = "";
    yearEl.disabled = true;
  } else {
    yearEl.disabled = false;
  }
}

// --- Emprunts ---
let loans = [];

async function loadLoans() {
  loans = await api('loans.php');
}

function displayLoans() {
  const container = document.getElementById("loans-container");
  const select = document.getElementById("loan-book");

  // Populate book selector
  const lib = libraryBooks();
  select.innerHTML = '<option disabled selected>Choisir un livre...</option>';
  lib.sort((a, b) => a.title.localeCompare(b.title, 'fr')).forEach(b => {
    select.innerHTML += `<option value="${b.id}">${escapeHtml(b.title)} — ${escapeHtml(b.author)}</option>`;
  });

  // Set default date to today
  document.getElementById("loan-date").valueAsDate = new Date();

  const active = loans.filter(l => !l.returned_date);
  const returned = loans.filter(l => l.returned_date);

  let html = '';

  // Active loans
  html += `<h3 class="font-medium text-sm opacity-60 mb-3">${active.length} emprunt${active.length > 1 ? 's' : ''} en cours</h3>`;
  if (active.length === 0) {
    html += `<div class="text-center py-8 opacity-40 text-sm mb-6">Aucun livre emprunté en ce moment</div>`;
  } else {
    html += `<div class="flex flex-col gap-2 mb-6">`;
    active.forEach(loan => {
      const days = Math.floor((new Date() - new Date(loan.loan_date)) / (1000 * 60 * 60 * 24));
      html += `
        <div class="card card-border bg-base-100">
          <div class="card-body p-4 flex-row items-center justify-between gap-4">
            <div class="flex-1">
              <div class="font-medium text-sm">${escapeHtml(loan.title)}</div>
              <div class="text-xs opacity-60">${escapeHtml(loan.author)}</div>
              <div class="text-xs mt-1">
                <span class="badge badge-sm badge-outline">${loan.person}</span>
                <span class="opacity-40 ml-2">depuis le ${new Date(loan.loan_date).toLocaleDateString('fr-FR')} (${days}j)</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button onclick="returnLoan(${loan.id})" class="btn btn-sm btn-success btn-outline">Rendu</button>
              <button onclick="deleteLoan(${loan.id})" class="btn btn-sm btn-ghost btn-error">Supprimer</button>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  // Returned loans history
  if (returned.length > 0) {
    html += `<h3 class="font-medium text-sm opacity-60 mb-3">Historique (${returned.length})</h3>`;
    html += `<div class="flex flex-col gap-1">`;
    returned.forEach(loan => {
      html += `
        <div class="flex items-center justify-between p-3 bg-base-100 rounded-sm border border-base-300 opacity-50">
          <div class="flex-1">
            <span class="text-sm">${escapeHtml(loan.title)}</span>
            <span class="text-xs opacity-60 ml-2">— ${loan.person}</span>
          </div>
          <div class="text-xs opacity-40">
            ${new Date(loan.loan_date).toLocaleDateString('fr-FR')} → ${new Date(loan.returned_date).toLocaleDateString('fr-FR')}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

async function addLoan() {
  const bookId = parseInt(document.getElementById("loan-book").value);
  const person = document.getElementById("loan-person").value.trim();
  const loanDate = document.getElementById("loan-date").value;

  if (!bookId || !person) {
    if (!bookId) document.getElementById("loan-book").classList.add("select-error");
    if (!person) document.getElementById("loan-person").classList.add("input-error");
    setTimeout(() => {
      document.getElementById("loan-book").classList.remove("select-error");
      document.getElementById("loan-person").classList.remove("input-error");
    }, 2000);
    return;
  }

  await api('loans.php', 'POST', { book_id: bookId, person, loan_date: loanDate });
  await loadLoans();

  // Reset form
  document.getElementById("loan-book").selectedIndex = 0;
  document.getElementById("loan-person").value = "";

  displayLoans();
}

async function returnLoan(id) {
  await api('loans.php', 'POST', { action: 'return', id });
  await loadLoans();
  displayLoans();
}

async function deleteLoan(id) {
  await api('loans.php', 'DELETE', { id });
  await loadLoans();
  displayLoans();
}

// --- Exposer les fonctions au scope global (nécessaire pour onclick en mode module) ---
window.showPage = showPage;
window.addBook = addBook;
window.deleteBook = deleteBook;
window.toggleRead = toggleRead;
window.startGenreQuiz = startGenreQuiz;
window.pickQuizGenre = pickQuizGenre;
window.createChallenge = createChallenge;
window.deleteChallenge = deleteChallenge;
window.addToChallenge = addToChallenge;
window.removeFromChallenge = removeFromChallenge;
window.toggleReadAndRefreshChallenge = toggleReadAndRefreshChallenge;
window.spinRoulette = spinRoulette;
window.openBookSelector = openBookSelector;
window.closeBookSelector = closeBookSelector;
window.filterBookSelector = filterBookSelector;
window.toggleGiftInput = toggleGiftInput;
window.toggleAddExtras = toggleAddExtras;
window.selectAddColorSwatch = selectAddColorSwatch;
window.addWishlistBook = addWishlistBook;
window.markAsBought = markAsBought;
window.rateBook = rateBook;
window.displayWishlist = displayWishlist;
window.displayStats = displayStats;
window.displayShelf = displayShelf;
window.toggleEditMode = toggleEditMode;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveBookEdit = saveBookEdit;
window.setEditRating = setEditRating;
window.selectColorSwatch = selectColorSwatch;
window.applyBookFilter = applyBookFilter;
window.applyBookSort = applyBookSort;
window.clearBookFilter = clearBookFilter;
window.addLoan = addLoan;
window.returnLoan = returnLoan;
window.deleteLoan = deleteLoan;
window.displayCurrentlyReading = displayCurrentlyReading;
window.openReadingSelector = openReadingSelector;
window.closeReadingSelector = closeReadingSelector;
window.filterReadingSelector = filterReadingSelector;
window.startReading = startReading;
window.openProgressModal = openProgressModal;
window.closeProgressModal = closeProgressModal;
window.saveProgress = saveProgress;
window.setProgressMode = setProgressMode;
window.finishReading = finishReading;
window.dnfReading = dnfReading;

// --- Initialisation ---
document.addEventListener("DOMContentLoaded", async () => {
  importManagement = setupImportManagement({
    getBooks: () => books, reloadBooks: loadBooks, api, showPage,
    refreshLibrary: () => { displayBooks(); displayShelf(); displayWishlist(); },
  });
  await Promise.all([loadBooks(), loadChallengeData(), loadCurrentlyReading()]);
  displayCurrentlyReading();
  displayShelf();

  // Sync color picker → swatches
  document.getElementById('edit-book-color').addEventListener('input', (e) => {
    renderColorSwatches(e.target.value);
  });
  document.getElementById('book-color').addEventListener('input', (e) => {
    renderAddColorSwatches();
  });
});
