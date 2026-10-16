<?php
require_once __DIR__ . '/catalog-lib.php';

function catalog_bnf_parse($xml) {
    if (stripos($xml, '<!DOCTYPE') !== false) throw new InvalidArgumentException('XML BnF invalide');
    $document = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    try { $loaded = $document->loadXML($xml, LIBXML_NONET); }
    finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
    if (!$loaded) throw new RuntimeException('Réponse BnF illisible');
    $xpath = new DOMXPath($document);
    if ($xpath->query('//*[local-name()="diagnostic"]')->length) throw new RuntimeException('La BnF a refusé la recherche');
    $items = [];
    foreach ($xpath->query('//*[local-name()="recordData"]/*[local-name()="record"]') as $record) {
        if (!preg_match('~^ark:/12148/(cb\d{8}[0-9a-z])$~', $record->getAttribute('id'), $match)) continue;
        $id = $match[1];
        $fields = function($tag, $code, $parent = null) use ($xpath, $record) {
            $selector = $parent ? './*[local-name()="subfield"][@code="' . $code . '"]' : './*[local-name()="datafield"][@tag="' . $tag . '"]/*[local-name()="subfield"][@code="' . $code . '"]';
            $values = [];
            foreach ($xpath->query($selector, $parent ?: $record) as $node) {
                $value = catalog_text(preg_replace('/[\x{0098}\x{009C}]/u', '', $node->textContent));
                if ($value) $values[] = $value;
            }
            return $values;
        };
        $isbns = [];
        foreach ($fields('010', 'a') as $value) { try { $isbns[] = catalog_isbn($value); } catch (InvalidArgumentException $e) {} }
        $isbns = array_values(array_unique($isbns));
        $isbn = $isbns[0] ?? null;
        $authors = [];
        foreach ($xpath->query('./*[local-name()="datafield"][@tag="700" or @tag="701"]', $record) as $field) {
            $roles = $fields(null, '4', $field);
            if ($roles && !in_array('070', $roles, true)) continue;
            $name = trim(implode(' ', array_merge($fields(null, 'b', $field), $fields(null, 'a', $field))));
            if ($name) $authors[] = $name;
        }
        $publisher = null; $date = null;
        foreach ($xpath->query('./*[local-name()="datafield"][@tag="214" and @ind2="0"] | ./*[local-name()="datafield"][@tag="210"]', $record) as $field) {
            $publisher = $fields(null, 'c', $field)[0] ?? null;
            $value = $fields(null, 'd', $field)[0] ?? '';
            if (preg_match('/\b(1[5-9]\d{2}|20\d{2})\b/', $value, $year)) $date = $year[1];
            if ($publisher) break;
        }
        $pages = null;
        foreach ($fields('215','a') as $value) if (preg_match('/\b(\d+)\s*p\./u', $value, $count)) { $pages = (int) $count[1]; break; }
        $genres = array_merge($fields('606','a'), $fields('608','a'), $fields('225','e'));
        $cover = null;
        if (in_array('Première de couverture', $fields('856','b'), true)) {
            $cover = 'https://openapi.bnf.fr/couverture/image/image/recupererImage?' . http_build_query(['idArk'=>'ark:/12148/' . $id, 'couverture'=>1]);
        }
        $items[] = [
            'source'=>'bnf', 'source_id'=>$id, 'source_url'=>catalog_source_url('bnf',$id),
            'title'=>$fields('200','a')[0] ?? null,
            'author'=>catalog_text(implode(', ', array_unique($authors)) ?: ($fields('200','f')[0] ?? null)),
            'isbn'=>$isbn, 'isbns'=>$isbns, 'page_count'=>$pages, 'genres'=>array_slice(array_values(array_unique($genres)),0,3),
            'publisher'=>$publisher, 'published_date'=>$date, 'cover_url'=>$cover,
            'cover_retrieved_at'=>$cover ? gmdate('Y-m-d') : null,
        ];
    }
    return $items;
}
function catalog_bnf_search($query) {
    $params = ['version'=>'1.2','operation'=>'searchRetrieve','query'=>$query,'recordSchema'=>'unimarcxchange','maximumRecords'=>6];
    $curl = curl_init('https://catalogue.bnf.fr/api/SRU?' . http_build_query($params));
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>15,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_USERAGENT=>'BookshelfManagement/1.0 (reading.chlohal.com)',CURLOPT_HTTPHEADER=>['Accept: application/xml']]);
    $xml = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_HTTP_CODE); unset($curl);
    if ($xml === false || $status !== 200) throw new RuntimeException('La recherche BnF est indisponible. Réessaie dans un instant.');
    return catalog_bnf_parse($xml);
}
function catalog_isbn_sources($isbn, $primary = null, $secondary = null) {
    $isbn = catalog_isbn($isbn);
    $primary ??= fn() => catalog_lookup('ISBN:' . $isbn);
    $secondary ??= fn() => catalog_bnf_search('bib.isbn all "' . $isbn . '"');
    try { $book = $primary(); if ($book) return [$book]; } catch (RuntimeException $e) {}
    // Preserve a secondary outage as an error, not an apparent catalogue miss.
    $books = $secondary();
    $matches = [];
    foreach ($books as $book) {
        if (in_array($isbn, $book['isbns'] ?? [$book['isbn'] ?? null], true)) {
            $book['isbn'] = $isbn;
            $matches[] = $book;
        }
    }
    return $matches;
}
