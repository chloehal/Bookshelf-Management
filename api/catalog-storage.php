<?php
require_once __DIR__ . '/catalog-lib.php';
class CatalogImportException extends RuntimeException {}

function catalog_import(PDO $pdo, array $data) {
    $candidate = catalog_validate($data['candidate'] ?? null);
    try {
        $pdo->beginTransaction();
        $id = (int) ($data['id'] ?? 0);
        if ($id) {
            $stmt = $pdo->prepare('SELECT * FROM books WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $local = $stmt->fetch();
            if (!$local) throw new CatalogImportException('Livre introuvable', 404);
            if (catalog_values($local) !== ($data['expected'] ?? null)) {
                throw new CatalogImportException('Cette fiche a changé. Ferme la comparaison et relance la recherche pour comparer les dernières valeurs.', 409);
            }
            $values = catalog_merge($local, $candidate, $data['choices'] ?? []);
        } else {
            $edited = $candidate;
            foreach (CATALOG_FIELDS as $key) {
                if (array_key_exists($key, $data['values'] ?? [])) $edited[$key] = $data['values'][$key];
            }
            $values = catalog_values(catalog_validate($edited));
        }
        if (empty($values['title']) || empty($values['author']) || empty($values['genres'])) {
            throw new InvalidArgumentException('Titre, auteur et au moins un genre requis');
        }
        // Protect against two records for the same edition, including legacy ISBN-10.
        $stmt = $pdo->prepare('SELECT id, title, isbn, metadata_source_id FROM books WHERE id <> ? AND (isbn IS NOT NULL OR metadata_source_id = ?) FOR UPDATE');
        $stmt->execute([$id, $candidate['source_id']]);
        foreach ($stmt->fetchAll() as $other) {
            $otherIsbn = null;
            try { if ($other['isbn']) $otherIsbn = catalog_isbn($other['isbn']); } catch (InvalidArgumentException $e) {}
            if ($other['metadata_source_id'] === $candidate['source_id'] || ($candidate['isbn'] && $otherIsbn === $candidate['isbn']) || ($values['isbn'] && $otherIsbn === $values['isbn'])) {
                throw new CatalogImportException('Cette édition existe déjà : ' . $other['title'], 409);
            }
        }
        if ($id) {
            $stmt = $pdo->prepare('SELECT id, current_page FROM currently_reading WHERE book_id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $reading = $stmt->fetch();
            if ($reading) {
                $page = (int) $reading['current_page'];
                // Legacy fiches displayed the sum of the reading log. Adopt that
                // displayed position once when linking; linked fiches store position separately.
                if (empty($local['metadata_source'])) {
                    $stmt = $pdo->prepare('SELECT COALESCE(SUM(pages_read), 0) FROM reading_log WHERE book_id = ?');
                    $stmt->execute([$id]);
                    $page = (int) $stmt->fetchColumn();
                }
                $page = catalog_convert_progress($page, $local['page_count'], $values['page_count']);
                $stmt = $pdo->prepare('UPDATE currently_reading SET current_page = ? WHERE book_id = ?');
                $stmt->execute([$page, $id]);
                // Edition conversion is not reading activity: leave reading_log untouched.
            }
        }
        $columns = CATALOG_FIELDS;
        $params = array_map(fn($key) => $key === 'genres' ? json_encode($values[$key], JSON_UNESCAPED_UNICODE) : $values[$key], $columns);
        array_push($params, 'openlibrary', $candidate['source_id'], json_encode($candidate, JSON_UNESCAPED_UNICODE));
        if ($id) {
            $set = implode(', ', array_map(fn($key) => "$key = ?", $columns));
            $stmt = $pdo->prepare("UPDATE books SET $set, metadata_source = ?, metadata_source_id = ?, metadata_snapshot = ?, metadata_linked_at = CURRENT_TIMESTAMP WHERE id = ?");
            $params[] = $id;
        } else {
            $names = implode(', ', $columns);
            $marks = implode(', ', array_fill(0, count($columns), '?'));
            $stmt = $pdo->prepare("INSERT INTO books ($names, metadata_source, metadata_source_id, metadata_snapshot, metadata_linked_at) VALUES ($marks, ?, ?, ?, CURRENT_TIMESTAMP)");
        }
        $stmt->execute($params);
        if (!$id) $id = (int) $pdo->lastInsertId();
        $pdo->commit();
        return ['success' => true, 'id' => $id];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
