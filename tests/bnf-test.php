<?php
require __DIR__ . '/../api/catalog-bnf.php';
function check_bnf($value, $label) { if (!$value) throw new Exception($label); }
$items = catalog_bnf_parse(file_get_contents(__DIR__ . '/fixtures/bnf-lux.xml'));
$book = $items[0];
check_bnf($book['title'] === 'Lux' && $book['author'] === 'Maxime Chattam', 'Title and author');
check_bnf($book['page_count'] === 665 && $book['published_date'] === '2025', 'Pages/date');
check_bnf($book['isbn'] === '9782266311281' && $book['publisher'] === 'Pocket', 'Exact edition');
check_bnf($book['source'] === 'bnf' && $book['source_id'] === 'cb485048536', 'Source');
check_bnf($book['genres'] === ['thriller'], 'Do not invent genres from publisher or collection');
check_bnf(catalog_validate($book)['source_url'] === 'https://catalogue.bnf.fr/ark:/12148/cb485048536', 'Persistable provenance');
$items = catalog_isbn_sources('9782266311281', fn()=>null, fn()=>[$book]);
check_bnf($items[0]['title'] === 'Lux', 'Fallback when primary has no result');
$items = catalog_isbn_sources('9782266311281', function(){throw new RuntimeException('Primary unavailable');}, fn()=>[$book]);
check_bnf(count($items) === 1, 'Fallback when primary fails');
check_bnf(catalog_isbn_sources('9782266311281', fn()=>null, fn()=>[]) === [], 'True empty result');
try { catalog_bnf_parse('<!DOCTYPE x [<!ENTITY x "unsafe">]><x/>'); throw new Exception('DTD accepted'); } catch(InvalidArgumentException $e) {}
try { catalog_isbn_sources('9782266311281', fn()=>null, function(){throw new RuntimeException('Unavailable');}); throw new Exception('Failure hidden as empty result'); } catch(RuntimeException $e) {}
echo "BnF and fallback tests passed\n";
$multiple = str_replace('<mxc:datafield tag="010">', '<mxc:datafield tag="010"><mxc:subfield code="a">9780306406157</mxc:subfield></mxc:datafield><mxc:datafield tag="010">', file_get_contents(__DIR__.'/fixtures/bnf-lux.xml'));
$matched = catalog_isbn_sources('9782266311281', fn()=>null, fn()=>catalog_bnf_parse($multiple));
check_bnf(($matched[0]['isbn'] ?? null) === '9782266311281', 'Match an exact second ISBN on the same BnF notice');
$primaryBook = ['source'=>'openlibrary','source_id'=>'OL61705777M','title'=>'Perspective(s)','isbn'=>'9782253907701','cover_url'=>null];
$bnfCover = $book; $bnfCover['isbn']='9782253907701'; $bnfCover['isbns']=['9782253907701'];
$enriched = catalog_isbn_sources('9782253907701',fn()=>$primaryBook,fn()=>[$bnfCover])[0];
check_bnf($enriched['source'] === 'openlibrary' && $enriched['title'] === 'Perspective(s)', 'Keep primary metadata');
check_bnf($enriched['cover_url'] === $bnfCover['cover_url'] && $enriched['cover_retrieved_at'] === $bnfCover['cover_retrieved_at'], 'Complete missing cover from exact-ISBN secondary record');
$wrongEdition=$bnfCover;$wrongEdition['isbn']='9782266311281';$wrongEdition['isbns']=['9782266311281'];
check_bnf(catalog_isbn_sources('9782253907701',fn()=>$primaryBook,fn()=>[$wrongEdition])[0]['cover_url'] === null, 'Never borrow another edition cover');
check_bnf(catalog_isbn_sources('9782253907701',fn()=>$primaryBook,function(){throw new RuntimeException('Secondary offline');})[0]['title'] === 'Perspective(s)', 'Secondary outage does not discard a primary match');
$existingCover = $primaryBook; $existingCover['cover_url']='https://covers.openlibrary.org/b/id/123-M.jpg?default=false';
check_bnf(catalog_isbn_sources('9782253907701',fn()=>$existingCover,function(){throw new Exception('Unnecessary secondary call');})[0]['cover_url']===$existingCover['cover_url'], 'Keep existing primary artwork without another request');
$persistable = $book; $persistable['source']='openlibrary'; $persistable['source_id']='OL61705777M';
check_bnf(catalog_validate($persistable)['cover_retrieved_at'] === $book['cover_retrieved_at'], 'Secondary artwork retains its retrieval date on an Open Library fiche');

check_bnf(catalog_isbn_sources('9782253907701',fn()=>$primaryBook,function(){throw new InvalidArgumentException('Malformed secondary XML');})[0]['title'] === 'Perspective(s)', 'Secondary parsing errors do not discard a primary match');
