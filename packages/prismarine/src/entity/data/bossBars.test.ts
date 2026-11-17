import { describe, expect, it } from 'vitest';

import { EntityBossBars, ownBossBarOf } from './bossBars';
import type { BossBarViewer, ShownBossBar } from './bossBars';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const BOSS = {
    components: {
        'minecraft:health': { value: 300, max: 300 },
        'minecraft:boss': { hud_range: 55, should_darken_sky: true },
        'minecraft:collision_box': { width: 0.9, height: 3.5 }
    }
};

const fixture = () =>
    entityFixture(new TestEntityWorld(), {}, { 'minecraft:wither': BOSS, 'minecraft:ender_dragon': BOSS });

/** A player whose client tracks the entities in its set. */
class Viewer implements BossBarViewer {
    public readonly tracked = new Set<bigint>();
    public tracks(runtimeId: bigint): boolean {
        return this.tracked.has(runtimeId);
    }
}

/** Every bar the bars put up, and what each was asked to do. */
const recorded = () => {
    const events: string[] = [];
    const bars = new EntityBossBars<Viewer>((entity, shown) => {
        events.push(`open ${entity.identifier} ${shown.progress}`);
        const bar: ShownBossBar<Viewer> = {
            show: (viewer) => events.push(`show ${viewers.indexOf(viewer)}`),
            hide: (viewer) => events.push(`hide ${viewers.indexOf(viewer)}`),
            setProgress: (progress) => events.push(`progress ${progress}`),
            setName: (name) => events.push(`name ${name}`),
            close: () => events.push('close')
        };
        return bar;
    });
    const viewers = [new Viewer(), new Viewer()];
    return { bars, events, viewers };
};

describe('EntityBossBars', () => {
    it('shows a wither its bar to the players tracking it, at its health, and to nobody else', () => {
        const { runtime } = fixture();
        const wither = runtime.spawn('minecraft:wither', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
        const { bars, events, viewers } = recorded();
        viewers[0]!.tracked.add(BigInt(wither.id));

        bars.sync(runtime.entities(), viewers);
        expect(events).toEqual(['open minecraft:wither 1', 'show 0']);

        wither.instance.attributes.set('health', 150);
        viewers[0]!.tracked.clear();
        viewers[1]!.tracked.add(BigInt(wither.id));
        events.length = 0;
        bars.sync(runtime.entities(), viewers);
        expect(events).toEqual(['progress 0.5', 'hide 0', 'show 1']);

        runtime.remove(wither.id, 'test');
        events.length = 0;
        bars.sync(runtime.entities(), viewers);
        expect(events).toEqual(['close']);
    });

    it("leaves the ender dragon's bar to its fight", () => {
        const { runtime } = fixture();
        const dragon = runtime.spawn('minecraft:ender_dragon', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
        const { bars, events, viewers } = recorded();
        viewers[0]!.tracked.add(BigInt(dragon.id));

        bars.sync(runtime.entities(), viewers);

        expect(ownBossBarOf(dragon)).toBeUndefined();
        expect(events).toEqual([]);
    });
});
