<?php
require_once __DIR__.'/catalog-editions.php';

// One source per request: the browser can render fast catalogues while another is offline.
function catalog_search_source($input, $providers = null) {
    $source = $input['source'] ?? '';
    if (!is_string($source) || !isset(EDITION_SOURCES[$source])) throw new InvalidArgumentException('Catalogue invalide');
    $offset = filter_var($input['offset'] ?? 0, FILTER_VALIDATE_INT);
    if ($offset === false || $offset < 0 || $offset > 1000000) throw new InvalidArgumentException('Pagination invalide');
    $isbn = !empty($input['isbn']) ? catalog_isbn($input['isbn']) : null;
    $title = catalog_text($input['title'] ?? null);
    $author = catalog_text($input['author'] ?? null) ?? '';
    if (!$isbn && (!$title || mb_strlen(catalog_cql_text($title)) < 2)) throw new InvalidArgumentException('Saisis au moins deux caractères de titre');
    $query = $isbn ? ['isbn'=>$isbn] : ['title'=>$title,'author'=>$author];
    $providers ??= [
        'openlibrary'=>function($q,$o) {
            if (!empty($q['isbn'])) {
                $book = catalog_lookup('ISBN:'.$q['isbn']);
                return ['items'=>$book ? [$book] : [],'next_offset'=>null];
            }
            return catalog_search_openlibrary($q,$o);
        },
        'bnf'=>function($q,$o) {
            if (!empty($q['isbn'])) return ['items'=>catalog_bnf_isbn_matches(catalog_bnf_search('bib.isbn all "'.$q['isbn'].'"'),$q['isbn']),'next_offset'=>null];
            return catalog_editions_xml('bnf',$q,$o);
        },
        'sudoc'=>function($q,$o) {
            if (!empty($q['isbn'])) return ['items'=>catalog_sudoc_search($q['isbn']),'next_offset'=>null];
            return catalog_editions_xml('sudoc',$q,$o);
        },
    ];
    $page = $providers[$source]($query,$offset);
    $next = $page['next_offset'] !== null ? array_merge($query,['source'=>$source,'offset'=>$page['next_offset']]) : null;
    return ['items'=>$page['items'],'next'=>$next,'source'=>$source];
}
