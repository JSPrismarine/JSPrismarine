import type { Entity } from '../entity/Entity';
import CoordinateUtils from './CoordinateUtils';
import { coordinatePairKey } from './positionKeys';

/** Width of the finer cells used to look up dropped items. */
const ITEM_CELL_SIZE = 2;

interface ItemIndexEntry {
    readonly entity: Entity;
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly order: number;
    readonly x: number;
    readonly z: number;
    readonly cellX: number;
    readonly cellZ: number;
}

/**
 * Where everything is, arranged so that "what is near me" is cheap to ask.
 *
 * The world keeps its entities in one flat map, which is the right shape for looking one up by id
 * and the wrong shape for the question every mob asks once a tick: who am I touching. Answering
 * that from the flat map means every entity considering every other, and the spawner allows
 * thirty-odd mobs per player - so a handful of players is already thousands of pairs a tick, all
 * of them to discover that two animals forty blocks apart are not touching.
 *
 * So entities are bucketed by chunk, once, at the top of the tick, and a mob looks only in its own
 * bucket and the eight around it. Rebuilding costs one pass over the entities; after that each
 * lookup sees a handful of candidates instead of all of them.
 *
 * Rebuilt wholesale rather than kept up to date as entities move, deliberately: a grid maintained
 * incrementally has to be told about every position change by everything that can move one, and
 * the first thing that forgets leaves an entity indexed where it no longer is. A full rebuild is
 * one pass and cannot drift.
 */
export class EntityGrid {
    private readonly cells = new Map<number | string, Entity[]>();
    private readonly itemCells = new Map<number | string, ItemIndexEntry[]>();
    private readonly pickupItemCells = new Map<number | string, ItemIndexEntry[]>();
    private readonly pickupItems = new Map<bigint, ItemIndexEntry>();
    private nextPickupOrder = 0;

    private static key(chunkX: number, chunkZ: number): number | string {
        return coordinatePairKey(chunkX, chunkZ);
    }

    private static itemKey(cellX: number, cellZ: number): number | string {
        return coordinatePairKey(cellX, cellZ);
    }

    /** Throws away the previous tick's arrangement and buckets these entities. */
    public rebuild(entities: readonly Entity[]): void {
        this.cells.clear();
        this.itemCells.clear();
        this.pickupItemCells.clear();
        this.pickupItems.clear();
        this.nextPickupOrder = 0;

        for (const [order, entity] of entities.entries()) {
            const position = entity.getPosition();
            const x = position.getX();
            const z = position.getZ();
            const chunkX = CoordinateUtils.fromBlockToChunk(x);
            const chunkZ = CoordinateUtils.fromBlockToChunk(z);
            const key = EntityGrid.key(chunkX, chunkZ);

            const cell = this.cells.get(key);
            if (cell) cell.push(entity);
            else this.cells.set(key, [entity]);

            if (entity.getType() !== 'minecraft:item') continue;

            const cellX = Math.floor(x / ITEM_CELL_SIZE);
            const cellZ = Math.floor(z / ITEM_CELL_SIZE);
            const itemKey = EntityGrid.itemKey(cellX, cellZ);
            const itemCell = this.itemCells.get(itemKey);
            const entry = { entity, chunkX, chunkZ, order, x, z, cellX, cellZ };
            if (itemCell) itemCell.push(entry);
            else this.itemCells.set(itemKey, [entry]);
            this.addPickupEntry(entry);
        }
        this.nextPickupOrder = entities.length;
    }

    /** Adds or replaces one item's live pickup entry without waiting for the next tick rebuild. */
    public add(entity: Entity): void {
        const id = entity.getRuntimeId();
        const previous = this.pickupItems.get(id);
        const order = previous?.order ?? this.nextPickupOrder++;
        if (previous !== undefined) this.removePickupEntry(previous);
        if (entity.getType() !== 'minecraft:item') return;

        const position = entity.getPosition();
        const x = position.getX();
        const z = position.getZ();
        this.addPickupEntry({
            entity,
            chunkX: CoordinateUtils.fromBlockToChunk(x),
            chunkZ: CoordinateUtils.fromBlockToChunk(z),
            order,
            x,
            z,
            cellX: Math.floor(x / ITEM_CELL_SIZE),
            cellZ: Math.floor(z / ITEM_CELL_SIZE)
        });
    }

    /** Removes one item's live pickup entry, if it still names this entity instance. */
    public remove(entity: Entity): void {
        const entry = this.pickupItems.get(entity.getRuntimeId());
        if (entry?.entity === entity) this.removePickupEntry(entry);
    }

