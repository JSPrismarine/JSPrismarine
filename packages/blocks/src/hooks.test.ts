import { HookTable } from '@jsprismarine/content';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { BlockHookName, BlockHooks, HookBlock } from './hooks';
import { BLOCK_HOOK_NAMES } from './hooks';

const block: HookBlock = {
    identifier: 'minecraft:oak_stairs',
    position: { x: 1, y: 2, z: 3 },
    dimension: 'minecraft:overworld',
    states: { upside_down_bit: 0, weirdo_direction: 1 }
};

describe('the block hook map', () => {
    it('lists every hook the map declares', () => {
        expectTypeOf<BlockHookName>().toEqualTypeOf<keyof BlockHooks>();
        expect([...BLOCK_HOOK_NAMES].sort()).toEqual(
            [
                'onBlockStateChange',
                'onBreak',
                'onEntityFallOn',
                'onNeighborChanged',
                'onPlace',
                'onPlayerInteract',
                'onRandomTick',
                'onRedstoneUpdate',
                'onStepOn',
                'onTick'
            ].sort()
        );
    });

    it('dispatches in contribution order', () => {
        const calls: string[] = [];
        const table = new HookTable<BlockHooks>([
            { source: 'minecraft:tick', handlers: { onTick: () => void calls.push('component') } },
            { source: 'jsprismarine:crops', handlers: { onTick: () => void calls.push('behavior') } }
        ]);

        table.dispatch('onTick', { block, tick: 7 });

        expect(calls).toEqual(['component', 'behavior']);
        expect(table.contributors('onTick')).toEqual(['minecraft:tick', 'jsprismarine:crops']);
    });

    it('stops onPlayerInteract at the first handler that consumes it', () => {
        const calls: string[] = [];
        const table = new HookTable<BlockHooks>([
            {
                source: 'jsprismarine:door',
                handlers: {
                    onPlayerInteract: () => {
                        calls.push('door');
                        return true;
                    }
                }
            },
            {
                source: 'jsprismarine:plain_block',
                handlers: {
                    onPlayerInteract: () => {
                        calls.push('plain');
                        return undefined;
                    }
                }
            }
        ]);

        const handled = table.dispatchFirst('onPlayerInteract', {
            block,
            player: { identifier: 'minecraft:player', position: { x: 1, y: 2, z: 4 } },
            face: 'north',
            faceLocation: undefined
        });

        expect(handled).toBe(true);
        expect(calls).toEqual(['door']);
    });
});
