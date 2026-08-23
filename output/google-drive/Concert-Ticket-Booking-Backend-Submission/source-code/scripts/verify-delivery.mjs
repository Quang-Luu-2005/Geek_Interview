import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];

function pass(name, detail) {
  checks.push({ name, detail });
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
}

function read(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(join(repositoryRoot, relativePath));
}

const requiredFiles = [
  '.env.example',
  'package-lock.json',
  'README.md',
  'docs/FINAL_QA.md',
  'openapi/openapi.yaml',
  'postman/local.environment.json',
  'postman/customer-apis.collection.json',
  'postman/operation-apis.collection.json',
];
for (const file of requiredFiles) {
  if (exists(file)) pass('delivery file', file);
  else fail('delivery file', file);
}

const expectedRoutes = [
  '/health',
  '/health/live',
  '/health/ready',
  '/metrics',
  '/api/concerts',
  '/api/concerts/{id}',
  '/api/concerts/{id}/ticket-categories',
  '/api/me/bookings',
  '/api/bookings',
  '/api/bookings/{id}',
  '/api/bookings/{id}/confirm',
  '/api/bookings/{id}/cancel',
  '/api/admin/bookings',
  '/api/admin/bookings/{id}',
  '/api/admin/bookings/{id}/status',
  '/api/admin/concerts',
  '/api/admin/concerts/{id}/ticket-categories',
  '/api/admin/concerts/{id}/publish',
  '/api/admin/vouchers',
];
const openapi = read('openapi/openapi.yaml');
const openapiPaths = new Set([...openapi.matchAll(/^  (\/[^:]+):$/gm)].map((match) => match[1]));
for (const route of expectedRoutes) {
  if (openapiPaths.has(route)) pass('OpenAPI route parity', route);
  else fail('OpenAPI route parity', `missing ${route}`);
}

function collectRequests(items, result = []) {
  for (const item of items || []) {
    if (item.request?.url) result.push(item.request.url);
    collectRequests(item.item, result);
  }
  return result;
}

function normalizePostmanUrl(url) {
  const raw = typeof url === 'string' ? url : url.raw;
  const withoutBase = raw.replace(/^\{\{baseUrl\}\}/, '');
  const path = withoutBase.split('?')[0];
  return path.replace(/\{\{[^}]+\}\}/g, '{id}');
}

for (const collectionPath of [
  'postman/customer-apis.collection.json',
  'postman/operation-apis.collection.json',
]) {
  const collection = JSON.parse(read(collectionPath));
  for (const url of collectRequests(collection.item)) {
    const normalized = normalizePostmanUrl(url);
    const matches = [...openapiPaths].some((route) => {
      const pattern = new RegExp(`^${route.replaceAll('{id}', '[^/]+')}$`);
      return pattern.test(normalized);
    });
    if (matches) pass('Postman/OpenAPI parity', `${collectionPath}: ${normalized}`);
    else fail('Postman/OpenAPI parity', `${collectionPath}: ${normalized}`);
  }
}

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const forbiddenTracked = tracked.filter((file) =>
  /(^|[\\/])(?:\.env$|node_modules[\\/]|dist[\\/]|coverage[\\/]|pgdata[\\/]|postgres-data[\\/])|(?:\.pem|\.key|\.p12)$/i.test(
    file,
  ),
);
if (forbiddenTracked.length > 0) fail('tracked hygiene', forbiddenTracked.join(', '));
else pass('tracked hygiene', 'no local env, dependency, build, database or key artifacts');

const trackedContent = tracked
  .filter((file) => /\.(md|mjs|cjs|ts|json|yaml|yml|sql|tex|example)$/.test(file))
  .map((file) => read(file))
  .join('\n');
const secretPattern =
  /-----BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY-----|(?:AKIA|ASIA)[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,}/;
if (secretPattern.test(trackedContent)) fail('secret scan', 'private key or token signature found');
else pass('secret scan', 'no private key or common cloud/API token signature');

const packageJson = JSON.parse(read('package.json'));
const lockfile = JSON.parse(read('package-lock.json'));
if (lockfile.packages?.['']?.version === packageJson.version) {
  pass('lockfile parity', packageJson.version);
} else {
  fail('lockfile parity', 'package.json and package-lock.json root versions differ');
}

if (failures.length > 0) {
  console.error(`Delivery verification failed (${failures.length} issue(s))`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Delivery verification passed (${checks.length} checks)`);
  checks.forEach(({ name, detail }) => console.log(`PASS  ${name}: ${detail}`));
}
