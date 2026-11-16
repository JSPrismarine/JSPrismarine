import { describe, expect, it } from 'vitest';

import { EVOKER_FANGS } from './evokerFangs';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const AT = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** Fangs cast under a cow, and when each blow on it landed and the fangs left. */
const castUnderCow = (owned: boolean, warmup?: number) => {
    const world = new TestEntityWorld();
    const { runtime } = entityFixture(world);
    const caster = runtime.spawn('minecraft:cow', { x: 10.5, y: FLOOR_Y + 1, z: 0.5 });
    const cow = runtime.spawn('minecraft:cow', AT);
    const fangs = runtime.spawn(EVOKER_FANGS, AT, {
        ...(owned && caster !== undefined ? { ownerId: caster.id } : {}),
        ...(warmup === undefined ? {} : { data: { warmup } })
    });
    if (cow === undefined || fangs === undefined || caster === undefined)
        throw new Error('the fixture spawned nothing');

    const blows: { tick: number; taken: number; cause: string; attacker: number | undefined }[] = [];
    let gone: number | undefined;
    for (let tick = 1; tick <= 30; tick += 1) {
        const before = world.commits.length;
        runtime.tick(tick);
        for (const commit of world.commits.slice(before))
            if (commit.target.id === cow.id)
                blows.push({ tick, taken: commit.taken, cause: commit.intent.cause, attacker: commit.intent.attacker });
        if (gone === undefined && runtime.byId(fangs.id) === undefined) gone = tick;
    }
    return { blows, gone, casterId: caster.id };
};

describe('evoker fangs', () => {
    it("bite what stands on them once, for Java's 6, eight ticks after they rise", () => {
        const { blows } = castUnderCow(false);
        expect(blows).toEqual([{ tick: 8, taken: 6, cause: 'magic', attacker: undefined }]);
    });

    it('answer to the evoker that cast them', () => {
        const { blows, casterId } = castUnderCow(true);
        expect(blows.map((blow) => blow.attacker)).toEqual([casterId]);
    });

    it('are gone once their 22 ticks run out', () => {
        expect(castUnderCow(false).gone).toBe(23);
    });

    it('wait out the warm-up their spell gave them before they rise', () => {
        const { blows, gone } = castUnderCow(false, 5);
        expect(blows.map((blow) => blow.tick)).toEqual([13]);
        expect(gone).toBe(28);
    });
});
