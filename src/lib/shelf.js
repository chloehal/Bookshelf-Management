import { coverColor } from "./library.js";
function seededRandom(seed) {
  let x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// 3 fixed heights: 1=petit (160px), 2=moyen (180px), 3=grand (200px)
const SIZE_HEIGHTS = { 1: 160, 2: 180, 3: 200 };

export function getBookDisplayProps(book) {
  const s1 = seededRandom(book.id);
  const s2 = seededRandom(book.id + 1000);

  const pageCount = book.page_count || Math.floor(100 + s1 * 600);
  const size = book.size || [1, 2, 3][Math.floor(s2 * 3)];
  const color = coverColor(book);

  // Width: 18px (80 pages) to 55px (800+ pages)
  const width = Math.max(18, Math.min(55, 18 + ((pageCount - 80) / 720) * 37));

  // Height: strictly one of 3 fixed values
  const height = SIZE_HEIGHTS[size] || 170;

  return { pageCount, size, color, width, height };
}

function buildReadPiles(readBooks, maxPileHeight) {
  // Group read books by exact height (3 fixed sizes: 160, 180, 200)
  const heightGroups = Object.create(null);
  readBooks.forEach((b) => {
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

    books.forEach((item) => {
      // Each book adds its width (thickness) to the pile height
      if (
        currentPileThickness + item.props.width > maxPileHeight &&
        currentPile.length > 0
      ) {
        piles.push({ type: "pile", books: currentPile, bookHeight });
        currentPile = [];
        currentPileThickness = 0;
      }
      currentPile.push(item);
      currentPileThickness += item.props.width;
    });

    if (currentPile.length > 0) {
      piles.push({ type: "pile", books: currentPile, bookHeight });
    }
  });

  return piles;
}

export function getShelfItems(lib) {
  const readBooks = lib.filter((b) => b.is_read);
  const unreadBooks = lib.filter((b) => !b.is_read);

  // Find max standing book height (for pile height limit)
  let maxHeight = 0;
  lib.forEach((b) => {
    const h = getBookDisplayProps(b).height;
    if (h > maxHeight) maxHeight = h;
  });

  // Build unread items grouped by genre (with label on first book of each group)
  const genreGroups = Object.create(null);
  unreadBooks.forEach((b) => {
    const firstGenre = (b.genres && b.genres[0]) || "Sans genre";
    if (!genreGroups[firstGenre]) genreGroups[firstGenre] = [];
    genreGroups[firstGenre].push(b);
  });

  // Alternate big/small genre groups so labels don't overlap
  const genresBySize = Object.keys(genreGroups).sort(
    (a, b) => genreGroups[b].length - genreGroups[a].length,
  );
  const ordered = [];
  let left = 0,
    right = genresBySize.length - 1;
  while (left <= right) {
    if (left === right) {
      ordered.push(genresBySize[left]);
      break;
    }
    ordered.push(genresBySize[left++]);
    ordered.push(genresBySize[right--]);
  }

  // Build genre groups as blocks (each block = array of book items)
  const genreBlocks = ordered.map((genre) => {
    return genreGroups[genre].map((b, i) => ({
      type: "book",
      book: b,
      genreLabel: i === 0 ? genre : null,
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
      pilesPerSlot[i].forEach((p) => allItems.push(p));
    }
    if (i < genreBlocks.length) {
      genreBlocks[i].forEach((item) => allItems.push(item));
    }
  }

  return {
    items: allItems,
    totalBooks: lib.length,
    readCount: readBooks.length,
  };
}

export function layoutShelves(items, width) {
  const rows = [];
  let row = [],
    used = 0;
  for (const item of items) {
    const slotWidth =
      item.type === "pile"
        ? item.bookHeight
        : getBookDisplayProps(item.book).width;
    if (row.length && used + slotWidth + 4 > width) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(item);
    used += slotWidth + 4;
  }
  if (row.length) rows.push(row);
  return rows;
}
