/**
 * Where the live entities are, filed by the cell each one stands in.
 *
 * The runtime's one quadratic cost is the neighbor search: `goalWorld.mobs`
 * runs it once per searching goal, and a hundred mobs ask about seventy-five
 * times a tick. Crossing the whole index each time is a hundred answers for
 * four or five hits, because almost every goal that searches uses a radius of
 * six or eight blocks while the mobs are spread across the simulation
 * distance.
 *
 * Ordinary entities are bucketed by their horizontal center cell, and large
 * collision boxes are also filed into every horizontal cell their footprint
 * overlaps. A search reads only the cells its radius or box reaches. Y is not
 * bucketed: an entity above or below is still in the cell's list and the exact
 * distance or box check throws it out, which costs a column of mobs nothing
 * worth a third axis of cells.
 *
 * The index is exact rather than a snapshot. {@link EntityGrid.refile} runs on
 * every position write, through `MobBody.onMove`, so a search inside a tick
 * sees the mobs that already moved in that tick where they moved to. A grid
 * rebuilt once a tick would be cheaper and would answer a different question.
 */
import type { EntityPosition } from '@jsprismarine/entities';

import type { DataEntity } from './DataEntity';
import { squaredDistance } from './DataEntity';

/**
 * How wide one cell is, as the shift that divides a coordinate by it.
 *
 * Sixteen blocks. Searches commonly reach six or eight blocks, while target
 * searches can reach thirty-five. Wider cells reduce the empty map lookups in
 * those searches; the exact distance check still drops candidates outside the
 * requested radius.
 */
const CELL_BITS = 4;

/**
 * How many bits of each cell coordinate the key keeps.
 *
 * Twenty-six, which packs two of them into one integer a double holds exactly. With sixteen-block
 * cells, keys repeat after more than a billion blocks, well beyond the 30-million-block world
 * border.
 */
const KEY_BITS = 26;
const KEY_MASK = (1 << KEY_BITS) - 1;
const KEY_SPAN = 2 ** KEY_BITS;

/** Small results sort faster by shifting their arrival keys than by decorating every entity. */
const SMALL_RESULT_SORT_LIMIT = 8;

/** Boxes beyond common mob dimensions are filed in every horizontal cell they overlap. */
const LARGE_BOX_WIDTH = 2;
const LARGE_BOX_HEIGHT = 3;

/** The cell one horizontal coordinate falls in. */
const cellOf = (coordinate: number): number => Math.floor(coordinate) >> CELL_BITS;

/** One cell's key, which is its two coordinates packed into one number. */
const keyOf = (cellX: number, cellZ: number): number => (cellX & KEY_MASK) * KEY_SPAN + (cellZ & KEY_MASK);

/** One entity's dimensions as the spatial index last filed them. */
interface IndexedBox {
    readonly width: number;
    readonly height: number;
    readonly large: boolean;
}

/** Whether one box should use the overlap-cell index rather than the center-cell index. */
const isLargeBox = (width: number, height: number): boolean => width > LARGE_BOX_WIDTH || height > LARGE_BOX_HEIGHT;

/** The live entities of one dimension, indexed by where they stand. */
export class EntityGrid {
    /** The entities in each cell, keyed by {@link keyOf}. */
    private readonly cells = new Map<number, DataEntity[]>();

    /** Large boxes filed by the horizontal cells their footprints overlap. */
    private readonly largeCells = new Map<number, DataEntity[]>();

    /** The entities in each family and cell, for data-driven target searches. */
    private readonly familyCells = new Map<string, Map<number, DataEntity[]>>();

    /** The cell each entity is filed under now, so a move knows what to undo. */
    private readonly filed = new Map<number, number>();

    /** The families each entity is filed under now. */
    private readonly filedFamilies = new Map<number, readonly string[]>();

    /** Large boxes, keyed by their runtime ids. */
    private readonly largeBoxes = new Map<number, DataEntity>();

    /** The overlap cells used by each large entity, so movement and removal can undo its filing. */
    private readonly filedLargeBoxCells = new Map<number, readonly number[]>();

    /** The last dimensions filed for each entity, including its broadphase class. */
    private readonly indexedBoxes = new Map<number, IndexedBox>();

    /** Width counts for ordinary boxes, which keep their center-cell index. */
    private readonly regularBoxWidths = new Map<number, number>();

    /** The widest ordinary box, maintained as entities enter, leave, or change components. */
    private widestRegularBox = 0;

