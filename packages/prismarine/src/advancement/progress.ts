/**
 * Where a player's advancement progress lives between two logins.
 *
 * `PlayerAdvancements` is deliberately not owned by the engine - a server
 * keeps progress wherever it keeps the rest of a player's data - so this is
 * the place that decides where that is: alongside the position and the
 * gamemode in the player data record, which `World.getPlayerData` reads and
 * `World.savePlayerData` writes through whatever the provider is. For the
 * LevelDB provider that is the `player_server_<key>` record, and for the file
 * provider `worlds/<name>/playerdata/<key>.json`.
 *
 * The store is a `WeakMap` keyed on the player rather than a field on
 * `Player`, so the advancement subsystem can be added and removed without the
 * player class growing a member for every subsystem that wants one. A player
 * who leaves is collected along with their progress.
 */
import { PlayerAdvancements } from '@jsprismarine/advancements';
import type { PlayerProgressJson } from '@jsprismarine/advancements';

import type Player from '../Player';

const stores = new WeakMap<Player, PlayerAdvancements>();

/**
 * The player's progress, created empty on first ask.
 *
 * Creating lazily is what lets every trigger call site reach for this without
 * caring whether the player's data has arrived; a player with none starts
 * from nothing, which is what a first join looks like anyway.
 */
export const advancementsOf = (player: Player): PlayerAdvancements => {
    const held = stores.get(player);
    if (held) return held;

    const created = new PlayerAdvancements();
    stores.set(player, created);
    return created;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a stored value is shaped like the progress record.
 *
 * Checked here rather than trusted, because the player data file is a boundary
 * the compiler cannot see and `PlayerAdvancements.fromJSON` reads `criteria`
 * off every entry without asking. An entry that is not shaped right is dropped
 * and the rest of the record still loads, which costs a player the entries
 * somebody broke rather than the login.
 */
const readProgress = (stored: unknown): PlayerProgressJson => {
    if (!isRecord(stored)) return {};

    const progress: Record<string, { criteria: Record<string, string>; done: boolean }> = {};
    for (const [id, entry] of Object.entries(stored)) {
        if (!isRecord(entry) || !isRecord(entry.criteria)) continue;

        const criteria: Record<string, string> = {};
        for (const [name, at] of Object.entries(entry.criteria)) {
            if (typeof at === 'string') criteria[name] = at;
        }
        if (Object.keys(criteria).length > 0) progress[id] = { criteria, done: entry.done === true };
    }
    return progress;
};

/**
 * Replaces a player's progress with what was stored.
 *
 * The stored `done` flag is read and then discarded: `PlayerAdvancements`
 * recomputes completion from the advancement's current `requirements`, so a
 * datapack reload that changes the matrix re-derives whether a player has
 * finished rather than trusting a flag written against the old one.
 *
 * @param stored - The record off the player data, or undefined for a player
 *   who has none.
 */
export const loadAdvancements = (player: Player, stored: unknown): void => {
    stores.set(player, PlayerAdvancements.fromJSON(readProgress(stored)));
};

/**
 * The player's progress in the shape the player data record stores.
 *
 * The engine goes in so each entry carries its `done` flag, which is what a
 * reader that is not this server - a tool, a migration - has to go on.
 */
export const storedAdvancements = (player: Player): PlayerProgressJson => {
    const engine = player.getServer().getContent()?.advancements;
    return advancementsOf(player).toJSON(engine ? (id) => engine.get(id) : undefined);
};
