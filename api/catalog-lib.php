<?php
const CATALOG_FIELDS = ['title', 'author', 'isbn', 'genres', 'page_count', 'publisher', 'published_date', 'cover_url'];
function catalog_isbn($value) {
    $isbn = strtoupper(preg_replace('/[\s-]/', '', (string) $value));
    if (preg_match('/^\d{9}[\dX]$/', $isbn)) {
        $sum = 0;
        for ($i = 0; $i < 10; $i++) $sum += ($isbn[$i] === 'X' ? 10 : (int) $isbn[$i]) * (10 - $i);
        if ($sum % 11) throw new InvalidArgumentException('ISBN invalide');
        $isbn = '978' . substr($isbn, 0, 9);
        $sum = 0;
        for ($i = 0; $i < 12; $i++) $sum += (int) $isbn[$i] * ($i % 2 ? 3 : 1);
        return $isbn . ((10 - $sum % 10) % 10);
    }
    if (!preg_match('/^97[89]\d{10}$/', $isbn)) throw new InvalidArgumentException('ISBN invalide');
    $sum = 0;
    for ($i = 0; $i < 13; $i++) $sum += (int) $isbn[$i] * ($i % 2 ? 3 : 1);
    if ($sum % 10) throw new InvalidArgumentException('ISBN invalide');
    return $isbn;
}
function catalog_source_url($source, $id) {
    if ($source === 'openlibrary' && preg_match('/^OL\d+M$/', $id)) return 'https://openlibrary.org/books/' . $id;
    if ($source === 'sudoc' && preg_match('/^\d{8}[\dX]$/', $id)) return 'https://www.sudoc.fr/' . $id;
    if ($source === 'bnf' && preg_match('/^cb\d{8}[0-9a-z]$/', $id)) return 'https://catalogue.bnf.fr/ark:/12148/' . $id;
    throw new InvalidArgumentException('Source bibliographique invalide');
}
function catalog_cover_url($value) {
    if (!$value) return null;
    $value = preg_replace('~^http://~', 'https://', (string) $value);
    $parts = parse_url($value);
    if (($parts['scheme'] ?? '') === 'https' && ($parts['host'] ?? '') === 'openapi.bnf.fr' && ($parts['path'] ?? '') === '/couverture/image/image/recupererImage' && !isset($parts['user']) && !isset($parts['pass']) && !isset($parts['fragment']) && !isset($parts['port'])) {
        parse_str($parts['query'] ?? '', $params);
        if (count($params) === 2 && ($params['couverture'] ?? '') === '1' && is_string($params['idArk'] ?? null) && preg_match('~^ark:/12148/cb\d{8}[0-9a-z]$~', $params['idArk'])) {
            return 'https://openapi.bnf.fr/couverture/image/image/recupererImage?' . http_build_query(['idArk'=>$params['idArk'],'couverture'=>1]);
        }
    }
    if (!preg_match('~^https://covers\.openlibrary\.org/b/(?:id/\d+|olid/OL\d+M)-[SML]\.jpg(?:\?default=false)?$~', $value)) return null;
    return str_contains($value, '?') ? $value : $value . '?default=false';
}
function catalog_text($value, $limit = 255) {
    if (!is_string($value)) return null;
    $value = trim($value);
    if (strlen($value) > $limit * 4) throw new InvalidArgumentException('Texte trop long');
    return $value === '' ? null : mb_substr($value, 0, $limit);
}
function catalog_normalize($book, $olid) {
    $isbns = array_merge($book['identifiers']['isbn_13'] ?? [], $book['identifiers']['isbn_10'] ?? []);
    $isbn = null;
    foreach ($isbns as $item) { try { $isbn = catalog_isbn($item); break; } catch (InvalidArgumentException $e) {} }
    return [
        'source' => 'openlibrary', 'source_id' => $olid,
        'source_url' => 'https://openlibrary.org/books/' . $olid,
        'title' => catalog_text($book['title'] ?? null),
        'author' => catalog_text(implode(', ', array_column($book['authors'] ?? [], 'name'))),
        'isbn' => $isbn,
        'genres' => array_slice(array_values(array_filter(array_map(fn($item) => catalog_text($item['name'] ?? null, 100), $book['subjects'] ?? []))), 0, 3),
        'page_count' => !empty($book['number_of_pages']) ? (int) $book['number_of_pages'] : null,
        'publisher' => catalog_text(implode(', ', array_column($book['publishers'] ?? [], 'name'))),
        'cover_url' => catalog_cover_url($book['cover']['large'] ?? $book['cover']['medium'] ?? null),
        'published_date' => catalog_text($book['publish_date'] ?? null, 100),
    ];
}
function catalog_values($book) {
    $values = [];
    foreach (CATALOG_FIELDS as $key) $values[$key] = $book[$key] ?? null;
    if (is_string($values['genres'])) $values['genres'] = json_decode($values['genres'], true);
    if ($values['page_count'] !== null) $values['page_count'] = (int) $values['page_count'];
    return $values;
}
function catalog_validate($candidate) {
    if (!is_array($candidate) || !is_string($candidate['source'] ?? null) || !is_string($candidate['source_id'] ?? null)) throw new InvalidArgumentException('Source bibliographique invalide');
    $url = catalog_source_url($candidate['source'], $candidate['source_id']);
    $result = ['source'=>$candidate['source'], 'source_id'=>$candidate['source_id'], 'source_url'=>$url];
    if ($candidate['source'] === 'bnf' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $candidate['cover_retrieved_at'] ?? '')) $result['cover_retrieved_at'] = $candidate['cover_retrieved_at'];
    foreach (CATALOG_FIELDS as $key) {
        $value = $candidate[$key] ?? null;
        if ($key === 'genres') {
            if (!is_array($value) || count($value) > 3) throw new InvalidArgumentException('Maximum 3 genres');
            $value = array_values(array_filter(array_map(fn($g) => catalog_text($g, 100), $value)));
        } elseif ($key === 'cover_url') {
            $value = catalog_cover_url($value);
        } elseif ($key === 'isbn') {
            $value = $value ? catalog_isbn($value) : null;
        } elseif ($key === 'page_count') {
            if ($value !== null && (!is_numeric($value) || (int) $value <= 0 || (int) $value > 1000000)) throw new InvalidArgumentException('Nombre de pages invalide');
            $value = $value === null ? null : (int) $value;
        } else $value = catalog_text($value, $key === 'published_date' ? 100 : 255);
        $result[$key] = $value;
    }
    return $result;
}
function catalog_merge($local, $candidate, $choices) {
    $values = catalog_values($local);
    foreach (CATALOG_FIELDS as $key) {
        $value = $candidate[$key] ?? null;
        if (($choices[$key] ?? 'local') === 'api' && $value !== null && $value !== '' && $value !== []) $values[$key] = $value;
    }
    return $values;
}
function catalog_fetch($path) {
    // Fixed host and no redirects: never fetch a URL supplied by a visitor.
    $curl = curl_init('https://openlibrary.org' . $path);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_USERAGENT => 'BookshelfManagement/1.0 (reading.chlohal.com)', CURLOPT_HTTPHEADER => ['Accept: application/json']]);
    $body = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    unset($curl);
    if ($body === false || $status !== 200) throw new RuntimeException('Open Library est indisponible. Réessaie dans un instant.');
    $data = json_decode($body, true);
    if (!is_array($data)) throw new RuntimeException('Réponse Open Library invalide');
    return $data;
}
function catalog_lookup($bibkey) {
    $data = catalog_fetch('/api/books?' . http_build_query(['bibkeys' => $bibkey, 'format' => 'json', 'jscmd' => 'data']));
    if (empty($data[$bibkey])) return null;
    $book = $data[$bibkey];
    preg_match('~/books/(OL\d+M)~', $book['url'] ?? '', $match);
    if (empty($match[1])) throw new RuntimeException('Cette édition ne possède pas de référence utilisable');
    return catalog_normalize($book, $match[1]);
}

// Preserve the reading fraction across editions; no old total means keep the page.
function catalog_convert_progress($page, $oldTotal, $newTotal) {
    $page = max(0, (int) $page);
    if (!$newTotal || (int) $newTotal === (int) $oldTotal) return $page;
    if ((int) $oldTotal > 0) return (int) round(min(1, $page / (int) $oldTotal) * (int) $newTotal);
    return min($page, (int) $newTotal);
}
