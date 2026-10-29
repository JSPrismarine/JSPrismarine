import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { publicIdOf } from './recipe-ids.ts';

/** The part of the datagen manifest these tests read. */
interface DatagenManifest {
    defaultProtocolVersion: number;
    versions: Record<string, { recipes?: { idAliases?: Record<string, unknown> } }>;
}

// Parsed JSON has no type the compiler can see; this is the shape the manifest documents.
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, 'manifest.json'), 'utf8')) as DatagenManifest;

const declaredAliases = (): [string, string][] =>
    Object.values(manifest.versions).flatMap((version) =>
        Object.entries(version.recipes?.idAliases ?? {}).filter(
            (entry): entry is [string, string] => !entry[0].startsWith('$') && typeof entry[1] === 'string'
        )
    );

describe('publicIdOf', () => {
    it('joins the station to the source ID', () => {
        expect(publicIdOf(undefined, 'crafting_table', 'minecraft:stick')).toBe('crafting_table/minecraft:stick');
    });

    // The aliases used to be looked up against the bare source ID while their keys carry a
    // station, so every one of them missed and the British spellings reached the output.
    it('applies a station-prefixed alias to that station only', () => {
        const aliases = { 'crafting_table/minecraft:FireCharge_coal_sulphur_recipeId': 'crafting_table/charge' };
        expect(publicIdOf(aliases, 'crafting_table', 'minecraft:FireCharge_coal_sulphur_recipeId')).toBe(
            'crafting_table/charge'
        );
        expect(publicIdOf(aliases, 'furnace', 'minecraft:FireCharge_coal_sulphur_recipeId')).toBe(
            'furnace/minecraft:FireCharge_coal_sulphur_recipeId'
        );
    });

    it('renames every alias the manifest declares', () => {
        const aliases = declaredAliases();
        expect(aliases.length).toBeGreaterThan(0);
        for (const [from, to] of aliases) {
            const [station, ...rest] = from.split('/');
            expect(publicIdOf(Object.fromEntries(aliases), station, rest.join('/'))).toBe(to);
        }
    });
});

describe('the recipe ID aliases in the datagen manifest', () => {
    it('declares keys that are published IDs, so none of them is inert', () => {
        for (const [from, to] of declaredAliases()) {
            expect(from, `${from} -> ${to}`).toContain('/');
            expect(to, `${from} -> ${to}`).toContain('/');
        }
    });
});
