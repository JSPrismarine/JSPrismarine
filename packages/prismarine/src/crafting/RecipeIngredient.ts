import type { Item } from '../item/Item';

/**
 * The meta value that means "any".
 *
 * Vanilla's recipes are full of it - a recipe for a stick does not care which of the six
 * planks it is fed - and it is a real value on the wire rather than a convention, so it has
 * to survive into the packet unchanged.
 */
export const ANY_META = 32767;

/**
 * How an ingredient describes itself to the client.
 *
 * Deliberately a plain union rather than the bytes themselves: an ingredient decides *what*
 * it is, the packet decides how that is written. Without the split, a plugin adding a kind
 * of ingredient would have to know the wire format, and the wire format could not change
 * without touching every ingredient.
 */
export type IngredientDescriptor = { kind: 'name'; name: string; meta: number } | { kind: 'tag'; tag: string };

/**
 * One slot's worth of what a recipe needs.
 *
 * An interface rather than a class so that a plugin can answer "does this item do?" however
 * it likes - by tag, by durability, by anything - and still be usable by every station and
 * written into the recipe packet.
 */
export interface RecipeIngredient {
    /** Whether an item satisfies this. `null` is an empty slot. */
    matches(item: Item | null): boolean;

    /** What to tell the client this is. */
    describe(): IngredientDescriptor;

    /** How many of the item the recipe consumes. */
    readonly count: number;
}

/**
 * The ordinary ingredient: a named item, optionally pinned to one meta value.
 *
 * Vanilla recipes are all of this kind.
 */
export class ItemIngredient implements RecipeIngredient {
    public constructor(
        public readonly name: string,
        public readonly meta: number = ANY_META,
        public readonly count: number = 1
    ) {}

    public matches(item: Item | null): boolean {
        if (!item || item.getName() !== this.name) return false;

        return this.meta === ANY_META || item.meta === this.meta;
    }

    public describe(): IngredientDescriptor {
        return { kind: 'name', name: this.name, meta: this.meta };
    }

    public toString(): string {
        return this.meta === ANY_META ? this.name : `${this.name}:${this.meta}`;
    }
}

/**
 * An ingredient satisfied by anything carrying a tag - "any plank", "any log".
 *
 * Nothing vanilla loads as one, because the recipe dump names every alternative out in full.
 * It exists because the alternative for a plugin is a recipe per variant, and because
 * writing it now is what proves {@link RecipeIngredient} is an interface rather than a class
 * wearing one.
 */
export class TagIngredient implements RecipeIngredient {
    public constructor(
        public readonly tag: string,
        private readonly members: ReadonlySet<string>,
        public readonly count: number = 1
    ) {}

    public matches(item: Item | null): boolean {
        return item !== null && this.members.has(item.getName());
    }

    public describe(): IngredientDescriptor {
        return { kind: 'tag', tag: this.tag };
    }

    public toString(): string {
        return `#${this.tag}`;
    }
}
