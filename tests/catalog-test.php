<?php
require __DIR__ . '/../api/catalog-lib.php';
function check($condition, $message) { if (!$condition) throw new Exception($message); }
check(catalog_isbn('0-306-40615-2') === '9780306406157', 'ISBN conversion');
try { catalog_isbn('9780306406158'); throw new Exception('Invalid ISBN accepted'); } catch (InvalidArgumentException $e) {}
$candidate = catalog_normalize(['title' => 'Dune', 'authors' => [['name' => 'Frank Herbert']], 'number_of_pages' => 412, 'subjects' => [['name' => 'Science fiction']], 'publish_date' => '1965', 'identifiers' => ['isbn_13' => ['9780441172719']]], 'OL1M');
check($candidate['author'] === 'Frank Herbert', 'Authors');
check($candidate['published_date'] === '1965', 'Publication date');
$local = ['title' => 'Dune local', 'author' => 'Frank Herbert', 'genres' => '["SF"]', 'page_count' => 200, 'year' => 2024, 'rating' => 5];
$merged = catalog_merge($local, $candidate, ['title' => 'local', 'page_count' => 'api', 'rating' => 'api', 'year' => 'api']);
check($merged['title'] === 'Dune local' && $merged['page_count'] === 412, 'Field choices');
check(!array_key_exists('rating', $merged) && !array_key_exists('year', $merged), 'Personal fields protected');
$empty = $candidate; $empty['title'] = null;
check(catalog_merge($local, $empty, ['title' => 'api'])['title'] === 'Dune local', 'Missing API values preserve local data');
echo "PHP catalog tests passed\n";

// Execute real INSERT/UPDATE/rollback queries against an isolated SQLite fixture.
// Only MySQL's row-lock suffix is removed; production keeps its FOR UPDATE locks.
require __DIR__ . '/../api/catalog-storage.php';
class TestCatalogDatabase extends PDO {
    public function prepare(string $query, array $options = []): PDOStatement|false {
        return parent::prepare(str_replace(' FOR UPDATE', '', $query), $options);
    }
}
$db = new TestCatalogDatabase('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, author TEXT, genres TEXT, isbn TEXT UNIQUE, page_count INTEGER, publisher TEXT, published_date TEXT, cover_url TEXT, metadata_source TEXT, metadata_source_id TEXT, metadata_snapshot TEXT, metadata_linked_at TEXT, year INTEGER, rating INTEGER, is_read INTEGER, is_gift INTEGER, is_wishlist INTEGER, color TEXT, size INTEGER, UNIQUE(metadata_source, metadata_source_id))');
$db->exec('CREATE TABLE currently_reading (id INTEGER PRIMARY KEY, book_id INTEGER UNIQUE, current_page INTEGER, started_at TEXT)');
$db->exec('CREATE TABLE reading_log (id INTEGER PRIMARY KEY, book_id INTEGER, pages_read INTEGER, log_date TEXT)');
$db->exec("INSERT INTO books (title, author, genres, page_count, year, rating, is_read, is_gift, color, size) VALUES ('Dune local', 'Frank Herbert', '[\"SF\"]', 200, 2024, 5, 1, 1, '#ffaa00', 2)");
$before = $db->query('SELECT * FROM books WHERE id = 1')->fetch();
$payload = ['id' => 1, 'candidate' => $candidate, 'expected' => catalog_values($before), 'choices' => ['title' => 'local', 'page_count' => 'api', 'isbn' => 'api', 'genres' => 'local', 'rating' => 'api', 'year' => 'api']];
$result = catalog_import($db, $payload);
$after = $db->query('SELECT * FROM books WHERE id = 1')->fetch();
check($after['page_count'] === 412 && $after['title'] === 'Dune local', 'SQL field reconciliation');
foreach (['year', 'rating', 'is_read', 'is_gift', 'color', 'size'] as $key) check($before[$key] === $after[$key], 'Personal data protected: ' . $key);
check(json_decode($after['metadata_snapshot'], true)['title'] === 'Dune', 'Original API snapshot persisted');
check($after['metadata_source_id'] === 'OL1M' && $after['metadata_linked_at'], 'Provenance persisted');
try { catalog_import($db, $payload); throw new Exception('Stale comparison accepted'); } catch (CatalogImportException $e) { check($e->getCode() === 409, 'Stale response'); }
try { catalog_import($db, ['candidate' => $candidate]); throw new Exception('Duplicate accepted'); } catch (CatalogImportException $e) { check($e->getCode() === 409, 'Duplicate response'); }
check(!$db->inTransaction(), 'Failed imports roll back');
$new = $candidate; $new['source_id'] = 'OL2M'; $new['isbn'] = '9780306406157'; $new['cover_url'] = 'https://covers.openlibrary.org/b/id/123-M.jpg?default=false';
$result = catalog_import($db, ['candidate' => $new, 'values' => ['title' => 'Titre relu', 'genres' => ['Roman']]]);
$added = $db->query('SELECT * FROM books WHERE id = ' . (int) $result['id'])->fetch();
check($added['title'] === 'Titre relu' && json_decode($added['genres'], true) === ['Roman'], 'New book editable preview');
check(json_decode($added['metadata_snapshot'], true)['title'] === 'Dune', 'Edited preview keeps original API source');
check($added['cover_url'] === $new['cover_url'], 'Edition artwork persisted');
echo "PHP persistence tests passed\n";