    /**
     * When each entity entered the index.
     *
     * A cell's list is in the order entities were filed into it, and a move
     * refiles, so neither is the order the index itself holds. `goalWorld.mobs`
     * breaks a tie in distance by that order, which decides who a zombie picks
     * out of a crowd standing together, so {@link EntityGrid.within} puts it
     * back. Counted here rather than read off the runtime id, because the id
     * comes from whatever counter the host supplies.
     */
    private readonly arrived = new Map<number, number>();

    private arrivals = 0;

    /** Puts one entity in the index, at the position it stands at now. */
    public add(entity: DataEntity): void {
        this.arrived.set(entity.id, this.arrivals);
        this.arrivals += 1;
        this.file(entity, cellKeyOf(entity.position));
        this.refreshBox(entity);
        this.refreshFamilies(entity);
    }

    /** Takes one entity out of the index. */
    public remove(entity: DataEntity): void {
        const key = this.filed.get(entity.id);
        if (key === undefined) return;
        this.filed.delete(entity.id);
        this.arrived.delete(entity.id);
        this.unfileLargeBox(entity.id);
        this.removeIndexedBox(entity.id);
        this.unfile(entity, key);
        for (const family of this.filedFamilies.get(entity.id) ?? []) this.unfileFamily(entity, family, key);
        this.filedFamilies.delete(entity.id);
    }

    /** Moves one entity to the cell it stands in now, which a position write calls. */
    public refile(entity: DataEntity): void {
        const was = this.filed.get(entity.id);
        if (was === undefined) return;

        this.refreshBox(entity);
        if (this.largeBoxes.has(entity.id)) {
            this.unfileLargeBox(entity.id);
            this.fileLargeBox(entity);
        }

        const now = cellKeyOf(entity.position);
        if (now === was) {
            this.refreshFamilies(entity);
            return;
        }

        for (const family of this.filedFamilies.get(entity.id) ?? []) this.unfileFamily(entity, family, was);
        this.unfile(entity, was);
        this.file(entity, now);
        for (const family of this.filedFamilies.get(entity.id) ?? []) this.fileFamily(entity, family, now);
    }

    /** Updates the family index after an entity applies its data-driven events. */
    public refreshFamilies(entity: DataEntity): void {
        const key = this.filed.get(entity.id);
        if (key === undefined) return;

        const previous = this.filedFamilies.get(entity.id) ?? [];
        const families = entity.instance.families();
        if (previous.length === families.length && previous.every((family, index) => family === families[index]))
            return;

        const uniqueFamilies = [...new Set(families)];
        if (
            previous.length === uniqueFamilies.length &&
            previous.every((family, index) => family === uniqueFamilies[index])
        )
            return;

        for (const family of previous) this.unfileFamily(entity, family, key);
        for (const family of uniqueFamilies) this.fileFamily(entity, family, key);
        this.filedFamilies.set(entity.id, uniqueFamilies);
    }

    /**
     * Every entity within a radius of a position, in the order they entered
     * the index.
     *
     * The same answer {@link Map.values} filtered by distance gives, which is
     * what this replaced, so a caller that reads the first one still reads the
     * same one.
     */
    public within(center: EntityPosition, radius: number, families?: readonly string[]): DataEntity[] {
        if (families !== undefined && families.length === 0) return [];

        const reach = radius * radius;
        const found: DataEntity[] = [];
        let singleFamilyCells: Map<number, DataEntity[]> | undefined;
        let familyBuckets: Map<number, DataEntity[]>[] | undefined;
        let seen: Set<number> | undefined;

        if (families !== undefined) {
            if (families.length === 1) {
                const family = families[0];
                if (family === undefined) return [];
                singleFamilyCells = this.familyCells.get(family);
            } else {
                familyBuckets = [];
                const seenFamilies = new Set<string>();
                for (const family of families) {
                    if (seenFamilies.has(family)) continue;
                    seenFamilies.add(family);
                    const cells = this.familyCells.get(family);
                    if (cells !== undefined) familyBuckets.push(cells);
                }

                if (familyBuckets.length === 0) return [];
                if (familyBuckets.length === 1) {
                    singleFamilyCells = familyBuckets[0];
                    familyBuckets = undefined;
                } else seen = new Set<number>();
            }

            if (singleFamilyCells === undefined && familyBuckets === undefined) return [];
        }

        const lowX = cellOf(center.x - radius);
        const highX = cellOf(center.x + radius);
        const lowZ = cellOf(center.z - radius);
        const highZ = cellOf(center.z + radius);

        for (let cellX = lowX; cellX <= highX; cellX += 1)
            for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
                const key = keyOf(cellX, cellZ);
                if (families === undefined) {
                    const cell = this.cells.get(key);
                    if (cell === undefined) continue;
                    for (const entity of cell)
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    continue;
                }

                if (singleFamilyCells !== undefined) {
                    const candidates = singleFamilyCells.get(key);
                    if (candidates === undefined) continue;
                    for (const entity of candidates)
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    continue;
                }

                for (const family of familyBuckets ?? []) {
                    const candidates = family.get(key);
                    if (candidates === undefined) continue;
                    for (const entity of candidates) {
                        if (seen?.has(entity.id)) continue;
                        seen?.add(entity.id);
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    }
                }
            }

