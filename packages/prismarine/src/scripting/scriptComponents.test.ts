import type { BlockHooks } from '@jsprismarine/blocks/hooks';
import { BehaviorRegistry } from '@jsprismarine/content/behaviors';
import type { Definition } from '@jsprismarine/content/definitions';
import type { ItemHooks } from '@jsprismarine/items/hooks';
import type {
    ScriptBlockHookEvent,
    ScriptComponentSink,
    ScriptItemHookEvent
} from '@jsprismarine/script-host/host/world';
import { describe, expect, it } from 'vitest';

import { registerScriptComponentBehaviors, ScriptComponentBridge, scriptComponentType } from './scriptComponents';

const definition = (identifier: string, data: unknown): Definition => ({
    identifier,
    registry: 'blocks',
    pack: 'test',
    path: `blocks/${identifier}.json`,
    data
});

const TICKER = definition('jsp:ticker', {
    format_version: '1.21.90',
    'minecraft:block': {
        description: { identifier: 'jsp:ticker' },
        components: {
            'jsp:recorder': { label: 'ticker' },
            'minecraft:tick': { interval_range: [10, 20], looping: true },
            'tag:jsp_tagged': {}
        },
        permutations: [{ condition: 'true', components: { 'jsp:other': {} } }]
    }
});

const LEGACY = definition('jsp:legacy', {
    format_version: '1.20.80',
    'minecraft:block': { components: { 'minecraft:custom_components': ['jsp:legacy'] } }
});

/** A sink that handles every hook of `jsp:recorder` and records what reaches it. */
const recordingSink = (cancel = false) => {
    const blocks: ScriptBlockHookEvent[] = [];
    const items: ScriptItemHookEvent[] = [];
    const sink: ScriptComponentSink = {
        handlesBlock: (components) => components.some((use) => use.name === 'jsp:recorder'),
        handlesItem: () => true,
        block: (event) => {
            blocks.push(event);
            return cancel;
        },
        item: (event) => void items.push(event)
    };
    return { sink, blocks, items };
};

describe('scriptComponentType', () => {
    it("reads a version 2 block's components, its permutations' and its tick", () => {
        expect(scriptComponentType(TICKER, 'minecraft:block')).toEqual({
            uses: [
                { name: 'jsp:recorder', params: { label: 'ticker' } },
                { name: 'jsp:other', params: {} }
            ],
            tick: { min: 10, max: 20, looping: true }
        });
    });

    it('reads minecraft:custom_components as components with no parameters', () => {
        expect(scriptComponentType(LEGACY, 'minecraft:block')).toEqual({
            uses: [{ name: 'jsp:legacy', legacy: true }]
        });
        expect(scriptComponentType(definition('minecraft:stone', {}), 'minecraft:block')).toBeUndefined();
    });
});

describe('ScriptComponentBridge', () => {
    it('raises onBreak and onPlace from block writes and starts the ticks of a block with minecraft:tick', () => {
        const bridge = new ScriptComponentBridge();
        const ticked: string[] = [];
        bridge.setScheduler((block, min, max) => ticked.push(`${block.x} ${min}-${max}`));
        const type = scriptComponentType(TICKER, 'minecraft:block');
        if (type === undefined) throw new Error('the ticker names components');
        bridge.addBlock('jsp:ticker', type);
        const writes = bridge.blockWrites('minecraft:overworld');

        writes({ x: 1, y: 2, z: 3 }, { name: 'minecraft:air', states: {} }, { name: 'jsp:ticker', states: {} });
        expect(ticked).toEqual([]);

        const { sink, blocks } = recordingSink();
        bridge.bind(sink);
        writes({ x: 1, y: 2, z: 3 }, { name: 'minecraft:air', states: {} }, { name: 'jsp:ticker', states: {} });
        writes({ x: 1, y: 2, z: 3 }, { name: 'jsp:ticker', states: {} }, { name: 'minecraft:stone', states: {} });
        expect(blocks.map((event) => event.hook)).toEqual(['onPlace', 'onBreak']);
        expect(blocks[0]).toMatchObject({
            block: { dimension: 'minecraft:overworld', x: 1, y: 2, z: 3 },
            previousBlock: { typeId: 'minecraft:air', states: {} }
        });
        expect(ticked).toEqual(['1 10-20']);
    });

    it('forwards the hooks the content dispatches, and a cancel from beforeOnPlayerPlace', () => {
        const blocks = new BehaviorRegistry<BlockHooks>();
        const items = new BehaviorRegistry<ItemHooks>();
        const bridge = new ScriptComponentBridge();
        registerScriptComponentBehaviors({ blocks, items }, bridge);
        const [bound] = blocks.bind({ identifier: 'jsp:ticker', definition: TICKER });
        expect(Object.keys(bound?.handlers ?? {}).sort()).toEqual([
            'beforeOnPlayerPlace',
            'onBlockStateChange',
            'onBreak',
            'onEntity',
            'onEntityFallOn',
            'onPlayerInteract',
            'onRandomTick',
            'onRedstoneUpdate',
            'onStepOn',
            'onTick'
        ]);
        // A block without minecraft:tick never ticks a script's component, as on BDS.
        expect(
            Object.keys(blocks.bind({ identifier: 'jsp:legacy', definition: LEGACY })[0]?.handlers ?? {})
        ).not.toContain('onTick');

        const { sink, blocks: raised } = recordingSink(true);
        bridge.bind(sink);
        const block = {
            identifier: 'jsp:ticker',
            position: { x: 0, y: 0, z: 0 },
            dimension: 'minecraft:overworld',
            states: {}
        };
        const player = { identifier: 'minecraft:player', entityId: '5', position: { x: 0, y: 1, z: 0 } };
        expect(bound?.handlers.beforeOnPlayerPlace?.({ block, player, face: 'up' })).toBe(true);
        expect(
            bound?.handlers.onPlayerInteract?.({
                block,
                player,
                face: 'north',
                faceLocation: undefined,
                itemStack: undefined
            })
        ).toBe(true);
        bound?.handlers.onBreak?.({ block, brokenBlock: block, brokenBy: player, itemStack: undefined });
        expect(raised.map((event) => event.hook)).toEqual(['beforeOnPlayerPlace', 'onPlayerInteract', 'onPlayerBreak']);
        expect(raised[0]).toMatchObject({ face: 'Up', player: { id: '5', typeId: 'minecraft:player' } });
        expect(raised[1]).toMatchObject({ face: 'North' });

        // The redstone hook reports the power before, and whether it is the block's first update.
        bound?.handlers.onRedstoneUpdate?.({ block, power: 7 });
        bound?.handlers.onRedstoneUpdate?.({ block, power: 0 });
        bound?.handlers.onBlockStateChange?.({ block, state: 'open_bit', previousValue: true, newValue: false });
        expect(raised.slice(3)).toMatchObject([
            { hook: 'onRedstoneUpdate', powerLevel: 7, previousPowerLevel: 0, firstUpdate: true },
            { hook: 'onRedstoneUpdate', powerLevel: 0, previousPowerLevel: 7, firstUpdate: false },
            { hook: 'onBlockStateChange', previousPermutation: { typeId: 'jsp:ticker', states: { open_bit: true } } }
        ]);
    });
});
