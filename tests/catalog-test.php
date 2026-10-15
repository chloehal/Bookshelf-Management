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
