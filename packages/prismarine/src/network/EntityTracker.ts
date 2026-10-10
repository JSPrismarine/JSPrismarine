import { isInView, VIEW_MARGIN_CHUNKS, type Point3 } from '../world/Proximity';

/**
 * The parts of an entity a tracker reads.
 *
 * Structural rather than the `Entity` class, so a test can hand this a plain object and so
 * this file does not import half the server to answer a question about distance.
 */
export interface TrackableEntity {
    getRuntimeId(): bigint;
    getPosition(): Point3;
    /** How far clients follow this kind of entity, in chunks. See `Entity.getTrackingRange`. */
    getTrackingRange(): number;
}

/**
 * What one pass decided.
 *
 * `despawn` carries ids rather than entities because an entity may have left the world
 * between two passes, and the client still has to be told to take it off screen.
 */
export interface TrackingChange<T extends TrackableEntity> {
    readonly spawn: readonly T[];
    readonly despawn: readonly bigint[];
}

export interface EntityTrackerOptions {
    /** Chunks past a viewer's own reach before a tracked entity is dropped. */
    readonly hysteresis: number;
    /** `false` tracks everything in the world - the `proximity-broadcast` escape hatch. */
    readonly enabled: boolean;
}

export interface TrackingPlanRequest<T extends TrackableEntity> {
    readonly viewer: Point3;
    readonly viewDistance: number;
    /** The viewer's own runtime id. A client is never sent a spawn for the entity it drives. */
    readonly self: bigint;
    /**
     * Every entity in the world, and it must be every one.
     *
     * A plan despawns anything tracked that is not in here, on the grounds that it has left
     * the world since the last pass. Handing it a subset therefore asks it to hide everything
     * else - for a single entity, use {@link EntityTracker.shouldSpawn}.
     */
    readonly entities: Iterable<T>;
}

/**
 * One client's set of visible entities.
 *
 * Decides and records; it never sends anything. That split is what makes this testable with
 * plain objects, and it is why {@link EntityTracker.plan} returns a description of the work
 * instead of doing it - the caller owns the packets and the failure handling.
 *
 * Spawning and despawning deliberately use different radii. With a single radius, a player
 * standing still on the boundary produces an `AddActor` and a `RemoveActor` for every entity
 * out there on alternating passes; the gap between the two radii is what stops that.
 *
 * @remarks The mob spawner works at 24-88 blocks, which is one and a half to five and a half
 * chunks - comfortably inside any view distance, so the two do not interact. Anyone widening
 * the spawner's radii should check that this is still true.
 */
export class EntityTracker {
    private readonly tracked = new Set<bigint>();
    private readonly options: EntityTrackerOptions;

    public constructor(options: EntityTrackerOptions) {
        this.options = options;
    }

    /** Whether this client currently has the entity on screen. */
    public tracks(runtimeId: bigint): boolean {
        return this.tracked.has(runtimeId);
    }

    /** How many entities this client is holding. */
    public get size(): number {
        return this.tracked.size;
    }

    /**
     * What must change for a viewer standing where they now stand.
     *
     * Sends nothing and records nothing - the caller applies the result and then calls
     * {@link EntityTracker.add} or {@link EntityTracker.remove} for what actually went out.
     * @param {TrackingPlanRequest} request - The viewer and the entities to consider.
     * @returns {TrackingChange} The entities to show and the ids to hide.
     */
    public plan<T extends TrackableEntity>(request: TrackingPlanRequest<T>): TrackingChange<T> {
        const { viewer, viewDistance, self, entities } = request;

        const spawn: T[] = [];
        const despawn: bigint[] = [];

        // Anything tracked and not seen this pass has left the world between passes, so it is
        // despawned by absence. Entries are struck off as they are met.
        const missing = new Set(this.tracked);

        for (const entity of entities) {
            const runtimeId = entity.getRuntimeId();
            if (runtimeId === self) continue;

            missing.delete(runtimeId);

            const isTracked = this.tracked.has(runtimeId);

            if (!this.options.enabled) {
                if (!isTracked) spawn.push(entity);
                continue;
            }

            // The same view test the rest of the server uses, so the radius an entity is
            // picked up at cannot drift from the one a block update at its feet uses. The
            // hysteresis is expressed as extra margin, which is exactly what it is.
            const test = {
                event: entity.getPosition(),
                viewer,
                viewDistance,
                range: entity.getTrackingRange()
            };

            if (!isTracked) {
                if (isInView(test)) spawn.push(entity);
                continue;
            }

            // Held on to a little past where it would have been picked up.
            if (!isInView({ ...test, margin: VIEW_MARGIN_CHUNKS + this.options.hysteresis })) despawn.push(runtimeId);
        }

        for (const runtimeId of missing) despawn.push(runtimeId);

        return { spawn, despawn };
    }

    /**
     * Whether one entity should be shown to a viewer that does not have it yet.
     *
     * The single-entity counterpart to {@link EntityTracker.plan}, for something that has just
     * arrived rather than a pass over the whole world. Separate because a plan reads the
     * absence of an entity as "it is gone", which is only true of a complete set.
     * @param {TrackableEntity} entity - The entity that arrived.
     * @param {Point3} viewer - Where the recipient is.
     * @param {number} viewDistance - The recipient's negotiated chunk radius.
     * @returns {boolean} `true` if it should be spawned now.
     */
    public shouldSpawn(entity: TrackableEntity, viewer: Point3, viewDistance: number): boolean {
        if (this.tracked.has(entity.getRuntimeId())) return false;
        if (!this.options.enabled) return true;

        return isInView({
            event: entity.getPosition(),
            viewer,
            viewDistance,
            range: entity.getTrackingRange()
        });
    }

    /** Records that an entity is now on the client. */
    public add(runtimeId: bigint): void {
        this.tracked.add(runtimeId);
    }

    /**
     * Records that an entity is no longer on the client.
     * @param {bigint} runtimeId - The entity's runtime id.
     * @returns {boolean} Whether it had been tracked.
     */
    public remove(runtimeId: bigint): boolean {
        return this.tracked.delete(runtimeId);
    }

    /** Forgets everything without implying a packet - the client is changing worlds. */
    public clear(): void {
        this.tracked.clear();
    }
}

export default EntityTracker;
