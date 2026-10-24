import type { RecipeItemStack } from './itemStack';

/** The contents of a crafting grid of a declared size, in row-major order. */
export interface CraftingGrid {
    readonly width: number;
    readonly height: number;
    /** `width * height` slots in row-major order, `null` where the slot is empty. */
    readonly slots: readonly (RecipeItemStack | null)[];
}

/**
 * A crafting grid shrunk to the bounding box of its filled slots, which is
 * what Java's `CraftingInput.ofPositioned` builds before any recipe sees the
 * grid. Cropping is what lets a 2x2 recipe match anywhere in a 3x3 table.
 */
export interface CroppedGrid extends CraftingGrid {
    /** For each cropped slot, the index it came from in the original grid. */
    readonly sourceSlots: readonly number[];
    /** How many cropped slots hold an item. */
    readonly filled: number;
}

/** An empty cropped grid, which is what cropping a grid with no items yields. */
const EMPTY_GRID: CroppedGrid = { width: 0, height: 0, slots: [], sourceSlots: [], filled: 0 };

/** Reads the slot at a column and row, or `null` when the coordinates fall outside the grid. */
export const gridAt = (grid: CraftingGrid, x: number, y: number): RecipeItemStack | null => {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
    return grid.slots[y * grid.width + x] ?? null;
};

/**
 * Shrinks a grid to the bounding box of its filled slots. Every recipe
 * matcher works on the cropped grid, so a recipe never has to describe where
 * in the table the player placed its items.
 */
export const cropGrid = (grid: CraftingGrid): CroppedGrid => {
    let minX = grid.width;
    let minY = grid.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            if (gridAt(grid, x, y) === null) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return EMPTY_GRID;

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const slots: (RecipeItemStack | null)[] = [];
    const sourceSlots: number[] = [];
    let filled = 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const stack = gridAt(grid, x, y);
            slots.push(stack);
            sourceSlots.push(y * grid.width + x);
            if (stack !== null) filled += 1;
        }
    }
    return { width, height, slots, sourceSlots, filled };
};

/** Every filled slot of a cropped grid, paired with its index inside that grid. */
export const filledSlots = (
    grid: CroppedGrid
): readonly { readonly index: number; readonly stack: RecipeItemStack }[] =>
    grid.slots.flatMap((stack, index) => (stack === null ? [] : [{ index, stack }]));
