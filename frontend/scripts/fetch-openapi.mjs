/**
 * Fetches the OpenAPI JSON schema from the running FastAPI backend
 * and writes it to src/types/openapi.json for use by openapi-typescript.
 *
 * Usage: node scripts/fetch-openapi.mjs [API_URL]
 * Default API_URL: http://localhost:5009
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.argv[2] || process.env.VITE_API_ROOT || 'http://localhost:5009';
const OPENAPI_URL = `${BASE_URL}/openapi.json`;
const OUTPUT_PATH = join(__dirname, '..', 'src', 'types', 'openapi.json');

console.log(`\n📡  Fetching OpenAPI schema from ${OPENAPI_URL} …`);

try {
  const res = await fetch(OPENAPI_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const schema = await res.json();

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(schema, null, 2), 'utf-8');

  const pathCount = Object.keys(schema.paths || {}).length;
  const schemaCount = Object.keys(schema.components?.schemas || {}).length;
  console.log(`✅  Schema saved to src/types/openapi.json`);
  console.log(`    ${pathCount} paths · ${schemaCount} component schemas\n`);
} catch (err) {
  console.error(`\n❌  Failed to fetch OpenAPI schema: ${err.message}`);
  console.error(`    Make sure the backend is running at ${BASE_URL}\n`);
  process.exit(1);
}
