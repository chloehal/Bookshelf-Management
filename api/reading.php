<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/catalog-lib.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $action = $_GET['action'] ?? 'current';

        if ($action === 'current') {
            // Get all currently reading books with book info
            $stmt = $pdo->query('
                SELECT cr.id, cr.book_id,
                       CASE WHEN b.metadata_source IS NULL THEN COALESCE((SELECT SUM(rl.pages_read) FROM reading_log rl WHERE rl.book_id = cr.book_id), 0) ELSE cr.current_page END AS current_page,
                       cr.started_at,
                       b.title, b.author, b.page_count, b.color, b.genres
                FROM currently_reading cr
                JOIN books b ON b.id = cr.book_id
                ORDER BY cr.started_at DESC
            ');
            $rows = $stmt->fetchAll();
            foreach ($rows as &$row) {
                $row['id'] = (int) $row['id'];
                $row['book_id'] = (int) $row['book_id'];
                $row['current_page'] = (int) $row['current_page'];
                $row['page_count'] = $row['page_count'] ? (int) $row['page_count'] : null;
                $row['genres'] = json_decode($row['genres']);
            }
            echo json_encode($rows);
        } elseif ($action === 'heatmap') {
            // Get reading log for heatmap with book details
            $stmt = $pdo->query('
                SELECT rl.log_date, rl.pages_read, b.title
                FROM reading_log rl
                JOIN books b ON b.id = rl.book_id
                ORDER BY rl.log_date ASC
            ');
            $rows = $stmt->fetchAll();

            // Group by date: {log_date, pages, books: [{title, pages}]}
            $grouped = [];
            foreach ($rows as $row) {
                $date = $row['log_date'];
                if (!isset($grouped[$date])) {
                    $grouped[$date] = ['log_date' => $date, 'pages' => 0, 'books' => []];
                }
                $grouped[$date]['pages'] += (int) $row['pages_read'];
                // Aggregate pages per book per day
                $found = false;
                foreach ($grouped[$date]['books'] as &$b) {
                    if ($b['title'] === $row['title']) {
                        $b['pages'] += (int) $row['pages_read'];
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $grouped[$date]['books'][] = ['title' => $row['title'], 'pages' => (int) $row['pages_read']];
                }
            }
            echo json_encode(array_values($grouped));
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $action = $data['action'] ?? '';
        $bookId = (int) ($data['book_id'] ?? 0);
        if (!$bookId || !in_array($action, ['start', 'update_page', 'finish', 'dnf'], true)) {
            http_response_code(400); echo json_encode(['error' => 'Livre ou action invalide']); exit;
        }
        // Serialize progress writes with edition reconciliation on the same book.
        $pdo->beginTransaction();
        $lock = $pdo->prepare('SELECT id, page_count FROM books WHERE id = ? FOR UPDATE');
        $lock->execute([$bookId]);
        $lockedBook = $lock->fetch();
        if (!$lockedBook) { $pdo->rollBack(); http_response_code(404); echo json_encode(['error' => 'Livre introuvable']); exit; }


        if ($action === 'start') {
            // Start reading a book
            $bookId = (int) ($data['book_id'] ?? 0);
            if (!$bookId) {
                http_response_code(400);
                echo json_encode(['error' => 'book_id requis']);
                exit;
            }
            $stmt = $pdo->prepare('INSERT INTO currently_reading (book_id, started_at) VALUES (?, CURDATE()) ON DUPLICATE KEY UPDATE started_at = started_at');
            $stmt->execute([$bookId]);
            echo json_encode(['success' => true]);

        } elseif ($action === 'update_page') {
            // Update current page
            $bookId = (int) ($data['book_id'] ?? 0);
            $page = (int) ($data['current_page'] ?? 0);
            if (array_key_exists('page_count_at_input', $data)) {
                // An already-open form may still use the pagination of the old edition.
                $page = catalog_convert_progress($page, $data['page_count_at_input'], $lockedBook['page_count']);
            }
            if (!$bookId) {
                http_response_code(400);
                echo json_encode(['error' => 'book_id requis']);
                exit;
            }

            // Get previous page to calculate pages read
            $stmt = $pdo->prepare('SELECT CASE WHEN b.metadata_source IS NULL THEN COALESCE((SELECT SUM(rl.pages_read) FROM reading_log rl WHERE rl.book_id = cr.book_id), 0) ELSE cr.current_page END AS current_page FROM currently_reading cr JOIN books b ON b.id = cr.book_id WHERE cr.book_id = ?');
            $stmt->execute([$bookId]);
            $prev = $stmt->fetch();
            $prevPage = $prev ? (int) $prev['current_page'] : 0;
            $pagesRead = max(0, $page - $prevPage);

            // Update current page
            $stmt = $pdo->prepare('UPDATE currently_reading SET current_page = ? WHERE book_id = ?');
            $stmt->execute([$page, $bookId]);

            // Log reading activity (only if pages were actually read)
            $logDate = !empty($data['log_date']) ? $data['log_date'] : date('Y-m-d');
            if ($pagesRead > 0) {
                $stmt = $pdo->prepare('INSERT INTO reading_log (book_id, pages_read, log_date) VALUES (?, ?, ?)');
                $stmt->execute([$bookId, $pagesRead, $logDate]);
            }

            echo json_encode(['success' => true, 'pages_read' => $pagesRead]);

        } elseif ($action === 'finish') {
            // Mark as finished: remove from currently_reading, mark as read
            $bookId = (int) ($data['book_id'] ?? 0);
            if (!$bookId) {
                http_response_code(400);
                echo json_encode(['error' => 'book_id requis']);
                exit;
            }

            // Get current page info for final log
            $stmt = $pdo->prepare('SELECT CASE WHEN b.metadata_source IS NULL THEN COALESCE((SELECT SUM(rl.pages_read) FROM reading_log rl WHERE rl.book_id = cr.book_id), 0) ELSE cr.current_page END AS current_page FROM currently_reading cr JOIN books b ON b.id = cr.book_id WHERE cr.book_id = ?');
            $stmt->execute([$bookId]);
            $prev = $stmt->fetch();
            $prevPage = $prev ? (int) $prev['current_page'] : 0;

            // Get book page count for final log entry
            $stmt = $pdo->prepare('SELECT page_count FROM books WHERE id = ?');
            $stmt->execute([$bookId]);
            $book = $stmt->fetch();
            $totalPages = $book && $book['page_count'] ? (int) $book['page_count'] : 0;

            // Log remaining pages if applicable
            if ($totalPages > $prevPage) {
                $remaining = $totalPages - $prevPage;
                $stmt = $pdo->prepare('INSERT INTO reading_log (book_id, pages_read, log_date) VALUES (?, ?, CURDATE())');
                $stmt->execute([$bookId, $remaining]);
            }

            // Remove from currently reading
            $stmt = $pdo->prepare('DELETE FROM currently_reading WHERE book_id = ?');
            $stmt->execute([$bookId]);

            // Mark book as read
            $stmt = $pdo->prepare('UPDATE books SET is_read = 1 WHERE id = ?');
            $stmt->execute([$bookId]);

            echo json_encode(['success' => true]);

        } elseif ($action === 'dnf') {
            // Did Not Finish: remove from currently_reading, keep as unread
            $bookId = (int) ($data['book_id'] ?? 0);
            if (!$bookId) {
                http_response_code(400);
                echo json_encode(['error' => 'book_id requis']);
                exit;
            }
            $stmt = $pdo->prepare('DELETE FROM currently_reading WHERE book_id = ?');
            $stmt->execute([$bookId]);
            echo json_encode(['success' => true]);
        }
        $pdo->commit();
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
}
