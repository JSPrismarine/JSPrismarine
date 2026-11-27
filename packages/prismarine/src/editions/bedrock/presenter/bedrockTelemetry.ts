/**
 * The `LegacyTelemetryEvent` packets a Bedrock Dedicated Server sends its players.
 *
 * A client unlocks most Xbox achievements from what it sees itself, but it cannot see that its
 * player's blow killed a mob, what killed its player, or that a command it sent succeeded. BDS
 * tells it with these packets. Each one built here follows a packet the pinned BDS 1.26.60 sent
 * with cheats off, captured as its player ran `/me`, punched a pig to death and was killed by a
 * zombie; `LegacyTelemetryEventPacket.test.ts` in `@jsprismarine/protocol` keeps those bytes.
 * BDS sent none for a kill made from its console, and none for `/gamemode`, which it refused.
 *
 * The header's actor is the player, with Use Player ID set. Every id is a unique id, which this
 * server makes the runtime id.
 */
import { ActorDamageCause } from '@jsprismarine/minecraft/generated/v2225/ActorDamageCause';
import { ActorType } from '@jsprismarine/minecraft/generated/v2225/ActorType';
import LegacyTelemetryEventPacket, {
    LegacyTelemetryEventDataOrdinal,
    LegacyTelemetryEventType
} from '@jsprismarine/protocol/bedrock/packet/LegacyTelemetryEventPacket';
import type { LegacyTelemetryEventData } from '@jsprismarine/protocol/bedrock/packet/LegacyTelemetryEventPacket';

import { DamageCause } from '../../../entity/DamageCause';
import type { ReportedKill } from '../../../player/presenter/SessionPresenter';

/**
 * The actor types whose name is not their identifier in capitals.
 *
 * Mojang's schema names the actor types after the game's classes, and 24 identifiers in the
 * actor list BDS sends are spelled otherwise. `minecraft:minecart` is here although `MINECART`
 * is a name, because `MINECART` is the category every minecart type belongs to, not the cart.
 * `bedrockTelemetry.test.ts` checks every identifier in the captured list against the table.
 */
const ACTOR_TYPE_NAMES: Readonly<Record<string, keyof typeof ActorType>> = {
    'minecraft:boat': 'BOAT_RIDEABLE',
    'minecraft:chest_boat': 'CHEST_BOAT_RIDEABLE',
    'minecraft:chest_minecart': 'MINECART_CHEST',
    'minecraft:cod': 'FISH',
    'minecraft:command_block_minecart': 'MINECART_COMMAND_BLOCK',
    'minecraft:egg': 'THROWN_EGG',
    'minecraft:ender_dragon': 'DRAGON',
    'minecraft:ender_pearl': 'ENDERPEARL',
    'minecraft:enderman': 'ENDER_MAN',
    'minecraft:eye_of_ender_signal': 'EYE_OF_ENDER',
    'minecraft:fireball': 'LARGE_FIREBALL',
    'minecraft:hopper_minecart': 'MINECART_HOPPER',
    'minecraft:item': 'ITEM_ENTITY',
    'minecraft:magma_cube': 'LAVA_SLIME',
    'minecraft:minecart': 'MINECART_RIDEABLE',
    'minecraft:mooshroom': 'MUSHROOM_COW',
    'minecraft:ravager': 'ILLAGER_BEAST',
    'minecraft:splash_potion': 'THROWN_POTION',
    'minecraft:thrown_trident': 'TRIDENT',
    'minecraft:tnt': 'PRIMED_TNT',
    'minecraft:tnt_minecart': 'MINECART_TNT',
    'minecraft:wither': 'WITHER_BOSS',
    'minecraft:xp_bottle': 'EXPERIENCE_POTION',
    'minecraft:xp_orb': 'EXPERIENCE',
    'minecraft:zombie_pigman': 'PIG_ZOMBIE'
};

/** Whether a string names a member of {@link ActorType}, rather than one of its reverse-mapped values. */
const isActorTypeName = (name: string): name is keyof typeof ActorType =>
    Object.hasOwn(ActorType, name) && Number.isNaN(Number(name));

/**
 * The `ActorType` an entity is reported as, which carries its category bits: a zombie is
 * 199456, not its legacy id 32.
 *
 * @param identifier - The entity's identifier, such as `minecraft:zombie`.
 * @returns Its actor type, or `UNDEFINED` for an identifier the schema has no type for, such as
 *   an addon's entity.
 */
