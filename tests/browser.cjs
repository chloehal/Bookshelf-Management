// Run with PLAYWRIGHT_MODULE=/absolute/path/to/@playwright/test node tests/browser.cjs
const { chromium, expect } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const candidate = { source: 'openlibrary', source_id: 'OL123M', title: 'Dune API', author: 'Frank Herbert', genres: ['Science-fiction'], page_count: 412, isbn: '9780441172719', publisher: 'Ace', published_date: '1965', cover_url: 'https://covers.openlibrary.org/b/id/123-M.jpg?default=false' };
const base = [{ id: 7, title: 'Dune local', author: 'Frank Herbert', genres: ['SF'], page_count: 200, is_read: true, rating: 5, year: 2024, is_gift: false, is_wishlist: false, isbn: null, publisher: null, published_date: null }];
(async () => {
 const browser = await chromium.launch({ headless: true });
 for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  let books = structuredClone(base), saves = [], failSearch = false, failSave = false;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://covers.openlibrary.org/**', route => width === 390 ? route.fulfill({status:404, body:''}) : route.fulfill({contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#d7ad6c"/><text x="20" y="90" font-size="28">DUNE</text></svg>'}));
  await page.route('**/api/**', async route => {
   const url = new URL(route.request().url());
   let data;
   if (url.pathname.endsWith('/books.php')) {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      books.push({id:9, ...payload, is_read:false, is_wishlist:false});
      data = {success:true,id:9};
    } else data = books;
   }
   else if (url.pathname.endsWith('/catalog.php')) {
    if (failSearch) return route.fulfill({status:502, json:{error:'API indisponible'}});
    data = url.searchParams.has('title') ? {items:[{...candidate, source:undefined, work_id:'OL42W'}]} : url.searchParams.has('work') ? {items:[{...candidate, source:undefined, publisher:'Autre édition'}],next_offset:null} : {items:[candidate]};
   } else if (url.pathname.endsWith('/book-import.php')) {
    if (failSave) return route.fulfill({status:500, json:{error:'Enregistrement impossible'}});
    const payload = route.request().postDataJSON(); saves.push(payload);
    if (payload.id) {
      const book = books.find(b => b.id === payload.id);
      for (const [key, choice] of Object.entries(payload.choices)) if(choice === 'api') book[key] = payload.candidate[key];
      book.metadata_source = 'openlibrary'; book.metadata_source_id = candidate.source_id;
    } else books.push({id:8,...payload.values,metadata_source:'openlibrary',metadata_source_id:candidate.source_id});
    data = {success:true,id:payload.id || 8};
   } else if (url.pathname.endsWith('/challenge.php')) data = null;
   else data = [];
   return route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:5176');
  await page.getByRole('tab', {name:'Import Management',exact:true}).click();
  await expect(page.locator('#import-books')).toContainText('Dune local');
  await page.getByRole('button',{name:'Rechercher une correspondance'}).click();
  await page.locator('#import-title-form button').click();
  await page.getByRole('button',{name:'Voir les autres éditions'}).click();
  await expect(page.locator('#import-results')).toContainText('Autre édition');
  await page.getByRole('button',{name:'Comparer cette édition'}).click();
  await expect(page.locator('#reconciliation-page')).toHaveClass(/active/);
  await expect(page.locator('#reconciliation-fields')).toContainText('Dune API');
  await expect(page.locator('input[name="reconcile-title"][value="local"]')).toBeChecked();
  await page.locator('input[name="reconcile-page_count"][value="api"]').check();
  failSave = true;
  await page.locator('#reconciliation-save').click();
  await expect(page.locator('#reconciliation-status')).toContainText('Enregistrement impossible');
  await expect(page.locator('#reconciliation-save')).toBeEnabled();
  failSave = false;
  await page.locator('#reconciliation-save').click();
  await expect(page.locator('#import-feedback')).toContainText('Livre enregistré');
  if(saves.length !== 1 || saves[0].choices.title !== 'local' || saves[0].choices.page_count !== 'api') throw Error('Incorrect reconciliation payload');
  if(books[0].rating !== 5 || books[0].year !== 2024 || books[0].title !== 'Dune local') throw Error('Personal/local data overwritten');
  await page.locator('#import-filter').selectOption('linked');
  await expect(page.locator('#import-books')).toContainText('Liée à Open Library');
  await page.getByRole('button',{name:'Comparer à nouveau'}).click();
  await expect(page.locator('#reconciliation-page')).toHaveClass(/active/);
  await page.locator('#reconciliation-cancel').click();
  await page.getByRole('tab',{name:'Tous mes livres',exact:true}).click();
  await page.locator('#new-isbn').fill('9780441172718');
  await page.locator('#isbn-search-form button').click();
  await expect(page.locator('#isbn-status')).toContainText('valide');
  await page.locator('#new-isbn').fill('9780441172719');
  failSearch = true;
  await page.locator('#isbn-search-form button').click();
  await expect(page.locator('#isbn-status')).toContainText('API indisponible');
  failSearch = false;
  await page.locator('#isbn-search-form button').click();
  await page.getByRole('button',{name:'Vérifier avant ajout'}).click();
  await expect(page.locator('#reconciliation-status')).toContainText('existe déjà');
  await expect(page.locator('#reconciliation-save')).toBeDisabled();
  await page.locator('#reconciliation-cancel').click();
  // A fresh library can add a book and stores the original source snapshot separately.
  books = [];
  await page.reload();
  await page.getByRole('tab',{name:'Tous mes livres',exact:true}).click();
  await page.locator('#new-isbn').fill('9780441172719');
  await page.locator('#isbn-search-form button').click();
  await page.getByRole('button',{name:'Vérifier avant ajout'}).click();
  if (width === 390) await expect(page.locator('#reconciliation-fields .book-cover img')).toBeHidden();
  else {
    await expect(page.locator('#reconciliation-fields .book-cover img')).toBeVisible();
    await expect(page.locator('#reconciliation-fields .book-cover img')).toHaveCSS('object-fit', 'contain');
    await expect.poll(() => page.locator('#reconciliation-fields .book-cover img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.locator('#reconciliation-fields .book-cover-fallback')).toContainText('Dune API');
  await page.locator('#new-api-genres').fill('SF, Aventure');
  await page.locator('#reconciliation-save').click();
  await expect(page.locator('#import-feedback')).toContainText('Livre enregistré');
  if (saves.length !== 2 || saves[1].values.genres.join(',') !== 'SF,Aventure' || saves[1].candidate.genres[0] !== 'Science-fiction') throw Error('Incorrect new-book payload');
  await page.getByRole('tab',{name:'Tous mes livres',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ajouter un livre manuellement'})).toBeVisible();
  await page.locator('#book-title').fill('Livre manuel');
  await page.locator('#book-author').fill('Mon auteur');
  await page.locator('#book-genres').fill('Roman');
  await page.locator('#list-page').getByRole('button',{name:'Ajouter à la bibliothèque',exact:true}).click();
  await expect(page.locator('#books-container')).toContainText('Livre manuel');
  await page.getByRole('tab',{name:'Import Management',exact:true}).click();
  if (errors.length) throw Error(errors.join('\n'));
  await page.locator('#import-filter').selectOption('linked');
  await page.getByRole('button',{name:'Comparer à nouveau'}).click();
  await expect(page.locator('#reconciliation-fields')).toBeVisible();
  await page.screenshot({animations:'disabled',path:`/tmp/bookshelf-reconciliation-${width}.png`,fullPage:true});
  await page.close();
  console.log(`Browser journeys passed at ${width}px`);
 }
 await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
