/**
 * The chunk-section registry Java's game-event dispatcher visits.
 *
 * Listeners stay in the section containing their position. A post visits only
 * loaded chunk columns in the event's notification range, then each listener
 * applies its own spherical radius. Most listeners run inline; listeners that
 * request distance delivery run after the walk, nearest first.
 */
import type { ContentPosition } from '../content/world/adapter';
import type { ContentGameEvent } from '../network/contentAdapter';

/** How a listener receives events from one dispatcher walk. */
export type GameEventDeliveryMode = 'unspecified' | 'by_distance';

/** One registered Java game-event listener. */
export interface GameEventListener {
    /** Resolves the listener's current position, or undefined while it has none. */
    getPosition(): ContentPosition | undefined;
    /** The listener's own notification radius, in blocks. */
    getListenerRadius(): number;
    /** Handles one event delivered within the listener's radius. */
    handleGameEvent(event: ContentGameEvent): void;
    /** Defaults to inline delivery. */
    getDeliveryMode?(): GameEventDeliveryMode;
}

/** What the registry needs from its owning world. */
export interface GameEventListenerWorld {
    /** Returns a chunk only when it is already loaded. */
    getLoadedChunk(chunkX: number, chunkZ: number): unknown | null;
}

/** The notification radius Java assigns to game events with a special range. */
const SPECIAL_EVENT_RADII: ReadonlyMap<string, number> = new Map([
    ['minecraft:jukebox_play', 10],
    ['minecraft:jukebox_stop_play', 10],
    ['minecraft:shriek', 32]
]);

/** The default notification range for game events whose registry has no special radius. */
const DEFAULT_NOTIFICATION_RADIUS = 16;

/** The squared distance between two positions. */
const squaredDistance = (left: ContentPosition, right: ContentPosition): number => {
    const x = left.x - right.x;
    const y = left.y - right.y;
    const z = left.z - right.z;
    return x * x + y * y + z * z;
};

/** The section coordinate of one block coordinate. */
const sectionCoordinate = (coordinate: number): number => Math.floor(coordinate / 16);

/** A section's listeners and the changes deferred while it is being visited. */
class ListenerSection {
    public readonly listeners = new Set<GameEventListener>();
    private visitDepth = 0;
    private readonly pending: Array<() => void> = [];

    /** Adds a listener, applying the mutation after an active visit. */
    public add(listener: GameEventListener): void {
        this.mutate(() => this.listeners.add(listener));
    }

    /** Removes a listener, applying the mutation after an active visit. */
    public remove(listener: GameEventListener): void {
        this.mutate(() => this.listeners.delete(listener));
    }

    /** Runs a callback over this registry and then applies its queued changes. */
    public visit(run: (listeners: Set<GameEventListener>) => void): void {
        this.visitDepth += 1;
        try {
            run(this.listeners);
        } finally {
            this.visitDepth -= 1;
            if (this.visitDepth === 0) {
                for (const mutation of this.pending.splice(0)) mutation();
            }
        }
    }

    /** Whether the registry has no listener or deferred registration. */
    public get empty(): boolean {
        return this.listeners.size === 0 && this.pending.length === 0;
    }

    private mutate(mutation: () => void): void {
        if (this.visitDepth > 0) this.pending.push(mutation);
        else mutation();
    }
}

/**
 * The game-event listener registries for one world.
 *
 * Registration and movement are separate because entities move between
 * sections while block listeners stay where their block entities were placed.
 */
export class GameEventListenerRegistry {
    private readonly sections = new Map<string, ListenerSection>();
    private readonly sectionByListener = new Map<GameEventListener, string>();

    /** Creates the registries over one world's loaded-chunk view. */
    public constructor(private readonly world: GameEventListenerWorld) {}

    /**
     * Registers a listener in the section containing its current position.
     *
     * @returns A function that removes the listener. Calling it more than once
     *   has no effect after the first call.
     */
    public add(listener: GameEventListener): () => void {
        this.move(listener);
        return () => this.remove(listener);
    }

