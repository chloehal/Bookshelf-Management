<?php
require_once __DIR__.'/catalog-sudoc.php';
const EDITION_PAGE_SIZE = 20;
const EDITION_SOURCES = ['openlibrary'=>'Open Library', 'bnf'=>'BnF', 'sudoc'=>'Sudoc'];

function catalog_cql_text($text) {
    return trim(preg_replace('/\s+/u', ' ', preg_replace('/[^\p{L}\p{N}\s\x{0027}-]/u', ' ', catalog_text($text) ?? '')));
}
function catalog_editions_sru($xml, $source, $offset) {
    $xpath = catalog_sudoc_xml($xml);
    $count = $xpath->query('/*/*[local-name()="numberOfRecords"]')->item(0);
    if (!$count || !ctype_digit(trim($count->textContent))) throw new RuntimeException('Réponse du catalogue invalide');
    $total = (int)trim($count->textContent);
    foreach ($xpath->query('//*[local-name()="diagnostics" or local-name()="diagnostic"]/*[local-name()="uri"]') as $uri) {
        // Sudoc emits diagnostic 0 on success and 61 for an exhausted page.
        $code = basename(trim($uri->textContent));
        if ($code !== '0' && !($code === '61' && $offset >= $total)) throw new RuntimeException('Le catalogue a refusé la recherche');
    }
    $records = $xpath->query('//*[local-name()="recordData"]/*[local-name()="record"]');
    if ($source === 'bnf') $items = catalog_bnf_parse($xml);
    else {
        $items = [];
        foreach ($records as $record) {
            $document = new DOMDocument();
            $document->appendChild($document->importNode($record, true));
            $items[] = catalog_sudoc_parse($document->saveXML());
        }
    }
    if ($offset < $total && $records->length === 0) throw new RuntimeException('Page du catalogue incomplète');
    $position = trim($xpath->evaluate('string(/*/*[local-name()="nextRecordPosition"])'));
    $nextOffset = ctype_digit($position) ? (int)$position - 1 : $offset + $records->length;
    if ($nextOffset <= $offset && $offset < $total) throw new RuntimeException('Pagination du catalogue invalide');
    return ['items'=>$items,'total'=>$total,'next_offset'=>$nextOffset < $total ? $nextOffset : null];
}
function catalog_editions_xml($source, $query, $offset) {
    $sudoc = $source === 'sudoc';
    $title = catalog_cql_text($query['title']);
    $author = catalog_cql_text($query['author']);
    $cql = $sudoc ? 'mti="'.$title.'"' : 'bib.title all "'.$title.'"';
    if ($author) $cql .= $sudoc ? ' and aut="'.$author.'"' : ' and bib.author all "'.$author.'"';
    $params = ['operation'=>'searchRetrieve','version'=>$sudoc ? '1.1' : '1.2', 'recordSchema'=>$sudoc ? 'unimarc' : 'unimarcxchange',
        'query'=>$cql,'maximumRecords'=>EDITION_PAGE_SIZE,'startRecord'=>$offset+1];
    $host = $sudoc ? 'https://www.sudoc.abes.fr/cbs/sru/' : 'https://catalogue.bnf.fr/api/SRU';
    $curl = curl_init($host.'?'.http_build_query($params));
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>12,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_USERAGENT=>'BookshelfManagement/1.0 (reading.chlohal.com)',CURLOPT_HTTPHEADER=>['Accept: application/xml']]);
    $xml = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_HTTP_CODE); unset($curl);
    if ($xml === false || $status !== 200) throw new RuntimeException('Catalogue indisponible');
    return catalog_editions_sru($xml, $source, $offset);
}
function catalog_editions_openlibrary($query, $offset) {
    $work = $query['work'];
    if (!$work) {
        $params = ['title'=>$query['title'],'limit'=>1,'fields'=>'key'];
        if ($query['author']) $params['author'] = $query['author'];
        $search = catalog_fetch('/search.json?'.http_build_query($params));
        $work = basename($search['docs'][0]['key'] ?? '');
        if (!$work) return ['items'=>[], 'total'=>0, 'next_offset'=>null];
        if (!preg_match('/^OL\d+W$/', $work)) throw new RuntimeException('Œuvre Open Library invalide');
    }
    $data = catalog_fetch('/works/'.$work.'/editions.json?'.http_build_query(['limit'=>EDITION_PAGE_SIZE,'offset'=>$offset]));
    $items = [];
    foreach ($data['entries'] ?? [] as $edition) {
        if (!preg_match('~/books/(OL\d+M)$~', $edition['key'] ?? '', $match)) continue;
        $isbn = null;
        foreach (array_merge($edition['isbn_13'] ?? [], $edition['isbn_10'] ?? []) as $value) {
            try { $isbn = catalog_isbn($value); break; } catch (InvalidArgumentException $e) {}
        }
        $items[] = ['source_id'=>$match[1], 'lookup_source'=>'openlibrary','title'=>$edition['title'] ?? 'Sans titre',
            'author'=>$query['author'],'publisher'=>implode(', ', $edition['publishers'] ?? []),
            'published_date'=>$edition['publish_date'] ?? null,'isbn'=>$isbn,
            'cover_url'=>!empty($edition['covers'][0]) && $edition['covers'][0] > 0 ? 'https://covers.openlibrary.org/b/id/'.(int)$edition['covers'][0].'-M.jpg?default=false' : null];
    }
    $total = (int)($data['size'] ?? 0);
    return ['items'=>$items,'total'=>$total,'work'=>$work,'next_offset'=>$offset+EDITION_PAGE_SIZE < $total ? $offset+EDITION_PAGE_SIZE : null];
}
function catalog_editions($input, $providers = null) {
    $title = catalog_text($input['title'] ?? null);
    $author = catalog_text($input['author'] ?? null) ?? '';
    if (!$title || mb_strlen(catalog_cql_text($title)) < 2) throw new InvalidArgumentException('Saisis au moins deux caractères de titre');
    $work = $input['work'] ?? '';
    if (!is_string($work) || ($work && !preg_match('/^OL\d+W$/', $work))) throw new InvalidArgumentException('Œuvre invalide');
    $query = ['editions'=>1,'title'=>$title,'author'=>$author,'work'=>$work];
    $providers ??= ['openlibrary'=>'catalog_editions_openlibrary','bnf'=>fn($q,$o)=>catalog_editions_xml('bnf',$q,$o),'sudoc'=>fn($q,$o)=>catalog_editions_xml('sudoc',$q,$o)];
    $offsets = [];
    foreach (EDITION_SOURCES as $source=>$label) {
        $offset = filter_var($input[$source.'_offset'] ?? 0, FILTER_VALIDATE_INT);
        if ($offset === false || $offset < -1 || $offset > 1000000) throw new InvalidArgumentException('Pagination invalide');
        $offsets[$source] = $offset;
    }
    $items = []; $warnings = []; $next = $query; $succeeded = 0; $pending = false;
    foreach (EDITION_SOURCES as $source=>$label) {
        $offset = $offsets[$source];
        $next[$source.'_offset'] = -1;
        if ($offset === -1) continue;
        try {
            $page = $providers[$source]($query, $offset);
            $succeeded++;
            foreach ($page['items'] as $book) {
                $book['edition_result'] = true;
                $items[$source.':'.$book['source_id']] = $book;
            }
            if (!empty($page['work'])) $next['work'] = $page['work'];
            if ($page['next_offset'] !== null) { $next[$source.'_offset'] = $page['next_offset']; $pending = true; }
        } catch (RuntimeException | InvalidArgumentException $e) {
            $warnings[] = $label.' indisponible : les résultats sont incomplets.';
            $next[$source.'_offset'] = $offset;
            $pending = true;
        }
    }
    if (!$succeeded && $warnings) throw new RuntimeException('Les catalogues demandés sont indisponibles. Réessaie dans un instant.');
    return ['items'=>array_values($items),'warnings'=>$warnings,'next'=>$pending ? $next : null];
}
