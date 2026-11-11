<?php
require_once __DIR__.'/catalog-lib.php';

function catalog_goodreads_redirect($location, $original) {
    $parts = parse_url($location);
    $valid = ($parts['scheme'] ?? '') === 'https' && ($parts['host'] ?? '') === 'www.goodreads.com'
        && !isset($parts['user']) && !isset($parts['pass']) && !isset($parts['port']) && !isset($parts['fragment']);
    if (!preg_match('~^/(book/show|work/editions)/([1-9]\d*)~', $original, $match)
        || !$valid || !preg_match('~^/'.preg_quote($match[1], '~').'/'.$match[2].'(?:-[a-zA-Z0-9_-]+)?$~D', $parts['path'] ?? '')) {
        throw new RuntimeException('Redirection Goodreads invalide');
    }
    parse_str(parse_url($original, PHP_URL_QUERY) ?? '', $expected);
    parse_str($parts['query'] ?? '', $actual);
    ksort($expected); ksort($actual);
    if ($expected !== $actual) throw new RuntimeException('Pagination Goodreads modifiée');
    return $location;
}

// Only public surfaces verified against Goodreads' crawl rules. No account or paid API.
function catalog_goodreads_fetch($path) {
    if (!preg_match('~^/(?:book/show/[1-9]\d*|book/auto_complete\?format=json&q=[^\s#]*|work/editions/[1-9]\d*\?per_page=20&page=[1-9]\d*)$~D', $path)) {
        throw new InvalidArgumentException('Adresse Goodreads invalide');
    }
    $directory = sys_get_temp_dir().'/bookshelf-goodreads-v1';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Cache Goodreads indisponible');
    $cache = $directory.'/'.hash('sha256', $path);
    $lock = @fopen($cache.'.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) fclose($lock);
        throw new RuntimeException('Recherche Goodreads déjà en cours');
    }
    try {
        if (is_file($cache) && filemtime($cache) > time()-86400) return file_get_contents($cache);
        $url = 'https://www.goodreads.com'.$path;
        $redirected = false; $retried = false;
        for ($attempt = 0; $attempt < 3; $attempt++) {
            // Shared pacing across PHP workers. Do not queue a large crawl on the web server.
            $pace = fopen($directory.'/pace.lock', 'c+');
            if (!$pace || !flock($pace, LOCK_EX | LOCK_NB)) {
                if ($pace) fclose($pace);
                throw new RuntimeException('Goodreads occupé. Réessaie dans un instant.');
            }
            try {
                $last = (float)stream_get_contents($pace);
                $delay = 1 - (microtime(true)-$last);
                if ($delay > 0) usleep((int)($delay*1000000));
                ftruncate($pace, 0); rewind($pace); fwrite($pace, (string)microtime(true));
            } finally { flock($pace, LOCK_UN); fclose($pace); }
            $curl = curl_init($url);
            $body = '';
            curl_setopt_array($curl, [CURLOPT_FOLLOWLOCATION=>false, CURLOPT_CONNECTTIMEOUT=>3, CURLOPT_TIMEOUT=>8,
                CURLOPT_USERAGENT=>'BookshelfManagement/1.0 (reading.chlohal.com)',
                CURLOPT_WRITEFUNCTION=>function($handle, $chunk) use (&$body) {
                    if (strlen($body)+strlen($chunk) > 4000000) return 0;
                    $body .= $chunk; return strlen($chunk);
                }]);
            $ok = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $location = curl_getinfo($curl, CURLINFO_REDIRECT_URL); unset($curl);
            if ($ok !== false && $status === 200) {
                // Never cache a block/challenge page as an empty catalogue.
                $valid = str_starts_with($path, '/book/auto_complete?') ? is_array(json_decode($body, true))
                    : (str_contains($body, '__NEXT_DATA__') || str_contains($body, 'editionData'));
                if (!$valid) throw new RuntimeException('Réponse Goodreads illisible');
                @file_put_contents($cache, $body, LOCK_EX);
                return $body;
            }
            if (in_array($status,[301,302,307,308],true) && !$redirected) {
                $url = catalog_goodreads_redirect($location, $path); $redirected = true; continue;
            }
            if ($status !== 503 || $retried) break;
            $retried = true;
        }
        throw new RuntimeException('Goodreads temporairement indisponible');
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}

function catalog_goodreads_dom($html) {
    $document = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    try { $loaded = $document->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET); }
    finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
    if (!$loaded) throw new RuntimeException('Fiche Goodreads illisible');
    return new DOMXPath($document);
}

