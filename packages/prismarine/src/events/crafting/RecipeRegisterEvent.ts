import type { Recipe } from '../../crafting/Recipe';
import { Event } from '../Event';

/**
 * A recipe is about to be registered.
 *
 * Cancellable, which is how a plugin removes a vanilla recipe: there is no unregister, and
 * there should not be - a recipe's net id is its position in the list, so taking one out
 * after the fact would renumber every recipe after it.
 */
export default class RecipeRegisterEvent extends Event {
    private readonly recipe: Recipe;

    public constructor(recipe: Recipe) {
        super();
        this.recipe = recipe;
    }

    public getRecipe(): Recipe {
        return this.recipe;
    }
}
