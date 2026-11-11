import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withJsExtensions } from './declaration-specifiers.mts';

let dist: string;

beforeEach(() => {
    dist = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'jsp-dts-specifiers-')));
});

afterEach(() => {
    fs.rmSync(dist, { recursive: true, force: true });
});

const declare = (...files: string[]): void => {
    for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
        fs.writeFileSync(path.join(dist, file), '');
    }
};

describe('withJsExtensions', () => {
    it('names the built module for a re-export of a sibling file', () => {
        declare('logger.d.ts');

        expect(withJsExtensions("export * from './logger';", path.join(dist, 'index.d.ts'))).toBe(
            "export * from './logger.js';"
        );
    });

    it('names the index module for a directory import', () => {
        declare('network/index.d.ts');

        expect(withJsExtensions('import { Codec } from "../network";', path.join(dist, 'world', 'World.d.ts'))).toBe(
            'import { Codec } from "../network/index.js";'
        );
    });

    it('rewrites import() types and module augmentations', () => {
        declare('Server.d.ts');
        const source = "type S = import('./Server').default;\ndeclare module './Server' {}";

        expect(withJsExtensions(source, path.join(dist, 'index.d.ts'))).toBe(
            "type S = import('./Server.js').default;\ndeclare module './Server.js' {}"
        );
    });

    it('replaces a .ts or .json extension with the built .js module', () => {
        declare('levels.d.ts', 'data.d.ts');
        const source = "import { a } from './levels.ts';\nimport data from './data.json';";

        expect(withJsExtensions(source, path.join(dist, 'index.d.ts'))).toBe(
            "import { a } from './levels.js';\nimport data from './data.js';"
        );
    });

    it('leaves package imports, .js specifiers and unresolved paths alone', () => {
        const source =
            "import { Logger } from '@jsprismarine/logger';\nexport * from './done.js';\nexport * from './missing';";

        expect(withJsExtensions(source, path.join(dist, 'index.d.ts'))).toBe(source);
    });
});
