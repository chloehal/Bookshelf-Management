<?php
// Read-only metadata smoke check; no database access.
require __DIR__ . '/../api/catalog-sudoc.php';
$items = catalog_search_isbn('9791041426027');
$book = $items[0] ?? null;
if (!$book || $book['source'] !== 'sudoc' || $book['source_id'] !== '292390726' || $book['isbn'] !== '9791041426027' || $book['page_count'] !== 177) throw new Exception('Sudoc ISBN lookup failed');
$validated = catalog_validate($book);
echo json_encode($validated, JSON_UNESCAPED_UNICODE), PHP_EOL;
