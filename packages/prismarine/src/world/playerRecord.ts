import { getGametypeName } from '@jsprismarine/minecraft';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';

import { storedAdvancements } from '../advancement/progress';
import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { enchantmentSeedOf } from '../enchantment/enchantingTable';
import { storedInventory } from '../inventory/persistence';
import type Player from '../Player';
import type { DimensionType } from './Dimension';

/**
 * The record a player's state saves as, built without awaiting anything.
 *
 * Plain data, so the {@link import('./PlayerPersistence').PlayerPersistence} service can write it
 * whenever and wherever it chooses, and so a save cut can build every player's record at one
 * tick boundary and write them later. The field order is the order the record is written in, and
 * the fallback JSON file keeps it, so it does not change.
 *
 * `position` is the player's position, which for a player is the eye, 1.62 above the feet. Every
 * record written so far holds the eye, and the login puts the player back at what it reads.
 * @param player - Whose state to record.
 * @param dimension - The dimension the record is stamped with, so the next login puts the player
 *   back in it: the one of the world saving the record.
 * @returns The record, with `savedAt` set to now.
 */
export const playerRecordOf = (player: Player, dimension: DimensionType): WorldPlayerData =>
    ({
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
        advancements: storedAdvancements(player),
        enchantmentSeed: enchantmentSeedOf(player),
        inventory: storedInventory(player.getInventory()),
        health: player.getHealth(),
        food: player.getFood(),
        saturation: player.getSaturation(),
        experience: {
            level: player.attributes.getValue(AttributeIds.PlayerLevel),
            progress: player.attributes.getValue(AttributeIds.PlayerExperience)
        },
        attributes: Object.fromEntries(
            player.attributes.getAttributes().map((attribute) => [
                attribute.getName(),
                {
                    min: attribute.getMin(),
                    max: attribute.getMax(),
                    base: attribute.getDefault(),
                    current: attribute.getValue()
                }
            ])
        ),
        // Written whether or not the player has a spawn point of their own, because a record is
        // the whole state: leaving the field out of a save after `/kill` would keep a bed this
        // player no longer has.
        ...(player.getSpawnPoint() === undefined ? {} : { spawn: player.getSpawnPoint() }),
        portalCooldown: player.getPortalCooldown(),
        seenCredits: player.hasSeenCredits(),
        savedAt: Date.now()
    }) satisfies WorldPlayerData;
