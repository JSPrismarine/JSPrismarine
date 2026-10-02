import type { Entity } from '../entity/Entity';
import CoordinateUtils from './CoordinateUtils';

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
    private readonly cells = new Map<string, Entity[]>();

    private static key(chunkX: number, chunkZ: number): string {
        return `${chunkX},${chunkZ}`;
    }

    /** Throws away the previous tick's arrangement and buckets these entities. */
    public rebuild(entities: readonly Entity[]): void {
        this.cells.clear();

        for (const entity of entities) {
            const position = entity.getPosition();
            const key = EntityGrid.key(
                CoordinateUtils.fromBlockToChunk(position.getX()),
                CoordinateUtils.fromBlockToChunk(position.getZ())
            );

            const cell = this.cells.get(key);
            if (cell) cell.push(entity);
            else this.cells.set(key, [entity]);
        }
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
}

export default EntityGrid;
