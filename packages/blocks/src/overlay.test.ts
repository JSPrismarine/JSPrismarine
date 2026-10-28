import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BEDROCK_ONLY_BLOCKS } from '@jsprismarine/mapping';
import { load } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { blockProperties, friction } from './components';
import { BLOCK_BEHAVIOR_NAMES, behaviorFor } from './families';
import { flattenBlockStates } from './flatten';
import { JAVA_BLOCK_PROPERTIES } from './javaProperties';
import { BEDROCK_FRICTION_CAP, generateVanillaOverlay } from './overlay';
import { vanillaBlockPalette } from './state';
import { resolveBlocks } from './types';

const packDirectory = join(import.meta.dirname, '..', 'vanilla_overlay');

const identifiers = () => vanillaBlockPalette().entries.map((entry) => entry.identifier);

const generated = () => generateVanillaOverlay(JAVA_BLOCK_PROPERTIES, identifiers());

describe('the jsprismarine_vanilla overlay generator', () => {
    it('declares one block definition for every block in the palette', () => {
        const pack = generated();
        const blocks = pack.files.filter((file) => file.path.startsWith('blocks/'));

        expect(blocks).toHaveLength(1477);
        expect(new Set(blocks.map((file) => file.path)).size).toBe(1477);
    });

    it('lists exactly the mapping package 182 Bedrock-only blocks as reviewed exceptions', () => {
        const pack = generated();

        expect(pack.exceptions).toHaveLength(182);
        expect(new Set(pack.exceptions.map((entry) => entry.identifier))).toEqual(BEDROCK_ONLY_BLOCKS);
    });

    it('gives every exception a reason rather than a silent default', () => {
        for (const exception of generated().exceptions) {
            expect(exception.reason).not.toMatch(/no group explains why/);
            expect(exception.behavior).toBeTruthy();
        }
    });

    it('marks a Bedrock-only block as a fallback and a mapped block as Java-sourced', () => {
        const pack = generated();
        const read = (name: string) =>
            JSON.parse(pack.files.find((file) => file.path === `blocks/${name}.block.json`)!.content);

        expect(read('element_1')['minecraft:block'].components['jsprismarine:block_properties'].source).toBe(
            'fallback'
        );
        expect(read('stone')['minecraft:block'].components['jsprismarine:block_properties'].source).toBe('java');
    });

    it('clamps the four icy frictions Mojang component cannot hold and keeps the Java value beside it', () => {
        const pack = generated();

        expect(pack.frictionClamps.map((clamp) => clamp.identifier)).toEqual([
            'minecraft:blue_ice',
            'minecraft:frosted_ice',
            'minecraft:ice',
            'minecraft:packed_ice'
        ]);

        const blueIce = JSON.parse(pack.files.find((file) => file.path === 'blocks/blue_ice.block.json')!.content)[
            'minecraft:block'
        ].components;
        expect(blueIce['minecraft:friction']).toBe(BEDROCK_FRICTION_CAP);
        expect(blueIce['jsprismarine:block_properties'].friction).toBe(0.989);
    });

    it('names a behavior the family table knows for every block', () => {
        const known = new Set(BLOCK_BEHAVIOR_NAMES);

        for (const identifier of identifiers()) expect(known.has(behaviorFor(identifier))).toBe(true);
        expect(behaviorFor('minecraft:lit_redstone_lamp')).toBe('jsprismarine:redstone');
    });

    it('matches the committed pack, so the generator and the files cannot drift', () => {
        for (const file of generated().files) {
            expect(readFileSync(join(packDirectory, ...file.path.split('/')), 'utf8'), file.path).toBe(file.content);
        }
    });
});

describe('the committed overlay pack', () => {
    it('loads as a real Bedrock behavior pack', () => {
        const { definitions, diagnostics } = load([{ kind: 'directory', path: packDirectory }]);

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        expect(definitions.blocks.size).toBe(1477);
    });

    it('resolves into a type per block and a state per palette state', () => {
        const { definitions } = load([{ kind: 'directory', path: packDirectory }]);
        const resolved = resolveBlocks(definitions.blocks.values());

        expect(resolved.diagnostics).toEqual([]);
        expect(resolved.types.size).toBe(1477);
        expect(resolved.states).toHaveLength(22079);
    });

    it('flattens into the per-state arrays the hot paths index', () => {
        const { definitions } = load([{ kind: 'directory', path: packDirectory }]);
        const resolved = resolveBlocks(definitions.blocks.values());
        const table = flattenBlockStates(resolved);

        const stone = resolved.types.get('minecraft:stone')!.state().runtimeId;
        expect(table.hardness[stone]).toBe(1.5);
        expect(table.blastResistance[stone]).toBe(6);
        expect(table.lightFilter[stone]).toBe(15);

        const blueIce = resolved.types.get('minecraft:blue_ice')!.state().runtimeId;
        expect(table.friction[blueIce]).toBeCloseTo(0.989, 5);

        const air = resolved.types.get('minecraft:air')!.state().runtimeId;
        expect(table.solid[air]).toBe(0);
        expect(table.solid[stone]).toBe(1);

        const wheat = resolved.types.get('minecraft:wheat')!.state().runtimeId;
        expect(table.randomTick[wheat]).toBe(1);
        expect(table.randomTick[stone]).toBe(0);

        expect(table.friction).toHaveLength(22079);
    });

    it('does not make water or lava solid in the flattened collision table', () => {
        const { definitions } = load([{ kind: 'directory', path: packDirectory }]);
        const resolved = resolveBlocks(definitions.blocks.values());
        const table = flattenBlockStates(resolved);

        for (const identifier of [
            'minecraft:water',
            'minecraft:flowing_water',
            'minecraft:lava',
            'minecraft:flowing_lava'
        ]) {
            const type = resolved.types.get(identifier);
            if (type === undefined) throw new Error(`the vanilla overlay has no ${identifier} block`);

            for (const state of type.states) expect(table.solid[state.runtimeId], identifier).toBe(0);
        }
    });

    it('keeps the Java friction readable through the component that carries it', () => {
        const { definitions } = load([{ kind: 'directory', path: packDirectory }]);
        const resolved = resolveBlocks(definitions.blocks.values());
        const state = resolved.types.get('minecraft:blue_ice')!.state().content;

        expect(state.params(friction)).toBe(BEDROCK_FRICTION_CAP);
        expect(state.params(blockProperties)?.friction).toBe(0.989);
    });
});
