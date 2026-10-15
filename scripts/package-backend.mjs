import { cp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

export async function packageBackend({
  root = process.cwd(),
  env = process.env,
} = {}) {
  const destination = join(root, "dist", "api");
  await mkdir(destination, { recursive: true });
  await cp(join(root, "api"), destination, {
    recursive: true,
    filter: (source) => basename(source) !== "config.php",
  });
  await cp(join(root, ".htaccess"), join(root, "dist", ".htaccess"));
  const ready = Boolean(env.DB_NAME && env.DB_USER && env.DB_PASSWORD);
  let config;
  if (ready) {
    // Serialized data avoids PHP/shell interpolation of quotes, dollar signs or newlines.
    const encoded = Buffer.from(
      JSON.stringify({
        host: env.DB_HOST || "localhost",
        name: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
      }),
    ).toString("base64");
    config = `<?php
header('Content-Type: application/json; charset=utf-8');
$settings = json_decode(base64_decode('${encoded}'), true);
try {
    $pdo = new PDO('mysql:host=' . $settings['host'] . ';dbname=' . $settings['name'] . ';charset=utf8mb4', $settings['user'], $settings['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(503);
    echo json_encode(['error' => 'Connexion BDD échouée. Vérifie les variables DB_HOST, DB_NAME, DB_USER et DB_PASSWORD du déploiement.']);
    exit;
}
unset($settings);
`;
  } else {
    config = `<?php
header('Content-Type: application/json; charset=utf-8');
http_response_code(503);
echo json_encode(['error' => 'Configuration BDD manquante : renseigne DB_NAME, DB_USER et DB_PASSWORD dans les variables du build Hostinger, puis redéploie.']);
exit;
`;
  }
  await writeFile(join(destination, "config.php"), config, { mode: 0o600 });
  return { configured: ready };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await packageBackend();
  console.log(
    result.configured
      ? "API PHP incluse ; configuration BDD générée."
      : "API PHP incluse ; variables BDD absentes : le serveur retournera un message de configuration explicite.",
  );
}
