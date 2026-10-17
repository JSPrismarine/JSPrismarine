import { describe, expect, it } from 'vitest';
import { EntityTracker, type TrackableEntity } from './EntityTracker';
import { VIEW_MARGIN_CHUNKS } from '../world/Proximity';

const VIEW_DISTANCE = 10;
const HYSTERESIS = 2;

/** A plain entity: the tracker asks for an id, a position and a range, and nothing else. */
const entityAt = (id: bigint, chunksEast: number, range = 8): TrackableEntity => ({
    getRuntimeId: () => id,
    getPosition: () => ({ getX: () => chunksEast * 16 + 8, getY: () => 64, getZ: () => 8 }),
    getTrackingRange: () => range
});

const viewer = { getX: () => 8, getY: () => 64, getZ: () => 8 };

const plan = (tracker: EntityTracker, entities: TrackableEntity[]) =>
    tracker.plan({ viewer, viewDistance: VIEW_DISTANCE, self: 999n, entities });

const newTracker = (enabled = true) => new EntityTracker({ hysteresis: HYSTERESIS, enabled });

describe('network', () => {
    describe('EntityTracker', () => {
        it('should plan a spawn for a nearby entity', () => {
            const tracker = newTracker();
            const near = entityAt(1n, 2);

            const change = plan(tracker, [near]);

            expect(change.spawn).toEqual([near]);
            expect(change.despawn).toEqual([]);
        });

        it('should plan nothing on a second pass', () => {
            // Idempotence is what the whole join sequence relies on: the resource pack handler
            // and `World.addEntity` both reconcile, and neither may double-spawn.
            const tracker = newTracker();
            const near = entityAt(1n, 2);

            plan(tracker, [near]);
            tracker.add(1n);

            expect(plan(tracker, [near])).toEqual({ spawn: [], despawn: [] });
        });

        it('should never plan the viewer itself', () => {
            // A client is not sent a spawn for the entity it is driving.
            const tracker = newTracker();

            expect(plan(tracker, [entityAt(999n, 0)]).spawn).toEqual([]);
        });

        it('should not spawn an entity beyond the viewer reach', () => {
            const tracker = newTracker();
            const far = entityAt(1n, VIEW_DISTANCE + VIEW_MARGIN_CHUNKS + 1, 32);

            expect(plan(tracker, [far]).spawn).toEqual([]);
        });

        describe('per-type range', () => {
            it('should hold an item to a shorter reach than a mob at the same distance', () => {
                const tracker = newTracker();
                // Inside a mob's range of 8 + margin, outside an item's 6 + margin.
                const distance = 8;

                expect(plan(tracker, [entityAt(1n, distance, 8)]).spawn).toHaveLength(1);
                expect(plan(tracker, [entityAt(2n, distance, 6)]).spawn).toHaveLength(0);
            });
        });

        describe('hysteresis', () => {
            it('should keep a tracked entity just past the spawn reach', () => {
                // With one radius, a player standing on the boundary sends an AddActor and a
                // RemoveActor on alternating passes. This gap is what stops that.
                const tracker = newTracker();
                tracker.add(1n);

                const justOutside = entityAt(1n, VIEW_DISTANCE + VIEW_MARGIN_CHUNKS + 1, 32);

                expect(plan(tracker, [justOutside]).despawn).toEqual([]);
            });

            it('should drop it once it is past the hysteresis too', () => {
                const tracker = newTracker();
                tracker.add(1n);

                const wellOutside = entityAt(1n, VIEW_DISTANCE + VIEW_MARGIN_CHUNKS + HYSTERESIS + 1, 32);

                expect(plan(tracker, [wellOutside]).despawn).toEqual([1n]);
            });

            it('should spawn it again once it comes back', () => {
                const tracker = newTracker();
                const near = entityAt(1n, 2);

                expect(plan(tracker, [near]).spawn).toEqual([near]);
            });
        });

        it('should despawn an entity that has left the world between passes', () => {
            const tracker = newTracker();
            tracker.add(7n);

            expect(plan(tracker, []).despawn).toEqual([7n]);
        });

        describe('disabled', () => {
            it('should spawn everything however far away', () => {
                const tracker = newTracker(false);

                expect(plan(tracker, [entityAt(1n, 5_000, 6)]).spawn).toHaveLength(1);
            });

            it('should not despawn by distance', () => {
                const tracker = newTracker(false);
                tracker.add(1n);

                expect(plan(tracker, [entityAt(1n, 5_000, 6)]).despawn).toEqual([]);
            });
        });

        describe('bookkeeping', () => {
            it('should report what it is holding', () => {
                const tracker = newTracker();

                expect(tracker.tracks(1n)).toBe(false);
                tracker.add(1n);
                expect(tracker.tracks(1n)).toBe(true);
                expect(tracker.size).toBe(1);

                expect(tracker.remove(1n)).toBe(true);
                expect(tracker.remove(1n)).toBe(false);
            });

            it('should clear without producing a despawn plan', () => {
                // A world change: the client drops everything on its own.
                const tracker = newTracker();
                tracker.add(1n);
                tracker.clear();

                expect(tracker.size).toBe(0);
                expect(plan(tracker, []).despawn).toEqual([]);
            });
        });
    });
});
