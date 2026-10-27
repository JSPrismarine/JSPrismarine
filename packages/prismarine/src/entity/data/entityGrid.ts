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
 * So the entities are bucketed by their horizontal cell and a search reads
 * only the cells its radius reaches. Y is not bucketed: an entity above or
 * below is still in the cell's list and the exact distance check throws it
 * out, which costs a column of mobs nothing worth a third axis of cells.
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
 * Eight blocks. The searching goals almost all ask for six or eight, and a
 * radius of eight over eight-block cells reads a three-by-three block of
 * cells: twenty-four blocks across for a sixteen-block question, which is as
 * tight as whole cells get before the map lookups cost more than the entities
 * they save.
 */
const CELL_BITS = 3;

/**
 * How many bits of each cell coordinate the key keeps.
 *
 * Twenty-six, which packs two of them into one integer a double holds
 * exactly, and reaches 268 million blocks each way. The world border stops at
 * 30 million, so two cells never share a key.
 */
const KEY_BITS = 26;
const KEY_MASK = (1 << KEY_BITS) - 1;
const KEY_SPAN = 2 ** KEY_BITS;

/** The cell one horizontal coordinate falls in. */
const cellOf = (coordinate: number): number => Math.floor(coordinate) >> CELL_BITS;

/** One cell's key, which is its two coordinates packed into one number. */
const keyOf = (cellX: number, cellZ: number): number => (cellX & KEY_MASK) * KEY_SPAN + (cellZ & KEY_MASK);

/** The live entities of one dimension, indexed by where they stand. */
export class EntityGrid {
    /** The entities in each cell, keyed by {@link keyOf}. */
    private readonly cells = new Map<number, DataEntity[]>();

    /** The entities in each family and cell, for data-driven target searches. */
    private readonly familyCells = new Map<string, Map<number, DataEntity[]>>();

    /** The cell each entity is filed under now, so a move knows what to undo. */
    private readonly filed = new Map<number, number>();

    /** The families each entity is filed under now. */
    private readonly filedFamilies = new Map<number, readonly string[]>();

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
        this.refreshFamilies(entity);
    }

    /** Takes one entity out of the index. */
    public remove(entity: DataEntity): void {
        const key = this.filed.get(entity.id);
        if (key === undefined) return;
        this.filed.delete(entity.id);
        this.arrived.delete(entity.id);
        this.unfile(entity, key);
        for (const family of this.filedFamilies.get(entity.id) ?? []) this.unfileFamily(entity, family, key);
        this.filedFamilies.delete(entity.id);
    }

    /** Moves one entity to the cell it stands in now, which a position write calls. */
    public refile(entity: DataEntity): void {
        const was = this.filed.get(entity.id);
        if (was === undefined) return;

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
        const families = [...new Set(entity.instance.families())];
        if (previous.length === families.length && previous.every((family, index) => family === families[index]))
            return;

        for (const family of previous) this.unfileFamily(entity, family, key);
        for (const family of families) this.fileFamily(entity, family, key);
        this.filedFamilies.set(entity.id, families);
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
        const familyNames = families === undefined ? undefined : [...new Set(families)];
        const seen = familyNames !== undefined && familyNames.length > 1 ? new Set<number>() : undefined;
        const familyBuckets = familyNames
            ?.map((family) => this.familyCells.get(family))
            .filter((cells) => cells !== undefined);

        const lowX = cellOf(center.x - radius);
        const highX = cellOf(center.x + radius);
        const lowZ = cellOf(center.z - radius);
        const highZ = cellOf(center.z + radius);

        for (let cellX = lowX; cellX <= highX; cellX += 1)
            for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
                const key = keyOf(cellX, cellZ);
                if (familyBuckets === undefined) {
                    const cell = this.cells.get(key);
                    if (cell === undefined) continue;
                    for (const entity of cell)
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    continue;
                }

                for (const family of familyBuckets) {
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

        // Read each arrival order once rather than once per sort comparison.
        const ordered = found.map((entity) => ({ entity, arrival: this.arrived.get(entity.id) ?? 0 }));
        ordered.sort((a, b) => a.arrival - b.arrival);
        return ordered.map(({ entity }) => entity);
    }

    /** Puts one entity in a cell and records that it is there. */
    private file(entity: DataEntity, key: number): void {
        this.filed.set(entity.id, key);
        const cell = this.cells.get(key);
        if (cell === undefined) this.cells.set(key, [entity]);
        else cell.push(entity);
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
