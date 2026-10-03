import type { Item } from '../item/Item';
import CraftingGrid from './CraftingGrid';

/**
 * The slots a player has put things into, waiting to be crafted.
 *
 * Nine of them, because a table's grid is the larger of the two. The client does *not*
 * number them from zero: the inventory's four are slots 28 to 31 and a table's nine are 32
 * to 40, both inside the one crafting container. That was read here as "the four are simply
 * the first four", and so every slot a real client named was rejected as out of range -
 * which is the whole of why nothing could be crafted.
 * @see https://github.com/pmmp/BedrockProtocol/blob/35.0.0%2Bbedrock-1.21.40/src/types/inventory/UIInventorySlotOffset.php
 */
export class CraftingInput {
    public static readonly SLOTS = 9;

    /** The inventory's own grid, which is two by two. */
    public static readonly SMALL = 2;

    /** A crafting table's, which is three by three. */
    public static readonly LARGE = 3;

    /** Where the client's numbering starts for each grid. */
    private static readonly SMALL_OFFSET = 28;
    private static readonly LARGE_OFFSET = 32;

    private readonly slots: Array<Item | null> = Array.from({ length: CraftingInput.SLOTS }, () => null);

    /**
     * Which grid the client last reached into.
     *
     * Read off the slot numbers rather than guessed from how full the grid is, because the
     * numbers say it outright: 28 is the inventory's, 32 is a table's.
     */
    private size: number = CraftingInput.SMALL;

    /**
     * The grid slot a wire slot names, and which grid it belongs to.
     * @param {number} wireSlot - the slot id as the client sent it.
     * @returns {object | null} the index into this store and the grid's size, or `null` for
     * a slot that is not part of either grid.
     */
    public static locate(wireSlot: number): { index: number; size: number } | null {
        if (!Number.isInteger(wireSlot)) return null;

        const small = wireSlot - CraftingInput.SMALL_OFFSET;
        if (small >= 0 && small < CraftingInput.SMALL * CraftingInput.SMALL) {
            return { index: small, size: CraftingInput.SMALL };
        }

        const large = wireSlot - CraftingInput.LARGE_OFFSET;
        if (large >= 0 && large < CraftingInput.LARGE * CraftingInput.LARGE) {
            return { index: large, size: CraftingInput.LARGE };
        }

        return null;
    }

    /** Records which grid is in use, so matching reads the right square. */
    public useGrid(size: number): void {
        this.size = size;
    }

    /**
     * The slot number the client knows a grid index by.
     *
     * The way back from {@link CraftingInput.locate}, and needed because a response has to
     * name slots in the client's numbering: told about slot 0 it would look at the cursor,
     * not at the top left of the grid.
     * @param {number} index - the index into this store.
     * @returns {number} the slot id to put on the wire.
     */
    public wireSlotOf(index: number): number {
        const offset =
            this.gridSize() === CraftingInput.SMALL ? CraftingInput.SMALL_OFFSET : CraftingInput.LARGE_OFFSET;

        return index + offset;
    }

    public get(slot: number): Item | null {
        return this.slots[slot] ?? null;
    }

    /**
     * Puts an item in, or clears the slot.
     * @param {number} slot - the slot; anything outside the grid is ignored, because the
     * number arrives off the wire and is not to be trusted as an index.
     */
    public set(slot: number, item: Item | null): void {
        if (!Number.isInteger(slot) || slot < 0 || slot >= CraftingInput.SLOTS) return;

        this.slots[slot] = item;
    }

    public clear(): void {
        this.slots.fill(null);
    }

    public isEmpty(): boolean {
        return this.slots.every((slot) => slot === null);
    }

    /**
     * The contents as a square, for matching.
     *
     * The size is the caller's to decide: the same slots are a two by two when the player is
     * crafting in their inventory and a three by three at a table, and only the station
     * knows which it is.
     * @param {number} size - the width and height to read as.
     * @returns {CraftingGrid} the grid.
     */
    public toGrid(size: number): CraftingGrid {
        return new CraftingGrid(
            size,
            size,
            Array.from({ length: size * size }, (_, index) => this.slots[index] ?? null)
        );
    }

    /**
     * The square to read these slots as.
     *
     * The grid the client named, except that anything sitting beyond the small square wins:
     * read too small a grid would hide items and match the wrong recipe, read too large it
     * still matches. Erring upwards is safe and erring downwards is not.
     */
    public gridSize(): number {
        const used = this.slots.findLastIndex((slot) => slot !== null);

        return used >= CraftingInput.SMALL * CraftingInput.SMALL ? CraftingInput.LARGE : this.size;
    }
}

export default CraftingInput;