    /** Re-files a registered listener after its position changes. */
    public move(listener: GameEventListener): void {
        const position = listener.getPosition();
        const nextKey = position === undefined ? undefined : this.sectionKey(position);
        const previousKey = this.sectionByListener.get(listener);
        if (previousKey === nextKey) return;

        if (previousKey !== undefined) {
            this.sectionByListener.delete(listener);
            this.changeSection(previousKey, (section) => section.remove(listener));
        }

        if (nextKey !== undefined) {
            this.sectionByListener.set(listener, nextKey);
            this.changeSection(nextKey, (section) => section.add(listener));
        }
    }

    /** Removes a registered listener. */
    public remove(listener: GameEventListener): void {
        const sectionKey = this.sectionByListener.get(listener);
        if (sectionKey === undefined) return;

        this.sectionByListener.delete(listener);
        this.changeSection(sectionKey, (section) => section.remove(listener));
    }

    /**
     * Posts an event to listeners in loaded sections within its notification radius.
     *
     * Immediate listeners run during the section walk. `by_distance` listeners
     * run afterwards in ascending distance order, as Java's catalyst listener
     * requires when the nearest listener consumes the source's experience.
     */
    public post(event: ContentGameEvent): void {
        const radius = SPECIAL_EVENT_RADII.get(event.event) ?? DEFAULT_NOTIFICATION_RADIUS;
        const minSectionX = sectionCoordinate(event.at.x - radius);
        const maxSectionX = sectionCoordinate(event.at.x + radius);
        const minSectionY = sectionCoordinate(event.at.y - radius);
        const maxSectionY = sectionCoordinate(event.at.y + radius);
        const minSectionZ = sectionCoordinate(event.at.z - radius);
        const maxSectionZ = sectionCoordinate(event.at.z + radius);
        const loadedColumns = new Set<string>();
        const distanceListeners: Array<{ readonly listener: GameEventListener; readonly distance: number }> = [];

        for (let sectionX = minSectionX; sectionX <= maxSectionX; sectionX += 1) {
            for (let sectionZ = minSectionZ; sectionZ <= maxSectionZ; sectionZ += 1) {
                const column = `${sectionX},${sectionZ}`;
                if (!loadedColumns.has(column)) {
                    loadedColumns.add(column);
                    if (this.world.getLoadedChunk(sectionX, sectionZ) === null) continue;
                }

                for (let sectionY = minSectionY; sectionY <= maxSectionY; sectionY += 1) {
                    const sectionKey = `${sectionX},${sectionY},${sectionZ}`;
                    const section = this.sections.get(sectionKey);
                    if (section === undefined) continue;

                    section.visit((listeners) => {
                        for (const listener of listeners) {
                            const position = listener.getPosition();
                            if (position === undefined || !this.withinRadius(position, event.at, listener)) continue;

                            if (listener.getDeliveryMode?.() === 'by_distance') {
                                distanceListeners.push({ listener, distance: squaredDistance(position, event.at) });
                            } else {
                                listener.handleGameEvent(event);
                            }
                        }
                    });
                    this.removeIfEmpty(sectionKey, section);
                }
            }
        }

        distanceListeners.sort((left, right) => left.distance - right.distance);
        for (const { listener } of distanceListeners) listener.handleGameEvent(event);
    }

    private withinRadius(
        position: ContentPosition,
        eventPosition: ContentPosition,
        listener: GameEventListener
    ): boolean {
        const radius = listener.getListenerRadius();
        return Number.isFinite(radius) && radius >= 0 && squaredDistance(position, eventPosition) <= radius * radius;
    }

    private sectionKey(position: ContentPosition): string | undefined {
        if (![position.x, position.y, position.z].every(Number.isFinite)) return undefined;
        return `${sectionCoordinate(position.x)},${sectionCoordinate(position.y)},${sectionCoordinate(position.z)}`;
    }

    private changeSection(key: string, change: (section: ListenerSection) => void): void {
        let section = this.sections.get(key);
        if (section === undefined) {
            section = new ListenerSection();
            this.sections.set(key, section);
        }
        change(section);
        this.removeIfEmpty(key, section);
    }

    private removeIfEmpty(key: string, section: ListenerSection): void {
        if (section.empty) this.sections.delete(key);
    }
}
