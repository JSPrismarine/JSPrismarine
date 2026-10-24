import type { CraftingGrid } from './grid';
import { gridAt } from './grid';
import type { Ingredient } from './ingredient';
import { ingredientAccepts } from './ingredient';
import type { ShapedPattern } from './types';

/** Reads the pattern cell at a column and row, honoring a left-right flip. */
const cellAt = (pattern: ShapedPattern, x: number, y: number, mirrored: boolean): Ingredient | null => {
    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return null;
    const column = mirrored ? pattern.width - x - 1 : x;
    return pattern.cells[y * pattern.width + column] ?? null;
};

/** Whether the pattern sits over the grid at one offset and flip, with every uncovered slot empty. */
const matchesAt = (
    pattern: ShapedPattern,
    grid: CraftingGrid,
    offsetX: number,
    offsetY: number,
    mirrored: boolean
): boolean => {
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            const cell = cellAt(pattern, x - offsetX, y - offsetY, mirrored);
            const stack = gridAt(grid, x, y);
            if (cell === null) {
                if (stack !== null) return false;
                continue;
            }
            if (!ingredientAccepts(cell, stack)) return false;
        }
    }
    return true;
};

/**
 * Whether a shaped pattern matches a grid, trying every offset placement and
 * both the written and the left-right mirrored arrangement, which is what
 * Java's `ShapedRecipePattern.matches` does.
 *
 * Pass the cropped grid: Java crops the crafting input to the bounding box of
 * its filled slots before matching, which is what makes a 2x2 recipe work in
 * any corner of a 3x3 table. The offset loop then only has room to move when
 * the pattern is smaller than the cropped grid, which happens when the
 * pattern itself has empty border cells.
 */
export const shapedPatternMatches = (pattern: ShapedPattern, grid: CraftingGrid): boolean => {
    for (let offsetX = 0; offsetX <= grid.width - pattern.width; offsetX++)
        for (let offsetY = 0; offsetY <= grid.height - pattern.height; offsetY++)
            if (matchesAt(pattern, grid, offsetX, offsetY, true) || matchesAt(pattern, grid, offsetX, offsetY, false))
                return true;
    return false;
};
