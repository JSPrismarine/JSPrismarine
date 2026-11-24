import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { MetadataFlag } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';
import { describe, expect, it } from 'vitest';

import type { EntityPosition } from '@jsprismarine/entities';
import { actorMetadataProjection } from './actorMetadata';
import type { DataEntity } from './DataEntity';
import { EXPERIENCE_ORB, orbViewOf } from './experienceOrbs';
import { entityOverlayPackPath } from '../../content/packStack';
import { dataEntityRecordIn, dataEntityRecordOf, writeDataEntityRecord } from './persistence';
import type { EntityFixture } from './testing';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** Where orbs lie in these tests: on the fixture's floor. */
const GROUND: EntityPosition = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/**
 * A store whose random always rolls 0.5, so an award's merge roll picks group 20 and its toss is
 * straight up, and whose runtime ids are the ones a test lists, in order.
 */
const fixtureOf = (ids?: readonly number[], world = new TestEntityWorld()): EntityFixture => {
    const queue = ids === undefined ? undefined : [...ids];
    return entityFixture(world, {}, {}, queue === undefined ? undefined : () => queue.shift() ?? 10_000);
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

/** One orb of a value at a spot, spawned in a tick as the server spawns one. */
const orbAt = (fixture: EntityFixture, value: number, at: EntityPosition = GROUND): DataEntity => {
    fixture.runtime.store.beginTick();
    const orb = fixture.runtime.experienceOrbs.spawn(at, value);
    fixture.runtime.store.sealTick();
    if (orb === undefined) throw new Error('the fixture declares no experience orb');
    return orb;
};

/** Every orb the store holds. */
const orbs = (fixture: EntityFixture) =>
    fixture.runtime
        .entities()
        .toArray()
        .filter((entity) => entity.identifier === EXPERIENCE_ORB);

/** The points every orb in the store holds, as value times count. */
const points = (fixture: EntityFixture): number =>
    orbs(fixture).reduce((sum, orb) => sum + (orbViewOf(orb)?.value ?? 0) * (orbViewOf(orb)?.count ?? 0), 0);

const player = (id: number, position: EntityPosition, spectator?: boolean) => ({
    id,
    identifier: 'minecraft:player',
    position,
    ...(spectator === undefined ? {} : { spectator })
});

describe('an experience award', () => {
    it("splits into Java's orb sizes, tossed up to 0.4 blocks a tick", () => {
        const fixture = fixtureOf();
        fixture.runtime.store.beginTick();
        const spawned = fixture.runtime.experienceOrbs.award(GROUND, 50);
        fixture.runtime.store.sealTick();

        // Java's getExperienceValue: 37 is the largest size that fits 50, then 7 of the 13 left, then 3 and 3.
        expect(spawned.map((orb) => orbViewOf(orb)?.value)).toEqual([37, 7, 3, 3]);
        expect(points(fixture)).toBe(50);
        // (0.5 * 0.2 - 0.1) * 2 sideways and 0.5 * 0.2 * 2 up.
        expect(spawned[0]?.body.velocity).toEqual({ x: 0, y: 0.2, z: 0 });
    });

    it('joins an orb of the same value in the group the roll picks, and starts its age over', () => {
        // The roll of 0.5 picks group 20 of 40, which runtime id 60 is in and 61 is not.
        const fixture = fixtureOf([61, 60]);
        const outside = orbAt(fixture, 3);
        const inside = orbAt(fixture, 3);
        // Long enough for both to come down from their toss.
        step(fixture, 40);

        fixture.runtime.store.beginTick();
        const spawned = fixture.runtime.experienceOrbs.award(GROUND, 3);
        fixture.runtime.store.sealTick();

        expect(spawned).toEqual([]);
        expect(orbViewOf(inside)).toMatchObject({ count: 2, age: 0 });
        expect(orbViewOf(outside)?.count).toBe(1);
    });
});

describe('an experience orb in the store', () => {
    it('draws in the orbs of its value and group on its scan tick, keeping every point', () => {
        // 1 and 41 share a group of forty; 2 is in another, and 81 is worth something else.
        const fixture = fixtureOf([1, 41, 2, 81]);
        const absorbing = orbAt(fixture, 7);
        const sameGroup = orbAt(fixture, 7);
        const otherGroup = orbAt(fixture, 7);
        const otherValue = orbAt(fixture, 3);

        step(fixture);

        expect(orbViewOf(absorbing)?.count).toBe(2);
        expect(sameGroup.removed).toBeDefined();
        expect(otherGroup.removed).toBeUndefined();
        expect(otherValue.removed).toBeUndefined();
        expect(points(fixture)).toBe(3 * 7 + 3);
    });

    it("scans on every tick its definition's scan interval names, an interval of one included", () => {
        // The shipped orb's components with only the scan interval changed, as a pack could ship it.
        const shipped = JSON.parse(readFileSync(join(entityOverlayPackPath(), 'entities', 'xp_orb.json'), 'utf8'));
        const components = shipped['minecraft:entity'].components;
        const everyTick = {
            components: {
                ...components,
                'jsprismarine:experience_orb': { ...components['jsprismarine:experience_orb'], scan_interval: 1 }
            }
        };
        // The survivor of two orbs in one group says which scanned: the older one, 1, scans first
        // in the tick and only between scan ticks when its interval is one; otherwise the newer
        // one, 41, takes it in on its own first tick.
        const survivor = (fixture: EntityFixture): number | undefined => {
            const older = orbAt(fixture, 7);
            older.body.velocity = { x: 0, y: 0, z: 0 };
            step(fixture, 2);
            const newer = orbAt(fixture, 7);
            newer.body.velocity = { x: 0, y: 0, z: 0 };
            step(fixture);
            const left = orbs(fixture).filter((orb) => orb.removed === undefined);
            return left.length === 1 && orbViewOf(left[0]!)?.count === 2 ? left[0]?.id : undefined;
        };
        const queue = (ids: number[]) => () => ids.shift() ?? 10_000;

        expect(
            survivor(entityFixture(new TestEntityWorld(), {}, { [EXPERIENCE_ORB]: everyTick }, queue([1, 41])))
        ).toBe(1);
        expect(survivor(fixtureOf([1, 41]))).toBe(41);
    });

    it('is pulled toward a player within eight blocks and not one further away', () => {
        const near = fixtureOf();
        near.world.players = [player(900, { x: GROUND.x + 5, y: GROUND.y, z: GROUND.z })];
        const pulled = orbAt(near, 1);
        pulled.body.velocity = { x: 0, y: 0, z: 0 };
        step(near);
        expect(pulled.position.x).toBeGreaterThan(GROUND.x);

        const far = fixtureOf();
        far.world.players = [player(900, { x: GROUND.x + 9, y: GROUND.y, z: GROUND.z })];
        const left = orbAt(far, 1);
        left.body.velocity = { x: 0, y: 0, z: 0 };
        step(far);
        expect(left.position.x).toBe(GROUND.x);
    });

    it('gives a player against it one orb every second tick, then is gone', () => {
        const fixture = fixtureOf([5, 45, 85]);
        const orb = orbAt(fixture, 7);
        orbAt(fixture, 7);
        orbAt(fixture, 7);
        step(fixture);
        expect(orbViewOf(orb)?.count).toBe(3);

        fixture.world.players = [player(900, { x: orb.position.x + 1, y: orb.position.y, z: orb.position.z })];
        const takenBy = (ticks: number): number => {
            step(fixture, ticks);
            return fixture.world.orbsTaken.length;
        };

        expect(takenBy(1)).toBe(1);
        expect(takenBy(1)).toBe(1);
        expect(takenBy(1)).toBe(2);
        expect(takenBy(2)).toBe(3);
        expect(fixture.world.orbsTaken).toEqual(
            Array.from({ length: 3 }, () => ({ playerId: 900, orbId: orb.id, value: 7 }))
        );
        expect(orb.removed).toBeDefined();
    });

    it('gives nothing to a spectator, nor follows one', () => {
        const fixture = fixtureOf();
        const orb = orbAt(fixture, 7);
        orb.body.velocity = { x: 0, y: 0, z: 0 };
        fixture.world.players = [player(900, { x: orb.position.x + 2, y: orb.position.y, z: orb.position.z }, true)];
        step(fixture, 4);

        expect(fixture.world.orbsTaken).toEqual([]);
        expect(orb.position.x).toBe(GROUND.x);
    });

    it('is gone after 6000 ticks', () => {
        const fixture = fixtureOf();
        const orb = orbAt(fixture, 1);
        step(fixture, 5999);
        expect(orb.removed).toBeUndefined();
        step(fixture);
        expect(orb.removed).toBeDefined();
    });

    it('shows clients its value, which sizes its sprite', () => {
        const fixture = fixtureOf();
        const orb = orbAt(fixture, 37);

        expect(actorMetadataProjection(orb).properties).toContainEqual({
            kind: 'int',
            id: MetadataFlag.EXPERIENCE_VALUE,
            value: 37
        });
    });

    it('keeps its value and count through a save', () => {
        const fixture = fixtureOf([1, 41]);
        const orb = orbAt(fixture, 7);
        orbAt(fixture, 7);
        step(fixture);

        const nbt = new NBTTagCompound('');
        nbt.addValue('UniqueID', new Types.LongVal(7n));
        writeDataEntityRecord(nbt, dataEntityRecordOf(orb, undefined));
        const record = dataEntityRecordIn(nbt);
        if (record === undefined) throw new Error('the orb record could not be read');
        fixture.runtime.store.beginTick();
        const restored = fixture.runtime.restore(record, orb.position);
        fixture.runtime.store.sealTick();

        expect(restored === undefined ? undefined : orbViewOf(restored)).toMatchObject({ value: 7, count: 2 });
    });
});
