import type { BlockStateValue } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { familyHooks } from '../family';
import type { PlaceOptions } from '../harness';
import { bindFamily, heldItem, silkTouchTool } from '../harness';
import { chemistryFamily, glassFamily, inertFamily, logFamily, oreFamily, plainBlockFamily } from './simple';

const position = { x: 0, y: 0, z: 0 };

const requiresTool = {
    'jsprismarine:block_properties': {
        friction: 0.6,
        random_tick: false,
        requires_correct_tool: true,
        push_reaction: 'push_pull',
        source: 'java'
    }
};

describe('plainBlockFamily', () => {
    it('drops itself when it is broken', () => {
        const harness = bindFamily(plainBlockFamily, 'minecraft:white_wool');
        harness.dimension.set(position, 'minecraft:white_wool');

        harness.breakBlock(position);

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:white_wool', count: 1 }
        ]);
    });

    it('drops nothing when its properties say the tool decides', () => {
        const harness = bindFamily(plainBlockFamily, 'minecraft:obsidian', { components: requiresTool });
        harness.dimension.set(position, 'minecraft:obsidian');

        harness.breakBlock(position);

        expect(harness.dimension.drops).toEqual([]);
    });
});

describe('inertFamily and chemistryFamily', () => {
    it('implement no hooks at all', () => {
        expect(familyHooks(inertFamily)).toEqual([]);
        expect(familyHooks(chemistryFamily)).toEqual([]);
    });
});

describe('glassFamily', () => {
    it('shatters into nothing for a bare hand or a plain tool', () => {
        const harness = bindFamily(glassFamily, 'minecraft:glass');
        harness.dimension.set(position, 'minecraft:glass');

        harness.breakBlock(position);
        harness.dimension.set(position, 'minecraft:glass');
        harness.breakBlock(position, { itemStack: heldItem('minecraft:diamond_pickaxe') });

        expect(harness.dimension.drops).toEqual([]);
    });

    it('drops itself to a silk touch tool', () => {
        const harness = bindFamily(glassFamily, 'minecraft:glass');
        harness.dimension.set(position, 'minecraft:glass');

        harness.breakBlock(position, { itemStack: silkTouchTool() });

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:glass', count: 1 }
        ]);
    });
});

describe('logFamily', () => {
    /** Places an oak log with one set of place options and reads back its axis. */
    const placeLog = (options: PlaceOptions): BlockStateValue | undefined => {
        const harness = bindFamily(logFamily, 'minecraft:oak_log');
        harness.dimension.set(position, 'minecraft:oak_log', { pillar_axis: 'y' });
        harness.place(position, options);
        return harness.dimension.stateAt(position, 'pillar_axis');
    };

    it('takes its axis from the clicked face, vertical placements included', () => {
        expect(placeLog({ face: 'up' })).toBe('y');
        expect(placeLog({ face: 'down' })).toBe('y');
        expect(placeLog({ face: 'east' })).toBe('x');
        expect(placeLog({ face: 'west' })).toBe('x');
        expect(placeLog({ face: 'north' })).toBe('z');
        expect(placeLog({ face: 'south' })).toBe('z');
    });

    it('falls back to the placer when the placement has no face', () => {
        expect(placeLog({ placedBy: { identifier: 'minecraft:player', position: { x: -5, y: 0, z: 0 } } })).toBe('x');
        expect(placeLog({ placedBy: undefined })).toBe('y');
    });

    it('lets the face win over the placer, which is what a vertical placement needs', () => {
        const axis = placeLog({
            face: 'up',
            placedBy: { identifier: 'minecraft:player', position: { x: -5, y: 0, z: 0 } }
        });

        expect(axis).toBe('y');
    });
});

describe('oreFamily', () => {
    it('drops the ore item and its experience', () => {
        const harness = bindFamily(oreFamily, 'minecraft:diamond_ore');
        harness.dimension.set(position, 'minecraft:diamond_ore');

        harness.breakBlock(position);

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:diamond', count: 1 }
        ]);
        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:xp_orb']);
    });

    it('drops three raw copper and no experience', () => {
        const harness = bindFamily(oreFamily, 'minecraft:deepslate_copper_ore');
        harness.dimension.set(position, 'minecraft:deepslate_copper_ore');

        harness.breakBlock(position);

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:raw_copper', count: 3 }
        ]);
        expect(harness.dimension.entities).toEqual([]);
    });

    it('falls back to dropping itself for an ore it does not know', () => {
        const harness = bindFamily(oreFamily, 'minecraft:ancient_debris');
        harness.dimension.set(position, 'minecraft:ancient_debris');

        harness.breakBlock(position);

        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:ancient_debris']);
    });
});