        if (found.length < 2) return found;

        const first = found[0];
        if (first === undefined) return found;

        let previousArrival = this.arrived.get(first.id) ?? 0;
        let inArrivalOrder = true;
        for (let index = 1; index < found.length; index += 1) {
            const entity = found[index];
            if (entity === undefined) continue;
            const arrival = this.arrived.get(entity.id) ?? 0;
            if (arrival < previousArrival) {
                inArrivalOrder = false;
                break;
            }
            previousArrival = arrival;
        }
        if (inArrivalOrder) return found;

        if (found.length <= SMALL_RESULT_SORT_LIMIT) {
            const arrivals = found.map((entity) => this.arrived.get(entity.id) ?? 0);
            for (let index = 1; index < found.length; index += 1) {
                const entity = found[index];
                const arrival = arrivals[index];
                if (entity === undefined || arrival === undefined) continue;

                let previous = index - 1;
                while (previous >= 0) {
                    const previousArrival = arrivals[previous];
                    const previousEntity = found[previous];
                    if (previousArrival === undefined || previousEntity === undefined || previousArrival <= arrival)
                        break;
                    found[previous + 1] = previousEntity;
                    arrivals[previous + 1] = previousArrival;
                    previous -= 1;
                }

                found[previous + 1] = entity;
                arrivals[previous + 1] = arrival;
            }
            return found;
        }

