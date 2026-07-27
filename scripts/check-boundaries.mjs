import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(projectRoot, 'src');

const forbiddenDependencies = {
  application: new Set(['infrastructure', 'interfaces']),
  domain: new Set(['application', 'config', 'infrastructure', 'interfaces']),
  infrastructure: new Set(['interfaces']),
};

async function findTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? findTypeScriptFiles(path) : path;
    }),
  );

  return nested.flat().filter((path) => extname(path) === '.ts');
}

function layerFor(path) {
  const sourceRelative = relative(sourceRoot, path);
  return sourceRelative.split(sep)[0];
}

function importedLayer(file, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const resolvedImport = resolve(file, '..', specifier);
  const sourceRelative = relative(sourceRoot, resolvedImport);
  if (sourceRelative.startsWith('..')) return undefined;
  return sourceRelative.split(sep)[0];
}

const violations = [];
for (const file of await findTypeScriptFiles(sourceRoot)) {
  const sourceLayer = layerFor(file);
  const forbidden = forbiddenDependencies[sourceLayer];
  if (!forbidden) continue;

  const content = await readFile(file, 'utf8');
  const imports = content.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g);
  for (const match of imports) {
    const targetLayer = importedLayer(file, match[1]);
    if (targetLayer && forbidden.has(targetLayer)) {
      violations.push(
        `${relative(projectRoot, file)} (${sourceLayer}) must not import ${targetLayer}: ${match[1]}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Module boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Module boundaries: PASS');
}
