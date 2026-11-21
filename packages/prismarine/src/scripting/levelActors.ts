/**
 * How a level's scripts find what an id names: a dimension's world, an entity's actor and a
 * player's session. The level's script access and its entity systems both look entities up here.
 */
import type { ScriptItem } from '@jsprismarine/script-host/host/world';

import type { StoreActor } from '../entity/data/storeActors';
import { itemFromContent } from '../item/itemFromContent';
import type PlayerSession from '../network/PlayerSession';
import type Server from '../Server';
import type { Item } from '../item/Item';
import type { Level } from '../world/Level';
import type { World } from '../world/World';

/**
 * Whether an actor is in the world: still in its store, whatever its health. A dead mob stays
 * there through its death animation, and a script reads it as valid until it leaves, as on BDS.
 */
export const presentActor = (actor: StoreActor): boolean => actor.entity.removed === undefined;

/** The lookups of one level. */
export const levelActors = (server: Server, level: Level) => ({
    /** The world of a dimension, by its Bedrock name, or undefined when nobody has entered it. */
    worldOf: (dimension: string): World | undefined =>
        [...level.worlds()].find((world) => world.getDimension().bedrockName === dimension),
    /** The actor of an entity in the level, by runtime id, while it is present. */
    actorOf: (id: string): StoreActor | undefined => {
        if (!/^\d+$/.test(id)) return undefined;
        for (const world of level.worlds()) {
            const actor = world.getActor(BigInt(id));
            if (actor !== null && presentActor(actor)) return actor;
        }
        return undefined;
    },
    /** The session of a player in the level, by runtime id. */
    sessionOf: (id: string): PlayerSession | undefined =>
        server
            .getSessionManager()
            .getSessions()
            .find((session) => String(session.runtimeId) === id && session.getWorld().getLevel() === level)
});

/** A script's stack as an inventory slot holds it, or undefined for a type the content lacks. */
export const itemOfScriptItem = (server: Server, item: ScriptItem): Item | undefined => {
    const stack = itemFromContent(item.typeId, server.getContent());
    if (stack === null) return undefined;
    const shown = stack.withCount(item.amount).withDisplay(item.nameTag, item.lore ?? []);
    const most = shown.getMaxDurability();
    return most > 0 ? shown.withDurability(most - (item.damage ?? 0)) : shown;
};
