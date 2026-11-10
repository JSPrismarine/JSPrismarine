import { vanillaItemDefinitions } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import type { ContentEntity } from '../../content/world/adapter';
import { DamageCause } from '../DamageCause';
import type { DataEntity } from './DataEntity';
import type { ItemStart } from './droppedItems';
import { itemViewOf } from './droppedItems';
import type { EntityFixture, TestWorldOptions } from './testing';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** The top of the fixture's stone floor, where a stack comes to rest. */
const SURFACE = FLOOR_Y + 1;

/** How far above where it lies an item reports itself, which the built-in definition declares. */
const OFFSET = 0.125;

const fixtureOf = (options: TestWorldOptions = {}): EntityFixture => entityFixture(new TestEntityWorld(options));

const cobblestone = (count = 1): ItemStart['stack'] => ({ name: 'minecraft:cobblestone', count });

/** Drops a stack lying at a point, with whatever else the test says it starts with. */
const drop = (fixture: EntityFixture, x: number, y: number, z: number, start: Partial<ItemStart> = {}): DataEntity => {
    const entity = fixture.runtime.droppedItems.spawn({ x, y, z }, { stack: cobblestone(), ...start });
    if (entity === undefined) throw new Error('the fixture declares no dropped item');
    return entity;
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

const player = (id: number, x: number, z: number, y = SURFACE): ContentEntity => ({
    id,
    identifier: 'minecraft:player',
    position: { x, y, z }
});

const countOf = (entity: DataEntity): number | undefined => itemViewOf(entity)?.stack.count;

describe('dropped items in the store', () => {
    it('are store entities of the built-in type, reported above where they lie', () => {
        const fixture = fixtureOf();
        const item = drop(fixture, 0.5, SURFACE, 0.5);

        expect(fixture.runtime.byId(item.id)).toBe(item);
        expect(item.identifier).toBe('minecraft:item');
        expect(item.position.y).toBe(SURFACE + OFFSET);
        expect(fixture.runtime.index.itemsWithin(0.5, 0.5, 1)).toEqual([item]);
        // A mob's neighbor search never reads a stack.
        expect(fixture.runtime.near(item.position, 4)).toEqual([]);
    });

    it('refuse an empty stack, and a summon that names no stack', () => {
        const fixture = fixtureOf();

        expect(fixture.runtime.droppedItems.spawn({ x: 0, y: SURFACE, z: 0 }, { stack: cobblestone(0) })).toBe(
            undefined
        );
        expect(fixture.runtime.spawn('minecraft:item', { x: 0, y: SURFACE, z: 0 })).toBe(undefined);
        expect(fixture.runtime.all()).toEqual([]);
    });

    describe('movement', () => {
        it('falls the distances BDS made an item fall, tick by tick', () => {
            const fixture = fixtureOf();
            const item = drop(fixture, 0.5, 90, 0.5);
            const steps: number[] = [];

            for (let tick = 0; tick < 4; tick += 1) {
                const before = item.position.y;
                step(fixture);
                steps.push(before - item.position.y);
            }

            [0.04, 0.0792, 0.117616, 0.15526368].forEach((expected, tick) =>
                expect(steps[tick]).toBeCloseTo(expected, 6)
            );
        });

        it('comes to rest on the surface, however far it fell', () => {
            const fixture = fixtureOf();
            const item = drop(fixture, 0.5, 200, 0.5);

            step(fixture, 200);

            expect(item.position.y).toBe(SURFACE + OFFSET);
            expect(item.body.velocity).toEqual({ x: 0, y: 0, z: 0 });
        });

        it('rises first when it leaves with upward speed', () => {
            const fixture = fixtureOf();
            const item = drop(fixture, 0.5, 70, 0.5, { motion: { x: 0, y: 0.2, z: 0 } });

            step(fixture);

            expect(item.position.y).toBeCloseTo(70.125 + 0.16, 6);
        });

        it('slows sideways by 0.98 a tick in the air and 0.588 on the ground', () => {
            const fixture = fixtureOf();
            const flying = drop(fixture, 0.5, 80, 0.5, { motion: { x: 0.1, y: 0, z: 0 } });
            const lying = drop(fixture, 0.5, SURFACE, 4.5, { motion: { x: 0.1, y: 0, z: 0 } });

            step(fixture);

            expect(flying.body.velocity.x).toBeCloseTo(0.098, 6);
            expect(lying.body.velocity.x).toBeCloseTo(0.0588, 6);
            expect(lying.position.x).toBeCloseTo(0.6, 6);
        });

        it('stops against a block in its way', () => {
            const fixture = fixtureOf();
            fixture.world.setBlock({ x: 1, y: SURFACE, z: 0 }, 'minecraft:stone');
            const item = drop(fixture, 0.5, SURFACE, 0.5, { motion: { x: 0.6, y: 0, z: 0 } });

            step(fixture);

            expect(item.position.x).toBe(0.5);
            expect(item.body.velocity.x).toBe(0);
        });

        it('treats an unloaded block as one in its way, and loads nothing', () => {
            const fixture = fixtureOf({ unloadedFromX: 1 });
            const item = drop(fixture, 0.5, SURFACE, 0.5, { motion: { x: 0.6, y: 0, z: 0 } });

            step(fixture);

            expect(item.position.x).toBe(0.5);
        });

        it('writes nothing about where it is once it has settled', () => {
            const fixture = fixtureOf();
            const item = drop(fixture, 0.5, SURFACE + 0.5, 0.5);
            step(fixture, 30);

            fixture.runtime.store.beginTick();
            fixture.runtime.tick(31);
            const sealed = fixture.runtime.store.sealTick();

            const fields = (sealed?.entries ?? []).flatMap((entry) =>
                entry.kind === 'field' && entry.field === 'entity' && entry.address.entity === BigInt(item.id)
                    ? [entry.address.field]
                    : []
            );
            expect(fields).toEqual(['component:jsprismarine:item']);
        });
    });

    describe('merging', () => {
        it('draws a neighboring stack of the same thing into the older one', () => {
            const fixture = fixtureOf();
            const first = drop(fixture, 0.5, SURFACE, 0.5);
            const second = drop(fixture, 0.6, SURFACE, 0.5);

            step(fixture);

            expect(countOf(first)).toBe(2);
            expect(second.removed).toBe('merged');
            expect(fixture.world.stackChanges).toEqual([{ itemId: first.id, count: 2 }]);
        });

        it('never sees again a stack it drew in earlier in the same tick', () => {
            const fixture = fixtureOf();
            const first = drop(fixture, 0.5, SURFACE, 0.5);
            const second = drop(fixture, 0.6, SURFACE, 0.5);
            const third = drop(fixture, 0.7, SURFACE, 0.5);

            step(fixture);

            expect(countOf(first)).toBe(3);
            expect([second.removed, third.removed]).toEqual(['merged', 'merged']);
            expect(fixture.runtime.index.itemsWithin(0.5, 0.5, 1)).toEqual([first]);
        });

        it('draws in a stack that slid next to it earlier in the same tick', () => {
            const fixture = fixtureOf();
            const first = drop(fixture, 0.5, SURFACE, 0.5);
            const second = drop(fixture, 5.5, SURFACE, 0.5);
            second.position = { x: 0.7, y: SURFACE + OFFSET, z: 0.5 };

            step(fixture);

            expect(countOf(first)).toBe(2);
            expect(second.removed).toBe('merged');
        });

        it('leaves a different item, a stack beyond half a block, and two that will not both fit', () => {
            const fixture = fixtureOf();
            const stone = drop(fixture, 0.5, SURFACE, 0.5);
            const dirt = drop(fixture, 0.55, SURFACE, 0.5, { stack: { name: 'minecraft:dirt', count: 1 } });
            const far = drop(fixture, 1.5, SURFACE, 0.5);
            const big = drop(fixture, 0.5, SURFACE, 8.5, { stack: cobblestone(60) });
            const rest = drop(fixture, 0.55, SURFACE, 8.5, { stack: cobblestone(10) });

            step(fixture);

            expect([stone, dirt, far, big, rest].map((entity) => entity.removed)).toEqual([
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            ]);
            expect([countOf(big), countOf(rest)]).toEqual([60, 10]);
        });
    });

    describe('pickup', () => {
        it('waits out the pickup delay, then goes to a player standing on it and leaves the world', () => {
            const fixture = fixtureOf({ players: [player(7, 0.5, 0.5)] });
            const item = drop(fixture, 0.5, SURFACE, 0.5);

            step(fixture, 9);
            expect(fixture.world.given).toEqual([]);
            expect(itemViewOf(item)?.pickupDelay).toBe(1);

            step(fixture);
            expect(fixture.world.given).toEqual([
                { playerId: 7, itemId: item.id, item: { identifier: 'minecraft:cobblestone', count: 1 } }
            ]);
            expect(item.removed).toBe('picked_up');
        });

        it('waits forty ticks for a stack a player threw', () => {
            const fixture = fixtureOf({ players: [player(7, 0.5, 0.5)] });
            drop(fixture, 0.5, SURFACE, 0.5, { pickupDelay: 40 });

            step(fixture, 39);
            expect(fixture.world.given).toHaveLength(0);
            step(fixture);
            expect(fixture.world.given).toHaveLength(1);
        });

        it('is taken once, however many ticks run afterwards', () => {
            const fixture = fixtureOf({ players: [player(7, 0.5, 0.5)] });
            drop(fixture, 0.5, SURFACE, 0.5);

            step(fixture, 60);

            expect(fixture.world.given).toHaveLength(1);
        });

        it('stays put when everyone is out of reach, measured to the body', () => {
            const fixture = fixtureOf({ players: [player(7, 4, 4), player(8, 0.5, 0.5, SURFACE + 3.4)] });
            const item = drop(fixture, 0.5, SURFACE, 0.5);

            step(fixture, 40);

            expect(fixture.world.given).toEqual([]);
            expect(item.removed).toBe(undefined);
        });

        it('takes a stack merged this tick together with what it absorbed', () => {
            const fixture = fixtureOf({ players: [player(7, 1, 0.5)] });
            const older = drop(fixture, 0.9, SURFACE, 0.5, { pickupDelay: 0 });
            const higher = drop(fixture, 1.1, SURFACE, 0.5, { pickupDelay: 0 });

            step(fixture);

            expect(higher.removed).toBe('merged');
            expect(older.removed).toBe('picked_up');
            expect(fixture.world.given.map((given) => given.item.count)).toEqual([2]);
        });

        it('leaves a stack where it is for a full inventory, and what did not fit for a partial one', () => {
            const fixture = fixtureOf({ players: [player(7, 0.5, 0.5)] });
            fixture.world.room.set(7, 0);
            const item = drop(fixture, 0.5, SURFACE, 0.5, { stack: cobblestone(5), pickupDelay: 0 });

            step(fixture);
            expect(countOf(item)).toBe(5);

            fixture.world.room.set(7, 2);
            step(fixture);
            expect(countOf(item)).toBe(3);
            expect(fixture.world.stackChanges).toEqual([{ itemId: item.id, count: 3 }]);
        });

        it('goes only to its owner', () => {
            const fixture = fixtureOf({ players: [player(7, 0.5, 0.5)] });
            const item = drop(fixture, 0.5, SURFACE, 0.5, { pickupDelay: 0, owner: 'player-8' });

            step(fixture, 5);
            expect(item.removed).toBe(undefined);

            fixture.world.players = [player(8, 0.5, 0.5)];
            step(fixture);
            expect(item.removed).toBe('picked_up');
        });

        it('gives a mob what it takes and leaves the rest lying there', () => {
            const fixture = fixtureOf();
            const item = drop(fixture, 0.5, SURFACE, 0.5, { stack: cobblestone(5) });

            expect(fixture.runtime.droppedItems.take(item.id, 2)).toEqual(cobblestone(2));
            expect(countOf(item)).toBe(3);
            expect(fixture.runtime.droppedItems.take(item.id)).toEqual(cobblestone(3));
            expect(item.removed).toBe('picked_up');
            expect(fixture.runtime.droppedItems.take(item.id)).toBe(undefined);
        });
    });

    describe('leaving the world', () => {
        it('despawns after five minutes on the ground', () => {
            const fixture = fixtureOf();
            const item = drop(fixture, 0.5, SURFACE, 0.5, { age: 5998 });

            step(fixture);
            expect(item.removed).toBe(undefined);
            step(fixture);
            expect(item.removed).toBe('despawn');
        });

        it('is discarded once it falls past the void', () => {
            const fixture = fixtureOf();
            for (let y = -140; y <= FLOOR_Y; y += 1) fixture.world.setBlock({ x: 0, y, z: 0 }, 'minecraft:air');
            const item = drop(fixture, 0.5, -127.5, 0.5);

            step(fixture, 20);

            expect(item.removed).toBe('fell_out_of_world');
        });

        it('burns away in lava and survives it as netherite', () => {
            // Every vanilla item, so netherite's `minecraft:fire_resistant` is there to read.
            const fixture = entityFixture(new TestEntityWorld(), { itemDefinitions: vanillaItemDefinitions() });
            fixture.world.setBlock({ x: 0, y: SURFACE, z: 0 }, 'minecraft:lava');
            const stone = drop(fixture, 0.5, SURFACE, 0.5);
            fixture.world.setBlock({ x: 4, y: SURFACE, z: 0 }, 'minecraft:lava');
            const netherite = drop(fixture, 4.5, SURFACE, 0.5, {
                stack: { name: 'minecraft:netherite_ingot', count: 1 }
            });

            step(fixture, 30);

            expect(stone.removed).toBe('death');
            expect(netherite.removed).toBe(undefined);
        });

        it('is pricked to nothing against a cactus', () => {
            const fixture = fixtureOf();
            fixture.world.setBlock({ x: 1, y: SURFACE, z: 0 }, 'minecraft:cactus');
            const item = drop(fixture, 0.874, SURFACE, 0.5);

            step(fixture, 60);

            expect(item.removed).toBe('death');
        });

        it('is destroyed by a blast, except a nether star', () => {
            const fixture = entityFixture(new TestEntityWorld(), { itemDefinitions: vanillaItemDefinitions() });
            const stone = drop(fixture, 0.5, SURFACE, 0.5);
            const star = drop(fixture, 4.5, SURFACE, 0.5, { stack: { name: 'minecraft:nether_star', count: 1 } });

            expect(fixture.runtime.droppedItems.hurt(stone, 6, DamageCause.Explosion)).toBe(true);
            expect(fixture.runtime.droppedItems.hurt(star, 6, DamageCause.Explosion)).toBe(false);
            expect([stone.removed, star.removed]).toEqual(['death', undefined]);
        });
    });

    it('undoes an update that throws and skips the stack for the rest of the tick', () => {
        const fixture = fixtureOf({ players: [player(7, 0.5, 0.5)] });
        const item = drop(fixture, 0.5, SURFACE + 2, 0.5, { pickupDelay: 0 });
        drop(fixture, 0.6, SURFACE + 2, 0.5);
        fixture.world.onGive = () => {
            throw new Error('the inventory is gone');
        };

        step(fixture);

        // Moved, merged and then threw in its pickup: the whole update is undone.
        expect(item.position.y).toBe(SURFACE + 2 + OFFSET);
        expect(countOf(item)).toBe(1);
        expect(itemViewOf(item)?.age).toBe(0);
        expect(fixture.runtime.all()).toHaveLength(2);
        expect(fixture.runtime.store.counts().reverted).toBe(1);
        expect(fixture.reports.some((report) => report.includes('the inventory is gone'))).toBe(true);
    });
});