function catalog_goodreads_languages($language) {
    $code = ['French'=>'fr','English'=>'en','German'=>'de','Spanish'=>'es','Italian'=>'it','Dutch'=>'nl','Portuguese'=>'pt'];
    return isset($code[$language]) ? [$code[$language]] : [];
}

function catalog_goodreads_book_parse($html, $id) {
    catalog_source_url('goodreads', $id);
    $xpath = catalog_goodreads_dom($html);
    $json = $xpath->evaluate('string(//script[@id="__NEXT_DATA__"])');
    $state = json_decode($json, true)['props']['pageProps']['apolloState'] ?? [];
    foreach ($state as $book) {
        if (($book['__typename'] ?? '') !== 'Book' || (string)($book['legacyId'] ?? '') !== $id || !isset($book['details'])) continue;
        $details = $book['details'];
        $ref = $book['primaryContributorEdge']['node']['__ref'] ?? '';
        $isbn = null;
        foreach ([$details['isbn13'] ?? null, $details['isbn'] ?? null] as $value) {
            if ($value) { try { $isbn = catalog_isbn($value); break; } catch(InvalidArgumentException $e) {} }
        }
        $genres = [];
        foreach ($book['bookGenres'] ?? [] as $genre) {
            if (!empty($genre['genre']['name'])) $genres[] = catalog_text($genre['genre']['name'],100);
        }
        $work = null;
        if (preg_match('~/work/editions/([1-9]\d*)~', $html, $match)) $work = $match[1];
        return ['source'=>'goodreads','source_id'=>$id,'source_url'=>catalog_source_url('goodreads',$id),
            'title'=>catalog_text($book['title'] ?? null),'author'=>catalog_text($state[$ref]['name'] ?? null),
            'isbn'=>$isbn,'genres'=>array_slice($genres,0,3),'page_count'=>$details['numPages'] ?? null,
            'publisher'=>catalog_text($details['publisher'] ?? null),
            'published_date'=>!empty($details['publicationTime']) ? gmdate('Y-m-d',(int)($details['publicationTime']/1000)) : null,
            'cover_url'=>catalog_cover_url($book['imageUrl'] ?? null),
            'languages'=>catalog_goodreads_languages($details['language']['name'] ?? ''),
            'format'=>catalog_text($details['format'] ?? null),'goodreads_work'=>$work];
    }
    throw new RuntimeException('Fiche Goodreads absente ou illisible');
}

