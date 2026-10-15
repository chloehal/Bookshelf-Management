<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/catalog-storage.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Méthode non autorisée']); exit; }
try {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) throw new InvalidArgumentException('Requête invalide');
    echo json_encode(catalog_import($pdo, $data));
} catch (CatalogImportException $e) {
    http_response_code($e->getCode()); echo json_encode(['error' => $e->getMessage(), 'code' => 'conflict']);
} catch (InvalidArgumentException $e) {
    http_response_code(400); echo json_encode(['error' => $e->getMessage()]);
} catch (PDOException $e) {
    if (($e->errorInfo[1] ?? null) === 1062) {
        http_response_code(409); echo json_encode(['error' => 'Cette édition ou cet ISBN est déjà enregistré. Recharge la bibliothèque.', 'code' => 'conflict']);
    } else {
        http_response_code(500); echo json_encode(['error' => 'Enregistrement impossible. Vérifie que les migrations de la base sont à jour, puis réessaie.']);
    }
} catch (Throwable $e) {
    http_response_code(500); echo json_encode(['error' => 'Enregistrement impossible. Réessaie.']);
}
