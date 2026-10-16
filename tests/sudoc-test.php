<?php
require __DIR__ . '/../api/catalog-sudoc.php';
function check_sudoc($ok, $label) { if (!$ok) throw new Exception($label); }
$xml = file_get_contents(__DIR__ . '/fixtures/sudoc-daraya.xml');
$book = catalog_sudoc_parse($xml);
check_sudoc($book['source_id'] === '292390726' && $book['source'] === 'sudoc', 'Sudoc provenance');
check_sudoc($book['isbn'] === '9791041426027' && $book['page_count'] === 177, 'Exact edition and printed pagination');
check_sudoc($book['author'] === 'Delphine Minoui' && $book['published_date'] === '2025', 'Author and date');
check_sudoc(catalog_validate($book)['source_url'] === 'https://www.sudoc.fr/292390726', 'Importable candidate');
$requests = [];
$fetch = function($path) use (&$requests, $xml) {
    $requests[] = $path;
    return str_contains($path, 'isbn2ppn') ? '<sudoc><query><result><ppn>292390726</ppn></result></query></sudoc>' : $xml;
};
check_sudoc(count(catalog_sudoc_search('9791041426027', $fetch)) === 1, 'ISBN lookup');
check_sudoc(catalog_sudoc_search('9782707358158', $fetch) === [], 'Reject mismatched edition even when lookup points to it');
check_sudoc(catalog_sudoc_search('9791041426027', fn()=>null) === [], '404 is a catalogue miss');
try { catalog_sudoc_parse('<!DOCTYPE r><record/>'); throw new Exception('DTD accepted'); } catch (InvalidArgumentException $e) {}
try { catalog_sudoc_parse('<html/>'); throw new Exception('Invalid document accepted'); } catch (RuntimeException $e) {}
$found = catalog_search_isbn('9791041426027', fn()=>[], fn()=>[$book]);
check_sudoc($found[0]['source'] === 'sudoc', 'Third catalogue fallback');
check_sudoc(catalog_search_isbn('9791041426027', function(){throw new RuntimeException('BnF down');}, fn()=>[$book])[0]['source'] === 'sudoc', 'Fallback despite earlier provider outage');
try { catalog_search_isbn('9791041426027', function(){throw new RuntimeException('BnF down');}, fn()=>[]); throw new Exception('Outage hidden as no results'); } catch(RuntimeException $e) {}
check_sudoc(catalog_search_isbn('9791041426027', fn()=>[$book], function(){throw new Exception('Unneeded request');})[0] === $book, 'Keep earlier successful catalogue');
$openLibraryOutage = fn()=>catalog_isbn_sources('9791041426027', function(){throw new RuntimeException('Open Library down');}, fn()=>[]);
try { catalog_search_isbn('9791041426027', $openLibraryOutage, fn()=>[]); throw new Exception('Open Library outage hidden after two empty catalogues'); } catch(RuntimeException $e) {}
check_sudoc(catalog_search_isbn('9791041426027', $openLibraryOutage, fn()=>[$book])[0]['source'] === 'sudoc', 'Sudoc can recover an Open Library outage');
echo "Sudoc tests passed\n";
