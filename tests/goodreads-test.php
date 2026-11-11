<?php
require __DIR__.'/../api/catalog-search.php';
function gr_check($ok, $message) { if (!$ok) throw new Exception($message); }
gr_check(function_exists('catalog_goodreads_book_parse'), 'Goodreads parser is available');
$html = file_get_contents(__DIR__.'/fixtures/goodreads-book.html');
$book = catalog_goodreads_book_parse($html, '134115463');
gr_check($book['isbn'] === '9782246829355' && $book['author'] === 'Laurent Binet' && $book['page_count'] === 304, 'Read the requested edition, not another book in the embedded state');
gr_check($book['languages'] === ['fr'] && $book['goodreads_work'] === '151621149', 'Retain edition language and work for expansion');
gr_check(catalog_validate($book)['cover_url'] === $book['cover_url'], 'Goodreads cover and source can be saved by comparison');
gr_check(catalog_cover_url('https://m.media-amazon.com.evil.test/images/S/compressed.photo.goodreads.com/books/1/2.jpg') === null, 'Reject lookalike image hosts');
gr_check(catalog_cover_url('https://m.media-amazon.com/arbitrary.jpg') === null, 'Only permit Goodreads image paths');
try { catalog_goodreads_book_parse($html,'220174931'); throw new Exception('Wrong edition accepted'); } catch(RuntimeException $e) {}
try { catalog_goodreads_book_parse('<html>Access denied</html>','134115463'); throw new Exception('Blocked page treated as no result'); } catch(RuntimeException $e) {}
$page = catalog_goodreads_editions_parse(file_get_contents(__DIR__.'/fixtures/goodreads-editions.html'), '151621149', 0);
gr_check(count($page['items']) === 2 && $page['next_offset'] === 1, 'Parse edition notices and independent next-page cursor');
gr_check($page['items'][1]['isbn'] === '9782253907701' && $page['items'][1]['languages'] === ['fr'], 'Find the French pocket ISBN among editions');
$calls = [];
$fetch = function($path) use (&$calls,$html) {
    $calls[] = $path;
    if (str_starts_with($path,'/book/auto_complete?')) return json_encode([['bookId'=>134115463,'workId'=>151621149,'title'=>'Perspective(s)','author'=>['name'=>'Laurent Binet'],'imageUrl'=>null]]);
    return $html;
};
$result = catalog_goodreads_search(['isbn'=>'9782253907701'], 0, $fetch);
gr_check($result['items'] === [], 'Never report a different ISBN as an exact match');
$result = catalog_goodreads_search(['isbn'=>'9782246829355'], 0, $fetch);
gr_check(count($result['items']) === 1 && $result['items'][0]['source'] === 'goodreads', 'ISBN search returns a verified full record');
$secondEdition = str_replace(['134115463','9782246829355','2246829356'],['220174931','9782253907701','2253907707'],$html);
$result = catalog_goodreads_search(['isbn'=>'9782253907701'], 0, function($path) use ($html,$secondEdition) {
    if (str_starts_with($path,'/book/auto_complete?')) return json_encode([['bookId'=>134115463],['bookId'=>220174931]]);
    return str_ends_with($path,'220174931') ? $secondEdition : $html;
});
gr_check(($result['items'][0]['isbn'] ?? null) === '9782253907701', 'Check the next autocomplete candidate when the first is another edition');
$result = catalog_goodreads_search(['title'=>'Perspective(s)','author'=>'Laurent Binet'], 0, $fetch);
gr_check($result['items'][0]['lookup_source'] === 'goodreads' && $result['items'][0]['goodreads_work'] === '151621149', 'Title search returns selectable edition summaries');
try { catalog_goodreads_fetch('/search?q=foo'); throw new Exception('Disallowed endpoint accepted'); } catch(InvalidArgumentException $e) {}
$result = catalog_search_source(['source'=>'goodreads','title'=>'Perspective'], ['goodreads'=>fn()=>['items'=>[$book],'next_offset'=>null]]);
gr_check($result['source'] === 'goodreads' && count($result['items']) === 1, 'Goodreads participates in source search');
gr_check(catalog_goodreads_redirect('https://www.goodreads.com/work/editions/151621149-perspective-s?page=1&per_page=20', '/work/editions/151621149?per_page=20&page=1') === 'https://www.goodreads.com/work/editions/151621149-perspective-s?page=1&per_page=20', 'Accept the canonical redirect for the same work and pagination');
foreach (['https://evil.test/work/editions/151621149-x?page=1&per_page=20','https://www.goodreads.com/work/editions/999-x?page=1&per_page=20','https://www.goodreads.com/search?q=foo'] as $redirect) {
    try { catalog_goodreads_redirect($redirect,'/work/editions/151621149?per_page=20&page=1'); throw new Exception('Unsafe redirect accepted'); } catch(RuntimeException $e) {}
}
echo "Goodreads tests passed\n";
