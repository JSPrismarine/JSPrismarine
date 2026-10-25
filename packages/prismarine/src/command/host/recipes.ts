/**
 * `/recipe give` and `/recipe take`, and the per-player set they write.
 *
 * Java keeps a recipe book per player and sends the whole of it on join plus
 * a delta for every change. Bedrock's `UnlockedRecipesPacket` is the same
 * shape, so the server's part is the set and the delta; the client draws the
 * book from it.
 *
 * The set lives for as long as the session does. Java saves it in the player
 * file and this server's player data has no field for it, so a player who
 * reconnects starts from whatever the server grants them - which is what the
 * row in {@link import('../vanillaCommands').UNWIRED_COMMANDS} used to say
 * was missing altogether.
 */
import type { EntityRef } from '@jsprismarine/commands';
import type { RecipeBook } from '@jsprismarine/recipes';

import type Server from '../../Server';
import UnlockedRecipesPacket, { UnlockedRecipesType } from '../../network/packet/UnlockedRecipesPacket';
import { carryOut, refuse, resolvePlayer } from './support';

/** The recipe name `/recipe` means "every one of them" by. */
const ALL_RECIPES = '*';

/** Which recipes each player has unlocked, by player name. */
export class UnlockedRecipes {
    private readonly byPlayer = new Map<string, Set<string>>();

    /** What one player has unlocked, in the order it was granted. */
    public of(player: string): readonly string[] {
        return [...(this.byPlayer.get(player) ?? [])];
    }

    /** @returns The ids that were not already unlocked. */
    public grant(player: string, ids: readonly string[]): readonly string[] {
        const held = this.byPlayer.get(player) ?? new Set<string>();
        this.byPlayer.set(player, held);

        const added = ids.filter((id) => !held.has(id));
        for (const id of added) held.add(id);
        return added;
    }

    /** @returns The ids that were unlocked and now are not. */
    public revoke(player: string, ids: readonly string[]): readonly string[] {
        const held = this.byPlayer.get(player);
        if (held === undefined) return [];

        const removed = ids.filter((id) => held.delete(id));
        if (held.size === 0) this.byPlayer.delete(player);
        return removed;
    }

    /** Locks everything one player had. @returns How many were locked. */
    public revokeAll(player: string): number {
        const held = this.byPlayer.get(player)?.size ?? 0;
        this.byPlayer.delete(player);
        return held;
    }
}

/**
 * Unlocks or locks recipes for players.
 *
 * @param book - The compiled recipe book, or undefined when `content-packs`
 *   is off. Without it a name cannot be checked against anything, so `*` has
 *   nothing to expand to and a name is refused rather than unlocked blindly.
 * @param recipe - A recipe id, or `*` for every recipe in the book.
 * @param give - True to unlock, false to lock.
 * @returns How many players had their book changed.
 * @throws {CommandSyntaxException} When no book is loaded, or when the name
 *   is not one the book holds.
 */
export const changeRecipes = (
    server: Server,
    unlocked: UnlockedRecipes,
    book: RecipeBook | undefined,
    players: readonly EntityRef[],
    recipe: string,
    give: boolean
): number => {
    if (book === undefined) {
        refuse('This server has loaded no recipes; turn on content-packs to unlock one');
    }

    const all = recipe === ALL_RECIPES;
    if (!all && book.get(recipe) === undefined) refuse(`There is no recipe called ${recipe}`);

    const ids = all ? book.recipes.map((entry) => entry.id) : [recipe];
    let changed = 0;

    for (const ref of players) {
        const player = resolvePlayer(server, ref);
        if (player === undefined) continue;

        const name = player.getName();
        // Locking everything is its own packet type, and it is the one case
        // where the client does not need the list to apply the change.
        if (!give && all) {
            const held = unlocked.revokeAll(name);
            if (held === 0) continue;

            changed += 1;
            carryOut(send(player, UnlockedRecipesType.RemoveAll, []), undefined);
            continue;
        }

        const applied = give ? unlocked.grant(name, ids) : unlocked.revoke(name, ids);
        if (applied.length === 0) continue;

        changed += 1;
        carryOut(
            send(player, give ? UnlockedRecipesType.NewlyUnlocked : UnlockedRecipesType.RemoveUnlocked, applied),
            undefined
        );
    }

    return changed;
};

/** One delta on the wire. */
const send = (
    player: { getNetworkSession(): { send(packet: UnlockedRecipesPacket): Promise<void> } },
    type: UnlockedRecipesType,
    recipes: readonly string[]
): Promise<void> => {
    const packet = new UnlockedRecipesPacket();
    packet.type = type;
    packet.recipes = [...recipes];
    return player.getNetworkSession().send(packet);
};
