import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import type { Server, Service } from '../';
import RecipeRegisterEvent from '../events/crafting/RecipeRegisterEvent';
import Timer from '../utils/Timer';
import type { Recipe, RecipeStation } from './Recipe';
import VanillaRecipes from './VanillaRecipes';

/**
 * Every recipe the server knows, and the numbers the client refers to them by.
 *
 * A recipe's **net id is its position here**, one-based, and that is the whole reason this
 * is one list rather than a map per station: `CraftingDataPacket` writes them in order and
 * an `ItemStackRequest` names one by that number. The two have to agree or a player crafts
 * something they did not choose.
 *
 * Registration is how a plugin contributes, mirroring `BlockManager` and `ItemManager`. The
 * {@link revision} counter alongside it is copied from `BlockStateSchemas`: the encoded
 * packet is worth caching - it is identical for every player and a megabyte of it - and this
 * is what lets that cache notice a plugin without knowing plugins exist.
 */
export class RecipeManager implements Service {
    private readonly server: Server;

    private readonly recipes: Recipe[] = [];
    private readonly byStation = new Map<RecipeStation, Recipe[]>();
    private readonly byId = new Map<string, Recipe>();

    private revisionCounter = 0;

    public constructor(server: Server) {
        this.server = server;
    }

    public async enable(): Promise<void> {
        const timer = new Timer();
        const loaded = VanillaRecipes.load((name) => this.isKnown(name));
        for (const recipe of loaded) await this.registerRecipe(recipe);

        this.server.getLogger().debug(`Registered §b${this.recipes.length}§r recipe(s) in §e${timer.stop()} ms§r`);
    }

    public async disable(): Promise<void> {
        this.recipes.length = 0;
        this.byStation.clear();
        this.byId.clear();
        this.revisionCounter++;
    }

    /**
     * Whether a name is one the server can hand to a client.
     *
     * The item table decides: it is what `StartGamePacket` declares and what every item
     * network id is resolved through, so a name absent from it is one the client would not
     * recognise however carefully the server built it.
     */
    private isKnown(name: string): boolean {
        return (ItemIdMap as Record<string, number>)[name] !== undefined;
    }

    /**
     * Adds a recipe, which is how a plugin contributes one.
     *
     * Announced first, and a listener cancelling it is how a vanilla recipe gets removed -
     * see {@link RecipeRegisterEvent} for why there is no unregister.
     * @param {Recipe} recipe - the recipe.
     * @throws when its id is already taken, because ids have to be unique for the packet to
     * be re-derivable and for a log line to name one thing.
     */
    public async registerRecipe(recipe: Recipe): Promise<void> {
        if (this.byId.has(recipe.id)) throw new Error(`A recipe with id ${recipe.id} is already registered`);

        const event = new RecipeRegisterEvent(recipe);
        await this.server.emit('recipeRegister', event);
        if (event.isCancelled()) return;

        this.recipes.push(recipe);
        this.byId.set(recipe.id, recipe);

        // Kept in priority order as it goes in, so that a station matching a grid tries the
        // more specific recipe first without sorting on every look-up. The main list must
        // *not* be ordered this way - a net id is a position in it.
        const station = this.byStation.get(recipe.station);
        if (!station) this.byStation.set(recipe.station, [recipe]);
        else {
            const at = station.findIndex((other) => other.priority > recipe.priority);
            station.splice(at === -1 ? station.length : at, 0, recipe);
        }

        this.revisionCounter++;
    }

    /**
     * The recipe a client's net id names.
     * @param {number} netId - one-based, as written by `CraftingDataPacket`.
     * @returns {Recipe | null} the recipe, or `null` if the id names nothing.
     */
    public getByNetId(netId: number): Recipe | null {
        return this.recipes[netId - 1] ?? null;
    }

    /** The net id to send for a recipe, or `null` if it is not registered here. */
    public getNetId(recipe: Recipe): number | null {
        const index = this.recipes.indexOf(recipe);

        return index === -1 ? null : index + 1;
    }

    public getById(id: string): Recipe | null {
        return this.byId.get(id) ?? null;
    }

    /** Everything, in net id order - which is the order the packet has to write. */
    public getRecipes(): readonly Recipe[] {
        return this.recipes;
    }

    /**
     * Only what a given station can make.
     *
     * Sorted by the priority vanilla gave them, so that a station matching a grid tries the
     * more specific recipe first.
     */
    public getRecipesFor(station: RecipeStation): readonly Recipe[] {
        return this.byStation.get(station) ?? [];
    }

    /** Bumped by every registration, for caches keyed on it. */
    public get revision(): number {
        return this.revisionCounter;
    }
}

export default RecipeManager;