$db->exec("INSERT INTO currently_reading VALUES (1, 2, 100, '2026-10-01')");
$db->exec("INSERT INTO reading_log VALUES (1, 2, 100, '2026-10-02')");
$activeCandidate = $new; $activeCandidate['page_count'] = 824;
$activeLocal = $db->query('SELECT * FROM books WHERE id = 2')->fetch();
$activePayload = ['id' => 2, 'candidate' => $activeCandidate, 'expected' => catalog_values($activeLocal), 'choices' => ['page_count' => 'api']];
catalog_import($db, $activePayload);
check((int) $db->query('SELECT current_page FROM currently_reading WHERE book_id = 2')->fetchColumn() === 200, 'Automatic percentage: 100/412 becomes 200/824');
check((int) $db->query('SELECT SUM(pages_read) FROM reading_log')->fetchColumn() === 100, 'Conversion creates no reading activity');
$activeLocal = $db->query('SELECT * FROM books WHERE id = 2')->fetch();
$activePayload['expected'] = catalog_values($activeLocal); $activePayload['candidate']['page_count'] = 150;
catalog_import($db, $activePayload);
check((int) $db->query('SELECT current_page FROM currently_reading WHERE book_id = 2')->fetchColumn() === 36, 'Smaller edition rescales automatically');
check((int) $db->query('SELECT SUM(pages_read) FROM reading_log')->fetchColumn() === 100, 'History remains unchanged after repeated conversion');
check(catalog_convert_progress(120, 300, 400) === 160, 'Preserve fraction');
check(catalog_convert_progress(110, 200, 400) === 220, 'Stale edition progress form converts to latest pagination');
check(catalog_convert_progress(120, null, 400) === 120, 'Unknown old total preserves page');
check(catalog_convert_progress(120, null, 80) === 80, 'Unknown total clamps to new edition');
check(catalog_convert_progress(500, 300, 400) === 400, 'Overflow clamps to complete edition');
// Legacy displayed position can differ from its cached current_page.
$db->exec("UPDATE books SET metadata_source = NULL, page_count = 150 WHERE id = 2");
$db->exec('UPDATE currently_reading SET current_page = 2 WHERE book_id = 2');
$activePayload['expected'] = catalog_values($db->query('SELECT * FROM books WHERE id = 2')->fetch());
$activePayload['candidate']['page_count'] = 300;
catalog_import($db, $activePayload);
check((int) $db->query('SELECT current_page FROM currently_reading WHERE book_id = 2')->fetchColumn() === 200, 'Legacy migration uses displayed 100/150, not cached page 2');
$readFlag = $db->query('SELECT is_read FROM books WHERE id = 2')->fetchColumn();
check(!$readFlag, 'Conversion never marks a book finished');
echo "PHP automatic reading reconciliation tests passed\n";
