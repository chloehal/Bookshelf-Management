<?php
// Read-only smoke check: catalogue metadata only, no database access.
require __DIR__.'/../api/catalog-editions.php';
$result = catalog_editions(['title'=>'Les passeurs de livres de Daraya', 'author'=>'Delphine Minoui']);
$sources = [];
foreach ($result['items'] as $book) $sources[$book['source'] ?? $book['lookup_source']] = true;
if (empty($sources['bnf']) || empty($sources['sudoc'])) throw new Exception('Expected BnF and Sudoc editions');
echo json_encode(['count'=>count($result['items']), 'sources'=>array_keys($sources), 'warnings'=>$result['warnings'], 'next'=>$result['next']], JSON_UNESCAPED_UNICODE), PHP_EOL;
