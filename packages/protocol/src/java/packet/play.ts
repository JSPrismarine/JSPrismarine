/**
 * The play phase. Ids come from the release's generated table, and the layouts that changed in
 * 26.x were read off the vanilla server's own encoders: `Login (play)` gained `onlineMode`, and
 * `Confirm Teleportation` carries the position and rotation the client accepted.
 */
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import { bool, custom, list, optional, record, uint8 } from '../../wire/fieldTypes';
import { PACKETS } from '../versions/26.3/packets';
import {
    blockPosition,
    double,
    float,
    int,
    javaString,
    long,
    optionalVarInt,
    sectionPosition,
    short,
    textComponent,
    uuid,
    varInt,
    varLong
} from '../wire/javaTypes';
import { profileProperty } from './login';
import { identifier } from './configuration';
import { defineJavaPacket } from './JavaPacket';

/** `Disconnect (play)` (clientbound): ends the connection, with the reason as a text component. */
export const PlayDisconnect = defineJavaPacket('Disconnect (play)', PACKETS.play.clientbound.disconnect, {
    reason: textComponent
});

/** Vanilla's `CommonPlayerSpawnInfo`: the world a player spawns into, which a login and a respawn both carry. */
const SPAWN_INFO = {
    /** The dimension type's network id: its index in the `minecraft:dimension_type` registry. */
    dimensionType: varInt,
    dimension: identifier,
    hashedSeed: long,
    gameMode: varInt,
    /** The game mode before the last change, or null for none. */
    previousGameMode: optionalVarInt,
    isDebug: bool,
    isFlat: bool,
    deathLocation: optional(record({ dimension: identifier, position: long })),
    portalCooldown: varInt,
    seaLevel: varInt
};

/** `Login (play)` (clientbound): the player's entity, the world it spawns in and the server's settings. */
export const PlayLogin = defineJavaPacket('Login (play)', PACKETS.play.clientbound.login, {
    entityId: int,
    hardcore: bool,
    dimensions: list(identifier),
    maxPlayers: varInt,
    viewDistance: varInt,
    simulationDistance: varInt,
    reducedDebugInfo: bool,
    showDeathScreen: bool,
    doLimitedCrafting: bool,
    ...SPAWN_INFO,
    onlineMode: bool,
    enforcesSecureChat: bool
});

/** `Synchronize Player Position` (clientbound): moves the client's own player, which confirms it by id. */
export const SynchronizePlayerPosition = defineJavaPacket(
    'Synchronize Player Position',
    PACKETS.play.clientbound.player_position,
    {
        teleportId: varInt,
        x: double,
        y: double,
        z: double,
        velocityX: double,
        velocityY: double,
        velocityZ: double,
        yaw: float,
        pitch: float,
        /** Which of the fields are relative, as `Relative` bits; zero for an absolute move. */
        flags: int
    }
);

/** `Confirm Teleportation` (serverbound): the client applied a position, and where it put the player. */
export const ConfirmTeleportation = defineJavaPacket(
    'Confirm Teleportation',
    PACKETS.play.serverbound.accept_teleportation,
    { teleportId: varInt, x: double, y: double, z: double, yaw: float, pitch: float }
);

/** `Game Event` (clientbound): a change of state the client applies, by event number. */
export const GameEvent = defineJavaPacket('Game Event', PACKETS.play.clientbound.game_event, {
    event: uint8,
    value: float
});

/** The `Game Event` that tells a joining client to wait for chunks around it before showing the world. */
export const START_WAITING_FOR_LEVEL_CHUNKS = 13;

/** `Set Center Chunk` (clientbound): the chunk the client's view is centered on. */
export const SetCenterChunk = defineJavaPacket('Set Center Chunk', PACKETS.play.clientbound.set_chunk_cache_center, {
    x: varInt,
    z: varInt
});

