<?php
require __DIR__.'/../api/catalog-search.php';
function search_check($ok, $label) { if (!$ok) throw new Exception($label); }
$calls = [];
$providers = [];
foreach (['openlibrary','bnf','sudoc'] as $source) {
    $providers[$source] = function($q, $offset) use ($source, &$calls) {
        $calls[] = [$source, $q, $offset];
        return ['items'=>[['title'=>'Titre '.$source]], 'next_offset'=>$offset === 0 ? 20 : null];
    };
    $page = catalog_search_source(['source'=>$source,'title'=>'Daraya','author'=>'Minoui'], $providers);
    search_check($page['items'][0]['title'] === 'Titre '.$source && $page['next']['offset'] === 20, 'Each initial source returns its own results and cursor');
    search_check($page['next']['source'] === $source, 'Cursor retains source');
}
search_check(count($calls) === 3, 'All three catalogues are directly searchable');
$page = catalog_search_source(['source'=>'bnf','isbn'=>'0-306-40615-2'], ['bnf'=>function($q,$o) {
    search_check($q['isbn'] === '9780306406157', 'Normalise ISBN before provider call');
    return ['items'=>[], 'next_offset'=>null];
}]);
search_check($page['next'] === null, 'Empty ISBN has no fake pagination');
foreach ([['source'=>'evil','title'=>'Lux'],['source'=>'bnf','title'=>'x'],['source'=>'bnf','title'=>'Lux','offset'=>'oops']] as $input) {
    try { catalog_search_source($input, $providers); throw new Exception('Bad input accepted'); } catch(InvalidArgumentException $e) {}
}
$ol = catalog_search_openlibrary(['title'=>'Dune','author'=>'Herbert'], 20, function($path) {
    parse_str(parse_url($path, PHP_URL_QUERY), $p);
    search_check($p['lang'] === 'fr' && $p['offset'] === '20', 'French preference and work pagination reach Open Library');
    return ['numFound'=>41,'docs'=>[['key'=>'/works/OL42W','title'=>'Dune','author_name'=>['Frank Herbert'],'editions'=>['docs'=>[['key'=>'/books/OL123M','title'=>'Dune','language'=>['fre'],'isbn'=>['9780306406157'],'physical_format'=>'Poche','publisher'=>['Pocket']]]]]]];
});
search_check($ol['items'][0]['languages'] === ['fr'] && $ol['items'][0]['format'] === 'Poche' && $ol['next_offset'] === 40, 'Edition-level language and format, not work-level language');
$bnfXml = file_get_contents(__DIR__.'/fixtures/bnf-lux.xml');
$bnfXml = str_replace('<mxc:datafield tag="200">', '<mxc:datafield tag="101"><mxc:subfield code="a">fre</mxc:subfield><mxc:subfield code="c">eng</mxc:subfield></mxc:datafield><mxc:datafield tag="200">', $bnfXml);
$bnf = catalog_bnf_parse($bnfXml)[0];
search_check($bnf['languages'] === ['fr'] && $bnf['collection'] === 'Pocket', 'Read MARC 101a, not original-language 101c');
$sudoc = catalog_sudoc_parse(file_get_contents(__DIR__.'/fixtures/sudoc-daraya.xml'));
search_check($sudoc['languages'] === ['fr'] && $sudoc['format'] === 'broché', 'Sudoc edition metadata');
$full = catalog_lookup('ISBN:9780306406157', function($path) {
    if (str_starts_with($path, '/api/books?')) return ['ISBN:9780306406157'=>['url'=>'https://openlibrary.org/books/OL123M','identifiers'=>['isbn_13'=>['9780441172719','9780306406157']]]];
    return ['languages'=>[['key'=>'/languages/fre']], 'physical_format'=>'Paperback'];
});
search_check($full['isbn'] === '9780306406157' && $full['languages'] === ['fr'], 'Keep exact requested ISBN and hydrate edition language');
echo "Direct catalogue search tests passed\n";
