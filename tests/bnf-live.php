<?php
// Read-only smoke test for the exact ISBN reported as missing from Open Library.
require __DIR__ . '/../api/catalog-bnf.php';
$items = catalog_isbn_sources('9782266311281');
if (count($items) !== 1 || $items[0]['source'] !== 'bnf' || $items[0]['title'] !== 'Lux' || $items[0]['isbn'] !== '9782266311281') throw new Exception('ISBN fallback regression');
$book = $items[0];
$again = catalog_bnf_search('bib.ark all "ark:/12148/' . $book['source_id'] . '"');
if (($again[0]['isbn'] ?? null) !== $book['isbn']) throw new Exception('Linked BnF lookup regression');
echo json_encode(['source'=>$book['source'],'title'=>$book['title'],'author'=>$book['author'],'publisher'=>$book['publisher'],'pages'=>$book['page_count'],'date'=>$book['published_date'],'cover'=>!empty($book['cover_url'])], JSON_UNESCAPED_UNICODE), PHP_EOL;