function catalog_goodreads_editions_parse($html, $work, $offset) {
    $xpath = catalog_goodreads_dom($html);
    $items = [];
    foreach ($xpath->query('//div[contains(concat(" ",normalize-space(@class)," ")," editionData ")]') as $node) {
        $link = $xpath->query('.//a[@class="bookTitle"]', $node)->item(0);
        if (!$link || !preg_match('~^/book/show/([1-9]\d*)~', $link->getAttribute('href'), $id)) continue;
        $text = preg_replace('/\s+/u',' ',$node->textContent);
        $isbn = null;
        if (preg_match('/ISBN: (97[89]\d{10}|\d{9}[\dX])\b/', $text, $match)) {
            try { $isbn = catalog_isbn($match[1]); } catch(InvalidArgumentException $e) {}
        }
        $language = preg_match('/Edition language: ([\p{L}]+)/u',$text,$match) ? $match[1] : '';
        $authors = [];
        foreach ($xpath->query('.//a[@class="authorName"]', $node) as $author) $authors[] = trim($author->textContent);
        $row = $xpath->query('./div[@class="dataRow"]', $node);
        $formatRow = $row->item(2)?->textContent ?? '';
        $pages = preg_match('/(\d+) pages/', $formatRow, $match) ? (int)$match[1] : null;
        $published = trim(preg_replace('/\s+/u',' ',$row->item(1)?->textContent ?? ''));
        $publisher = preg_match('/\bby (.+)$/u',$published,$match) ? catalog_text($match[1]) : null;
        $date = null;
        if (preg_match('/Published (.+?)(?: by |$)/', $published,$match)) {
            $timestamp = strtotime($match[1]);
            if ($timestamp !== false) $date = gmdate('Y-m-d',$timestamp);
        }
        $items[] = ['lookup_source'=>'goodreads','source_id'=>$id[1],'title'=>catalog_text($link->textContent),
            'cover_url'=>catalog_cover_url($xpath->evaluate('string(../div[contains(@class,"leftAlignedImage")]//img/@src)', $node)),
            'author'=>catalog_text(implode(', ', $authors)),'isbn'=>$isbn,'publisher'=>$publisher,
            'published_date'=>$date,'page_count'=>$pages,'languages'=>catalog_goodreads_languages($language),
            'format'=>catalog_text(preg_replace('/,?\s*\d+ pages.*$/s','',trim($formatRow))),
            'goodreads_work'=>$work,'edition_result'=>true];
    }
    if (!$items) throw new RuntimeException('Liste des éditions Goodreads illisible');
    $next = $xpath->query('//a[@rel="next"]')->item(0);
    return ['items'=>$items,'next_offset'=>$next ? $offset+1 : null,'goodreads_work'=>$work];
}

function catalog_goodreads_search($query, $offset = 0, $fetch = null) {
    $fetch ??= 'catalog_goodreads_fetch';
    if (!empty($query['goodreads_work'])) {
        $work = $query['goodreads_work'];
        if (!is_string($work) || !preg_match('/^[1-9]\d{0,15}$/D',$work)) throw new InvalidArgumentException('Œuvre Goodreads invalide');
        return catalog_goodreads_editions_parse($fetch('/work/editions/'.$work.'?per_page=20&page='.($offset+1)), $work,$offset);
    }
    if ($offset !== 0) throw new InvalidArgumentException('Pagination Goodreads invalide');
    $search = $query['isbn'] ?? trim(($query['title'] ?? '').' '.($query['author'] ?? ''));
    $matches = json_decode($fetch('/book/auto_complete?format=json&q='.rawurlencode($search)),true);
    if (!is_array($matches) || !array_is_list($matches)) throw new RuntimeException('Recherche Goodreads illisible');
    $items = [];
    foreach (array_slice($matches,0,!empty($query['isbn']) ? 3 : 10) as $match) {
        $id = (string)($match['bookId'] ?? '');
        if (!preg_match('/^[1-9]\d{0,15}$/D',$id)) continue;
        if (!empty($query['isbn'])) {
            // Autocomplete is not proof of edition identity: verify on the actual fiche.
            $book = catalog_goodreads_book_parse($fetch('/book/show/'.$id),$id);
            if ($book['isbn'] === $query['isbn']) { $items[] = $book; break; }
        } else {
            $work = (string)($match['workId'] ?? '');
            $items[] = ['lookup_source'=>'goodreads','source_id'=>$id,'title'=>catalog_text($match['title'] ?? null),
                'cover_url'=>catalog_cover_url($match['imageUrl'] ?? null),
                'author'=>catalog_text($match['author']['name'] ?? null),'page_count'=>$match['numPages'] ?? null,
                'goodreads_work'=>preg_match('/^[1-9]\d{0,15}$/D',$work) ? $work : null];
        }
    }
    return ['items'=>$items,'next_offset'=>null];
}
