import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const failures = [];

function pass(name, detail) {
  checks.push({ name, detail });
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
}

function requireFile(relativePath) {
  if (!existsSync(join(repositoryRoot, relativePath))) {
    fail('required file', relativePath);
    return false;
  }
  pass('required file', relativePath);
  return true;
}

function read(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), 'utf8');
}

function walk(directory) {
  const absoluteDirectory = join(repositoryRoot, directory);
  const files = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(relativePath));
    else files.push(relativePath);
  }
  return files;
}

const requiredFiles = [
  'README.md',
  'submission/README.md',
  'openapi/openapi.yaml',
  'database/migrations/0001_foundation.sql',
  'database/seeds/seed.sql',
  'docs/SYSTEM_DESIGN.md',
  'docs/DATABASE_DESIGN.md',
  'docs/ASSUMPTIONS_SCOPE_LIMITATIONS.md',
  'docs/TEST_STRATEGY.md',
  'docs/PERFORMANCE_REPORT.md',
  'docs/WOW_PLUS_POINTS.md',
  'scripts/verify-submission.mjs',
  'scripts/reviewer-smoke.mjs',
  'postman/local.environment.json',
  'postman/customer-apis.collection.json',
  'postman/operation-apis.collection.json',
  'tests/concurrency/booking-oversell.spec.ts',
  'test-results/README.md',
];
requiredFiles.forEach(requireFile);

for (const relativePath of [
  'postman/local.environment.json',
  'postman/customer-apis.collection.json',
  'postman/operation-apis.collection.json',
]) {
  try {
    JSON.parse(read(relativePath));
    pass('valid JSON', relativePath);
  } catch (error) {
    fail('valid JSON', `${relativePath} (${error.message})`);
  }
}

const openapi = read('openapi/openapi.yaml');
for (const path of [
  '/health/live:',
  '/health/ready:',
  '/metrics:',
  '/api/bookings:',
  '/api/admin/bookings:',
]) {
  if (openapi.includes(path)) pass('OpenAPI route', path);
  else fail('OpenAPI route', `missing ${path}`);
}

const seed = read('database/seeds/seed.sql');
for (const id of [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
]) {
  if (seed.includes(id)) pass('deterministic seed ID', id);
  else fail('deterministic seed ID', `missing ${id}`);
}

const customerCollection = read('postman/customer-apis.collection.json');
for (const example of [
  'Retry same booking',
  'Voucher booking example',
  'Sold-out conflict',
]) {
  if (customerCollection.includes(example)) pass('Postman example', example);
  else fail('Postman example', `missing ${example}`);
}

const documentationFiles = [
  'README.md',
  'submission/README.md',
  ...walk('docs').filter((file) => file.endsWith('.md')),
  'postman/README.md',
];
const placeholderPattern = /TODO|<install command>|<migrate command>|<seed command>|YOUR NAME|your-account\/your-repository/;
for (const relativePath of documentationFiles) {
  const content = read(relativePath);
  const match = content.match(placeholderPattern);
  if (match) fail('documentation placeholder', `${relativePath} contains ${match[0]}`);
}
pass('documentation placeholders', 'none found in reviewer-facing Markdown');

for (const relativePath of documentationFiles) {
  const content = read(relativePath);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().split('#')[0].split('?')[0];
    if (!target || /^https?:\/\//i.test(target) || /^mailto:/i.test(target)) continue;
    target = target.replace(/^<|>$/g, '');
    const resolvedTarget = resolve(repositoryRoot, dirname(relativePath), decodeURIComponent(target));
    if (!existsSync(resolvedTarget)) fail('documentation link', `${relativePath} -> ${target}`);
  }
}
pass('documentation links', 'local Markdown targets exist');

if (failures.length > 0) {
  console.error(`Submission verification failed (${failures.length} issue(s))`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Submission verification passed (${checks.length} checks)`);
  checks.forEach(({ name, detail }) => console.log(`PASS  ${name}: ${detail}`));
}
