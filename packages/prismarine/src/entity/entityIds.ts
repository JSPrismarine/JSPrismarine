/**
 * Hands out entity runtime ids, counting up from the last one it handed out.
 *
 * Hot world and tracking indexes key on the id as a JavaScript number, so the allocator refuses
 * the first id that a number cannot represent exactly.
 */
export class EntityIdAllocator {
    private last: number;

    /**
     * @param last - The id handed out before this allocator's first, 0 for a fresh one.
     */
    public constructor(last = 0) {
        this.last = last;
    }

    /**
     * Draws the next id.
     *
     * @throws RangeError when the next id would pass `Number.MAX_SAFE_INTEGER`.
     */
    public next(): number {
        if (this.last >= Number.MAX_SAFE_INTEGER) {
            throw new RangeError('Entity runtime id counter exceeded Number.MAX_SAFE_INTEGER');
        }
        this.last += 1;
        return this.last;
    }
}

/**
 * The server's one pool of entity runtime ids. Legacy entities and every world's entity store
 * draw from it, so an id names one entity whichever kind it is, and a goal that holds the id of a
 * player cannot be handed a data-driven mob that happens to share it.
 */
export const entityIds = new EntityIdAllocator();
