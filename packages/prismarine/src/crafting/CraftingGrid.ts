import type { Item } from '../item/Item';

/**
 * What a station has been given, as a rectangle.
 *
 * A read-only view rather than the container itself: matching should not be able to change
 * what it is looking at, and a station's grid may be a slice of something larger - the four
 * crafting slots of an inventory are not the whole inventory.
 */
export class CraftingGrid {
    private readonly slots: ReadonlyArray<Item | null>;

    public constructor(
        public readonly width: number,
        public readonly height: number,
        slots: ReadonlyArray<Item | null>
    ) {
        if (slots.length !== width * height) {
            throw new Error(`A ${width}x${height} grid needs ${width * height} slots, was given ${slots.length}`);
        }

        this.slots = slots;
    }

    /** The item at a position, or `null` for an empty slot. Out of bounds is empty. */
    public at(x: number, y: number): Item | null {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;

        return this.slots[y * this.width + x] ?? null;
    }

    /** Everything in it, in no particular order and without the gaps. */
    public items(): Item[] {
        return this.slots.filter((slot): slot is Item => slot !== null);
    }

    public isEmpty(): boolean {
        return this.items().length === 0;
    }

    /**
     * The smallest rectangle containing everything, as offsets into this grid.
     *
     * A shaped recipe is two by two whether it was put in the top left of a crafting table or
     * the bottom right, so matching walks the pattern across the grid - and this is where it
     * starts and stops. `null` when the grid is empty.
     */
    public bounds(): { x: number; y: number; width: number; height: number } | null {
        let minX = this.width;
        let minY = this.height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.at(x, y) === null) continue;

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        if (maxX === -1) return null;

        return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }
}

export default CraftingGrid;
