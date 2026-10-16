<?php
require_once __DIR__ . '/catalog-sudoc.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Méthode non autorisée']); exit; }
try {
    if (isset($_GET['sudoc'])) {
        catalog_source_url('sudoc', $_GET['sudoc']);
        $xml = catalog_sudoc_fetch('/' . $_GET['sudoc'] . '.xml');
        echo json_encode(['items'=>$xml === null ? [] : [catalog_sudoc_parse($xml)]]);
    } elseif (isset($_GET['bnf'])) {
        catalog_source_url('bnf', $_GET['bnf']);
        echo json_encode(['items'=>catalog_bnf_search('bib.ark all "ark:/12148/' . $_GET['bnf'] . '"')]);
    } elseif (isset($_GET['isbn'])) {
        echo json_encode(['items'=>catalog_search_isbn($_GET['isbn'])]);
    } elseif (isset($_GET['work'])) {
        if (!preg_match('/^OL\d+W$/', $_GET['work'])) throw new InvalidArgumentException('Œuvre invalide');
        $offset = max(0, min(10000, (int) ($_GET['offset'] ?? 0)));
        $data = catalog_fetch('/works/' . $_GET['work'] . '/editions.json?' . http_build_query(['limit' => 20, 'offset' => $offset]));
        $items = [];
        foreach ($data['entries'] ?? [] as $edition) {
            if (!preg_match('~/books/(OL\d+M)$~', $edition['key'] ?? '', $match)) continue;
            $items[] = ['source_id' => $match[1], 'title' => $edition['title'] ?? 'Sans titre', 'author' => null,
                'publisher' => implode(', ', $edition['publishers'] ?? []), 'published_date' => $edition['publish_date'] ?? null,
                'isbn' => $edition['isbn_13'][0] ?? $edition['isbn_10'][0] ?? null,
                'cover_url' => !empty($edition['covers'][0]) && $edition['covers'][0] > 0 ? 'https://covers.openlibrary.org/b/id/' . (int) $edition['covers'][0] . '-M.jpg?default=false' : null];
        }
        echo json_encode(['items' => $items, 'next_offset' => $offset + 20 < ($data['size'] ?? 0) ? $offset + 20 : null]);
    } elseif (isset($_GET['isbn']) || isset($_GET['olid'])) {
        if (isset($_GET['isbn'])) $key = 'ISBN:' . catalog_isbn($_GET['isbn']);
        else {
            if (!preg_match('/^OL\d+M$/', $_GET['olid'])) throw new InvalidArgumentException('Édition invalide');
            $key = 'OLID:' . $_GET['olid'];
        }
        $book = catalog_lookup($key);
        if ($book) $book = catalog_enrich_cover($book);
        echo json_encode(['items' => $book ? [$book] : []]);
    } else {
        $title = catalog_text($_GET['title'] ?? null);
        $author = catalog_text($_GET['author'] ?? null);
        if (!$title || strlen($title) < 2) throw new InvalidArgumentException('Saisis au moins deux caractères de titre');
        $params = ['title' => $title, 'lang' => 'fr', 'limit' => 6, 'fields' => 'key,title,author_name,editions,editions.key,editions.title,editions.publisher,editions.publish_date'];
        if ($author) $params['author'] = $author;
        $data = catalog_fetch('/search.json?' . http_build_query($params));
        $items = [];
        foreach ($data['docs'] ?? [] as $doc) {
            $edition = $doc['editions']['docs'][0] ?? null;
            if (!$edition || !preg_match('~/books/(OL\d+M)$~', $edition['key'] ?? '', $match)) continue;
            $items[] = ['source_id' => $match[1], 'work_id' => basename($doc['key']), 'title' => $edition['title'] ?? $doc['title'], 'author' => implode(', ', $doc['author_name'] ?? []),
                'publisher' => implode(', ', (array) ($edition['publisher'] ?? [])), 'published_date' => implode(', ', (array) ($edition['publish_date'] ?? []))];
        }
        echo json_encode(['items' => $items]);
    }
} catch (InvalidArgumentException $e) {
    http_response_code(400); echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(502); echo json_encode(['error' => 'La recherche bibliographique a échoué. Réessaie dans un instant.']);
}
