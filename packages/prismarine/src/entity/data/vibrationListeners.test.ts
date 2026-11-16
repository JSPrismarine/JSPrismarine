import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { singleDimension } from '../../content/world/adapter';
import { GameEventListenerRegistry } from '../../world/GameEventListenerRegistry';
import { entityContentGroups } from '../contentAdapter';
import { EntityRuntime } from './EntityRuntime';
import { FLOOR_Y, TestEntityWorld, entityContentOptions } from './testing';

const LISTENER = {
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:collision_box': { width: 0.9, height: 2.9 },
        'minecraft:vibration_listener': {}
    }
};

/** A runtime over the fixture content whose listeners register in a real game-event registry. */
const listeningRuntime = () => {
    const world = new TestEntityWorld();
    const events = new GameEventListenerRegistry({ getLoadedChunk: () => ({}) });
    let content: ServerContent | undefined;
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the runtime was read before the content was built');
            return content;
        },
        world: world.world,
        host: world.host,
        gameEvents: events
    });
    content = buildServerContent(
        entityContentOptions(
            { world: singleDimension({ ...world.world, ticks: world.ticks, ...entityContentGroups(runtime) }) },
            { 'minecraft:warden': LISTENER }
        )
    );
    return { runtime, events };
};

const ground = (x: number) => ({ x: x + 0.5, y: FLOOR_Y + 1, z: 0.5 });

describe('vibration listeners', () => {
    it('hear a step a cow takes', () => {
        const { runtime, events } = listeningRuntime();
        runtime.spawn('minecraft:warden', ground(0));
        const cow = runtime.spawn('minecraft:cow', ground(6));
        events.post({ event: 'minecraft:step', at: ground(6), sourceId: cow?.id });

        expect(runtime.poi('suspicious_location', ground(0), 16)).toEqual(ground(6));
    });

    it("pass over a warden's step, which Java's Warden.dampensVibrations hides", () => {
        const { runtime, events } = listeningRuntime();
        runtime.spawn('minecraft:warden', ground(0));
        const other = runtime.spawn('minecraft:warden', ground(6));
        events.post({ event: 'minecraft:step', at: ground(6), sourceId: other?.id });

        expect(runtime.poi('suspicious_location', ground(0), 16)).toBeUndefined();
    });
});
