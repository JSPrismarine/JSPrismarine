import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { readBedrockSchemas } from './bedrockSchemas';
import { bedrockSchemaValidator } from './bedrockSchemaValidator';

/**
 * A fixture shaped like Mojang's publication: a root document per format
 * version, `$ref`s to sibling files by percent-encoded relative path, and a
 * union written as `oneOf` whose arms overlap, which is the shape that makes
 * the real schemas unsatisfiable when read literally.
 */
const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const schemaRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-schema-validator-'));
    temporaryDirs.push(root);

    const write = (path: string, schema: Record<string, unknown>): void => {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(join(absolute, '..'), { recursive: true });
        writeFileSync(
            absolute,
            JSON.stringify({ $id: `/${path.split('/').map(encodeURIComponent).join('/')}`, ...schema })
        );
    };

    write('server/entity/1.21.0/ActorDocument.json', {
        type: 'object',
        required: ['description'],
        properties: {
            description: { type: 'object', required: ['identifier'], properties: { identifier: { type: 'string' } } },
            components: { $ref: './Entity%20component%20definitions.json' }
        }
    });
    write('server/entity/1.21.0/Entity component definitions.json', {
        type: 'object',
        properties: {
            'minecraft:health': { type: 'object', properties: { value: { type: 'integer' } } },
            'minecraft:despawn': { $ref: '../../common/1.21.0/Filter%20Group.json' }
        }
    });
    // Mojang's own overlap: a test object matches both the test arm and the
    // open group-map arm, so `oneOf` admits neither.
    write('server/common/1.21.0/Filter Group.json', {
        oneOf: [
            { type: 'object', required: ['test'], properties: { test: { type: 'string' } } },
            { type: 'object', properties: { all_of: { type: 'array' } } }
        ]
    });
    write('server/block/1.21.0/Blocks.json', {
        type: 'object',
        properties: { permutations: { type: 'array' } }
    });
    return root;
};

const validator = bedrockSchemaValidator(readBedrockSchemas(schemaRoot()));

const entity = (wrapper: Record<string, unknown>, formatVersion = '1.21.0') => ({
    registry: 'entities' as const,
    path: 'entities/thing.json',
    data: { format_version: formatVersion, 'minecraft:entity': wrapper }
});

describe('bedrockSchemaValidator', () => {
    it('accepts a definition the schema allows', () => {
        const findings = validator(
            entity({ description: { identifier: 'fixture:thing' }, components: { 'minecraft:health': { value: 10 } } })
        );
        expect(findings).toEqual([]);
    });

    it('names the field and the reason when a value has the wrong type', () => {
        const findings = validator(
            entity({
                description: { identifier: 'fixture:thing' },
                components: { 'minecraft:health': { value: 'ten' } }
            })
        );
        expect(findings).toEqual([
            {
                severity: 'error',
                code: 'definition.schema',
                message: '/minecraft:entity/components/minecraft:health/value must be integer'
            }
        ]);
    });

    it('names a missing required key', () => {
        expect(validator(entity({ components: {} }))).toEqual([
            {
                severity: 'error',
                code: 'definition.schema',
                message: "/minecraft:entity must have required property 'description'"
            }
        ]);
    });

    it('reads an overlapping Mojang oneOf as anyOf, so a plain filter test passes', () => {
        // Read as written, the test object matches both arms and `oneOf`
        // rejects it, which is why the real vanilla pack reports 347
        // violations without this rewrite.
        const findings = validator(
            entity({
                description: { identifier: 'fixture:thing' },
                components: { 'minecraft:despawn': { test: 'is_family' } }
            })
        );
        expect(findings).toEqual([]);
    });

    it('still rejects a value no arm of the union allows', () => {
        const findings = validator(
            entity({ description: { identifier: 'fixture:thing' }, components: { 'minecraft:despawn': 7 } })
        );
        expect(findings).not.toEqual([]);
        expect(
            findings.every((finding) => finding.message.startsWith('/minecraft:entity/components/minecraft:despawn'))
        ).toBe(true);
    });

    it('checks nothing for a file older than every published schema', () => {
        // The 54 vanilla spawn rules at format_version 1.8.0 are this case.
        expect(validator(entity({}, '1.8.0'))).toEqual([]);
    });

    it('checks nothing for a registry Mojang publishes no root document for', () => {
        expect(validator({ registry: 'recipes', path: 'recipes/a.json', data: { format_version: '1.21.0' } })).toEqual(
            []
        );
    });

    it('leaves a missing wrapper to the structural validator', () => {
        expect(
            validator({ registry: 'entities', path: 'entities/a.json', data: { format_version: '1.21.0' } })
        ).toEqual([]);
    });

    it('validates a registry whose document describes the whole file', () => {
        const findings = validator({
            registry: 'blocks',
            path: 'blocks/a.json',
            data: { format_version: '1.21.0', 'minecraft:block': { permutations: {} } }
        });
        expect(findings).toEqual([
            { severity: 'error', code: 'definition.schema', message: '/minecraft:block/permutations must be array' }
        ]);
    });

    it('summarizes the violations past the limit instead of listing them', () => {
        const limited = bedrockSchemaValidator(readBedrockSchemas(schemaRoot()), { limit: 1, severity: 'warning' });
        const findings = limited(
            entity({ description: { identifier: 1 }, components: { 'minecraft:health': { value: 'ten' } } })
        );
        expect(findings).toEqual([
            expect.objectContaining({ severity: 'warning', code: 'definition.schema' }),
            expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/^and \d+ further/) })
        ]);
    });
});
