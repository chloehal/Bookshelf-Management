<?php
require_once __DIR__ . '/config.php';

$migrations = [
    "ALTER TABLE books ADD COLUMN cover_url VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN isbn VARCHAR(13) DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN publisher VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN published_date VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN metadata_source VARCHAR(30) DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN metadata_source_id VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN metadata_snapshot JSON DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN metadata_linked_at TIMESTAMP NULL DEFAULT NULL",
    "ALTER TABLE books ADD COLUMN is_wishlist TINYINT(1) NOT NULL DEFAULT 0 AFTER is_gift",
    "ALTER TABLE books ADD COLUMN rating TINYINT UNSIGNED DEFAULT NULL AFTER is_wishlist",
    "ALTER TABLE books ADD COLUMN page_count INT UNSIGNED DEFAULT NULL AFTER rating",
    "ALTER TABLE books ADD COLUMN color VARCHAR(7) DEFAULT NULL AFTER page_count",
    "ALTER TABLE books ADD COLUMN size TINYINT UNSIGNED DEFAULT NULL AFTER color",
    "CREATE UNIQUE INDEX books_isbn_unique ON books (isbn)",
    "CREATE UNIQUE INDEX books_metadata_source_unique ON books (metadata_source, metadata_source_id)",
    "CREATE TABLE IF NOT EXISTS currently_reading (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL UNIQUE,
        current_page INT NOT NULL DEFAULT 0,
        started_at DATE NOT NULL DEFAULT (CURRENT_DATE),
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )",
    "CREATE TABLE IF NOT EXISTS reading_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        pages_read INT NOT NULL,
        log_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )",
];

$results = [];

foreach ($migrations as $sql) {
    try {
        $pdo->exec($sql);
        $results[] = ['sql' => $sql, 'status' => 'OK'];
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'Duplicate column name') || str_contains($e->getMessage(), 'Duplicate key name')) {
            $results[] = ['sql' => $sql, 'status' => 'SKIP (colonne existe déjà)'];
        } else {
            $results[] = ['sql' => $sql, 'status' => 'ERROR: ' . $e->getMessage()];
        }
    }
}

// Drop is_pocket if it exists (legacy column)
try {
    $pdo->exec("ALTER TABLE books DROP COLUMN is_pocket");
    $results[] = ['sql' => 'DROP COLUMN is_pocket', 'status' => 'OK'];
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), "check that it exists")) {
        $results[] = ['sql' => 'DROP COLUMN is_pocket', 'status' => 'SKIP (colonne inexistante)'];
    } else {
        $results[] = ['sql' => 'DROP COLUMN is_pocket', 'status' => 'SKIP'];
    }
}

echo json_encode(['migrations' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