export const actorTypeOf = (identifier: string): ActorType => {
    const name = ACTOR_TYPE_NAMES[identifier] ?? identifier.replace(/^minecraft:/, '').toUpperCase();
    return isActorTypeName(name) ? ActorType[name] : ActorType.UNDEFINED;
};

/**
 * How this server's damage causes are reported. Both kinds of kill have an entity that dealt the
 * blow, so an explosion is the entity's. `Generic`, which `/kill` deals, is BDS's `Override`.
 */
const DAMAGE_CAUSES: Readonly<Record<DamageCause, ActorDamageCause>> = {
    [DamageCause.Generic]: ActorDamageCause.OVERRIDE,
    [DamageCause.Drowning]: ActorDamageCause.DROWNING,
    [DamageCause.Starvation]: ActorDamageCause.STARVE,
    [DamageCause.Fall]: ActorDamageCause.FALL,
    [DamageCause.Fire]: ActorDamageCause.FIRE,
    [DamageCause.Lava]: ActorDamageCause.LAVA,
    [DamageCause.Void]: ActorDamageCause.VOID,
    [DamageCause.Attack]: ActorDamageCause.ENTITY_ATTACK,
    [DamageCause.Projectile]: ActorDamageCause.PROJECTILE,
    [DamageCause.Explosion]: ActorDamageCause.ENTITY_EXPLOSION,
    [DamageCause.SonicBoom]: ActorDamageCause.SONIC_BOOM,
    [DamageCause.Contact]: ActorDamageCause.CONTACT,
    [DamageCause.Suffocation]: ActorDamageCause.SUFFOCATION,
    [DamageCause.Magic]: ActorDamageCause.MAGIC,
    [DamageCause.Wither]: ActorDamageCause.WITHER,
    [DamageCause.Thorns]: ActorDamageCause.THORNS,
    [DamageCause.SelfDestruct]: ActorDamageCause.SELF_DESTRUCT
};

/** One event about the player, as BDS heads every event it sends. */
const telemetryPacket = (
    player: bigint,
    eventType: LegacyTelemetryEventType,
    eventData: LegacyTelemetryEventData
): LegacyTelemetryEventPacket => {
    const packet = new LegacyTelemetryEventPacket();
    packet.targetActorId = player;
    packet.eventType = eventType;
    packet.usePlayerId = true;
    packet.eventData = eventData;
    return packet;
};

/**
 * A kill as BDS reports it: `MobKilled` to the player who dealt the blow, `PlayerDied` to the
 * player who took it.
 *
 * @param kill - The kill.
 * @returns The packet for the player the kill names.
 */
export const killTelemetryOf = (kill: ReportedKill): LegacyTelemetryEventPacket =>
    kill.kind === 'killedMob'
        ? telemetryPacket(kill.player, LegacyTelemetryEventType.MobKilled, {
              ordinal: LegacyTelemetryEventDataOrdinal.MobKilled,
              instigatorActorId: kill.player,
              targetActorId: kill.victim,
              // The projectile's type when one dealt the blow; BDS sent `Undefined` for a punch.
              instigatorChildActorType:
                  kill.projectile === undefined ? ActorType.UNDEFINED : actorTypeOf(kill.projectile),
              damageSource: DAMAGE_CAUSES[kill.cause],
              // A victim that does not trade.
              tradeTier: -1,
              traderName: ''
          })
        : telemetryPacket(kill.player, LegacyTelemetryEventType.PlayerDied, {
              ordinal: LegacyTelemetryEventDataOrdinal.PlayerDied,
              // Despite the name, an actor type: BDS sent 199456 for a zombie.
              instigatorActorId: actorTypeOf(kill.killer),
              // This server keeps no mob variants; BDS sent 0 for a plain zombie.
              instigatorMobVariant: 0,
              damageSource: DAMAGE_CAUSES[kill.cause],
              // This server has no raids.
              diedInRaid: false
          });

/**
 * A command the player ran that succeeded, as BDS reports it: by the name it was typed with, and
 * one success. BDS sent nothing for a command it refused.
 *
 * @param player - The player's runtime id.
 * @param line - The command as the client sent it, such as `/me waves`.
 * @returns The packet.
 */
export const commandTelemetryOf = (player: bigint, line: string): LegacyTelemetryEventPacket =>
    telemetryPacket(player, LegacyTelemetryEventType.SlashCommand, {
        ordinal: LegacyTelemetryEventDataOrdinal.SlashCommand,
        successCount: 1,
        errorCount: 0,
        commandName: line.trim().replace(/^\//, '').split(/\s/, 1)[0] ?? '',
        errorList: ''
    });
