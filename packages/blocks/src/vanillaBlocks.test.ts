import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { load } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

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

describe.skipIf(!enabled)("Mojang's own data-driven blocks", () => {
    it('loads all 98 files with no error', { timeout: 60_000 }, () => {
        const { definitions, diagnostics } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        expect(definitions.blocks.size).toBe(98);
    });

    it('resolves every one with no diagnostic, and reports the components they use', { timeout: 60_000 }, () => {
        const { definitions } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);
        const resolved = resolveBlocks(definitions.blocks.values());

        expect(resolved.diagnostics).toEqual([]);
        expect(resolved.types.size).toBe(98);

        const used = new Map<string, number>();
        for (const type of resolved.types.values()) {
            for (const entry of type.definition.components) used.set(entry.name, (used.get(entry.name) ?? 0) + 1);
        }
        const inPermutations = new Set(
            [...resolved.types.values()].flatMap((type) =>
                type.definition.permutations.flatMap((permutation) => permutation.components.map((entry) => entry.name))
            )
        );

        // The research note counted 20 used of Mojang's 39 public components.
        expect(used.size).toBe(20);
        expect([...inPermutations].filter((name) => !used.has(name))).toEqual(['minecraft:transformation']);

        const unimplemented = [...used.keys(), ...inPermutations].filter(
            (name) => !BLOCK_COMPONENT_NAMES.includes(name)
        );
        expect(unimplemented).toEqual([]);

        console.debug(
            `vanilla block components, by file count:\n${[...used]
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => `  ${name} ${count}`)
                .join('\n')}\n  (permutations only) ${[...inPermutations].filter((name) => !used.has(name)).join(', ')}`
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

        expect(Object.fromEntries(archetypes)).toEqual({
            slab_block: 64,
            stair_block: 32,
            bush_block: 1,
            wall_foliage_block: 1
        });
    });

    it('applies the shelf mushroom permutations, the only ones vanilla ships', { timeout: 60_000 }, () => {
        const { definitions } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);
        const resolved = resolveBlocks(definitions.blocks.values());

        const withPermutations = [...resolved.types.values()].filter((type) => type.definition.permutations.length > 0);
        expect(withPermutations.map((type) => type.identifier)).toEqual(['minecraft:shelf_mushroom']);
        // The research note says 8; the 1.26.50.4 file has 9, one per growth
        // value and one per growth and cardinal direction pair but north.
        expect(withPermutations[0]!.definition.permutations).toHaveLength(9);

        const mushroom = withPermutations[0]!;
        expect(mushroom.model.names()).toEqual(['growth', 'minecraft:cardinal_direction']);
        expect(mushroom.state({ growth: 0, 'minecraft:cardinal_direction': 'north' }).permutations).toEqual([0]);
        expect(mushroom.state({ growth: 1, 'minecraft:cardinal_direction': 'east' }).permutations).toEqual([1, 8]);
    });
});
