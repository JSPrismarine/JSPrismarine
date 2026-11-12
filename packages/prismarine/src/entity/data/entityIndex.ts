/**
 * Where every entity of one dimension is, filed by the cell it stands in.
 *
 * One index, which ADR 0007 asks for. A position write refiles the entity
 * before the write returns, so a query later in the same tick sees it where it
 * moved to, and every query answers in ascending runtime id order. It serves
 * every entity of the dimension's store, players and dropped stacks among
 * them, which `MobBody.onMove` refiles.
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
 * Dropped items go in cells two blocks wide of their own. A stack merges
 * within half a block and a farm can leave hundreds in one chunk, so a merge
 * search over sixteen-block cells would read every item in the chunk. They are
 * store entities, but a mob's neighbor search never reads them: they are found
 * through {@link EntityIndex.itemsWithin}.
 *
 * The index is derived state. It is rebuilt from the entities whenever they
 * are, and it stays out of the replay digest.
 */
import type { EntityPosition } from '@jsprismarine/entities';

import type { DataEntity } from './DataEntity';
import { squaredDistance } from './DataEntity';
import { ITEM_ENTITY } from './droppedItems';
import { clientOwnsMovement } from '../playerOverlay';

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

/** Boxes beyond common mob dimensions are filed in every horizontal cell they overlap. */
const LARGE_BOX_WIDTH = 2;
const LARGE_BOX_HEIGHT = 3;

/** How wide one dropped item cell is, in blocks. */
const ITEM_CELL_SIZE = 2;

/** How many item cells one chunk-aligned cell spans along each axis. */
const ITEM_CELLS_PER_CELL = (1 << CELL_BITS) / ITEM_CELL_SIZE;

/** The cell one horizontal coordinate falls in. */
const cellOf = (coordinate: number): number => Math.floor(coordinate) >> CELL_BITS;

/** One cell's key, which is its two coordinates packed into one number. */
const keyOf = (cellX: number, cellZ: number): number => (cellX & KEY_MASK) * KEY_SPAN + (cellZ & KEY_MASK);

/** The fine cell one horizontal coordinate falls in, for dropped items. */
const itemCellOf = (coordinate: number): number => Math.floor(coordinate / ITEM_CELL_SIZE);

/** Whether a store entity is a dropped item, which the index files apart from the mobs. */
const isStoreItem = (entity: DataEntity): boolean => entity.identifier === ITEM_ENTITY;

/** The fine cell key of a position, for dropped items. */
const itemKeyOf = (position: EntityPosition): number => keyOf(itemCellOf(position.x), itemCellOf(position.z));

/** One entity's dimensions as the spatial index last filed them. */
interface IndexedBox {
    readonly width: number;
    readonly height: number;
    readonly large: boolean;
}

/** Whether one box should use the overlap-cell index rather than the center-cell index. */
const isLargeBox = (width: number, height: number): boolean => width > LARGE_BOX_WIDTH || height > LARGE_BOX_HEIGHT;

/** The live entities of one dimension, indexed by where they stand. */
export class EntityIndex {
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

    /** Dropped stacks of the store in each two-block cell. */
    private readonly storeItemCells = new Map<number, DataEntity[]>();

    /** The two-block cell each dropped stack of the store is filed under now. */
    private readonly filedItems = new Map<number, number>();

    /**
     * Hears each chunk a store entity other than a player enters, leaves or moves within, a
     * dropped stack's each time it changes two-block cell.
     * A cell is sixteen blocks wide and aligned to the chunks, so the cell an entity is filed
     * under is the chunk it stands in. The world marks the chunk changed, so a save writes the
     * chunk an entity left as well as the one it entered, and a chunk does not leave the world
     * with an entity that moved since the chunk was saved.
     */
    public chunkChanged: ((chunkX: number, chunkZ: number) => void) | undefined;

    /** How many candidates every query so far has read out of a cell. */
    private examined = 0;

    /**
     * How many candidates the queries so far have read out of cells, counted
     * from the index's creation.
     *
     * A query reads every entity in each cell it touches and no other, so the
     * difference across one query is the cost of that query.
     */
    public candidatesExamined(): number {
        return this.examined;
    }

    /** How many entities the index holds. */
    public get size(): number {
        return this.filed.size + this.filedItems.size;
    }

    /** How many cell lists hold anything, across every layer. Zero once the index is empty. */
    public get occupiedCells(): number {
        let familyCells = 0;
        for (const cells of this.familyCells.values()) familyCells += cells.size;
        return this.cells.size + this.largeCells.size + familyCells + this.storeItemCells.size;
    }

