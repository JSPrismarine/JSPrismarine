/**
 * Writes `dist/index.d.ts` from the definition of `@jsprismarine/server` in the script host, the
 * one the runtime builds each pack's namespace from.
 *
 * Run from the package directory.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { jsprismarineServerTypings } from '@jsprismarine/script-host/host/jsprismarineServer';

const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.d.ts'), jsprismarineServerTypings());