/** `Chunk Batch Start` (clientbound): chunks follow, which the client times. */
export const ChunkBatchStart = defineJavaPacket('Chunk Batch Start', PACKETS.play.clientbound.chunk_batch_start, {});

/** `Chunk Batch Finished` (clientbound): how many chunks the batch held. */
export const ChunkBatchFinished = defineJavaPacket(
    'Chunk Batch Finished',
    PACKETS.play.clientbound.chunk_batch_finished,
    { batchSize: varInt }
);

/** `Chunk Batch Received` (serverbound): how many chunks a tick the client would like next. */
export const ChunkBatchReceived = defineJavaPacket(
    'Chunk Batch Received',
    PACKETS.play.serverbound.chunk_batch_received,
    { chunksPerTick: float }
);

/** `Clientbound Keep Alive (play)`: a number the client must send back, or the server drops it. */
export const ClientboundKeepAlive = defineJavaPacket(
    'Clientbound Keep Alive (play)',
    PACKETS.play.clientbound.keep_alive,
    {
        id: long
    }
);

/** `Serverbound Keep Alive (play)`: the number the server sent. */
export const ServerboundKeepAlive = defineJavaPacket(
    'Serverbound Keep Alive (play)',
    PACKETS.play.serverbound.keep_alive,
    {
        id: long
    }
);

/** The flags byte the move packets end with: on the ground, and against a wall. */
const moveFlags = uint8;

/** `Set Player Position` (serverbound). */
export const MovePlayerPos = defineJavaPacket('Set Player Position', PACKETS.play.serverbound.move_player_pos, {
    x: double,
    y: double,
    z: double,
    flags: moveFlags
});

/** `Set Player Position and Rotation` (serverbound). */
export const MovePlayerPosRot = defineJavaPacket(
    'Set Player Position and Rotation',
    PACKETS.play.serverbound.move_player_pos_rot,
    { x: double, y: double, z: double, yaw: float, pitch: float, flags: moveFlags }
);

/** `Set Player Rotation` (serverbound). */
export const MovePlayerRot = defineJavaPacket('Set Player Rotation', PACKETS.play.serverbound.move_player_rot, {
    yaw: float,
    pitch: float,
    flags: moveFlags
});

/** `Set Player Movement Flags` (serverbound). */
export const MovePlayerStatusOnly = defineJavaPacket(
    'Set Player Movement Flags',
    PACKETS.play.serverbound.move_player_status_only,
    { flags: moveFlags }
);

/** The move flags' bit for a player standing on the ground. */
export const MOVE_ON_GROUND = 0x01;

/** `System Chat Message` (clientbound): text the client shows in chat, or over the hotbar when `overlay`. */
export const SystemChat = defineJavaPacket('System Chat Message', PACKETS.play.clientbound.system_chat, {
    content: textComponent,
    overlay: bool
});

/** A chat signature: 256 bytes, which a server without secure chat reads past. */
const signature = custom<Buffer>(
    'Byte Array (256)',
    (s, v) => s.write(v),
    (s) => s.read(256)
);

/** Which recent messages the client has seen, as a fixed 20-bit set in 3 bytes; nothing reads it. */
const acknowledged = custom<Buffer>(
    'Fixed BitSet (20)',
    (s, v) => s.write(v),
    (s) => s.read(3)
);

/** `Chat Message` (serverbound): what the player typed, with the secure chat fields this server does not check. */
export const ChatMessage = defineJavaPacket('Chat Message', PACKETS.play.serverbound.chat, {
    message: javaString(256),
    timestamp: long,
    salt: long,
    signature: optional(signature),
    lastSeenOffset: varInt,
    acknowledged,
    checksum: uint8
});

/** `Chat Command` (serverbound): a command the player typed, without its slash. */
export const ChatCommand = defineJavaPacket('Chat Command', PACKETS.play.serverbound.chat_command, {
    command: javaString(32_767)
});

