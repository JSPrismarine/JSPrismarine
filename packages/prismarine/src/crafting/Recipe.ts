import type { Item } from '../item/Item';
import type { CraftingGrid } from './CraftingGrid';
import type { RecipeIngredient } from './RecipeIngredient';

/**
 * The block a recipe belongs to, as vanilla names it.
 *
 * A plain string rather than an enum: a plugin's station names itself, and a station this
 * server has never heard of is a recipe it simply never considers rather than a value that
 * fails to parse.
 */
export type RecipeStation = string;

export const CRAFTING_TABLE: RecipeStation = 'crafting_table';
export const FURNACE: RecipeStation = 'furnace';
export const STONECUTTER: RecipeStation = 'stonecutter';
export const SMITHING_TABLE: RecipeStation = 'smithing_table';

/**
 * A recipe: what a station can turn one set of items into.
 *
 * Data, not behaviour. It knows what it needs and what it yields, and nothing about how a
 * player got there - which is what lets the same object be both matched against a grid and
 * written into `CraftingDataPacket`. Deciding *when* to apply one belongs to the station.
 */
export interface Recipe {
    /** Vanilla's own identifier, unique, and what a deterministic UUID is derived from. */
    readonly id: string;

    /** The block this can be made at. */
    readonly station: RecipeStation;

    /**
     * Which recipe wins when several match. Lower comes first, as vanilla orders them.
     */
    readonly priority: number;

    /** Everything it consumes, in no particular order - for filtering and for display. */
    getIngredients(): readonly RecipeIngredient[];

    /** What it produces. */
    getOutputs(): readonly Item[];

    /**
     * Whether what is in the grid is what this needs.
     *
     * On the recipe rather than in a matcher somewhere, because each kind matches by its own
     * rules - a shape walked across the grid, a bag of ingredients in any order, one input
     * cooked - and a central matcher would be a switch that a plugin's recipe could not add
     * itself to.
     */
    matches(grid: CraftingGrid): boolean;
}

/** A recipe whose ingredients may be arranged any way in the grid. */
export class ShapelessRecipe implements Recipe {
    public constructor(
        public readonly id: string,
        public readonly station: RecipeStation,
        private readonly ingredients: readonly RecipeIngredient[],
        private readonly outputs: readonly Item[],
        public readonly priority: number = 0
    ) {}

    public getIngredients(): readonly RecipeIngredient[] {
        return this.ingredients;
    }

    public getOutputs(): readonly Item[] {
        return this.outputs;
    }

    /**
     * Every ingredient satisfied by a different item, and nothing left over.
     *
     * Each ingredient claims one item and that item is then spent, which is what stops a
     * single plank from satisfying a recipe that wants two. The leftover check is what stops
     * a grid holding an extra thing from matching a smaller recipe.
     */
    public matches(grid: CraftingGrid): boolean {
        const available = grid.items();
        if (available.length !== this.ingredients.length) return false;

        const claimed = new Set<number>();
        for (const ingredient of this.ingredients) {
            const index = available.findIndex((item, at) => !claimed.has(at) && ingredient.matches(item));
            if (index === -1) return false;

            claimed.add(index);
        }

        return true;
    }
}

/**
 * A recipe whose ingredients must sit in a particular pattern.
 *
 * The pattern is stored row major and `width * height` long, with `null` for a slot that
 * must be empty. Keeping the holes explicit is what lets a match walk the grid at an offset
 * without a second structure describing where the gaps are.
 */
export class ShapedRecipe implements Recipe {
    public constructor(
        public readonly id: string,
        public readonly station: RecipeStation,
        public readonly width: number,
        public readonly height: number,
        private readonly pattern: ReadonlyArray<RecipeIngredient | null>,
        private readonly outputs: readonly Item[],
        public readonly priority: number = 0,
        /** Whether the pattern may also be matched mirrored. */
        public readonly symmetric: boolean = false
    ) {
        if (pattern.length !== width * height) {
            throw new Error(`Shaped recipe ${id} has ${pattern.length} slots for a ${width}x${height} grid`);
        }
    }

    /** The slot at a position in the pattern, or `null` where the pattern wants nothing. */
    public at(x: number, y: number): RecipeIngredient | null {
        return this.pattern[y * this.width + x] ?? null;
    }

    public getIngredients(): readonly RecipeIngredient[] {
        return this.pattern.filter((slot): slot is RecipeIngredient => slot !== null);
    }

    public getOutputs(): readonly Item[] {
        return this.outputs;
    }

    /**
     * The pattern, laid over whatever part of the grid is occupied.
     *
     * A two by two recipe is the same recipe in any corner of a three by three table, so the
     * pattern is aligned to the occupied bounds rather than to the grid's origin. Anything
     * outside those bounds is empty by definition, which is why only one offset needs trying.
     */
    public matches(grid: CraftingGrid): boolean {
        const bounds = grid.bounds();
        if (!bounds) return false;
        if (bounds.width !== this.width || bounds.height !== this.height) return false;

        const fits = (mirrored: boolean): boolean => {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const wanted = this.at(mirrored ? this.width - 1 - x : x, y);
                    const item = grid.at(bounds.x + x, bounds.y + y);

                    if (wanted === null) {
                        if (item !== null) return false;
                    } else if (!wanted.matches(item)) return false;
                }
            }

            return true;
        };

        return fits(false) || (this.symmetric && fits(true));
    }
}

/**
 * A smithing table's upgrade: a template, the thing being upgraded, and the material.
 *
 * Three named slots rather than a shape or a bag, which is why it is not a
 * {@link ShapelessRecipe} carrying three ingredients - the protocol writes it as its own
 * entry type, and the slots are not interchangeable.
 */
export class SmithingRecipe implements Recipe {
    public readonly priority = 0;

    public constructor(
        public readonly id: string,
        public readonly station: RecipeStation,
        public readonly template: RecipeIngredient,
        public readonly input: RecipeIngredient,
        public readonly addition: RecipeIngredient,
        public readonly output: Item
    ) {}

    public getIngredients(): readonly RecipeIngredient[] {
        return [this.template, this.input, this.addition];
    }

    public getOutputs(): readonly Item[] {
        return [this.output];
    }

    /**
     * The three slots in order: template, input, addition.
     *
     * A one-by-three grid, not a bag - swapping the template and the material is a different
     * arrangement and not this recipe.
     */
    public matches(grid: CraftingGrid): boolean {
        return (
            grid.items().length === 3 &&
            this.template.matches(grid.at(0, 0)) &&
            this.input.matches(grid.at(1, 0)) &&
            this.addition.matches(grid.at(2, 0))
        );
    }
}

/**
 * A recipe with one input and one output, cooked over time.
 *
 * The furnace family - furnace, blast furnace, smoker, campfire - which differ by which
 * station they name rather than by shape.
 */
export class FurnaceRecipe implements Recipe {
    public readonly priority = 0;

    public constructor(
        public readonly id: string,
        public readonly station: RecipeStation,
        public readonly input: RecipeIngredient,
        public readonly output: Item
    ) {}

    public getIngredients(): readonly RecipeIngredient[] {
        return [this.input];
    }

    public getOutputs(): readonly Item[] {
        return [this.output];
    }

    /** One thing in the grid, and it is the thing this cooks. */
    public matches(grid: CraftingGrid): boolean {
        const items = grid.items();

        return items.length === 1 && this.input.matches(items[0]!);
    }
}
