import test from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageBackend } from "../scripts/package-backend.mjs";

test("the published output includes PHP endpoints and generates configuration without copying a private local config", async () => {
  const root = await mkdtemp(join(tmpdir(), "bookshelf-package-"));
  try {
    await mkdir(join(root, "api"));
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "api", "books.php"), '<?php echo "books";');
    await writeFile(join(root, "api", "config.php"), "PRIVATE LOCAL CONFIG");
    await writeFile(join(root, ".htaccess"), "Options -Indexes");
    await packageBackend({
      root,
      env: {
        DB_NAME: "test",
        DB_USER: "reader",
        DB_PASSWORD: "password'with$symbols",
      },
    });
    assert.match(
      await readFile(join(root, "dist/api/books.php"), "utf8"),
      /books/,
    );
    const config = await readFile(join(root, "dist/api/config.php"), "utf8");
    assert.doesNotMatch(config, /PRIVATE LOCAL CONFIG/);
    assert.match(config, /base64_decode/);
    assert.equal(
      spawnSync("php", ["-l", join(root, "dist/api/config.php")], {
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(
      await readFile(join(root, "dist/.htaccess"), "utf8"),
      "Options -Indexes",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("missing build credentials produce a clear JSON response rather than a missing config fatal error", async () => {
  const root = await mkdtemp(join(tmpdir(), "bookshelf-package-"));
  try {
    await mkdir(join(root, "api"));
    await writeFile(join(root, ".htaccess"), "Options -Indexes");
    await packageBackend({ root, env: {} });
    const config = await readFile(join(root, "dist/api/config.php"), "utf8");
    assert.match(config, /Configuration BDD manquante/);
    assert.match(config, /http_response_code\(503\)/);
    const result = spawnSync("php", [join(root, "dist/api/config.php")], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(
      JSON.parse(result.stdout).error,
      /Configuration BDD manquante/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
