import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { readBedrockSchemas, selectSchema } from './bedrockSchemas';

/**
 * A fixture laid out the way bedrock-samples lays out
 * `metadata/json_schemas`: area, then format version, then the document,
 * with `$id` carrying the percent-encoded path.
 */
const fixture = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-schemas-'));
    temporaryDirs.push(root);

    const write = (path: string, schema: Record<string, unknown>): void => {
        const absolute = join(root, 'metadata', 'json_schemas', ...path.split('/'));
        mkdirSync(join(absolute, '..'), { recursive: true });
        writeFileSync(
            absolute,
            JSON.stringify({ $id: `/${path.split('/').map(encodeURIComponent).join('/')}`, ...schema })
        );
    };

    write('server/entity/1.21.0/ActorDocument.json', { type: 'object' });
    write('server/entity/1.26.50/ActorDocument.json', { type: 'object' });
    write('server/entity/beta/ActorDocument.json', { type: 'object' });
    write('server/biome/1.21.110/Biome Document.json', { type: 'object' });
    return root;
};

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('readBedrockSchemas', () => {
    it('indexes every schema by its $id and finds the subdirectory from a checkout root', () => {
        const schemas = readBedrockSchemas(fixture());

        expect(schemas.byId.has('/server/entity/1.26.50/ActorDocument.json')).toBe(true);
        // A name with a space is keyed percent-encoded, the way the `$ref`s
        // between the files write it.
        expect(schemas.byId.has('/server/biome/1.21.110/Biome%20Document.json')).toBe(true);
    });

    it('groups a document by format version, oldest first, and leaves beta out', () => {
        const schemas = readBedrockSchemas(fixture());

        expect(schemas.versionsByDocument.get('server/entity/ActorDocument.json')).toEqual([
            { version: [1, 21, 0], id: '/server/entity/1.21.0/ActorDocument.json' },
            { version: [1, 26, 50], id: '/server/entity/1.26.50/ActorDocument.json' }
        ]);
    });

    it('rejects a directory with no schemas', () => {
        const empty = mkdtempSync(join(tmpdir(), 'jsp-schemas-empty-'));
        temporaryDirs.push(empty);
        expect(() => readBedrockSchemas(empty)).toThrow(/no bedrock-samples schemas/);
    });
});

describe('selectSchema', () => {
    const schemas = readBedrockSchemas(fixture());
    const entityDocument = 'server/entity/ActorDocument.json';

    it('takes the exact version when one is published', () => {
        expect(selectSchema(schemas, entityDocument, [1, 26, 50])).toBe('/server/entity/1.26.50/ActorDocument.json');
    });

    it('takes the closest version that is not greater', () => {
        expect(selectSchema(schemas, entityDocument, [1, 26, 0])).toBe('/server/entity/1.21.0/ActorDocument.json');
        expect(selectSchema(schemas, entityDocument, [2, 0, 0])).toBe('/server/entity/1.26.50/ActorDocument.json');
    });

    it('selects nothing for a file older than every published schema', () => {
        // The alternative, checking a 1.8 spawn rule against a 1.21 schema,
        // reports fields that did not exist when the file was written.
        expect(selectSchema(schemas, entityDocument, [1, 8, 0])).toBeUndefined();
    });

    it('selects nothing without a format_version or for an unpublished document', () => {
        expect(selectSchema(schemas, entityDocument, undefined)).toBeUndefined();
        expect(selectSchema(schemas, 'server/recipe/Recipe.json', [1, 26, 50])).toBeUndefined();
    });
});
