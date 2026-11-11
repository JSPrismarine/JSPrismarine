/**
 * The saved player record as a projection of a player's state, in both directions.
 *
 * {@link playerRecordFrom} builds the record from a player and {@link applyPlayerRecord} puts a
 * record back into one. Both read and write through structural ports, so the record has one home
 * whichever object holds the player: a live `Player` satisfies the ports today, and a store
 * player (`entity/storePlayer.ts`) satisfies them over its store entity. Slice 5 of the entity
 * and tick re-architecture moves live players into the store, and the record does not change
 * when it does.
 *
 * Plain data out, as ADR 0011 asks of anything that leaves a world: the record shares no object
 * with the player it was built from, so a save cut under ADR 0018 can build it at one tick
 * boundary and write it later.
 */
import type { PlayerProgressJson } from '@jsprismarine/advancements';
import type { Gametype } from '@jsprismarine/minecraft';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';
import { Attribute, AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import { storedAdvancements } from '../advancement/progress';
import type { WorldPlayerData } from '../config/JsonConfigTypes';
import type { ServerContent } from '../content/ServerContent';
import { enchantmentSeedOf } from '../enchantment/enchantingTable';
import type HumanInventory from '../inventory/HumanInventory';
import { restoreInventory, storedInventory } from '../inventory/persistence';
import { mayFlyIn } from '../entity/playerComponents';
import type { KeyedPlayer } from '../keyedPlayer';
import type { DimensionType } from './Dimension';
import type { StoredSpawnPoint } from './RespawnPoint';

/** What a record reads off a player. A live `Player` has every member. */
export interface PlayerRecordSource {
    getUUID(): { toString(): string };
    getName(): string;
    readonly gamemode: Gametype;
    isFlying(): boolean;
    /** The eye position, 1.62 above the feet, which every record written so far holds. */
    getPosition(): { getX(): number; getY(): number; getZ(): number };
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
    getInventory(): HumanInventory;
    getHealth(): number;
    getMaxHealth(): number;
    getFood(): number;
    getSaturation(): number;
    /** The client's attribute table, which holds food, saturation and experience and is saved whole. */
    readonly attributes: Attributes;
    getSpawnPoint(): StoredSpawnPoint | undefined;
    getPortalCooldown(): number;
    hasSeenCredits(): boolean;
}

/**
 * What a record writes back into a player. Every write is silent: nothing is sent and no death
 * runs, because a record is loaded before the client has been told its login succeeded.
 */
export interface PlayerRecordTarget {
    gamemode: Gametype;
    getInventory(): HumanInventory;
    getHealth(): number;
    readonly attributes: Attributes;
    /** Writes health without the death path, so a player who left on half a heart is not killed. */
    restoreHealth(health: number): void;
    /** Writes the flying flag without asking the client or raising an event. */
    restoreFlying(flying: boolean): void;
    setFood(food: number): void;
    /** Writes saturation, which never exceeds the food just set. */
    setSaturation(saturation: number): void;
    setSpawnPoint(spawn: StoredSpawnPoint | undefined): void;
    setSeenCredits(seen: boolean): void;
    setPortalCooldown(ticks: number): void;
}

/**
 * The record's fields that per-player services hold, keyed by `keyOfPlayer`, rather than the
 * player: advancement progress and the enchantment seed.
 */
export interface PlayerServiceState {
    readonly advancements: PlayerProgressJson;
    readonly enchantmentSeed: number;
}

/**
 * The record a player's state saves as, built without awaiting anything.
 *
 * The field order is the order the record is written in, and the fallback JSON file keeps it, so
 * it does not change. `position` is the eye. The attribute table's health entry is the player's
 * health and maximum health, so a player whose health lives on its store entity saves the same
 * table a live player does.
 * @param player - Whose state to record.
 * @param services - What the per-player services hold for this player.
 * @param dimension - The dimension the record is stamped with, so the next login puts the player
 *   back in it: the one of the world saving the record.
 * @returns The record, with `savedAt` set to now.
 */
export const playerRecordFrom = (
    player: PlayerRecordSource,
    services: PlayerServiceState,
    dimension: DimensionType
): WorldPlayerData => {
    const spawn = player.getSpawnPoint();
    return {
        // Serialized explicitly: the uuid is a parsed object, and letting JSON have its way with
        // it would write out the four raw parts instead of the identity.
        uuid: player.getUUID().toString(),
        username: player.getName(),
        gamemode: getGametypeName(player.gamemode),
        flying: player.isFlying(),
        position: {
            x: player.getPosition().getX(),
            y: player.getPosition().getY(),
            z: player.getPosition().getZ(),
            pitch: player.pitch,
            yaw: player.yaw,
            headYaw: player.headYaw
        },
        dimension: dimension.id,
        advancements: services.advancements,
        enchantmentSeed: services.enchantmentSeed,
        inventory: storedInventory(player.getInventory()),
        health: player.getHealth(),
        food: player.getFood(),
        saturation: player.getSaturation(),
        experience: {
            level: player.attributes.getValue(AttributeIds.PlayerLevel),
            progress: player.attributes.getValue(AttributeIds.PlayerExperience)
        },
        attributes: Object.fromEntries(
            player.attributes.getAttributes().map((attribute) => {
                const health = attribute.getName() === AttributeIds.Health;
                return [
                    attribute.getName(),
                    {
                        min: attribute.getMin(),
                        max: health ? player.getMaxHealth() : attribute.getMax(),
                        base: attribute.getDefault(),
                        current: health ? player.getHealth() : attribute.getValue()
                    }
                ];
            })
        ),
        // Written whether or not the player has a spawn point of their own, because a record is
        // the whole state: leaving the field out of a save after `/kill` would keep a bed this
        // player no longer has. Copied, so the record shares nothing with the player.
        ...(spawn === undefined ? {} : { spawn: { ...spawn } }),
        portalCooldown: player.getPortalCooldown(),
        seenCredits: player.hasSeenCredits(),
        savedAt: Date.now()
    } satisfies WorldPlayerData;
};

/**
 * A player's record, with what the per-player services hold for them.
 * @param player - Whose state to record.
 * @param keyed - The key the services file the player's state under, and the server they read.
 * @param dimension - The dimension the record is stamped with; see {@link playerRecordFrom}.
 * @returns The record.
 */
export const playerRecordOf = (
    player: PlayerRecordSource,
    keyed: KeyedPlayer,
    dimension: DimensionType
): WorldPlayerData =>
    playerRecordFrom(
        player,
        { advancements: storedAdvancements(keyed), enchantmentSeed: enchantmentSeedOf(keyed) },
        dimension
    );

/**
 * Puts a record back into a player: game mode, inventory, attributes, flying, the spawn point,
 * the credits flag and the portal cooldown.
 *
 * The attributes go in whole when the record has the table, which is every record written since
 * it existed, and through the separate health, food, saturation and experience fields otherwise.
 * Saturation is set after food because it is clamped to it. Flying is kept only for a game mode
 * that allows it. The position and the per-player services are the caller's, because placing a
 * player who has no saved position needs the world.
 * @param player - The player to fill, freshly built.
 * @param data - The record, or what a first join gets instead of one.
 * @param defaultGamemode - The game mode named when the record names none.
 * @param content - The content build, which decides each restored item's maximum durability.
 */
export const applyPlayerRecord = (
    player: PlayerRecordTarget,
    data: Partial<WorldPlayerData>,
    defaultGamemode: string,
    content?: ServerContent
): void => {
    player.gamemode = getGametypeId(data.gamemode || defaultGamemode);
    restoreInventory(player.getInventory(), data.inventory, content);

    if (data.attributes !== undefined) {
        for (const [name, attribute] of Object.entries(data.attributes)) {
            player.attributes.setAttribute(
                new Attribute({
                    name,
                    min: attribute.min,
                    max: attribute.max,
                    def: attribute.base,
                    value: attribute.current
                })
            );
        }
        // A player whose health is not in the table, such as a store player, takes it from there.
        const health = data.attributes[AttributeIds.Health]?.current;
        if (health !== undefined && player.getHealth() !== health) player.restoreHealth(health);
    } else {
        if (data.health !== undefined) player.restoreHealth(data.health);
        if (data.food !== undefined) player.setFood(data.food);
        if (data.saturation !== undefined) player.setSaturation(data.saturation);
        if (data.experience !== undefined) {
            player.attributes.setValue(AttributeIds.PlayerLevel, data.experience.level);
            player.attributes.setValue(AttributeIds.PlayerExperience, data.experience.progress);
        }
    }

    player.restoreFlying(data.flying === true && mayFlyIn(player.gamemode));
    player.setSpawnPoint(data.spawn);
    player.setSeenCredits(data.seenCredits === true);
    if (data.portalCooldown !== undefined) player.setPortalCooldown(data.portalCooldown);
};

/** Where a record puts a returning player: the eye and the look. */
export interface RecordedPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
}

/**
 * The position a record puts a returning player at, or undefined for a player who has none and
 * is placed the way a first join is.
 * @param data - The record.
 * @returns The eye position and the look, with a missing angle read as 0.
 */
export const recordedPosition = (data: Partial<WorldPlayerData>): RecordedPosition | undefined => {
    const position = data.position;
    if (!position) return undefined;
    return {
        x: position.x,
        y: position.y,
        z: position.z,
        pitch: position.pitch || 0,
        yaw: position.yaw || 0,
        headYaw: position.headYaw || 0
    };
};
