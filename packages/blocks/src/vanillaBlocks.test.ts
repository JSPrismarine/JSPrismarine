import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { load } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../.test/reportProgress';

import { BLOCK_COMPONENT_NAMES } from './components';
import { resolveBlocks } from './types';

/**
 * Loads Mojang's own 98 data-driven block files out of the fetched
 * `bedrock-samples` behavior pack and checks that every one resolves with no
 * diagnostic. Needs the cache that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so
 * it only runs with JSP_VANILLA_BLOCKS set.
 */

const enabled = !!process.env.JSP_VANILLA_BLOCKS;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

/** The `bedrock-samples` behavior pack directory, whose folder name carries a commit hash. */
const vanillaBehaviorPack = (): string => {
    const root = join(cacheRoot, 'bedrock-samples');
    for (const version of readdirSync(root)) {
        const unpacked = join(root, version, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'blocks'))) return pack;
        }
    }
    throw new Error(`no bedrock-samples behavior pack under ${root}; run the bedrock-data fetch:sources script`);
};

describe.skipIf(!enabled)("Mojang's own data-driven blocks", { tags: ['real-data'] }, () => {
    it('loads the behavior-pack block files with no error', { timeout: 60_000 }, () => {
        const { definitions, diagnostics } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        reportProgress(`${definitions.blocks.size} vanilla data-driven block definitions loaded.`);
    });

    it('resolves every one with no diagnostic, and reports the components they use', { timeout: 60_000 }, () => {
        const { definitions } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);
        const resolved = resolveBlocks(definitions.blocks.values());

        expect(resolved.diagnostics).toEqual([]);
        expect([...resolved.types.keys()].sort()).toEqual([...definitions.blocks.keys()].sort());

        const used = new Map<string, number>();
        for (const type of resolved.types.values()) {
            for (const entry of type.definition.components) used.set(entry.name, (used.get(entry.name) ?? 0) + 1);
        }
        const inPermutations = new Set(
            [...resolved.types.values()].flatMap((type) =>
                type.definition.permutations.flatMap((permutation) => permutation.components.map((entry) => entry.name))
            )
        );

        expect([...inPermutations].filter((name) => !used.has(name))).toEqual(['minecraft:transformation']);

        const unimplemented = [...used.keys(), ...inPermutations].filter(
            (name) => !BLOCK_COMPONENT_NAMES.includes(name)
        );
        reportProgress(
            `${used.size} vanilla block component types used; ${unimplemented.length} are not registered (${unimplemented.join(', ') || 'none'}).`
        );
    });

    it('reads the undocumented block archetype out of every file', { timeout: 60_000 }, () => {
        const { definitions } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);
        const resolved = resolveBlocks(definitions.blocks.values());

        const archetypes = new Map<string, number>();
        for (const type of resolved.types.values()) {
            const archetype = type.definition.description.internalVanillaData?.blockArchetype;
            expect(archetype).toBeDefined();
            archetypes.set(archetype!, (archetypes.get(archetype!) ?? 0) + 1);
        }

        reportProgress(
            `Vanilla block archetypes: ${[...archetypes]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([name, count]) => `${name}=${count}`)
                .join(', ')}.`
        );
    });

    it('applies the shelf mushroom growth and direction permutations', { timeout: 60_000 }, () => {
        const { definitions } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);
        const resolved = resolveBlocks(definitions.blocks.values());

        const mushroom = resolved.types.get('minecraft:shelf_mushroom');
        expect(mushroom).toBeDefined();
        if (mushroom === undefined) throw new Error('the vanilla pack declares no shelf mushroom');
        expect(mushroom.definition.permutations.length).toBeGreaterThan(0);
        expect(mushroom.model.names()).toEqual(['growth', 'minecraft:cardinal_direction']);
        const baseGrowth = mushroom.state({ growth: 0, 'minecraft:cardinal_direction': 'north' }).permutations;
        const grownFacing = mushroom.state({ growth: 1, 'minecraft:cardinal_direction': 'east' }).permutations;

        expect(baseGrowth.length).toBeGreaterThan(0);
        expect(grownFacing.length).toBeGreaterThan(baseGrowth.length);
    });
});
