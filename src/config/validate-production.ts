import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  productionSecretNames,
  type ProductionSecretName,
  validateProductionDeployment,
} from './production-deployment.js';

function parseEnvironmentFile(path: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [index, rawLine] of readFileSync(path, 'utf8').split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match?.[1] || match[2] === undefined) {
      throw new Error(`Invalid environment line ${index + 1}`);
    }
    const rawValue = match[2].trim();
    const quoted = /^(?:"([^"]*)"|'([^']*)')$/u.exec(rawValue);
    result[match[1]] = quoted ? (quoted[1] ?? quoted[2] ?? '') : rawValue;
  }
  return result;
}

const environmentFile = process.argv[2];
if (!environmentFile) throw new Error('Usage: validate-production ENV_FILE');
const settings = parseEnvironmentFile(environmentFile);
const secretDirectory = settings.MCK_SECRET_DIR ?? '';
const secrets = Object.fromEntries(
  productionSecretNames.map((name) => {
    try {
      const path = join(secretDirectory, name);
      if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0) {
        throw new Error('permissions');
      }
      return [name, readFileSync(path, 'utf8')];
    } catch {
      throw new Error(`Secret file unavailable or unsafe: ${name}`);
    }
  }),
) as Record<ProductionSecretName, string>;

validateProductionDeployment({ secrets, settings });
console.log('Production deployment configuration: PASS');
