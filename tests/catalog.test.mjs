import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIsbn, comparisonRows, reconciliationPayload } from '../catalog.mjs';

test('ISBN-10/13: separators, checksum and conversion for duplicate detection', () => {
  assert.equal(normalizeIsbn('978-0-306-40615-7'), '9780306406157');
  assert.equal(normalizeIsbn('0-306-40615-2'), '9780306406157');
  assert.equal(normalizeIsbn('0-8044-2957-X'), '9780804429573');
  for (const value of ['9780306406158', '123', 'hello', '1234567890128']) assert.throws(() => normalizeIsbn(value));
});
test('reconciliation preserves local choices and never sends personal fields', () => {
  const local = { id: 7, title: 'Mon titre', author: 'Auteur', genres: ['SF'], page_count: 200, year: 2024, rating: 5, is_read: true };
  const candidate = { source: 'openlibrary', source_id: 'OL1M', title: 'Titre API', author: 'Auteur', genres: [], page_count: 320, rating: 1, year: 1999 };
  const rows = comparisonRows(local, candidate);
  assert.equal(rows.find(r => r.key === 'title').different, true);
  assert.equal(rows.find(r => r.key === 'author').different, false);
  assert.equal(rows.find(r => r.key === 'genres').available, false);
  const payload = reconciliationPayload(local, candidate, { title: 'local', page_count: 'api' });
  assert.equal(payload.choices.title, 'local');
  assert.equal(payload.choices.page_count, 'api');
  assert.equal(payload.choices.genres, 'local');
  assert.equal('rating' in payload.expected, false);
  assert.equal('year' in payload.expected, false);
});

test('cover presentation keeps the edition artwork and provides a safe readable fallback', async () => {
  const { coverHtml, safeCoverUrl } = await import('../book-cover.mjs');
  assert.equal(safeCoverUrl('javascript:alert(1)'), null);
  assert.equal(safeCoverUrl('https://example.com/cover.jpg'), null);
  assert.match(coverHtml({title:'<Dune>',author:'Frank Herbert',cover_url:'https://covers.openlibrary.org/b/id/123-M.jpg'}), /object|book-cover/);
  assert.match(coverHtml({title:'<Dune>',author:'Frank Herbert'}), /&lt;Dune&gt;/);
  assert.doesNotMatch(coverHtml({title:'<Dune>',author:'Frank Herbert'}), /<img/);
});

test('automatic reading conversion preserves fraction or page when old total is unknown', async () => {
  const { convertProgress } = await import('../catalog.mjs');
  assert.equal(convertProgress(120, 300, 400), 160);
  assert.equal(convertProgress(120, null, 400), 120);
  assert.equal(convertProgress(120, null, 80), 80);
  assert.equal(convertProgress(500, 300, 400), 400);
});
