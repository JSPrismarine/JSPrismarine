import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Imported so a change to any generated file selects this suite under `vitest --changed`.
import { SCRIPT_MODULE_HISTORIES } from '../../src/generated/scriptModules.ts';
import { emitShape } from './emit.mts';
import { generateShape } from './generate.mts';
import { directorySource, findScriptModules, readSamplesPin } from './locate.mts';
import { SHAPE_OVERRIDES } from './overrides.mts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const metadata = await findScriptModules();

describe.skipIf(metadata === undefined)('the checked-in Script API shape', { tags: ['real-data'] }, () => {
    it('is what the pinned metadata generates', () => {
        const files = emitShape(
            generateShape(directorySource(metadata ?? ''), { overrides: SHAPE_OVERRIDES }),
            readSamplesPin()
        );
        expect(Object.keys(SCRIPT_MODULE_HISTORIES).length).toBe(files.size - 2);
        for (const [file, content] of files) {
            expect(readFileSync(join(packageDir, file), 'utf8'), `${file} is stale: run generate:shape`).toBe(content);
        }
    });
});
