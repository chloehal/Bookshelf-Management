<?php
require_once __DIR__ . '/catalog-bnf.php';

function catalog_sudoc_xml($xml) {
    if (stripos($xml, '<!DOCTYPE') !== false) throw new InvalidArgumentException('XML Sudoc invalide');
    $document = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    try { $loaded = $document->loadXML($xml, LIBXML_NONET); }
    finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
    if (!$loaded) throw new RuntimeException('Réponse Sudoc illisible');
    return new DOMXPath($document);
}
function catalog_sudoc_parse($xml) {
    $xpath = catalog_sudoc_xml($xml);
    $record = $xpath->query('/*[local-name()="record"]')->item(0);
    if (!$record) throw new RuntimeException('Notice Sudoc invalide');
    $values = function($tag, $code, $parent = null) use ($xpath, $record) {
        $selector = $parent ? './*[local-name()="subfield"][@code="'.$code.'"]' : './*[local-name()="datafield"][@tag="'.$tag.'"]/*[local-name()="subfield"][@code="'.$code.'"]';
        $items = [];
        foreach ($xpath->query($selector, $parent ?: $record) as $node) {
            $text = catalog_text(preg_replace('/[\x{0098}\x{009C}]/u', '', $node->textContent));
            if ($text) $items[] = $text;
        }
        return $items;
    };
    $id = trim($xpath->evaluate('string(./*[local-name()="controlfield"][@tag="001"])', $record));
    $url = catalog_source_url('sudoc', $id);
    $isbns = [];
    foreach ($values('010','a') as $value) { try { $isbns[] = catalog_isbn($value); } catch (InvalidArgumentException $e) {} }
    $authors = [];
    foreach ($xpath->query('./*[local-name()="datafield"][@tag="700" or @tag="701"]', $record) as $field) {
        $roles = $values(null,'4',$field);
        if ($roles && !in_array('070', $roles, true)) continue;
        $name = trim(implode(' ', array_merge($values(null,'b',$field), $values(null,'a',$field))));
        if ($name) $authors[] = $name;
    }
    $publisher = null; $date = null;
    foreach ($xpath->query('./*[local-name()="datafield"][@tag="214" and @ind2="0"] | ./*[local-name()="datafield"][@tag="210"]', $record) as $field) {
        $publisher = $values(null,'c',$field)[0] ?? null;
        if (preg_match('/\b(1[5-9]\d{2}|20\d{2})\b/', $values(null,'d',$field)[0] ?? '', $match)) $date = $match[1];
        if ($publisher) break;
    }
    $pages = null;
    foreach ($values('215','a') as $value) {
        if (preg_match('/\b(\d+)\s*(?:p\.|pages?\b)/u', $value, $match)) { $pages = (int)$match[1]; break; }
    }
    return ['source'=>'sudoc','source_id'=>$id,'source_url'=>$url,
        'languages'=>catalog_languages($values('101','a')),
        'format'=>$values('010','b')[0] ?? null,
        'collection'=>$values('225','a')[0] ?? null,
        'title'=>$values('200','a')[0] ?? null,
        'author'=>catalog_text(implode(', ', array_unique($authors)) ?: ($values('200','f')[0] ?? null)),
        'isbn'=>$isbns[0] ?? null,'isbns'=>array_values(array_unique($isbns)),
        'publisher'=>$publisher,'published_date'=>$date,'page_count'=>$pages,
        'genres'=>array_slice(array_values(array_unique(array_merge($values('606','a'), $values('608','a')))),0,3),
        // Sudoc does not supply artwork. Do not invent a cover from another edition.
        'cover_url'=>null];
}
function catalog_sudoc_fetch($path) {
    if (!preg_match('~^/(?:services/isbn2ppn/97[89]\d{10}|\d{8}[\dX]\.xml)$~', $path)) throw new InvalidArgumentException('Requête Sudoc invalide');
    $curl = curl_init('https://www.sudoc.fr'.$path);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_USERAGENT=>'BookshelfManagement/1.0 (reading.chlohal.com)',CURLOPT_HTTPHEADER=>['Accept: application/xml']]);
    $xml = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_HTTP_CODE); unset($curl);
    if ($status === 404) return null;
    if ($xml === false || $status !== 200) throw new RuntimeException('La recherche Sudoc est indisponible. Réessaie dans un instant.');
    return $xml;
}
function catalog_sudoc_search($isbn, $fetch = null) {
    $isbn = catalog_isbn($isbn);
    $fetch ??= 'catalog_sudoc_fetch';
    $xml = $fetch('/services/isbn2ppn/'.$isbn);
    if ($xml === null) return [];
    $xpath = catalog_sudoc_xml($xml);
    if (!$xpath->query('/sudoc/query')->length) throw new RuntimeException('Réponse Sudoc invalide');
    $ids = [];
    foreach ($xpath->query('/sudoc/query/result/ppn') as $node) {
        $id = trim($node->textContent);
        catalog_source_url('sudoc', $id);
        $ids[$id] = $id;
    }
    $items = [];
    foreach (array_slice(array_values($ids),0,6) as $id) {
        $record = $fetch('/'.$id.'.xml');
        if ($record === null) continue;
        $book = catalog_sudoc_parse($record);
        if ($book['source_id'] !== $id || !in_array($isbn, $book['isbns'], true)) continue;
        $book['isbn'] = $isbn;
        $items[] = $book;
    }
    return $items;
}
function catalog_search_isbn($isbn, $existing = null, $sudoc = null) {
    $isbn = catalog_isbn($isbn);
    $existing ??= fn()=>catalog_isbn_sources($isbn);
    $sudoc ??= fn()=>catalog_sudoc_search($isbn);
    $failure = null;
    try { $items = $existing(); if ($items) return $items; }
    catch (RuntimeException | InvalidArgumentException $e) { $failure = $e; }
    $items = $sudoc();
    if (!$items && $failure) throw new RuntimeException('Un catalogue est indisponible. Réessaie dans un instant.', 0, $failure);
    return $items;
}