        // Read each arrival order once rather than once per sort comparison.
        const ordered = found.map((entity) => ({ entity, arrival: this.arrived.get(entity.id) ?? 0 }));
        ordered.sort((a, b) => a.arrival - b.arrival);
        return ordered.map(({ entity }) => entity);
    }

    /** Entities whose Java collision boxes strictly intersect an axis-aligned box. */
    public withinBox(min: EntityPosition, max: EntityPosition): DataEntity[] {
        const found: DataEntity[] = [];
        // Normal boxes stay in one center cell, so only their maintained maximum expands this scan.
        const halfWidth = this.widestRegularBox / 2;
        const lowX = cellOf(min.x - halfWidth);
        const highX = cellOf(max.x + halfWidth);
        const lowZ = cellOf(min.z - halfWidth);
        const highZ = cellOf(max.z + halfWidth);

        for (let cellX = lowX; cellX <= highX; cellX += 1)
            for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
                const cell = this.cells.get(keyOf(cellX, cellZ));
                if (cell === undefined) continue;
                for (const entity of cell)
                    if (!this.largeBoxes.has(entity.id) && this.intersectsBox(entity, min, max)) found.push(entity);
            }

        // A large box may overlap the query while its center sits many cells away.
        // Its footprint index finds those candidates without widening every query.
        if (this.largeBoxes.size > 0) {
            const seen = new Set<number>();
            for (let cellX = cellOf(min.x); cellX <= cellOf(max.x); cellX += 1)
                for (let cellZ = cellOf(min.z); cellZ <= cellOf(max.z); cellZ += 1)
                    for (const entity of this.largeCells.get(keyOf(cellX, cellZ)) ?? []) {
                        if (seen.has(entity.id)) continue;
                        seen.add(entity.id);
                        if (this.intersectsBox(entity, min, max)) found.push(entity);
                    }
        }

        found.sort((a, b) => (this.arrived.get(a.id) ?? 0) - (this.arrived.get(b.id) ?? 0));
        return found;
    }

    /** Refreshes the size index after a live component set changes. */
    public refreshBox(entity: DataEntity): void {
        if (!this.filed.has(entity.id)) return;

        const { width, height } = entity.facts.box;
        const previous = this.indexedBoxes.get(entity.id);
        if (previous?.width === width && previous.height === height) return;

        if (previous?.large === true) {
            this.unfileLargeBox(entity.id);
            this.largeBoxes.delete(entity.id);
        } else if (previous !== undefined) this.removeRegularWidth(previous.width);

        const large = isLargeBox(width, height);
        this.indexedBoxes.set(entity.id, { width, height, large });
        if (large) {
            this.largeBoxes.set(entity.id, entity);
            this.fileLargeBox(entity);
        } else {
            const count = this.regularBoxWidths.get(width) ?? 0;
            this.regularBoxWidths.set(width, count + 1);
            this.widestRegularBox = Math.max(this.widestRegularBox, width);
        }
    }

    /** Puts one entity in a cell and records that it is there. */
    private file(entity: DataEntity, key: number): void {
        this.filed.set(entity.id, key);
        const cell = this.cells.get(key);
        if (cell === undefined) this.cells.set(key, [entity]);
        else cell.push(entity);
    }

    /** Removes one entity's ordinary width from the incremental maximum. */
    private removeRegularWidth(width: number): void {
        const count = this.regularBoxWidths.get(width) ?? 0;
        if (count <= 1) {
            this.regularBoxWidths.delete(width);
            if (width === this.widestRegularBox) this.widestRegularBox = Math.max(0, ...this.regularBoxWidths.keys());
        } else this.regularBoxWidths.set(width, count - 1);
    }

    /** Files a large entity into each horizontal cell overlapped by its current box. */
    private fileLargeBox(entity: DataEntity): void {
        const halfWidth = entity.facts.box.width / 2;
        const lowX = cellOf(entity.position.x - halfWidth);
        const highX = cellOf(entity.position.x + halfWidth);
        const lowZ = cellOf(entity.position.z - halfWidth);
        const highZ = cellOf(entity.position.z + halfWidth);
        const keys: number[] = [];

        for (let cellX = lowX; cellX <= highX; cellX += 1)
            for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
                const key = keyOf(cellX, cellZ);
                const cell = this.largeCells.get(key);
                if (cell === undefined) this.largeCells.set(key, [entity]);
                else cell.push(entity);
                keys.push(key);
            }

        this.filedLargeBoxCells.set(entity.id, keys);
    }

    /** Removes one large entity from every overlap cell it was filed into. */
    private unfileLargeBox(id: number): void {
        const entity = this.largeBoxes.get(id);
        const keys = this.filedLargeBoxCells.get(id);
        if (entity === undefined || keys === undefined) return;

        for (const key of keys) {
            const cell = this.largeCells.get(key);
            if (cell === undefined) continue;
            const at = cell.indexOf(entity);
            if (at !== -1) cell.splice(at, 1);
            if (cell.length === 0) this.largeCells.delete(key);
        }

        this.filedLargeBoxCells.delete(id);
    }

    /** Drops an entity's current size category from the incremental index. */
    private removeIndexedBox(id: number): void {
        const previous = this.indexedBoxes.get(id);
        if (previous === undefined) return;
        this.indexedBoxes.delete(id);
        if (previous.large) this.largeBoxes.delete(id);
        else this.removeRegularWidth(previous.width);
    }

    /** Whether one live entity's collision box strictly intersects the given AABB. */
    private intersectsBox(entity: DataEntity, min: EntityPosition, max: EntityPosition): boolean {
        const halfWidth = entity.facts.box.width / 2;
        return (
            entity.position.x - halfWidth < max.x &&
            entity.position.x + halfWidth > min.x &&
            entity.position.y < max.y &&
            entity.position.y + entity.facts.box.height > min.y &&
            entity.position.z - halfWidth < max.z &&
            entity.position.z + halfWidth > min.z
        );
    }

    /** Puts one entity in a family cell. */
    private fileFamily(entity: DataEntity, family: string, key: number): void {
        const cells = this.familyCells.get(family) ?? new Map<number, DataEntity[]>();
        const cell = cells.get(key);
        if (cell === undefined) cells.set(key, [entity]);
        else cell.push(entity);
        this.familyCells.set(family, cells);
    }

    /** Takes one entity out of a family cell, dropping empty index entries. */
    private unfileFamily(entity: DataEntity, family: string, key: number): void {
        const cells = this.familyCells.get(family);
        const cell = cells?.get(key);
        if (cells === undefined || cell === undefined) return;

        const at = cell.indexOf(entity);
        if (at !== -1) cell.splice(at, 1);
        if (cell.length === 0) cells.delete(key);
        if (cells.size === 0) this.familyCells.delete(family);
    }

    /** Takes one entity out of a cell, dropping the cell when it empties. */
    private unfile(entity: DataEntity, key: number): void {
        const cell = this.cells.get(key);
        if (cell === undefined) return;

        const at = cell.indexOf(entity);
        if (at !== -1) cell.splice(at, 1);
        if (cell.length === 0) this.cells.delete(key);
    }
}

/** The key of the cell one position falls in. */
const cellKeyOf = (position: EntityPosition): number => keyOf(cellOf(position.x), cellOf(position.z));
