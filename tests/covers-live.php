<?php
// Metadata-only, read-only smoke check; no image download and no database writes.
require __DIR__ . '/../api/catalog-bnf.php';
$book = catalog_isbn_sources('9782253907701')[0] ?? null;
if (!$book || $book['source'] !== 'openlibrary' || $book['title'] !== 'Perspective(s)' || !str_starts_with($book['cover_url'] ?? '', 'https://openapi.bnf.fr/') || empty($book['cover_retrieved_at'])) throw new Exception('Cross-catalogue cover enrichment failed');
$validated = catalog_validate($book);
if (empty($validated['cover_retrieved_at'])) throw new Exception('Lost cover attribution');
echo json_encode(['isbn'=>$book['isbn'],'title'=>$book['title'],'metadata_source'=>$book['source'],'cover_source'=>'bnf','attribution_date'=>$book['cover_retrieved_at']], JSON_UNESCAPED_UNICODE), PHP_EOL;