/** `Game Event` 3: the client's own game mode changed, to the value's game mode. */
export const CHANGE_GAME_MODE = 3;

/** `Player Loaded` (serverbound): the client has the world around it and shows the player. */
export const PlayerLoaded = defineJavaPacket('Player Loaded', PACKETS.play.serverbound.player_loaded, {});

/** An angle as one byte: 256 steps to a turn. */
const angle = custom<number>(
    'Angle',
    (s, degrees) => s.writeByte(Math.round((((degrees % 360) + 360) % 360) * (256 / 360)) & 0xff),
    (s) => (s.readByte() * 360) / 256
);

/**
 * A low-precision vector, which carries a spawned entity's velocity. Only the zero vector, one zero
 * byte, is written and read: the server sends entities at rest.
 */
const restingVelocity = custom<null>(
    'LpVec3',
    (s) => s.writeByte(0),
    (s) => {
        const first = s.readByte();
        if (first !== 0) throw new ProtocolWireErrors.JavaVelocityNotAtRest();
        return null;
    }
);

/** `Spawn Entity` (clientbound): an entity coming into view, by type id, at rest. */
export const AddEntity = defineJavaPacket('Spawn Entity', PACKETS.play.clientbound.add_entity, {
    entityId: varInt,
    uuid,
    type: varInt,
    x: double,
    y: double,
    z: double,
    velocity: restingVelocity,
    pitch: angle,
    yaw: angle,
    headYaw: angle,
    data: varInt
});

/** `Remove Entities` (clientbound): entities leaving view. */
export const RemoveEntities = defineJavaPacket('Remove Entities', PACKETS.play.clientbound.remove_entities, {
    entityIds: list(varInt)
});

/** `Teleport Entity` (clientbound): an entity's absolute position and facing. */
export const TeleportEntity = defineJavaPacket('Teleport Entity', PACKETS.play.clientbound.teleport_entity, {
    entityId: varInt,
    x: double,
    y: double,
    z: double,
    velocityX: double,
    velocityY: double,
    velocityZ: double,
    yaw: float,
    pitch: float,
    /** Which of the fields are relative, as `Relative` bits; zero for an absolute move. */
    flags: int,
    onGround: bool
});

/** `Set Head Rotation` (clientbound): where an entity's head faces. */
export const RotateHead = defineJavaPacket('Set Head Rotation', PACKETS.play.clientbound.rotate_head, {
    entityId: varInt,
    headYaw: angle
});

/** `Player Info Update` actions, as bits of the set the packet opens with. */
export enum PlayerInfoAction {
    AddPlayer = 0x01,
    UpdateListed = 0x08
}

/**
 * `Player Info Update` (clientbound) adding players to the tab list: their profile, and listed.
 * The action set is fixed to adding and listing, whose fields each entry carries in that order.
 */
export const PlayerInfoAdd = defineJavaPacket('Player Info Update', PACKETS.play.clientbound.player_info_update, {
    actions: uint8,
    players: list(record({ uuid, name: javaString(16), properties: list(profileProperty), listed: bool }))
});

/** `Player Info Remove` (clientbound): players leaving the tab list. */
export const PlayerInfoRemove = defineJavaPacket('Player Info Remove', PACKETS.play.clientbound.player_info_remove, {
    uuids: list(uuid)
});

/** `Block Update` (clientbound): one block's new state, by its state id. */
export const BlockUpdate = defineJavaPacket('Block Update', PACKETS.play.clientbound.block_update, {
    position: blockPosition,
    state: varInt
});

