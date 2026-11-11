<?php
// Optional read-only network smoke check. No account, charges or database writes.
require __DIR__.'/../api/catalog-search.php';
$page = catalog_search_source(['source'=>'goodreads','isbn'=>'9782253907701']);
$book = $page['items'][0] ?? null;
if (!$book || $book['isbn'] !== '9782253907701' || $book['publisher'] !== 'Le Livre de Poche'
    || $book['languages'] !== ['fr'] || !$book['cover_url']) throw new Exception('Exact French pocket edition not found');
if (catalog_validate($book)['cover_url'] !== $book['cover_url']) throw new Exception('Cover cannot be saved');
$editions = catalog_search_source(['source'=>'goodreads','title'=>'Perspective(s)','goodreads_work'=>'151621149']);
if (!$editions['items'] || ($editions['next']['goodreads_work'] ?? '') !== '151621149') throw new Exception('Edition pagination missing');
$next = catalog_search_source($editions['next']);
$all = array_merge($editions['items'], $next['items']);
if (!array_filter($all,fn($item)=>$item['isbn'] === '9782253907701')) throw new Exception('Pocket edition missing from edition pages');
echo json_encode(['isbn'=>$book['isbn'],'publisher'=>$book['publisher'],'cover'=>$book['cover_url'],
    'edition_notices'=>count($all)],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL;
