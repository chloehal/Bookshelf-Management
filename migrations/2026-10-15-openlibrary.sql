-- Installation existante : exécuter UNE SEULE FOIS avant de déployer le nouveau frontend.
-- Les données et colonnes existantes sont conservées.
ALTER TABLE books
  ADD COLUMN isbn VARCHAR(13) DEFAULT NULL,
  ADD COLUMN publisher VARCHAR(255) DEFAULT NULL,
  ADD COLUMN published_date VARCHAR(100) DEFAULT NULL,
  ADD COLUMN cover_url VARCHAR(255) DEFAULT NULL,
  ADD COLUMN metadata_source VARCHAR(30) DEFAULT NULL,
  ADD COLUMN metadata_source_id VARCHAR(50) DEFAULT NULL,
  ADD COLUMN metadata_snapshot JSON DEFAULT NULL,
  ADD COLUMN metadata_linked_at TIMESTAMP NULL DEFAULT NULL,
  ADD UNIQUE INDEX books_isbn_unique (isbn),
  ADD UNIQUE INDEX books_metadata_source_unique (metadata_source, metadata_source_id);
