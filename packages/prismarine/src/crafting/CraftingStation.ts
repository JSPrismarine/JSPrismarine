import type Server from '../Server';
import type { CraftingGrid } from './CraftingGrid';
import type { Recipe, RecipeStation } from './Recipe';

/**
 * A block a player can craft at.
 *
 * The seam that keeps `ItemStackRequestHandler` from growing a switch on which block a
 * request came from. A plugin adding a station registers one of these; nothing else has to
 * learn about it.
 *
 * Most stations are {@link RecipeDrivenStation}: they look in the recipe book. The anvil is
 * the reason this is an interface and not that class - it has no recipes at all, it computes
 * its result from what it was given.
 */
export interface CraftingStation {
    /** The block this is, as vanilla names it and as recipes name their station. */
    readonly block: RecipeStation;

    /**
     * What the grid would produce, or `null` for nothing.
     * @param {CraftingGrid} grid - what the player has put in.
     */
    match(grid: CraftingGrid): Recipe | null;
}

/**
 * A station that answers from the recipe book.
 *
 * Candidates come from the manager already ordered by priority, so the first that matches is
 * the one vanilla would have chosen.
 */
export class RecipeDrivenStation implements CraftingStation {
    public constructor(
        public readonly block: RecipeStation,
        private readonly server: Server
    ) {}

    public match(grid: CraftingGrid): Recipe | null {
        if (grid.isEmpty()) return null;

        for (const recipe of this.server.getRecipeManager().getRecipesFor(this.block)) {
            if (recipe.matches(grid)) return recipe;
        }

        return null;
    }
}

/**
 * Every station the server knows.
 *
 * Registration mirrors the other managers. There is no `enable` hook: stations are cheap and
 * are registered by whoever owns them - the vanilla ones here, a plugin's in its own setup.
 */
export class StationRegistry {
    private readonly stations = new Map<RecipeStation, CraftingStation>();

    /**
     * Adds a station, replacing one of the same name.
     *
     * Replacing is allowed on purpose: overriding what a crafting table does is a reasonable
     * thing for a plugin to want, and forbidding it would only mean the plugin registered
     * under a different name and lost the recipes.
     */
    public register(station: CraftingStation): void {
        this.stations.set(station.block, station);
    }

    public get(block: RecipeStation): CraftingStation | null {
        return this.stations.get(block) ?? null;
    }

    public getStations(): readonly CraftingStation[] {
        return [...this.stations.values()];
    }

    /**
     * Registers a recipe-driven station for every block the recipe book mentions.
     *
     * Derived rather than listed, so that a station appears the moment a recipe names it -
     * including a plugin's - and nothing has to keep a second list in step. A block that
     * needs behaviour of its own registers over the top afterwards.
     */
    public registerRecipeStations(server: Server): void {
        for (const recipe of server.getRecipeManager().getRecipes()) {
            if (!this.stations.has(recipe.station)) {
                this.register(new RecipeDrivenStation(recipe.station, server));
            }
        }
    }
}

export default StationRegistry;
