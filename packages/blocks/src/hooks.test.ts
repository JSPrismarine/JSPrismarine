import { HookTable } from '@jsprismarine/content';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
    BlockBreakEvent,
    BlockHookName,
    BlockHooks,
    BlockPlaceEvent,
    BlockPlayerInteractEvent,
    HookBlock,
    HookItem
} from './hooks';
import { BLOCK_HOOK_NAMES } from './hooks';

const block: HookBlock = {
    identifier: 'minecraft:oak_stairs',
    position: { x: 1, y: 2, z: 3 },
    dimension: 'minecraft:overworld',
    states: { upside_down_bit: 0, weirdo_direction: 1 }
};

/** A held item with one component, as a behavior reads one. */
class TestItem implements HookItem {
    public constructor(
        public readonly identifier: string,
        private readonly components: Readonly<Record<string, unknown>> = {}
    ) {}

    public get(name: string): unknown {
        return this.components[name];
    }
}

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
            faceLocation: undefined,
            itemStack: undefined
        });

        expect(handled).toBe(true);
        expect(calls).toEqual(['door']);
    });
});

describe('the held item on a hook event', () => {
    it('reaches a handler on the three hooks a held item decides', () => {
        const honeycomb = new TestItem('minecraft:honeycomb');
        const pickaxe = new TestItem('minecraft:diamond_pickaxe', {
            'minecraft:enchantments': { 'minecraft:silk_touch': 1 }
        });
        const seen: (string | undefined)[] = [];

        const table = new HookTable<BlockHooks>([
            {
                source: 'jsprismarine:copper',
                handlers: {
                    onPlace: (event) => void seen.push(event.itemStack?.identifier),
                    onBreak: (event) => void seen.push(event.itemStack?.identifier),
                    onPlayerInteract: (event) => {
                        seen.push(event.itemStack?.identifier);
                        return true;
                    }
                }
            }
        ]);

        const place: BlockPlaceEvent = {
            block,
            previous: undefined,
            placedBy: undefined,
            itemStack: pickaxe,
            face: 'up',
            faceLocation: { x: 0.5, y: 0, z: 0.5 }
        };
        const broken: BlockBreakEvent = { block, brokenBlock: block, brokenBy: undefined, itemStack: pickaxe };
        const used: BlockPlayerInteractEvent = {
            block,
            player: { identifier: 'minecraft:player', position: { x: 1, y: 2, z: 4 } },
            face: 'up',
            faceLocation: { x: 0.5, y: 1, z: 0.5 },
            itemStack: honeycomb
        };

        table.dispatch('onPlace', place);
        table.dispatch('onBreak', broken);
        table.dispatchFirst('onPlayerInteract', used);

        expect(seen).toEqual(['minecraft:diamond_pickaxe', 'minecraft:diamond_pickaxe', 'minecraft:honeycomb']);
        expect(broken.itemStack?.get('minecraft:enchantments')).toEqual({ 'minecraft:silk_touch': 1 });
        expect(honeycomb.get('minecraft:enchantments')).toBeUndefined();
    });

    it('accepts an ItemStack-shaped class without either package importing the other', () => {
        // The shape `@jsprismarine/items`'s `ItemStack` presents: an
        // `identifier` getter and a `get(name)` component reader. This
        // package cannot import it, so the claim is checked against a stand-in
        // with the same declarations.
        class StackShape {
            public get identifier(): string {
                return 'minecraft:shears';
            }

            public get(_name: string): unknown {
                return undefined;
            }
        }

        expectTypeOf<StackShape>().toExtend<HookItem>();
        const held: HookItem = new StackShape();
        expect(held.identifier).toBe('minecraft:shears');
    });
});
