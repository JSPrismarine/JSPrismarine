import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcdocValidator } from './mcdocValidator';
import type { DefinitionValidator } from './validation';

/**
 * A one-module mcdoc fixture rather than the real `vanilla-mcdoc`, so these
 * run without the fetched cache. The dispatch target and the release gating
 * are the same machinery the full schema set uses; the corpus run against
 * the real schemas lives in `vanillaDatapack.test.ts`.
 */
const FIXTURE = `
#[since="1.21"]
dispatch minecraft:resource[damage_type] to struct DamageType {
	message_id: string,
	exhaustion: float,
	scaling: ("never" | "when_caused_by_living_non_player" | "always"),
	#[since="26.0"]
	death_message_type?: ("default" | "fall_variants" | "intentional_game_design"),
}
`;

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const schemaRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-mcdoc-'));
    temporaryDirs.push(root);
    mkdirSync(join(root, 'java', 'data'), { recursive: true });
    writeFileSync(join(root, 'java', 'data', 'damage_type.mcdoc'), FIXTURE);
    return root;
};

const damageType = (data: unknown) => ({
    registry: 'damageTypes' as const,
    path: 'data/fixture/damage_type/laser.json',
    data
});

const valid = { message_id: 'laser', exhaustion: 0.1, scaling: 'never' };

describe('createMcdocValidator', () => {
    let validator: DefinitionValidator;
    beforeAll(async () => {
        validator = await createMcdocValidator({ root: schemaRoot() });
    }, 60_000);

    it('accepts a definition the schema allows', () => {
        expect(validator(damageType(valid))).toEqual([]);
    });

    it('names the field and the reason when a value has the wrong type', () => {
        expect(validator(damageType({ ...valid, exhaustion: 'lots' }))).toEqual([
            { severity: 'warning', code: 'definition.schema', message: '/exhaustion Expected a float' }
        ]);
    });

    it('names a missing required key', () => {
        const { message_id: _dropped, ...withoutMessage } = valid;
        expect(validator(damageType(withoutMessage))).toEqual([
            { severity: 'warning', code: 'definition.schema', message: '/ Missing key “message_id”' }
        ]);
    });

    it('names a value outside the allowed set', () => {
        expect(validator(damageType({ ...valid, scaling: 'sometimes' }))).toEqual([
            {
                severity: 'warning',
                code: 'definition.schema',
                message: '/scaling Expected “never”, “when_caused_by_living_non_player”, or “always”'
            }
        ]);
    });

    it('reports an unknown key without making the definition fail to load', () => {
        expect(validator(damageType({ ...valid, exhaustionn: 0.1 }))).toEqual([
            { severity: 'warning', code: 'definition.schema', message: '/exhaustionn Unknown key “exhaustionn”' }
        ]);
    });

    it('reads a finding as an error when the caller asks for the strict reading', async () => {
        const strict = await createMcdocValidator({ root: schemaRoot(), severity: 'error' });
        expect(strict(damageType({ ...valid, exhaustion: 'lots' }))).toEqual([
            { severity: 'error', code: 'definition.schema', message: '/exhaustion Expected a float' }
        ]);
        // An unknown key stays a warning whatever the caller asks for, so an
        // unrecognized field never keeps a definition from loading.
        expect(strict(damageType({ ...valid, extra: 1 }))).toEqual([expect.objectContaining({ severity: 'warning' })]);
    }, 60_000);

    it('gates a field on the release', async () => {
        const old = await createMcdocValidator({ root: schemaRoot(), release: '1.21' });
        expect(validator(damageType({ ...valid, death_message_type: 'default' }))).toEqual([]);
        expect(old(damageType({ ...valid, death_message_type: 'default' }))).toEqual([
            expect.objectContaining({ message: expect.stringContaining('Unknown key') })
        ]);
    }, 60_000);

    it('rejects a root with no schemas', () => {
        const empty = mkdtempSync(join(tmpdir(), 'jsp-mcdoc-empty-'));
        temporaryDirs.push(empty);
        return expect(createMcdocValidator({ root: empty })).rejects.toThrow(/no \.mcdoc files/);
    });
});