/** One block of a section's update: its state id, and its place within the section. */
export interface SectionBlock {
    readonly state: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A section block as one VarLong: the state id above twelve bits of x, z and y, four bits each. */
const sectionBlock = custom<SectionBlock>(
    'Section Block',
    (s, { state, x, y, z }) => varLong.write(s, (BigInt(state) << 12n) | BigInt((x << 8) | (z << 4) | y)),
    (s) => {
        const packed = varLong.read(s);
        const place = Number(packed & 0xfffn);
        return { state: Number(packed >> 12n), x: place >> 8, y: place & 15, z: (place >> 4) & 15 };
    }
);

/** `Update Section Blocks` (clientbound): several blocks of one section at once. */
export const SectionBlocksUpdate = defineJavaPacket(
    'Update Section Blocks',
    PACKETS.play.clientbound.section_blocks_update,
    { section: sectionPosition, blocks: list(sectionBlock) }
);

/**
 * `Player Action` (serverbound) statuses, by the order of vanilla's `ServerboundPlayerActionPacket.Action`.
 * 26.x put `ChangeDestroyDirection` second, which moved every later one up by one.
 */
export enum PlayerActionStatus {
    StartDestroyBlock = 0,
    ChangeDestroyDirection = 1,
    AbortDestroyBlock = 2,
    StopDestroyBlock = 3,
    DropAllItems = 4,
    DropItem = 5,
    ReleaseUseItem = 6,
    SwapItemWithOffhand = 7,
    Stab = 8
}

/**
 * `Player Action` (serverbound): mining a block, and the hand's other actions. `face` is the
 * direction's 3D data value, 0 to 5 for down, up, north, south, west and east, and `sequence` is
 * what the server's `Block Changed Ack` answers.
 */
export const PlayerAction = defineJavaPacket('Player Action', PACKETS.play.serverbound.player_action, {
    status: varInt,
    position: blockPosition,
    face: uint8,
    sequence: varInt
});

/** `Acknowledge Block Change` (clientbound): the client's block predictions up to `sequence` are answered. */
export const BlockChangedAck = defineJavaPacket(
    'Acknowledge Block Change',
    PACKETS.play.clientbound.block_changed_ack,
    {
        sequence: varInt
    }
);

/** An item stack as plain data: an item's network id and how many. */
export interface JavaItemStack {
    readonly item: number;
    readonly count: number;
}

/**
 * `Slot` as the server writes it: a count, zero for an empty slot, then the item's id and its
 * data component patch. Stacks are sent plain, with an empty patch, so reading one with components
 * refuses it rather than misread what follows.
 */
const itemStack = custom<JavaItemStack | null>(
    'Slot',
    (s, stack) => {
        if (stack === null || stack.count <= 0) {
            varInt.write(s, 0);
            return;
        }
        varInt.write(s, stack.count);
        varInt.write(s, stack.item);
        // No components added, none removed.
        varInt.write(s, 0);
        varInt.write(s, 0);
    },
    (s) => {
        const count = varInt.read(s);
        if (count <= 0) return null;
        const item = varInt.read(s);
        const added = varInt.read(s);
        const removed = varInt.read(s);
        if (added + removed > 0) throw new ProtocolWireErrors.JavaItemComponentsUnread({ count: added + removed });
        return { item, count };
    }
);

/**
 * `Slot` as a client writes it, vanilla's untrusted codec: each added component's value carries
 * its length, so the components are read past. The stack keeps its item and count only.
 */
const untrustedItemStack = custom<JavaItemStack | null>(
    'Untrusted Slot',
    (s, stack) => itemStack.write(s, stack),
    (s) => {
        const count = varInt.read(s);
        if (count <= 0) return null;
        const item = varInt.read(s);
        const added = varInt.read(s);
        const removed = varInt.read(s);
        for (let i = 0; i < added; i++) {
            varInt.read(s);
            s.read(varInt.read(s));
        }
        for (let i = 0; i < removed; i++) varInt.read(s);
        return { item, count };
    }
);

/**
 * `Set Container Content` (clientbound): every slot of a window, and what the cursor carries.
 * Window 0 is the player's own inventory: 0 the crafting result, 1 to 4 the crafting grid, 5 to 8
 * the armor from the head down, 9 to 35 the main inventory, 36 to 44 the hotbar and 45 the off hand.
 */
export const ContainerSetContent = defineJavaPacket(
    'Set Container Content',
    PACKETS.play.clientbound.container_set_content,
    { window: varInt, stateId: varInt, items: list(itemStack), carried: itemStack }
);

/** `Set Container Slot` (clientbound): one slot of a window. */
export const ContainerSetSlot = defineJavaPacket('Set Container Slot', PACKETS.play.clientbound.container_set_slot, {
    window: varInt,
    stateId: varInt,
    slot: short,
    item: itemStack
});

/** `Set Held Item` (clientbound): the hotbar slot the player holds, 0 to 8. */
export const SetHeldSlot = defineJavaPacket('Set Held Item', PACKETS.play.clientbound.set_held_slot, {
    slot: varInt
});

/** `Set Held Item` (serverbound): the hotbar slot the player moved its hand to, 0 to 8. */
export const SetCarriedItem = defineJavaPacket('Set Held Item', PACKETS.play.serverbound.set_carried_item, {
    slot: short
});

/** `Set Creative Mode Slot` (serverbound): a creative player put a stack in a slot of its inventory, or emptied it. */
export const SetCreativeModeSlot = defineJavaPacket(
    'Set Creative Mode Slot',
    PACKETS.play.serverbound.set_creative_mode_slot,
    { slot: short, item: untrustedItemStack }
);

/** The hands a player uses items with, by vanilla's `InteractionHand` ids. */
export enum JavaHand {
    Main = 0,
    Off = 1
}

/**
 * `Use Item On` (serverbound): the player used the item in a hand on a block's face. The cursor is
 * where on the block, each coordinate from 0 to 1; `inside` says the eyes were inside the block,
 * and `worldBorderHit` that the click landed on the world border. `sequence` is what the server's
 * `Acknowledge Block Change` answers.
 */
export const UseItemOn = defineJavaPacket('Use Item On', PACKETS.play.serverbound.use_item_on, {
    hand: varInt,
    position: blockPosition,
    face: varInt,
    cursorX: float,
    cursorY: float,
    cursorZ: float,
    inside: bool,
    worldBorderHit: bool,
    sequence: varInt
});

/** `Set Health` (clientbound): the player's own health, food level and saturation. */
export const SetHealth = defineJavaPacket('Set Health', PACKETS.play.clientbound.set_health, {
    health: float,
    food: varInt,
    saturation: float
});

/** `Combat Death` (clientbound): a player died, which opens its client's death screen with the message. */
export const PlayerCombatKill = defineJavaPacket('Combat Death', PACKETS.play.clientbound.player_combat_kill, {
    playerId: varInt,
    message: textComponent
});

/** `Client Command` (serverbound) actions, by vanilla's `ServerboundClientCommandPacket.Action` order. */
export enum ClientCommandAction {
    PerformRespawn = 0,
    RequestStats = 1,
    RequestGameRuleValues = 2
}

/** `Client Command` (serverbound): the death screen's respawn button, and requests for statistics. */
export const ClientCommand = defineJavaPacket('Client Command', PACKETS.play.serverbound.client_command, {
    action: varInt
});

/**
 * `Respawn` (clientbound): the player is spawned again into a world, which a death's respawn and a
 * change of dimension send. `dataToKeep` keeps the attributes (1) and the entity data (2) the
 * client had; a respawn after death keeps neither.
 */
export const Respawn = defineJavaPacket('Respawn', PACKETS.play.clientbound.respawn, {
    ...SPAWN_INFO,
    dataToKeep: uint8
});

/** Equipment slots, by vanilla's `EquipmentSlot` order, which numbers them on the wire. */
export enum JavaEquipmentSlot {
    MainHand = 0,
    OffHand = 1,
    Feet = 2,
    Legs = 3,
    Chest = 4,
    Head = 5,
    Body = 6,
    Saddle = 7
}

/** One slot of an entity's equipment and what is in it. */
export interface JavaEquipment {
    readonly slot: JavaEquipmentSlot;
    readonly item: JavaItemStack | null;
}

/** The bit a slot's byte carries while more slots follow it. */
const MORE_EQUIPMENT = 0x80;

/** The equipment list: each slot's byte, with {@link MORE_EQUIPMENT} on all but the last, then its stack. */
const equipmentList = custom<JavaEquipment[]>(
    'Equipment',
    (s, entries) =>
        entries.forEach(({ slot, item }, index) => {
            s.writeByte(index < entries.length - 1 ? slot | MORE_EQUIPMENT : slot);
            itemStack.write(s, item);
        }),
    (s) => {
        const entries: JavaEquipment[] = [];
        for (let more = true; more;) {
            const byte = s.readByte();
            more = (byte & MORE_EQUIPMENT) !== 0;
            entries.push({ slot: byte & ~MORE_EQUIPMENT, item: itemStack.read(s) });
        }
        return entries;
    }
);

/** `Set Equipment` (clientbound): what an entity holds and wears, slot by slot; at least one slot. */
export const SetEquipment = defineJavaPacket('Set Equipment', PACKETS.play.clientbound.set_equipment, {
    entityId: varInt,
    equipment: equipmentList
});

/** The entity data serializers this server writes, by their 26.3 registration ids. */
export enum JavaEntityDataSerializer {
    Byte = 0,
    Int = 1,
    Pose = 20
}

/** One entity data entry: its index on the entity, its serializer and its value. */
export interface JavaEntityDataEntry {
    readonly index: number;
    readonly serializer: JavaEntityDataSerializer;
    readonly value: number;
}

/** The byte that ends an entity's data. */
const END_OF_ENTITY_DATA = 0xff;

/** The entries, each as its index, its serializer's VarInt id and its value, then {@link END_OF_ENTITY_DATA}. */
const entityData = custom<JavaEntityDataEntry[]>(
    'Entity Metadata',
    (s, entries) => {
        for (const { index, serializer, value } of entries) {
            s.writeByte(index);
            varInt.write(s, serializer);
            if (serializer === JavaEntityDataSerializer.Byte) s.writeByte(value);
            else varInt.write(s, value);
        }
        s.writeByte(END_OF_ENTITY_DATA);
    },
    (s) => {
        const entries: JavaEntityDataEntry[] = [];
        for (let index = s.readByte(); index !== END_OF_ENTITY_DATA; index = s.readByte()) {
            const serializer = varInt.read(s);
            if (serializer === JavaEntityDataSerializer.Byte) entries.push({ index, serializer, value: s.readByte() });
            else if (serializer === JavaEntityDataSerializer.Int || serializer === JavaEntityDataSerializer.Pose) {
                entries.push({ index, serializer, value: varInt.read(s) });
            } else throw new ProtocolWireErrors.JavaEntityDataSerializerUnread({ serializer });
        }
        return entries;
    }
);

/** `Set Entity Metadata` (clientbound): some of an entity's data, by index. */
export const SetEntityData = defineJavaPacket('Set Entity Metadata', PACKETS.play.clientbound.set_entity_data, {
    entityId: varInt,
    entries: entityData
});

/** The bits of an entity's shared flags, at entity data index 0. */
export enum JavaEntityFlag {
    OnFire = 0x01,
    Crouching = 0x02,
    Sprinting = 0x08,
    Swimming = 0x10,
    Invisible = 0x20,
    Glowing = 0x40,
    FallFlying = 0x80
}

/** Poses, by vanilla's `Pose` order, at entity data index 6. */
export enum JavaPose {
    Standing = 0,
    FallFlying = 1,
    Sleeping = 2,
    Swimming = 3,
    Crouching = 5
}

/** The entity data indices every entity has. */
export enum JavaEntityDataIndex {
    SharedFlags = 0,
    Pose = 6
}
