import { Item } from '../item/Item';

/** A source of chance. Injected rather than reached for, so a roll can be made to repeat. */
export type Random = () => number;

/** One thing a block may yield, and how likely it is. */
export interface DropChance {
    /**
     * What falls, by name.
     *
     * Resolved through the item table when the stack goes on the wire, so a name is enough -
     * neither a numeric id nor a registered class is needed here.
     */
    name: string;
    /** The fewest that fall when this entry comes up. Defaults to one. */
    min?: number;
    /** The most that fall, inclusive. Defaults to {@link DropChance.min}. */
    max?: number;
    /**
     * The odds, written the way the game states them: `8` is a one in eight chance.
     *
     * Absent means certain. A probability between zero and one would read as `0.125` here and
     * be wrong by a factor of a thousand just as easily.
     */
    oneIn?: number;
}

/**
 * What a block yields when it breaks.
 *
 * Declarative because the alternative is a `Math.random()` in each of two hundred and sixty
 * block files, which is how gravel's flint was written: correct, untestable, and impossible
 * to state without reading the code. A table can be read, compared against the game, and
 * rolled with a chance source of the caller's choosing.
 *
 * Bedrock keeps these in the engine rather than in data - a Bedrock Dedicated Server ships
 * loot tables for chests, entities, equipment and gameplay, and none for blocks - so unlike
 * the recipes and the enums, this is authored rather than generated. That is a fact about
 * Mojang's distribution, not a shortcut taken here.
 */
export class DropTable {
    public constructor(private readonly entries: readonly DropChance[]) {}

    /** The entries, for anything that wants to state the odds rather than roll them. */
    public getEntries(): readonly DropChance[] {
        return this.entries;
    }

    /**
     * Rolls the table once.
     * @param {Random} random - where the chance comes from.
     * @returns {Item[]} what fell, one stack of one per item.
     */
    public roll(random: Random): Item[] {
        const drops: Item[] = [];

        for (const entry of this.entries) {
            if (entry.oneIn !== undefined && Math.floor(random() * entry.oneIn) !== 0) continue;

            const min = entry.min ?? 1;
            const max = entry.max ?? min;
            const count = min + Math.floor(random() * (max - min + 1));

            for (let i = 0; i < count; i++) {
                // A fresh stack each, never one object handed out twice: two entities sharing
                // an item is two entities that mutate each other, which is the mistake the
                // creative menu makes if its list is handed straight to a player.
                //
                // No numeric id, because the name is what resolves - see `Item.getNetworkId`.
                drops.push(new Item({ id: 0, name: entry.name, count: 1 }));
            }
        }

        return drops;
    }
}

/**
 * The server's source of chance, or the global one if it has none.
 *
 * A block is handed a server and nothing else, so this is where a roll finds its randomness.
 * The fallback keeps a bare stand-in server - every block test has one - working.
 * @param {object} server - the server the break happened on.
 * @returns {Random} the source of chance.
 */
export const randomOf = (server: unknown): Random =>
    (server as { getRandom?: () => Random } | null)?.getRandom?.() ?? Math.random;

export default DropTable;