    /** Updates one item's live pickup cell after its position changes. */
    public refilePickupItem(entity: Entity): void {
        const entry = this.pickupItems.get(entity.getRuntimeId());
        if (entry?.entity !== entity) return;

        const position = entity.getPosition();
        const x = position.getX();
        const z = position.getZ();
        const cellX = Math.floor(x / ITEM_CELL_SIZE);
        const cellZ = Math.floor(z / ITEM_CELL_SIZE);
        if (cellX === entry.cellX && cellZ === entry.cellZ) {
            const updated = { ...entry, x, z };
            this.replacePickupEntry(entry, updated);
            return;
        }

        this.removePickupEntry(entry);
        this.addPickupEntry({
            ...entry,
            chunkX: CoordinateUtils.fromBlockToChunk(x),
            chunkZ: CoordinateUtils.fromBlockToChunk(z),
            x,
            z,
            cellX,
            cellZ
        });
    }

    /**
     * Everything in the chunk around a point and the eight chunks touching it.
     *
     * Coarse on purpose - a chunk is far wider than anything that needs to be found - because the
     * caller has to check the actual distance anyway, and a coarse bucket that is never wrong
     * beats a tight one that has to be right.
     * @param {number} x - World x to look around.
     * @param {number} z - World z to look around.
     * @returns {Entity[]} Candidates, including whatever asked, if it is in the grid.
     */
    public near(x: number, z: number): Entity[] {
        const chunkX = CoordinateUtils.fromBlockToChunk(x);
        const chunkZ = CoordinateUtils.fromBlockToChunk(z);

        const found: Entity[] = [];
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
                const cell = this.cells.get(EntityGrid.key(chunkX + offsetX, chunkZ + offsetZ));
                if (cell) found.push(...cell);
            }
        }

        return found;
    }

    /**
     * Returns item entities within a horizontal radius, in the same order as {@link near}.
     *
     * The fine index avoids scanning every entity in the surrounding chunks during stack
     * merging. Ordering by the original chunk cells keeps the selected merge partners stable.
     * @param {number} x - World x coordinate.
     * @param {number} z - World z coordinate.
     * @param {number} radius - Horizontal distance, in blocks.
     * @returns {Entity[]} Nearby item entities in the general grid's traversal order.
     */
    public nearItems(x: number, z: number, radius: number): Entity[] {
        if (radius < 0) return [];

        const cellX = Math.floor(x / ITEM_CELL_SIZE);
        const cellZ = Math.floor(z / ITEM_CELL_SIZE);
        const cellRadius = Math.ceil(radius / ITEM_CELL_SIZE);
        const radiusSquared = radius * radius;

        if (cellRadius <= 1) {
            return this.mergeNeighboringItemCells(x, z, cellX, cellZ, cellRadius, radiusSquared);
        }

        const found: ItemIndexEntry[] = [];

        for (let offsetX = -cellRadius; offsetX <= cellRadius; offsetX++) {
            for (let offsetZ = -cellRadius; offsetZ <= cellRadius; offsetZ++) {
                const cell = this.itemCells.get(EntityGrid.itemKey(cellX + offsetX, cellZ + offsetZ));
                if (!cell) continue;

                for (const entry of cell) {
                    const dx = entry.x - x;
                    const dz = entry.z - z;
                    if (dx * dx + dz * dz <= radiusSquared) found.push(entry);
                }
            }
        }

        found.sort(
            (left, right) => left.chunkX - right.chunkX || left.chunkZ - right.chunkZ || left.order - right.order
        );

        return found.map(({ entity }) => entity);
    }

    /**
     * Returns live item candidates in horizontal range, in world insertion order.
     *
     * Pickup goals apply the exact three-dimensional radius and nearest-first ordering after
     * this query. Unlike {@link nearItems}, this index is updated on same-tick add, remove, and
     * movement changes, so a goal never receives a stack another mob already took.
     * @param {number} x - World x coordinate.
     * @param {number} z - World z coordinate.
     * @param {number} radius - Horizontal candidate radius, in blocks.
     * @returns {Entity[]} Nearby item entities in their original world insertion order.
     */
    public nearItemsForPickup(x: number, z: number, radius: number): Entity[] {
        if (radius < 0) return [];

        const cellX = Math.floor(x / ITEM_CELL_SIZE);
        const cellZ = Math.floor(z / ITEM_CELL_SIZE);
        const cellRadius = Math.ceil(radius / ITEM_CELL_SIZE);
        const radiusSquared = radius * radius;
        const found: ItemIndexEntry[] = [];

        for (let offsetX = -cellRadius; offsetX <= cellRadius; offsetX++) {
            for (let offsetZ = -cellRadius; offsetZ <= cellRadius; offsetZ++) {
                const cell = this.pickupItemCells.get(EntityGrid.itemKey(cellX + offsetX, cellZ + offsetZ));
                if (cell === undefined) continue;

                for (const entry of cell) {
                    const dx = entry.x - x;
                    const dz = entry.z - z;
                    if (dx * dx + dz * dz <= radiusSquared) found.push(entry);
                }
            }
        }

        found.sort((left, right) => left.order - right.order);
        return found.map(({ entity }) => entity);
    }

    /** Inserts a live pickup entry into both the id map and its fine cell. */
    private addPickupEntry(entry: ItemIndexEntry): void {
        const key = EntityGrid.itemKey(entry.cellX, entry.cellZ);
        const cell = this.pickupItemCells.get(key);
        if (cell === undefined) this.pickupItemCells.set(key, [entry]);
        else cell.push(entry);
        this.pickupItems.set(entry.entity.getRuntimeId(), entry);
    }

    /** Replaces the entry in place, preserving its within-cell order. */
    private replacePickupEntry(previous: ItemIndexEntry, updated: ItemIndexEntry): void {
        const cell = this.pickupItemCells.get(EntityGrid.itemKey(previous.cellX, previous.cellZ));
        if (cell !== undefined) {
            const index = cell.indexOf(previous);
            if (index !== -1) cell[index] = updated;
        }
        this.pickupItems.set(updated.entity.getRuntimeId(), updated);
    }

    /** Removes one entry from its fine cell and id map. */
    private removePickupEntry(entry: ItemIndexEntry): void {
        const key = EntityGrid.itemKey(entry.cellX, entry.cellZ);
        const cell = this.pickupItemCells.get(key);
        if (cell !== undefined) {
            const index = cell.indexOf(entry);
            if (index !== -1) cell.splice(index, 1);
            if (cell.length === 0) this.pickupItemCells.delete(key);
        }
        if (this.pickupItems.get(entry.entity.getRuntimeId()) === entry) {
            this.pickupItems.delete(entry.entity.getRuntimeId());
        }
    }

    /**
     * Merges fine-cell lists in the order the coarse grid would visit them.
     *
     * Two-block fine cells align with 16-block chunks. Each list therefore stays inside one chunk,
     * in its original entity order.
     */
    private mergeNeighboringItemCells(
        x: number,
        z: number,
        cellX: number,
        cellZ: number,
        cellRadius: number,
        radiusSquared: number
    ): Entity[] {
        const cells: ItemIndexEntry[][] = [];
        const cursors: number[] = [];

        for (let offsetX = -cellRadius; offsetX <= cellRadius; offsetX++) {
            for (let offsetZ = -cellRadius; offsetZ <= cellRadius; offsetZ++) {
                const entries = this.itemCells.get(EntityGrid.itemKey(cellX + offsetX, cellZ + offsetZ));
                if (entries) {
                    cells.push(entries);
                    cursors.push(0);
                }
            }
        }

        const found: Entity[] = [];

        while (true) {
            let earliest: ItemIndexEntry | undefined;
            let earliestCell: number | undefined;

            for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
                const entries = cells[cellIndex];
                let cursor = cursors[cellIndex];
                if (entries === undefined || cursor === undefined) continue;

                while (cursor < entries.length) {
                    const entry = entries[cursor];
                    if (entry === undefined) {
                        cursor++;
                        continue;
                    }

                    const dx = entry.x - x;
                    const dz = entry.z - z;
                    if (dx * dx + dz * dz <= radiusSquared) break;
                    cursor++;
                }

                cursors[cellIndex] = cursor;
                const entry = entries[cursor];
                if (entry === undefined) continue;

                if (
                    earliest === undefined ||
                    entry.chunkX < earliest.chunkX ||
                    (entry.chunkX === earliest.chunkX &&
                        (entry.chunkZ < earliest.chunkZ ||
                            (entry.chunkZ === earliest.chunkZ && entry.order < earliest.order)))
                ) {
                    earliest = entry;
                    earliestCell = cellIndex;
                }
            }

            if (earliest === undefined || earliestCell === undefined) break;

            found.push(earliest.entity);
            const cursor = cursors[earliestCell];
            if (cursor !== undefined) cursors[earliestCell] = cursor + 1;
        }

        return found;
    }
}

export default EntityGrid;
