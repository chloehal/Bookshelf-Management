<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $pdo->query('SELECT id, title, author, genres, is_read, year, is_gift, is_wishlist, rating, page_count, color, size, isbn, publisher, published_date, cover_url, metadata_source, metadata_source_id, metadata_snapshot, metadata_linked_at FROM books ORDER BY title ASC');
        $books = $stmt->fetchAll();
        foreach ($books as &$book) {
            $book['id'] = (int) $book['id'];
            $book['is_read'] = (bool) $book['is_read'];
            $book['is_gift'] = (bool) $book['is_gift'];
            $book['is_wishlist'] = (bool) $book['is_wishlist'];
            $book['rating'] = $book['rating'] ? (int) $book['rating'] : null;
            $book['year'] = $book['year'] ? (int) $book['year'] : null;
            $book['page_count'] = $book['page_count'] ? (int) $book['page_count'] : null;
            $book['size'] = $book['size'] ? (int) $book['size'] : null;
            $book['genres'] = json_decode($book['genres']);
            $book['metadata_snapshot'] = $book['metadata_snapshot'] ? json_decode($book['metadata_snapshot'], true) : null;
        }
        echo json_encode($books);
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $title = trim($data['title'] ?? '');
        $author = trim($data['author'] ?? '');
        $genres = $data['genres'] ?? [];
        $year = !empty($data['year']) ? (int) $data['year'] : null;
        $is_gift = !empty($data['is_gift']) ? 1 : 0;
        $is_wishlist = !empty($data['is_wishlist']) ? 1 : 0;

        if (!$title || !$author || empty($genres)) {
            http_response_code(400);
            echo json_encode(['error' => 'Titre, auteur et genres requis']);
            exit;
        }

        $page_count = !empty($data['page_count']) ? (int) $data['page_count'] : null;
        $size = !empty($data['size']) ? (int) $data['size'] : null;
        $color = !empty($data['color']) ? $data['color'] : null;

        $stmt = $pdo->prepare('INSERT INTO books (title, author, genres, year, is_gift, is_wishlist, page_count, size, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$title, $author, json_encode($genres), $year, $is_gift, $is_wishlist, $page_count, $size, $color]);

        echo json_encode(['id' => (int) $pdo->lastInsertId(), 'success' => true]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = (int) ($data['id'] ?? 0);

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requis']);
            exit;
        }

        $allowed = ['title', 'author', 'genres', 'page_count', 'color', 'size', 'rating', 'is_read', 'is_gift', 'year'];
        $fields = [];
        $values = [];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                if ($field === 'genres') {
                    $fields[] = "$field = ?";
                    $values[] = json_encode($data[$field]);
                } else {
                    $fields[] = "$field = ?";
                    $values[] = $data[$field];
                }
            }
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'Aucun champ à mettre à jour']);
            exit;
        }

        $values[] = $id;
        $sql = "UPDATE books SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($values);

        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = (int) ($data['id'] ?? 0);

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requis']);
            exit;
        }

        $stmt = $pdo->prepare('DELETE FROM books WHERE id = ?');
        $stmt->execute([$id]);

        echo json_encode(['success' => $stmt->rowCount() > 0]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
}
