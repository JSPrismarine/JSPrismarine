import { LevelEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { EntityPosition } from '@jsprismarine/entities';
import type { DataEntity } from './DataEntity';
import { itemViewOf } from './droppedItems';
import { EYE_OF_ENDER_SIGNAL, eyeViewOf } from './eyeOfEnderSignals';
import type { EntityFixture } from './testing';
import { entityFixture, TestEntityWorld } from './testing';

/** A store whose random always rolls `roll`, which decides whether an eye survives. */
const fixtureOf = (roll = 0.5): EntityFixture => entityFixture(new TestEntityWorld({ random: [roll] }));

const ENDER_EYE = { name: 'minecraft:ender_eye', count: 1 };

/** An eye thrown from (0, 65, 0) toward a point. */
const thrown = (fixture: EntityFixture, target: EntityPosition): DataEntity => {
    const eye = fixture.runtime.eyesOfEnder.launch({ x: 0, y: 65, z: 0 }, target, ENDER_EYE);
    if (eye === undefined) throw new Error('the fixture declares no eye of ender');
    return eye;
};

/** Runs ticks the way the world does: each inside an open tick of the change log. */
const step = (fixture: EntityFixture, ticks = 1): void => {
    for (let tick = 0; tick < ticks; tick += 1) {
        fixture.runtime.store.beginTick();
        fixture.runtime.tick(tick);
        fixture.runtime.store.sealTick();
        fixture.world.advance();
    }
};

/** The dropped stacks the store holds. */
const droppedStacks = (fixture: EntityFixture) =>
    fixture.runtime
        .all()
        .map((entity) => itemViewOf(entity)?.stack)
        .filter((stack) => stack !== undefined);

describe('an eye of ender in the store', () => {
    it('is a store entity of the built-in type that a save leaves out', () => {
        const fixture = fixtureOf();
        const eye = thrown(fixture, { x: 100, y: 0, z: 0 });

        expect(eye.identifier).toBe(EYE_OF_ENDER_SIGNAL);
        expect(fixture.runtime.byId(eye.id)).toBe(eye);
        expect(eye.instance.hasComponent('minecraft:transient')).toBe(true);
    });

    it('flies toward a far stronghold, rising eight blocks and stopping twelve blocks out', () => {
        // Java's `signalTo`: past twelve horizontal blocks the eye aims twelve blocks along the
        // way and eight blocks up, which is what makes an eye point rather than travel.
        const fixture = fixtureOf();
        const eye = thrown(fixture, { x: 100, y: 0, z: 0 });
        expect(eyeViewOf(eye)?.target).toEqual({ x: 12, y: 73, z: 0 });

        const xs: number[] = [];
        for (let tick = 0; tick < 40; tick += 1) {
            step(fixture);
            xs.push(eye.position.x);
        }

        expect(eye.position.x).toBeCloseTo(12, 0);
        expect(eye.position.z).toBeCloseTo(0, 5);
        expect(eye.position.y).toBeGreaterThan(72);
        expect(eye.position.y).toBeLessThan(74);
        // The first tick carries the zero motion it was thrown with, as Java's does; the second
        // sets off toward the target.
        expect(xs[0]).toBe(0);
        expect(xs[1]).toBeGreaterThan(0);
        expect(xs[19]).toBeLessThan(xs[39] ?? 0);
    });

    it('sinks toward a near stronghold, which lies below it', () => {
        // Within twelve blocks the eye flies at the structure's own point, whose y is the ground
        // the stronghold was laid out at, so it descends.
        const fixture = fixtureOf();
        const eye = thrown(fixture, { x: 5, y: 0, z: 0 });

        step(fixture, 40);

        expect(eye.position.x).toBeCloseTo(5, 0);
        expect(eye.position.y).toBeLessThan(60);
    });

    it('keeps its speed on the body, where the spawn packet reads it', () => {
        const fixture = fixtureOf();
        const eye = thrown(fixture, { x: 100, y: 0, z: 0 });
        expect(eye.body.velocity).toEqual({ x: 0, y: 0, z: 0 });

        step(fixture);

        expect(eye.body.velocity.x).toBeGreaterThan(0);
    });

    it('drops as an eye of ender after eighty ticks when the roll lets it survive', () => {
        // `random.nextInt(5) > 0` survives, so any roll from 0.2 up keeps the eye.
        const fixture = fixtureOf(0.2);
        const eye = thrown(fixture, { x: 100, y: 0, z: 0 });

        step(fixture, 80);
        expect(eye.removed).toBe(undefined);

        step(fixture);
        expect(eye.removed).toBe('discarded');
        expect(droppedStacks(fixture)).toEqual([ENDER_EYE]);
        expect(fixture.world.levelEvents).toEqual([]);
        expect(fixture.world.sounds).toEqual(['block.itemframe.break']);
    });

    it('shatters instead when the roll lands on the one in five', () => {
        const fixture = fixtureOf(0.1);
        const eye = thrown(fixture, { x: 100, y: 0, z: 0 });

        step(fixture, 81);

        expect(eye.removed).toBe('discarded');
        expect(droppedStacks(fixture)).toEqual([]);
        expect(fixture.world.levelEvents.map(({ event, data }) => ({ event, data }))).toEqual([
            { event: LevelEvent.PARTICLES_EYE_OF_ENDER_DEATH, data: 0 }
        ]);
        // The break named as Bedrock spells it: an actor `DEATH` sound has no entry for the eye in
        // the client's sound tables and fell back to the player's hurt sound.
        expect(fixture.world.sounds).toEqual(['block.itemframe.break']);
    });

    it('logs its position, its speed and its flight each tick', () => {
        const fixture = fixtureOf();
        const eye = thrown(fixture, { x: 100, y: 0, z: 0 });
        step(fixture, 2);

        const sealed = fixture.runtime.store.lastSealed();
        const fields = (sealed?.entries ?? []).flatMap((entry) =>
            entry.kind === 'field' && entry.field === 'entity' && entry.address.entity === BigInt(eye.id)
                ? [entry.address.field]
                : []
        );
        expect(fields).toEqual(
            expect.arrayContaining(['position', 'velocity', 'component:jsprismarine:eye_of_ender_signal'])
        );
    });
});