    /** Puts one entity in the index, at the position it stands at now. */
    public add(entity: DataEntity): void {
        if (isStoreItem(entity)) {
            this.fileItem(entity, itemKeyOf(entity.position));
            return;
        }
        this.file(entity, cellKeyOf(entity.position));
        this.refreshBox(entity);
        this.refreshFamilies(entity);
    }

    /** Takes one entity out of the index. */
    public remove(entity: DataEntity): void {
        const itemKey = this.filedItems.get(entity.id);
        if (itemKey !== undefined) {
            this.unfileItem(entity, itemKey);
            return;
        }
        const key = this.filed.get(entity.id);
        if (key === undefined) return;
        this.filed.delete(entity.id);
        this.unfileLargeBox(entity.id);
        this.removeIndexedBox(entity.id);
        this.unfile(entity, key);
        for (const family of this.filedFamilies.get(entity.id) ?? []) this.unfileFamily(entity, family, key);
        this.filedFamilies.delete(entity.id);
    }

    /**
     * Dropped items within a horizontal radius of a point, in ascending runtime id order.
     *
     * Horizontal only, as item merge and pickup ask: each applies its own
     * exact distance to what comes back.
     */
    public itemsWithin(x: number, z: number, radius: number): DataEntity[] {
        if (radius < 0) return [];
        const found: DataEntity[] = [];
        const reach = radius * radius;
        const lowX = itemCellOf(x - radius);
        const highX = itemCellOf(x + radius);
        const lowZ = itemCellOf(z - radius);
        const highZ = itemCellOf(z + radius);
        for (let cellX = lowX; cellX <= highX; cellX += 1)
            for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
                const cell = this.storeItemCells.get(keyOf(cellX, cellZ));
                if (cell === undefined) continue;
                this.examined += cell.length;
                for (const entity of cell) {
                    const dx = entity.position.x - x;
                    const dz = entity.position.z - z;
                    if (dx * dx + dz * dz <= reach) found.push(entity);
                }
            }
        return inIdOrder(found);
    }

    /**
     * The store's entities other than dropped stacks that stand in one chunk, in ascending
     * runtime id order, which is what a chunk that leaves the world takes with it.
     */
    public storeInChunk(chunkX: number, chunkZ: number): DataEntity[] {
        const cell = this.cells.get(keyOf(chunkX, chunkZ));
        return cell === undefined ? [] : inIdOrder([...cell]);
    }

    /**
     * The dropped stacks of the store that lie in one chunk, in ascending runtime id order, which
     * a chunk that leaves the world takes with it beside {@link EntityIndex.storeInChunk}.
     */
    public itemsInChunk(chunkX: number, chunkZ: number): DataEntity[] {
        const found: DataEntity[] = [];
        const span = ITEM_CELLS_PER_CELL;
        for (let cellX = chunkX * span; cellX < (chunkX + 1) * span; cellX += 1)
            for (let cellZ = chunkZ * span; cellZ < (chunkZ + 1) * span; cellZ += 1) {
                const cell = this.storeItemCells.get(keyOf(cellX, cellZ));
                if (cell !== undefined) found.push(...cell);
            }
        return inIdOrder(found);
    }

    /**
     * The store's entities other than dropped stacks within a horizontal radius of a point, in
     * ascending runtime id order. Horizontal, as a blast asks: it applies its own exact reach.
     */
    public storeWithin(x: number, z: number, radius: number): DataEntity[] {
        if (radius < 0) return [];

        const found: DataEntity[] = [];
        const reach = radius * radius;
        const lowX = cellOf(x - radius);
        const highX = cellOf(x + radius);
        const lowZ = cellOf(z - radius);
        const highZ = cellOf(z + radius);
        for (let cellX = lowX; cellX <= highX; cellX += 1)
            for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
                const data = this.cells.get(keyOf(cellX, cellZ));
                if (data === undefined) continue;
                this.examined += data.length;
                for (const entity of data) {
                    const dx = entity.position.x - x;
                    const dz = entity.position.z - z;
                    if (dx * dx + dz * dz <= reach) found.push(entity);
                }
            }

        return inIdOrder(found);
    }

    /** Moves one entity to the cell it stands in now, which a position write calls. */
    public refile(entity: DataEntity): void {
        const itemWas = this.filedItems.get(entity.id);
        if (itemWas !== undefined) {
            const itemNow = itemKeyOf(entity.position);
            if (itemNow === itemWas) return;
            this.unfileItem(entity, itemWas);
            this.fileItem(entity, itemNow);
            return;
        }
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
            this.reportCell(entity, was);
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
     * Every entity within a radius of a position, in ascending runtime id order.
     *
     * The order is the contract, not the cells: `goalWorld.mobs` breaks a tie
     * in distance by it, which decides who a zombie picks out of a crowd
     * standing together, and a cell's list is in whatever order moves left it.
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
                    this.examined += cell.length;
                    for (const entity of cell)
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    continue;
                }

                if (singleFamilyCells !== undefined) {
                    const candidates = singleFamilyCells.get(key);
                    if (candidates === undefined) continue;
                    this.examined += candidates.length;
                    for (const entity of candidates)
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    continue;
                }

                for (const family of familyBuckets ?? []) {
                    const candidates = family.get(key);
                    if (candidates === undefined) continue;
                    this.examined += candidates.length;
                    for (const entity of candidates) {
                        if (seen?.has(entity.id)) continue;
                        seen?.add(entity.id);
                        if (squaredDistance(center, entity.position) <= reach) found.push(entity);
                    }
                }
            }

        return inIdOrder(found);
    }

    /** Entities whose Java collision boxes strictly intersect an axis-aligned box, in ascending runtime id order. */
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
                this.examined += cell.length;
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
                        this.examined += 1;
                        if (seen.has(entity.id)) continue;
                        seen.add(entity.id);
                        if (this.intersectsBox(entity, min, max)) found.push(entity);
                    }
        }

        return inIdOrder(found);
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

    /** Puts one dropped stack of the store in its two-block cell. */
    private fileItem(entity: DataEntity, key: number): void {
        this.filedItems.set(entity.id, key);
        const cell = this.storeItemCells.get(key);
        if (cell === undefined) this.storeItemCells.set(key, [entity]);
        else cell.push(entity);
        this.reportItemCell(key);
    }

    /** Takes one dropped stack of the store out of its two-block cell. */
    private unfileItem(entity: DataEntity, key: number): void {
        this.filedItems.delete(entity.id);
        this.reportItemCell(key);
        const cell = this.storeItemCells.get(key);
        if (cell === undefined) return;
        const at = cell.indexOf(entity);
        if (at !== -1) cell.splice(at, 1);
        if (cell.length === 0) this.storeItemCells.delete(key);
    }

    /** Puts one entity in a cell and records that it is there. */
    private file(entity: DataEntity, key: number): void {
        this.filed.set(entity.id, key);
        const cell = this.cells.get(key);
        if (cell === undefined) this.cells.set(key, [entity]);
        else cell.push(entity);
        this.reportCell(entity, key);
    }

    /**
     * Tells the listener which chunk an entity entered or left, which is the cell it names. A
     * player is no part of a chunk's save, so its moves change no chunk.
     */
    private reportCell(entity: DataEntity, key: number): void {
        const listener = this.chunkChanged;
        if (listener === undefined || clientOwnsMovement(entity.identifier)) return;
        const signed = (cell: number): number => (cell >= KEY_SPAN / 2 ? cell - KEY_SPAN : cell);
        listener(signed(Math.floor(key / KEY_SPAN)), signed(key % KEY_SPAN));
    }

    /**
     * Tells the listener which chunk a dropped stack entered or left, which the two-block cell
     * lies in: a stack is part of its chunk's save as a mob is.
     */
    private reportItemCell(key: number): void {
        const listener = this.chunkChanged;
        if (listener === undefined) return;
        const signed = (cell: number): number => (cell >= KEY_SPAN / 2 ? cell - KEY_SPAN : cell);
        const chunkOf = (cell: number): number => Math.floor(signed(cell) / ITEM_CELLS_PER_CELL);
        listener(chunkOf(Math.floor(key / KEY_SPAN)), chunkOf(key % KEY_SPAN));
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
        this.reportCell(entity, key);
    }
}

/** The key of the cell one position falls in. */
const cellKeyOf = (position: EntityPosition): number => keyOf(cellOf(position.x), cellOf(position.z));

/**
 * Puts a query's result in ascending runtime id order.
 *
 * Most results arrive in order already, since ids are drawn in spawn order and
 * entities that stand still keep their place in a cell, so the check comes
 * first and the sort runs only for a result a move has shuffled.
 */
const inIdOrder = (found: DataEntity[]): DataEntity[] => {
    for (let index = 1; index < found.length; index += 1)
        if (found[index - 1]!.id > found[index]!.id) return found.sort((a, b) => a.id - b.id);
    return found;
};
