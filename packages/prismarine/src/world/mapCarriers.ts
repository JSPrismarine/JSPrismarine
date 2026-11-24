/**
 * Who carries a map and what each of them has yet to be sent: the runtime half of Java 26.3's
 * `MapItemSavedData`, its `carriedBy` list of `HoldingPlayer`s and the player markers it keeps
 * beside the saved ones.
 *
 * None of it is saved. A holder is registered the first tick it carries the map and starts with
 * the whole map and every marker due, and is dropped the first tick anyone carrying the map sees
 * it no longer does, which also takes its marker off.
 */
import type { MapHolderPosition, SavedMap, SavedMapDecoration } from './savedMap';
import { MAP_SIZE, holderDecorationOnMap } from './savedMap';

/** A player that may carry a map, as the map asks after it each tick. */
export interface MapCarrier {
    /** The name its marker is kept under, Java's plain text name. */
    readonly name: string;
    /** Whether it left the game. */
    isRemoved(): boolean;
    /** Whether any slot of its inventory holds the map. */
    carries(map: SavedMap): boolean;
    /** The level id of the dimension it is in. */
    dimension(): string;
    /** Where it stands, for its marker. */
    position(): MapHolderPosition;
    /** Whether it wears something that hides it from maps, `#minecraft:map_invisibility_equipment`. */
    hidesFromMaps(): boolean;
}

/** The part of a map one holder has not been sent yet. */
export interface MapUpdate {
    /** The changed pixels, a rectangle of Java's packed color ids in row order. */
    readonly patch?: {
        readonly startX: number;
        readonly startY: number;
        readonly width: number;
        readonly height: number;
        readonly colors: Uint8Array;
    };
    /** Every marker, when one changed. */
    readonly decorations?: readonly SavedMapDecoration[];
}

/** Java's `MapItemSavedData$HoldingPlayer`. */
class Holder {
    /** Which sixteenth of the columns `updateMapAround` redraws next. */
    public step = 0;
    // A new holder is owed the whole map and every marker.
    private dirtyData = true;
    private minDirtyX = 0;
    private minDirtyY = 0;
    private maxDirtyX = MAP_SIZE - 1;
    private maxDirtyY = MAP_SIZE - 1;
    private dirtyDecorations = true;
    private tick = 0;

    public markColorsDirty(x: number, y: number): void {
        if (this.dirtyData) {
            this.minDirtyX = Math.min(this.minDirtyX, x);
            this.minDirtyY = Math.min(this.minDirtyY, y);
            this.maxDirtyX = Math.max(this.maxDirtyX, x);
            this.maxDirtyY = Math.max(this.maxDirtyY, y);
        } else {
            this.dirtyData = true;
            this.minDirtyX = x;
            this.minDirtyY = y;
            this.maxDirtyX = x;
            this.maxDirtyY = y;
        }
    }

    public markDecorationsDirty(): void {
        this.dirtyDecorations = true;
    }

    /** Java's `nextUpdatePacket`: the dirty pixels, and the markers at most every fifth tick they changed. */
    public nextUpdate(colors: Uint8Array, decorations: () => readonly SavedMapDecoration[]): MapUpdate | undefined {
        let patch: MapUpdate['patch'];
        if (this.dirtyData) {
            this.dirtyData = false;
            const width = this.maxDirtyX + 1 - this.minDirtyX;
            const height = this.maxDirtyY + 1 - this.minDirtyY;
            const rows = new Uint8Array(width * height);
            for (let y = 0; y < height; y++) {
                const from = this.minDirtyX + (this.minDirtyY + y) * MAP_SIZE;
                rows.set(colors.subarray(from, from + width), y * width);
            }
            patch = { startX: this.minDirtyX, startY: this.minDirtyY, width, height, colors: rows };
        }

        let shown: readonly SavedMapDecoration[] | undefined;
        // Java counts the tick only while the markers are dirty.
        if (this.dirtyDecorations && this.tick++ % 5 === 0) {
            this.dirtyDecorations = false;
            shown = decorations();
        }

        if (patch === undefined && shown === undefined) return undefined;
        return { ...(patch === undefined ? {} : { patch }), ...(shown === undefined ? {} : { decorations: shown }) };
    }
}

/** The carriers of one map. */
export class MapCarriers {
    // By carrier, as Java keys them by player: a player who rejoins under the same name is a new holder.
    private readonly holders = new Map<MapCarrier, Holder>();
    /** The holders' markers by name, in the order they were first drawn. */
    private readonly markers = new Map<string, SavedMapDecoration>();

    public constructor(private readonly map: SavedMap) {}

    /** The holder a carrier is, registered on first sight as Java's `getHoldingPlayer` does. */
    private holderOf(carrier: MapCarrier): Holder {
        let holder = this.holders.get(carrier);
        if (holder === undefined) {
            holder = new Holder();
            this.holders.set(carrier, holder);
        }
        return holder;
    }

