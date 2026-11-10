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
 * The store is a map keyed by the player's key (`playerKeyOf`: the XUID, or the
 * name without one) rather than a field on the player, so the advancement
 * subsystem can be added and removed without the player class growing a member
 * for every subsystem that wants one. The entry lives from the load at join to
 * the save at leave. Keyed by the account rather than the entity runtime id
 * because the account is what the record is filed under and what survives a
 * move between worlds, and since #2951 one live player holds an account at a
 * time: a second login waits for the first one's save and release before it
 * loads. `PlayerSession.disable` calls {@link forgetAdvancements} once the
 * progress is saved.
 */
import { PlayerAdvancements } from '@jsprismarine/advancements';
import type { PlayerProgressJson } from '@jsprismarine/advancements';

import type { KeyedPlayerSource, PlayerKeySource } from '../keyedPlayer';
import { keyedPlayerOf, playerKeyFrom } from '../keyedPlayer';
import { isRecord } from '../utils/isRecord';

const stores = new Map<string, PlayerAdvancements>();

/**
 * The player's progress, created empty on first ask.
 *
 * Creating lazily is what lets every trigger call site reach for this without
 * caring whether the player's data has arrived; a player with none starts
 * from nothing, which is what a first join looks like anyway.
 */
export const advancementsOf = (player: PlayerKeySource): PlayerAdvancements => {
    const key = playerKeyFrom(player);
    const held = stores.get(key);
    if (held) return held;

    const created = new PlayerAdvancements();
    stores.set(key, created);
    return created;
};

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
export const loadAdvancements = (player: PlayerKeySource, stored: unknown): void => {
    stores.set(playerKeyFrom(player), PlayerAdvancements.fromJSON(readProgress(stored)));
};

/**
 * Lets go of a player's progress, for a player who is leaving.
 *
 * Called after the progress has been saved. A player who comes back has it
 * read from the record again by {@link loadAdvancements}.
 */
export const forgetAdvancements = (player: PlayerKeySource): void => {
    stores.delete(playerKeyFrom(player));
};

/**
 * The player's progress in the shape the player data record stores.
 *
 * The engine goes in so each entry carries its `done` flag, which is what a
 * reader that is not this server - a tool, a migration - has to go on.
 */
export const storedAdvancements = (player: KeyedPlayerSource): PlayerProgressJson => {
    const keyed = keyedPlayerOf(player);
    const engine = keyed.server.getContent().advancements;
    return advancementsOf(keyed).toJSON((id) => engine.get(id));
};
