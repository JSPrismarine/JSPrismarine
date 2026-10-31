import { Vector3 } from '@jsprismarine/math';
import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { Item as ItemStack } from '../../item/Item';
import { testEntityServer } from '../../testing/entityServer';
import { Position } from '../../world/Position';
import { EyeOfEnderSignal } from './EyeOfEnderSignal';

/** A world that records what an eye does to it: where it moves, what it drops, what it plays. */
const fakeWorld = () => {
    const moves: Vector3[] = [];
    const removed: unknown[] = [];
    const dropped: { position: Vector3; items: unknown[] }[] = [];
    const worldEvents: { event: number; data: number }[] = [];
    const actorSounds: number[] = [];

    return {
        moves,
        removed,
        dropped,
        worldEvents,
        actorSounds,
        getName: () => 'test',
        getServer: () => testEntityServer(),
        broadcastMove: async (entity: { getPosition(): Vector3 }) => void moves.push(entity.getPosition()),
        removeEntity: async (entity: unknown) => void removed.push(entity),
        dropContents: async (position: Vector3, items: unknown[]) => void dropped.push({ position, items }),
        sendWorldEvent: async (_position: Vector3 | null, event: number, data: number) =>
            void worldEvents.push({ event, data }),
        sendActorSound: async (_entity: unknown, sound: number) => void actorSounds.push(sound)
    };
};

const eye = () => new ItemStack({ runtimeId: 1, name: 'minecraft:ender_eye' });

/** An eye thrown from (0, 65, 0), with a random that always rolls `roll`. */
const thrownAt = (world: ReturnType<typeof fakeWorld>, roll = 0.5) =>
    new EyeOfEnderSignal({
        item: eye(),
        random: () => roll,
        position: new Position(0, 65, 0, world as never)
    });

const tick = async (entity: EyeOfEnderSignal, ticks: number) => {
    for (let i = 1; i <= ticks; i++) await entity.update(i);
};

describe('entity', () => {
    describe('EyeOfEnderSignal', () => {
        it('flies toward a far stronghold, rising eight blocks and stopping twelve blocks out', async () => {
            // Java's `signalTo`: past twelve horizontal blocks the eye aims twelve blocks along the
            // way and eight blocks up, which is what makes an eye point rather than travel.
            const world = fakeWorld();
            const signal = thrownAt(world);
            signal.signalTo(new Vector3(100, 0, 0));

            await tick(signal, 40);

            const at = signal.getPosition();
            expect(at.getX()).toBeCloseTo(12, 0);
            expect(at.getZ()).toBeCloseTo(0, 5);
            expect(at.getY()).toBeGreaterThan(72);
            expect(at.getY()).toBeLessThan(74);
            // Every tick moved it and every move reached the world. The first tick carries the
            // zero motion it was thrown with, as Java's does; the second sets off toward the target.
            expect(world.moves).toHaveLength(40);
            expect(world.moves[1]?.getX()).toBeGreaterThan(0);
            expect(world.moves[19]?.getX()).toBeLessThan(world.moves[39]?.getX() ?? 0);
        });

        it('sinks toward a near stronghold, which lies below it', async () => {
            // Within twelve blocks the eye flies at the structure's own point, whose y is the
            // ground the stronghold was laid out at, so it descends.
            const world = fakeWorld();
            const signal = thrownAt(world);
            signal.signalTo(new Vector3(5, 0, 0));

            await tick(signal, 40);

            const at = signal.getPosition();
            expect(at.getX()).toBeCloseTo(5, 0);
            expect(at.getY()).toBeLessThan(60);
        });

        it('reports its motion so the spawn packet carries it', async () => {
            const world = fakeWorld();
            const signal = thrownAt(world);
            signal.signalTo(new Vector3(100, 0, 0));
            expect(signal.getVelocity()).toEqual(Vector3.ZERO);

            await tick(signal, 1);

            expect(signal.getVelocity().getX()).toBeGreaterThan(0);
        });

        it('drops as an eye of ender after eighty ticks when the roll lets it survive', async () => {
            // `random.nextInt(5) > 0` survives, so any roll from 0.2 up keeps the eye.
            const world = fakeWorld();
            const signal = thrownAt(world, 0.2);
            signal.signalTo(new Vector3(100, 0, 0));

            await tick(signal, 80);
            expect(world.removed).toHaveLength(0);

            await tick(signal, 1);
            expect(world.removed).toEqual([signal]);
            expect(world.dropped).toHaveLength(1);
            expect(world.dropped[0]?.items).toEqual([signal.getItem()]);
            expect(world.worldEvents).toHaveLength(0);
            expect(world.actorSounds).toEqual([LevelSoundEvent.DEATH]);
        });

        it('shatters instead when the roll lands on the one in five', async () => {
            const world = fakeWorld();
            const signal = thrownAt(world, 0.1);
            signal.signalTo(new Vector3(100, 0, 0));

            await tick(signal, 81);

            expect(world.removed).toEqual([signal]);
            expect(world.dropped).toHaveLength(0);
            expect(world.worldEvents).toEqual([{ event: LevelEvent.PARTICLES_EYE_OF_ENDER_DEATH, data: 0 }]);
            expect(world.actorSounds).toEqual([LevelSoundEvent.DEATH]);
        });

        it('hangs where it was thrown until it is given a target', async () => {
            const world = fakeWorld();
            const signal = thrownAt(world);

            await tick(signal, 5);

            expect(signal.getPosition().getY()).toBe(65);
            expect(world.moves).toHaveLength(0);
        });

        it('is the eye of ender signal actor and does not outlive a save', () => {
            const signal = thrownAt(fakeWorld());
            expect(signal.getType()).toBe('minecraft:eye_of_ender_signal');
            expect(signal.shouldPersist()).toBe(false);
        });
    });
});
