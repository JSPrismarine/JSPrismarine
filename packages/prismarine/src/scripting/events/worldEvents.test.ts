import { describe, expect, it } from 'vitest';

import type { ScriptGameEvent } from '@jsprismarine/script-host/host/world';

import type { StoreActor } from '../../entity/data/storeActors';
import ExplodedEvent from '../../events/other/ExplodedEvent';
import ExplosionEvent from '../../events/other/ExplosionEvent';
import RedstoneActivatedEvent from '../../events/other/RedstoneActivatedEvent';
import PlayerBlockPlacedEvent from '../../events/player/PlayerBlockPlacedEvent';
import PlayerItemUseStageEvent from '../../events/player/PlayerItemUseStageEvent';
import PlayerPlaceBlockEvent from '../../events/player/PlayerPlaceBlockEvent';
import type { Item } from '../../item/Item';
import type Server from '../../Server';
import { testKernel } from '../../testing/kernel.test.helper';
import { sessionsWith } from '../../testing/playerSession.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { Level } from '../../world/Level';
import type { World } from '../../world/World';
import { levelWorldEvents } from './worldEvents';

const level = stub<Level>();
const elsewhere = stub<Level>();
const pig = stub<StoreActor>({ getRuntimeId: () => 9n, getType: () => 'minecraft:pig' });
const worldOf = (owner: Level): World =>
    stub<World>({
        getLevel: () => owner,
        getDimension: () => stub<ReturnType<World['getDimension']>>({ bedrockName: 'minecraft:overworld' }),
        getActor: () => pig
    });
const stick = stub<Item>({
    getName: () => 'minecraft:stick',
    getAmount: () => 1,
    getCustomName: () => undefined,
    getLore: () => [],
    getMaxDurability: () => 0,
    getDurability: () => 0
});
const stone = { x: 1, y: -60, z: 2, name: 'minecraft:stone', states: {} };

/** One level's world events over a fresh kernel, and what its scripts heard. */
const setup = () => {
    const kernel = testKernel();
    const server = stub<Server>({
        getKernel: () => kernel,
        getSessionManager: () => sessionsWith({ getSessions: () => [] })
    });
    const events = levelWorldEvents(server, level);
    const heard: ScriptGameEvent[] = [];
    events.events((event) => heard.push(event));
    return { kernel, events, heard };
};

describe("a level's world events, as its scripts see them", () => {
    it("cancels a placement through the server's event when a script's guard vetoes it, for the level's players only", () => {
        const { kernel, events, heard } = setup();
        const guarded: ScriptGameEvent[] = [];
        events.guard((event) => {
            guarded.push(event);
            return { veto: true };
        });

        const here = new PlayerPlaceBlockEvent(7n, worldOf(level), stone, 'up', { x: 0.5, y: 1, z: 0.5 });
        kernel.events.post('playerPlaceBlock', here);
        const there = new PlayerPlaceBlockEvent(7n, worldOf(elsewhere), stone, 'up', { x: 0.5, y: 1, z: 0.5 });
        kernel.events.post('playerPlaceBlock', there);
        kernel.events.post('playerBlockPlaced', new PlayerBlockPlacedEvent(7n, worldOf(level), stone));

        expect([here.isCanceled(), there.isCanceled()]).toEqual([true, false]);
        expect(guarded).toEqual([
            {
                event: 'PlayerPlaceBlockBeforeEvent',
                fields: {
                    player: { entity: { id: '7', typeId: 'minecraft:player' } },
                    block: { block: { dimension: 'minecraft:overworld', x: 1, y: -60, z: 2 } },
                    face: 'Up',
                    faceLocation: { vector: { x: 0.5, y: 1, z: 0.5 } },
                    permutationToPlace: { permutation: { typeId: 'minecraft:stone', states: {} } }
                }
            }
        ]);
        expect(heard.map((event) => event.event)).toEqual(['PlayerPlaceBlockAfterEvent']);
    });

    it('hands a blast the blocks a script left it, and tells each cleared block before the blast', () => {
        const { kernel, events, heard } = setup();
        events.guard((event) => {
            const impacted = event.fields.impactedBlocks;
            if (typeof impacted !== 'object' || !('blocks' in impacted)) return { veto: true };
            return { veto: false, fields: { ...event.fields, impactedBlocks: { blocks: impacted.blocks.slice(1) } } };
        });

        const blast = new ExplosionEvent(worldOf(level), pig, [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 }
        ]);
        kernel.events.post('explosion', blast);
        kernel.events.post('exploded', new ExplodedEvent(worldOf(level), pig, [stone]));

        expect(blast.getBlocks()).toEqual([{ x: 1, y: 0, z: 0 }]);
        expect(heard.map((event) => event.event)).toEqual(['BlockExplodeAfterEvent', 'ExplosionAfterEvent']);
        expect(heard[1]?.fields.source).toEqual({ entity: { id: '9', typeId: 'minecraft:pig' } });
    });

    it('names each stage of an item use, with the ticks left or the block it was on', () => {
        const { kernel, heard } = setup();
        for (const stage of ['start', 'release', 'stop'] as const) {
            kernel.events.post('playerItemUseStage', new PlayerItemUseStageEvent(7n, worldOf(level), stage, stick, 30));
        }
        kernel.events.post(
            'playerItemUseStage',
            new PlayerItemUseStageEvent(7n, worldOf(level), 'startOn', stick, 0, { at: stone, face: 'north' })
        );

        expect(heard.map((event) => [event.event, event.fields.useDuration, event.fields.blockFace])).toEqual([
            ['ItemStartUseAfterEvent', 30, undefined],
            ['ItemReleaseUseAfterEvent', 30, undefined],
            ['ItemStopUseAfterEvent', 30, undefined],
            ['ItemStartUseOnAfterEvent', undefined, 'North']
        ]);
    });

    it('tells a pressure plate pushed from one popped, and a piston with its component', () => {
        const { kernel, heard } = setup();
        const position = { x: 3, y: -60, z: 3 };
        kernel.events.post(
            'redstoneActivated',
            new RedstoneActivatedEvent(worldOf(level), {
                kind: 'pressurePlate',
                position,
                power: 15,
                previousPower: 0,
                source: '9'
            })
        );
        kernel.events.post(
            'redstoneActivated',
            new RedstoneActivatedEvent(worldOf(level), { kind: 'pressurePlate', position, power: 0, previousPower: 15 })
        );
        kernel.events.post(
            'redstoneActivated',
            new RedstoneActivatedEvent(worldOf(level), { kind: 'piston', position, extending: true })
        );

        expect(heard.map((event) => event.event)).toEqual([
            'PressurePlatePushAfterEvent',
            'PressurePlatePopAfterEvent',
            'PistonActivateAfterEvent'
        ]);
        expect(heard[0]?.fields.source).toEqual({ entity: { id: '9', typeId: 'minecraft:pig' } });
        expect(heard[2]?.fields.piston).toEqual({
            blockComponent: 'BlockPistonComponent',
            at: { dimension: 'minecraft:overworld', ...position }
        });
    });
});
