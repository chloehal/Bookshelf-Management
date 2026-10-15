<?php
// Optional read-only smoke test against the public Open Library API; no database access.
$queries = [
    ['isbn' => '9780441172719'],
    ['title' => 'Dune', 'author' => 'Frank Herbert'],
    ['work' => 'OL893414W', 'offset' => 0],
];
$reports = [];
foreach ($queries as $query) {
    $_SERVER['REQUEST_METHOD'] = 'GET'; $_GET = $query;
    ob_start(); require __DIR__ . '/../api/catalog.php'; $body = ob_get_clean();
    $data = json_decode($body, true);
    if (empty($data['items']) || isset($data['error'])) throw new Exception('Live search failed: ' . $body);
    if (isset($query['isbn']) && (empty($data['items'][0]['source_id']) || empty($data['items'][0]['cover_url']))) throw new Exception('Missing ISBN edition/artwork');
    if (isset($query['title']) && empty($data['items'][0]['work_id'])) throw new Exception('Missing work reference for other editions');
    if (isset($query['work']) && count($data['items']) < 2) throw new Exception('Expected multiple editions');
    $reports[] = 'Open Library ' . array_key_first($query) . ': OK (' . count($data['items']) . ' results)';
    usleep(400000);
}

echo implode(PHP_EOL, $reports), PHP_EOL;