    /**
     * Every marker one player is shown: the saved ones, then the holders'.
     *
     * A holder's marker stays until some carrier of the map ticks, as in Java, so a holder that
     * left or put the map away since, or that hides from maps, is left out here. Java sends a
     * player the markers right after that player's own tick has taken those off; a map asked for
     * outside a tick has no such tick. The viewer's own marker is always shown.
     *
     * @param viewer - The player shown the map, or undefined for nobody's own marker.
     */
    public decorations(viewer?: MapCarrier): readonly SavedMapDecoration[] {
        const carriers = [...this.holders.keys()];
        const shown = [...this.markers]
            .filter(([name]) => {
                const holder = carriers.find((carrier) => carrier.name === name);
                if (holder === undefined || holder === viewer) return true;
                return !holder.isRemoved() && holder.carries(this.map) && !holder.hidesFromMaps();
            })
            .map(([, marker]) => marker);
        return [...this.map.decorations, ...shown];
    }

    /**
     * Java's `tickCarriedBy` for a map in a player's inventory: registers the player, then moves
     * every holder's marker and drops each holder that left or no longer carries the map.
     */
    public tickCarriedBy(ticking: MapCarrier): void {
        this.holderOf(ticking);
        if (!ticking.carries(this.map)) this.removeMarker(ticking.name);

        for (const other of [...this.holders.keys()]) {
            if (!other.isRemoved() && other.carries(this.map)) {
                if (other.dimension() === this.map.dimension && this.map.trackingPosition) {
                    this.setMarker(other.name, holderDecorationOnMap(this.map, other.position()));
                }
            } else {
                this.holders.delete(other);
                this.removeMarker(other.name);
            }

            if (other !== ticking && other.hidesFromMaps()) this.removeMarker(other.name);
        }
    }

    /** Advances a holder's step and answers it, for `updateMapAround`. */
    public nextStep(carrier: MapCarrier): number {
        const holder = this.holderOf(carrier);
        holder.step++;
        return holder.step;
    }

    /**
     * Writes a pixel and marks it dirty for every holder, Java's `updateColor`.
     * @returns Whether the pixel changed.
     */
    public readonly paint = (x: number, z: number, packedColor: number): boolean => {
        const colors = this.map.colors;
        const index = x + z * MAP_SIZE;
        if (colors === undefined || colors[index] === packedColor) return false;
        colors[index] = packedColor;
        for (const holder of this.holders.values()) holder.markColorsDirty(x, z);
        return true;
    };

    /** What a holder has not been sent yet, or undefined when it is up to date or not a holder. */
    public nextUpdate(carrier: MapCarrier): MapUpdate | undefined {
        const colors = this.map.colors;
        const holder = this.holders.get(carrier);
        if (colors === undefined || holder === undefined) return undefined;
        return holder.nextUpdate(colors, () => this.decorations(carrier));
    }

    /**
     * Owes a holder an update again after it failed to reach the player, so the next one carries
     * its pixels and markers rather than leaving them stale on the client.
     */
    public unsent(carrier: MapCarrier, update: MapUpdate): void {
        const holder = this.holders.get(carrier);
        if (holder === undefined) return;
        const patch = update.patch;
        if (patch !== undefined) {
            holder.markColorsDirty(patch.startX, patch.startY);
            holder.markColorsDirty(patch.startX + patch.width - 1, patch.startY + patch.height - 1);
        }
        if (update.decorations !== undefined) holder.markDecorationsDirty();
    }

    private setMarker(name: string, decoration: SavedMapDecoration | undefined): void {
        if (decoration === undefined) {
            this.removeMarker(name);
            return;
        }
        const previous = this.markers.get(name);
        this.markers.set(name, decoration);
        if (
            previous?.type !== decoration.type ||
            previous.x !== decoration.x ||
            previous.y !== decoration.y ||
            previous.rotation !== decoration.rotation
        ) {
            this.markDecorationsDirty();
        }
    }

    private removeMarker(name: string): void {
        this.markers.delete(name);
        // Java marks the markers dirty whether or not one was there.
        this.markDecorationsDirty();
    }

    private markDecorationsDirty(): void {
        for (const holder of this.holders.values()) holder.markDecorationsDirty();
    }
}

/** Each saved map's carriers, kept while the level keeps the map. */
const carriersByMap = new WeakMap<SavedMap, MapCarriers>();

/** The carriers of a saved map. */
export const carriersOf = (map: SavedMap): MapCarriers => {
    let carriers = carriersByMap.get(map);
    if (carriers === undefined) {
        carriers = new MapCarriers(map);
        carriersByMap.set(map, carriers);
    }
    return carriers;
};
