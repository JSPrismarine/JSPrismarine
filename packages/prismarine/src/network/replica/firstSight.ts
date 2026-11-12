/**
 * The packets that show a client an entity it has not seen, and the equipment, status effect and
 * ability packets they share with a session's own sends.
 *
 * A first sight is answered from the entity replica
 * ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md)): a {@link FirstSight}
 * is plain data the replica gives, and nothing here reads a live entity. Nothing in a first sight
 * depends on the viewer either, so its packets are built once for each protocol codec and the
 * encoded batch is shared by every viewer in a codec and compression group.
 */
import { Vector3 } from '@jsprismarine/math';
import { BuildPlatform, CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import type { ProtocolContext } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import AddItemActorPacket from '@jsprismarine/protocol/packet/AddItemActorPacket';
import AddPlayerPacket from '@jsprismarine/protocol/packet/AddPlayerPacket';
import MobArmorEquipmentPacket from '@jsprismarine/protocol/packet/MobArmorEquipmentPacket';
import MobEffectPacket, { MobEffectEvent } from '@jsprismarine/protocol/packet/MobEffectPacket';
import MobEquipmentPacket from '@jsprismarine/protocol/packet/MobEquipmentPacket';
import UpdateAbilitiesPacket, {
    AbilityLayer,
    AbilityLayerFlag,
    AbilityLayerType
} from '@jsprismarine/protocol/packet/UpdateAbilitiesPacket';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';

import { healthAttributesOf } from '../../entity/data/actorView';
import type { EntityView } from '../../entity/data/actorView';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { ShownPlayerState } from '../../entity/playerShown';
import type { ViewableEquipment } from '../../entity/predicateView';
import type { StatusEffect, StatusEffectChange } from '../../entity/StatusEffect';
import { bedrockMobEffectId } from '../../entity/StatusEffect';
import { WindowIds } from '../../inventory/WindowIds';
import { Item } from '../../item/Item';
import type Device from '../../utils/Device';

/** Who a player is, as the session that speaks for it holds it, which no log entry carries. */
export interface SightIdentity {
    readonly uuid: UUID;
    readonly name: string;
    readonly platformChatId: string;
    readonly device: Device | null;
    /** Whether the permission service lists the player as an operator. */
    readonly op: boolean;
}

/** What a client is shown when an entity first comes into its view. */
export type FirstSight =
    | {
          readonly kind: 'actor';
          readonly runtimeId: bigint;
          /** The type the client draws. */
          readonly identifier: string;
          readonly view: EntityView;
          readonly metadata: Metadata;
          readonly equipment: ViewableEquipment;
      }
    | {
          readonly kind: 'item';
          readonly runtimeId: bigint;
          readonly view: EntityView;
          readonly metadata: Metadata;
          /** The stack lying there, or undefined for a stack with nothing in it, which is not shown. */
          readonly stack: Item | undefined;
      }
    | {
          readonly kind: 'player';
          readonly runtimeId: bigint;
          readonly view: EntityView;
          readonly metadata: Metadata;
          readonly player: ShownPlayerState;
          readonly identity: SightIdentity;
          readonly equipment: ViewableEquipment;
      };

/** What the abilities packet says about a player. */
export interface AbilityTarget {
    readonly runtimeId: bigint;
    readonly gamemode: Gametype;
    /** Whether the player's metadata lets it fly. */
    readonly canFly: boolean;
    readonly flying: boolean;
    readonly op: boolean;
}

/**
 * The packets that show one client an entity, in the order a client is sent them.
 * @param context - The receiving codec's context, which numbers the items.
 */
export const firstSightPackets = (sight: FirstSight, context: ProtocolContext): NetworkPacket<unknown>[] => {
    switch (sight.kind) {
        case 'actor':
            return actorSight(sight, context);
        case 'item':
            return itemSight(sight, context);
        case 'player':
            return playerSight(sight, context);
    }
};

const actorSight = (sight: Extract<FirstSight, { kind: 'actor' }>, context: ProtocolContext) => {
    const { runtimeId, view } = sight;
    const packet = new AddActorPacket();
    packet.runtimeEntityId = runtimeId;
    packet.type = sight.identifier;
    packet.position = new Vector3(view.pose.x, view.pose.y, view.pose.z);
    // Whatever the entity is actually doing, where it can say. A projectile spawned with no
    // motion is drawn hanging in the air until the first movement packet catches up with it,
    // which for something crossing three blocks a tick is a visible stutter at the muzzle.
    packet.motion = Vector3.fromObject(view.velocity);
    packet.pitch = view.pose.pitch;
    packet.yaw = view.pose.yaw;
    // A store entity's head turns with its body.
    packet.headYaw = view.pose.yaw;
    packet.metadata = sight.metadata;
    packet.syncedProperties = view.properties;
    // Health, speed and reach arrive with the entity rather than in a packet of their own
    // afterwards, which is the difference between a mob that is right from its first frame and
    // one that is briefly a default.
    packet.attributes = healthAttributesOf(view.health).getAttributes();
    const packets: NetworkPacket<unknown>[] = [packet];

    // What it is holding and wearing. `AddActorPacket` has no room for equipment, so a mob's
    // weapon has to follow it as a packet of its own - and without this a skeleton fires arrows
    // from an empty fist. Nothing is sent for an entity with empty slots throughout, which every
    // entity that is not a dressed mob is.
    if (Object.values(sight.equipment).some((item) => item !== undefined))
        packets.push(...equipmentPackets(runtimeId, sight.equipment, context));

    packets.push(...statusEffectsOf(runtimeId, view.statusEffects));
    return packets;
};

/** A dropped stack, as Bedrock Dedicated Server sends it, so the client draws it leaving its block. */
const itemSight = (sight: Extract<FirstSight, { kind: 'item' }>, context: ProtocolContext) => {
    if (sight.stack === undefined) return [];
    const { runtimeId, view } = sight;
    return [
        new AddItemActorPacket({
            targetActorId: runtimeId,
            runtimeEntityId: runtimeId,
            item: sight.stack.toStackDescriptor(context),
            position: new Vector3(view.pose.x, view.pose.y, view.pose.z),
            motion: Vector3.fromObject(view.velocity),
            metadata: sight.metadata,
            isFromFishing: false
        })
    ];
};

/** A player, as Bedrock shows one: an `AddPlayer`, then the abilities, the armor and the status effects. */
const playerSight = (sight: Extract<FirstSight, { kind: 'player' }>, context: ProtocolContext) => {
    const { runtimeId, view, player, identity } = sight;
    // `StorePlayer.platformChatId` is still empty because the login handler does not read the
    // client's platform online id yet. This sends what the player list sends.
    return [
        new AddPlayerPacket({
            uuid: identity.uuid,
            name: identity.name,
            runtimeEntityId: runtimeId,
            platformChatId: identity.platformChatId,
            position: playerEyes(view),
            // Players report their own movement every tick, so the server has no velocity to send.
            motion: new Vector3(0, 0, 0),
            pitch: view.pose.pitch,
            yaw: view.pose.yaw,
            headYaw: player.headYaw,
            carriedItem: (sight.equipment.mainhand ?? Item.air()).toStackDescriptor(context),
            gamemode: player.gamemode,
            metadata: sight.metadata,
            syncedProperties: new SyncedProperties(),
            abilities: {
                targetPlayerRawId: runtimeId,
                playerPermission: identity.op ? PlayerPermissionLevel.OPERATOR : PlayerPermissionLevel.MEMBER,
                commandPermission: identity.op ? CommandPermissionLevel.GAME_DIRECTORS : CommandPermissionLevel.ANY,
                layers: []
            },
            links: [],
            passengerOfBlock: null,
            deviceId: identity.device?.id ?? '',
            buildPlatform: identity.device?.os ?? BuildPlatform.UNKNOWN
        }),
        // No adventure settings here: that packet describes only the client receiving it, so it
        // has no place in showing somebody else.
        abilitiesPacket({
            runtimeId,
            gamemode: player.gamemode,
            canFly: sight.metadata.canFly,
            flying: player.flying,
            op: identity.op
        }),
        // `AddPlayerPacket` carries the held item and nothing else, so armor has to follow the
        // player into view as a packet of its own.
        ...armorPackets(runtimeId, sight.equipment, context),
        ...statusEffectsOf(runtimeId, view.statusEffects)
    ];
};

/** Where a client draws a player: at its eyes, which a store player's feet are `EYE_HEIGHT` below. */
const playerEyes = (view: EntityView): Vector3 => new Vector3(view.pose.x, view.pose.y + EYE_HEIGHT, view.pose.z);

const statusEffectsOf = (runtimeId: bigint, effects: readonly StatusEffect[]): MobEffectPacket[] =>
    effects.flatMap((effect) => statusEffectPacket(runtimeId, effect, 'add', 0n) ?? []);

/**
 * Everything one entity is holding and wearing, as a mob is shown it.
 *
 * Both packets go out whatever the entity is wearing, rather than only the occupied slots.
 * `MobArmorEquipmentPacket` is positional, so a client sent three pieces reads the next packet's
 * bytes as the fourth, and an empty slot has to travel as air. The main hand is a separate packet
 * because that is the one the client reads a held item from, with zero for both slots, as a mob
 * has no inventory to name one in; the off hand follows only when something is in it, the way
 * vanilla sends it.
 */
export const equipmentPackets = (
    runtimeEntityId: bigint,
    worn: ViewableEquipment,
    context: ProtocolContext
): NetworkPacket<unknown>[] => {
    const packets: NetworkPacket<unknown>[] = [
        new MobArmorEquipmentPacket({
            runtimeEntityId,
            head: (worn.head ?? Item.air()).toStackDescriptor(context),
            chest: (worn.chest ?? Item.air()).toStackDescriptor(context),
            legs: (worn.legs ?? Item.air()).toStackDescriptor(context),
            feet: (worn.feet ?? Item.air()).toStackDescriptor(context),
            body: (worn.body ?? Item.air()).toStackDescriptor(context)
        }),
        new MobEquipmentPacket({
            runtimeEntityId,
            item: (worn.mainhand ?? Item.air()).toStackDescriptor(context),
            inventorySlot: 0,
            hotbarSlot: 0,
            windowId: 0
        })
    ];
    if (worn.offhand !== undefined) {
        packets.push(
            new MobEquipmentPacket({
                runtimeEntityId,
                item: worn.offhand.toStackDescriptor(context),
                inventorySlot: 0,
                hotbarSlot: 0,
                windowId: WindowIds.OFFHAND
            })
        );
    }
    return packets;
};

/**
 * What a human is wearing and holding in the off hand.
 *
 * All four armor pieces at once, empty ones included as air: the packet is positional. `Body` is
 * the body armor slot, which `HumanInventory` does not model, so it is always air. It used to carry
 * the off-hand item, which the client took for body armor. The off hand goes out as a
 * `MobEquipmentPacket` for the offhand container, the way the client reports its own off-hand
 * changes, and its single slot makes both slot fields zero.
 */
export const armorPackets = (
    runtimeEntityId: bigint,
    worn: ViewableEquipment,
    context: ProtocolContext
): NetworkPacket<unknown>[] => [
    new MobArmorEquipmentPacket({
        runtimeEntityId,
        head: (worn.head ?? Item.air()).toStackDescriptor(context),
        chest: (worn.chest ?? Item.air()).toStackDescriptor(context),
        legs: (worn.legs ?? Item.air()).toStackDescriptor(context),
        feet: (worn.feet ?? Item.air()).toStackDescriptor(context),
        body: Item.air().toStackDescriptor(context)
    }),
    new MobEquipmentPacket({
        runtimeEntityId,
        item: (worn.offhand ?? Item.air()).toStackDescriptor(context),
        inventorySlot: 0,
        hotbarSlot: 0,
        windowId: WindowIds.OFFHAND
    })
];

/**
 * One status effect change of an entity.
 * @param tick - The client's last input tick when the entity is its own player, else zero.
 * @returns The packet, or undefined for an effect Bedrock has no id for.
 */
export const statusEffectPacket = (
    runtimeId: bigint,
    effect: StatusEffect,
    change: StatusEffectChange,
    tick: bigint
): MobEffectPacket | undefined => {
    const effectId = bedrockMobEffectId(effect.id);
    if (effectId === undefined) return undefined;

    const packet = new MobEffectPacket();
    packet.targetRuntimeId = runtimeId;
    packet.eventId =
        change === 'add' ? MobEffectEvent.Add : change === 'update' ? MobEffectEvent.Update : MobEffectEvent.Remove;
    packet.effectId = effectId;
    packet.effectAmplifier = effect.amplifier;
    packet.showParticles = effect.showParticles;
    packet.effectDurationTicks = effect.durationTicks;
    packet.tick = tick;
    packet.ambient = effect.ambient;
    return packet;
};

/**
 * `UpdateAbilitiesPacket` describing one player.
 *
 * One `BASE` layer carries every ability, derived from the game mode and op state, with walk
 * speed 0.1, fly speed 0.05 and vertical fly speed 1, the client's own defaults. The target id is
 * the player's runtime id, which the server also uses as its unique id.
 */
export const abilitiesPacket = (target: AbilityTarget): UpdateAbilitiesPacket => {
    // Read off the gamemode rather than each written out by hand, which is how `INSTABUILD` - the
    // flag that *is* creative, as far as the client is concerned - came to be granted to
    // spectators and withheld from creative players.
    const creative = target.gamemode === Gametype.CREATIVE;
    const spectator = target.gamemode === Gametype.SPECTATOR;

    // The base layer names every ability, so the client replaces its whole state rather than
    // keeping stale bits. The three speed flags mark their floats as applying; without
    // `VERTICAL_FLY_SPEED` the client ignored the vertical speed written below.
    const mainLayer = new AbilityLayer();
    mainLayer.layerType = AbilityLayerType.BASE;
    mainLayer.layerFlags = new Map([
        [AbilityLayerFlag.FLY_SPEED, true],
        [AbilityLayerFlag.WALK_SPEED, true],
        [AbilityLayerFlag.VERTICAL_FLY_SPEED, true],
        [AbilityLayerFlag.MAY_FLY, creative || spectator || target.canFly],
        [AbilityLayerFlag.FLYING, spectator || target.flying],
        [AbilityLayerFlag.NO_CLIP, spectator],
        [AbilityLayerFlag.OPERATOR_COMMANDS, target.op],
        [AbilityLayerFlag.TELEPORT, target.op],
        [AbilityLayerFlag.INVULNERABLE, creative || spectator],
        [AbilityLayerFlag.MUTED, false],
        [AbilityLayerFlag.WORLD_BUILDER, false],
        [AbilityLayerFlag.INSTABUILD, creative],
        [AbilityLayerFlag.LIGHTNING, false],
        [AbilityLayerFlag.PRIVILEGED_BUILDER, false],
        [AbilityLayerFlag.BUILD, !spectator],
        [AbilityLayerFlag.MINE, !spectator],
        [AbilityLayerFlag.DOORS_AND_SWITCHES, !spectator],
        [AbilityLayerFlag.OPEN_CONTAINERS, !spectator],
        [AbilityLayerFlag.ATTACK_PLAYERS, !spectator],
        [AbilityLayerFlag.ATTACK_MOBS, !spectator]
    ]);
    mainLayer.flySpeed = 0.05;
    mainLayer.verticalFlySpeed = 1;
    mainLayer.walkSpeed = 0.1;

    const packet = new UpdateAbilitiesPacket();
    packet.commandPermission = target.op ? CommandPermissionLevel.GAME_DIRECTORS : CommandPermissionLevel.ANY;
    packet.playerPermission = target.op ? PlayerPermissionLevel.OPERATOR : PlayerPermissionLevel.MEMBER;
    packet.targetActorUniqueId = target.runtimeId;
    packet.abilityLayers = [mainLayer];
    return packet;
};
