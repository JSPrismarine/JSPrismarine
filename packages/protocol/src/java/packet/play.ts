/**
 * The play phase. Ids come from the release's generated table, and the layouts that changed in
 * 26.x were read off the vanilla server's own encoders: `Login (play)` gained `onlineMode`, and
 * `Confirm Teleportation` carries the position and rotation the client accepted.
 */
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import { bool, custom, list, optional, record, uint8 } from '../../wire/fieldTypes';
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
import type { JavaText } from '../wire/javaTypes';
import { profileProperty } from './login';
import { identifier } from './configuration';
import { defineJavaPacket } from './JavaPacket';

/**
 * `Disconnect (play)` (clientbound): ends the connection, with the reason as a text component.
 * @javaSource ClientboundDisconnectPacket.STREAM_CODEC
 */
export const PlayDisconnect = defineJavaPacket('Disconnect (play)', 'play/clientbound/disconnect', {
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

/**
 * `Login (play)` (clientbound): the player's entity, the world it spawns in and the server's settings.
 * @javaSource ClientboundLoginPacket.STREAM_CODEC
 */
export const PlayLogin = defineJavaPacket('Login (play)', 'play/clientbound/login', {
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

/**
 * `Synchronize Player Position` (clientbound): moves the client's own player, which confirms it by id.
 * @javaSource ClientboundPlayerPositionPacket.STREAM_CODEC
 */
export const SynchronizePlayerPosition = defineJavaPacket(
    'Synchronize Player Position',
    'play/clientbound/player_position',
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

/**
 * `Confirm Teleportation` (serverbound): the client applied a position, and where it put the player.
 * @javaSource ServerboundAcceptTeleportationPacket.STREAM_CODEC
 */
export const ConfirmTeleportation = defineJavaPacket('Confirm Teleportation', 'play/serverbound/accept_teleportation', {
    teleportId: varInt,
    x: double,
    y: double,
    z: double,
    yaw: float,
    pitch: float
});

/**
 * `Game Event` (clientbound): a change of state the client applies, by event number.
 * @javaSource ClientboundGameEventPacket.STREAM_CODEC
 */
export const GameEvent = defineJavaPacket('Game Event', 'play/clientbound/game_event', {
    event: uint8,
    value: float
});

/** The `Game Event` that tells a joining client to wait for chunks around it before showing the world. */
export const START_WAITING_FOR_LEVEL_CHUNKS = 13;

/**
 * `Set Center Chunk` (clientbound): the chunk the client's view is centered on.
 * @javaSource ClientboundSetChunkCacheCenterPacket.STREAM_CODEC
 */
export const SetCenterChunk = defineJavaPacket('Set Center Chunk', 'play/clientbound/set_chunk_cache_center', {
    x: varInt,
    z: varInt
});

/**
 * `Chunk Batch Start` (clientbound): chunks follow, which the client times.
 * @javaSource ClientboundChunkBatchStartPacket.STREAM_CODEC
 */
export const ChunkBatchStart = defineJavaPacket('Chunk Batch Start', 'play/clientbound/chunk_batch_start', {});

/**
 * `Chunk Batch Finished` (clientbound): how many chunks the batch held.
 * @javaSource ClientboundChunkBatchFinishedPacket.STREAM_CODEC
 */
export const ChunkBatchFinished = defineJavaPacket('Chunk Batch Finished', 'play/clientbound/chunk_batch_finished', {
    batchSize: varInt
});

/**
 * `Chunk Batch Received` (serverbound): how many chunks a tick the client would like next.
 * @javaSource ServerboundChunkBatchReceivedPacket.STREAM_CODEC
 */
export const ChunkBatchReceived = defineJavaPacket('Chunk Batch Received', 'play/serverbound/chunk_batch_received', {
    chunksPerTick: float
});

/**
 * `Clientbound Keep Alive (play)`: a number the client must send back, or the server drops it.
 * @javaSource ClientboundKeepAlivePacket.STREAM_CODEC
 */
export const ClientboundKeepAlive = defineJavaPacket('Clientbound Keep Alive (play)', 'play/clientbound/keep_alive', {
    id: long
});

/**
 * `Serverbound Keep Alive (play)`: the number the server sent.
 * @javaSource ServerboundKeepAlivePacket.STREAM_CODEC
 */
export const ServerboundKeepAlive = defineJavaPacket('Serverbound Keep Alive (play)', 'play/serverbound/keep_alive', {
    id: long
});

/** The flags byte the move packets end with: on the ground, and against a wall. */
const moveFlags = uint8;

/**
 * `Set Player Position` (serverbound).
 * @javaSource ServerboundMovePlayerPacket$Pos.STREAM_CODEC
 */
export const MovePlayerPos = defineJavaPacket('Set Player Position', 'play/serverbound/move_player_pos', {
    x: double,
    y: double,
    z: double,
    flags: moveFlags
});

/**
 * `Set Player Position and Rotation` (serverbound).
 * @javaSource ServerboundMovePlayerPacket$PosRot.STREAM_CODEC
 */
export const MovePlayerPosRot = defineJavaPacket(
    'Set Player Position and Rotation',
    'play/serverbound/move_player_pos_rot',
    { x: double, y: double, z: double, yaw: float, pitch: float, flags: moveFlags }
);

/**
 * `Set Player Rotation` (serverbound).
 * @javaSource ServerboundMovePlayerPacket$Rot.STREAM_CODEC
 */
export const MovePlayerRot = defineJavaPacket('Set Player Rotation', 'play/serverbound/move_player_rot', {
    yaw: float,
    pitch: float,
    flags: moveFlags
});

/**
 * `Set Player Movement Flags` (serverbound).
 * @javaSource ServerboundMovePlayerPacket$StatusOnly.STREAM_CODEC
 */
export const MovePlayerStatusOnly = defineJavaPacket(
    'Set Player Movement Flags',
    'play/serverbound/move_player_status_only',
    { flags: moveFlags }
);

/** `Player Command` (serverbound) actions, by the order of vanilla's `ServerboundPlayerCommandPacket.Action`. */
export enum PlayerCommandAction {
    StopSleeping = 0,
    StartSprinting = 1,
    StopSprinting = 2,
    StartRidingJump = 3,
    StopRidingJump = 4,
    OpenInventory = 5,
    StartFallFlying = 6
}

/**
 * `Player Command` (serverbound): the player got out of bed, started or stopped sprinting, or
 * jumped with or opened the inventory of what it rides. `data` is a riding jump's strength.
 * @javaSource ServerboundPlayerCommandPacket.STREAM_CODEC
 */
export const PlayerCommand = defineJavaPacket('Player Command', 'play/serverbound/player_command', {
    entityId: varInt,
    action: varInt,
    data: varInt
});

/** The bits of `Player Input`'s flags, as vanilla's `Input` writes them. */
export enum PlayerInputFlag {
    Forward = 0x01,
    Backward = 0x02,
    Left = 0x04,
    Right = 0x08,
    Jump = 0x10,
    Shift = 0x20,
    Sprint = 0x40
}

/**
 * `Player Input` (serverbound): the movement keys the player holds, sent each time they change.
 * @javaSource ServerboundPlayerInputPacket.STREAM_CODEC
 */
export const PlayerInput = defineJavaPacket('Player Input', 'play/serverbound/player_input', { flags: uint8 });

/** The move flags' bit for a player standing on the ground. */
export const MOVE_ON_GROUND = 0x01;

/**
 * `System Chat Message` (clientbound): text the client shows in chat, or over the hotbar when `overlay`.
 * @javaSource ClientboundSystemChatPacket.STREAM_CODEC
 */
export const SystemChat = defineJavaPacket('System Chat Message', 'play/clientbound/system_chat', {
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

/**
 * `Chat Message` (serverbound): what the player typed, with the secure chat fields this server does not check.
 * @javaSource ServerboundChatPacket.STREAM_CODEC
 */
export const ChatMessage = defineJavaPacket('Chat Message', 'play/serverbound/chat', {
    message: javaString(256),
    timestamp: long,
    salt: long,
    signature: optional(signature),
    lastSeenOffset: varInt,
    acknowledged,
    checksum: uint8
});

/**
 * `Chat Command` (serverbound): a command the player typed, without its slash.
 * @javaSource ServerboundChatCommandPacket.STREAM_CODEC
 */
export const ChatCommand = defineJavaPacket('Chat Command', 'play/serverbound/chat_command', {
    command: javaString(32_767)
});

/** `Game Event` 3: the client's own game mode changed, to the value's game mode. */
export const CHANGE_GAME_MODE = 3;

/**
 * `Player Loaded` (serverbound): the client has the world around it and shows the player.
 * @javaSource ServerboundPlayerLoadedPacket.STREAM_CODEC
 */
export const PlayerLoaded = defineJavaPacket('Player Loaded', 'play/serverbound/player_loaded', {});

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

/**
 * `Spawn Entity` (clientbound): an entity coming into view, by type id, at rest.
 * @javaSource ClientboundAddEntityPacket.STREAM_CODEC
 */
export const AddEntity = defineJavaPacket('Spawn Entity', 'play/clientbound/add_entity', {
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

/**
 * `Remove Entities` (clientbound): entities leaving view.
 * @javaSource ClientboundRemoveEntitiesPacket.STREAM_CODEC
 */
export const RemoveEntities = defineJavaPacket('Remove Entities', 'play/clientbound/remove_entities', {
    entityIds: list(varInt)
});

/**
 * `Teleport Entity` (clientbound): an entity's absolute position and facing.
 * @javaSource ClientboundTeleportEntityPacket.STREAM_CODEC
 */
export const TeleportEntity = defineJavaPacket('Teleport Entity', 'play/clientbound/teleport_entity', {
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

/**
 * `Set Head Rotation` (clientbound): where an entity's head faces.
 * @javaSource ClientboundRotateHeadPacket.STREAM_CODEC
 */
export const RotateHead = defineJavaPacket('Set Head Rotation', 'play/clientbound/rotate_head', {
    entityId: varInt,
    headYaw: angle
});

/** `Player Info Update` actions, as bits of the set the packet opens with. */
export enum PlayerInfoAction {
    AddPlayer = 0x01,
    UpdateGameMode = 0x04,
    UpdateListed = 0x08
}

/**
 * `Player Info Update` (clientbound) adding players to the tab list: their profile, and listed.
 * The action set is fixed to adding and listing, whose fields each entry carries in that order.
 * @javaSource ClientboundPlayerInfoUpdatePacket.STREAM_CODEC
 */
export const PlayerInfoAdd = defineJavaPacket('Player Info Update', 'play/clientbound/player_info_update', {
    actions: uint8,
    players: list(record({ uuid, name: javaString(16), properties: list(profileProperty), listed: bool }))
});

/**
 * `Player Info Update` (clientbound) changing players' game modes, which the tab list shows: a
 * spectator's entry is gray and italic. The action set is fixed to
 * {@link PlayerInfoAction.UpdateGameMode}, whose one field each entry carries.
 * @javaSource ClientboundPlayerInfoUpdatePacket.STREAM_CODEC
 */
export const PlayerInfoUpdateGameMode = defineJavaPacket(
    'Player Info Update (game mode)',
    'play/clientbound/player_info_update',
    { actions: uint8, players: list(record({ uuid, gameMode: varInt })) }
);

/**
 * `Player Info Remove` (clientbound): players leaving the tab list.
 * @javaSource ClientboundPlayerInfoRemovePacket.STREAM_CODEC
 */
export const PlayerInfoRemove = defineJavaPacket('Player Info Remove', 'play/clientbound/player_info_remove', {
    uuids: list(uuid)
});

/**
 * `Block Update` (clientbound): one block's new state, by its state id.
 * @javaSource ClientboundBlockUpdatePacket.STREAM_CODEC
 */
export const BlockUpdate = defineJavaPacket('Block Update', 'play/clientbound/block_update', {
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

/**
 * `Update Section Blocks` (clientbound): several blocks of one section at once.
 * @javaSource ClientboundSectionBlocksUpdatePacket.STREAM_CODEC
 */
export const SectionBlocksUpdate = defineJavaPacket('Update Section Blocks', 'play/clientbound/section_blocks_update', {
    section: sectionPosition,
    blocks: list(sectionBlock)
});

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
 * @javaSource ServerboundPlayerActionPacket.STREAM_CODEC
 */
export const PlayerAction = defineJavaPacket('Player Action', 'play/serverbound/player_action', {
    status: varInt,
    position: blockPosition,
    face: uint8,
    sequence: varInt
});

/**
 * `Acknowledge Block Change` (clientbound): the client's block predictions up to `sequence` are answered.
 * @javaSource ClientboundBlockChangedAckPacket.STREAM_CODEC
 */
export const BlockChangedAck = defineJavaPacket('Acknowledge Block Change', 'play/clientbound/block_changed_ack', {
    sequence: varInt
});

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
 * @javaSource ClientboundContainerSetContentPacket.STREAM_CODEC
 */
export const ContainerSetContent = defineJavaPacket('Set Container Content', 'play/clientbound/container_set_content', {
    window: varInt,
    stateId: varInt,
    items: list(itemStack),
    carried: itemStack
});

/**
 * `Set Container Slot` (clientbound): one slot of a window.
 * @javaSource ClientboundContainerSetSlotPacket.STREAM_CODEC
 */
export const ContainerSetSlot = defineJavaPacket('Set Container Slot', 'play/clientbound/container_set_slot', {
    window: varInt,
    stateId: varInt,
    slot: short,
    item: itemStack
});

/**
 * `Set Held Item` (clientbound): the hotbar slot the player holds, 0 to 8.
 * @javaSource ClientboundSetHeldSlotPacket.STREAM_CODEC
 */
export const SetHeldSlot = defineJavaPacket('Set Held Item', 'play/clientbound/set_held_slot', {
    slot: varInt
});

/**
 * `Set Held Item` (serverbound): the hotbar slot the player moved its hand to, 0 to 8.
 * @javaSource ServerboundSetCarriedItemPacket.STREAM_CODEC
 */
export const SetCarriedItem = defineJavaPacket('Set Held Item', 'play/serverbound/set_carried_item', {
    slot: short
});

/**
 * `Set Creative Mode Slot` (serverbound): a creative player put a stack in a slot of its inventory, or emptied it.
 * @javaSource ServerboundSetCreativeModeSlotPacket.STREAM_CODEC
 */
export const SetCreativeModeSlot = defineJavaPacket(
    'Set Creative Mode Slot',
    'play/serverbound/set_creative_mode_slot',
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
 * @javaSource ServerboundUseItemOnPacket.STREAM_CODEC
 */
export const UseItemOn = defineJavaPacket('Use Item On', 'play/serverbound/use_item_on', {
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

/**
 * `Set Health` (clientbound): the player's own health, food level and saturation.
 * @javaSource ClientboundSetHealthPacket.STREAM_CODEC
 */
export const SetHealth = defineJavaPacket('Set Health', 'play/clientbound/set_health', {
    health: float,
    food: varInt,
    saturation: float
});

/**
 * `Combat Death` (clientbound): a player died, which opens its client's death screen with the message.
 * @javaSource ClientboundPlayerCombatKillPacket.STREAM_CODEC
 */
export const PlayerCombatKill = defineJavaPacket('Combat Death', 'play/clientbound/player_combat_kill', {
    playerId: varInt,
    message: textComponent
});

/** `Client Command` (serverbound) actions, by vanilla's `ServerboundClientCommandPacket.Action` order. */
export enum ClientCommandAction {
    PerformRespawn = 0,
    RequestStats = 1,
    RequestGameRuleValues = 2
}

/**
 * `Client Command` (serverbound): the death screen's respawn button, and requests for statistics.
 * @javaSource ServerboundClientCommandPacket.STREAM_CODEC
 */
export const ClientCommand = defineJavaPacket('Client Command', 'play/serverbound/client_command', {
    action: varInt
});

/**
 * `Respawn` (clientbound): the player is spawned again into a world, which a death's respawn and a
 * change of dimension send. `dataToKeep` keeps the attributes (1) and the entity data (2) the
 * client had; a respawn after death keeps neither.
 * @javaSource ClientboundRespawnPacket.STREAM_CODEC
 */
export const Respawn = defineJavaPacket('Respawn', 'play/clientbound/respawn', {
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

/**
 * `Set Equipment` (clientbound): what an entity holds and wears, slot by slot; at least one slot.
 * @javaSource ClientboundSetEquipmentPacket.STREAM_CODEC
 */
export const SetEquipment = defineJavaPacket('Set Equipment', 'play/clientbound/set_equipment', {
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

/**
 * `Set Entity Metadata` (clientbound): some of an entity's data, by index.
 * @javaSource ClientboundSetEntityDataPacket.STREAM_CODEC
 */
export const SetEntityData = defineJavaPacket('Set Entity Metadata', 'play/clientbound/set_entity_data', {
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

/**
 * `Boss Event` operations, by vanilla's `ClientboundBossEventPacket.OperationType` order, which
 * numbers them on the wire.
 */
export enum JavaBossEventOperation {
    Add = 0,
    Remove = 1,
    UpdateProgress = 2,
    UpdateName = 3,
    UpdateStyle = 4,
    UpdateProperties = 5
}

/** Boss bar colors, by vanilla's `BossEvent.BossBarColor` order. */
export enum JavaBossBarColor {
    Pink = 0,
    Blue = 1,
    Red = 2,
    Green = 3,
    Yellow = 4,
    Purple = 5,
    White = 6
}

/** How a boss bar is divided, by vanilla's `BossEvent.BossBarOverlay` order. */
export enum JavaBossBarOverlay {
    Progress = 0,
    Notched6 = 1,
    Notched10 = 2,
    Notched12 = 3,
    Notched20 = 4
}

/** The bits of a boss bar's flags byte. */
export enum JavaBossBarFlag {
    DarkenScreen = 0x01,
    PlayMusic = 0x02,
    CreateWorldFog = 0x04
}

/** One `Boss Event` operation and what it carries. */
export type JavaBossEvent =
    | {
          readonly type: JavaBossEventOperation.Add;
          readonly title: JavaText;
          readonly progress: number;
          readonly color: JavaBossBarColor;
          readonly overlay: JavaBossBarOverlay;
          readonly flags: number;
      }
    | { readonly type: JavaBossEventOperation.Remove }
    | { readonly type: JavaBossEventOperation.UpdateProgress; readonly progress: number }
    | { readonly type: JavaBossEventOperation.UpdateName; readonly title: JavaText }
    | {
          readonly type: JavaBossEventOperation.UpdateStyle;
          readonly color: JavaBossBarColor;
          readonly overlay: JavaBossBarOverlay;
      }
    | { readonly type: JavaBossEventOperation.UpdateProperties; readonly flags: number };

/**
 * The operation: its VarInt type, then its fields, as each of vanilla's `Operation.write` lays
 * them out. The title is a text component, the progress a float, the color and the overlay
 * VarInts, and the flags one byte of {@link JavaBossBarFlag}.
 */
const bossEventOperation = custom<JavaBossEvent>(
    'Boss Event Operation',
    (s, event) => {
        varInt.write(s, event.type);
        switch (event.type) {
            case JavaBossEventOperation.Add:
                textComponent.write(s, event.title);
                float.write(s, event.progress);
                varInt.write(s, event.color);
                varInt.write(s, event.overlay);
                uint8.write(s, event.flags);
                break;
            case JavaBossEventOperation.Remove:
                break;
            case JavaBossEventOperation.UpdateProgress:
                float.write(s, event.progress);
                break;
            case JavaBossEventOperation.UpdateName:
                textComponent.write(s, event.title);
                break;
            case JavaBossEventOperation.UpdateStyle:
                varInt.write(s, event.color);
                varInt.write(s, event.overlay);
                break;
            case JavaBossEventOperation.UpdateProperties:
                uint8.write(s, event.flags);
                break;
        }
    },
    (s): JavaBossEvent => {
        const operation = varInt.read(s);
        switch (operation) {
            case JavaBossEventOperation.Add:
                return {
                    type: operation,
                    title: textComponent.read(s),
                    progress: float.read(s),
                    color: varInt.read(s),
                    overlay: varInt.read(s),
                    flags: uint8.read(s)
                };
            case JavaBossEventOperation.Remove:
                return { type: operation };
            case JavaBossEventOperation.UpdateProgress:
                return { type: operation, progress: float.read(s) };
            case JavaBossEventOperation.UpdateName:
                return { type: operation, title: textComponent.read(s) };
            case JavaBossEventOperation.UpdateStyle:
                return { type: operation, color: varInt.read(s), overlay: varInt.read(s) };
            case JavaBossEventOperation.UpdateProperties:
                return { type: operation, flags: uint8.read(s) };
            default:
                throw new ProtocolWireErrors.JavaBossEventOperationUnknown({ operation });
        }
    }
);

/**
 * `Boss Event` (clientbound): adds, removes or updates one boss bar at the top of the screen. The
 * client keys its bars by the UUID, which the server picks.
 * @javaSource ClientboundBossEventPacket.STREAM_CODEC
 */
export const BossEvent = defineJavaPacket('Boss Event', 'play/clientbound/boss_event', {
    uuid,
    operation: bossEventOperation
});

/**
 * `Set Title Text` (clientbound): shows the title in the middle of the screen, with the subtitle
 * the client was last sent.
 * @javaSource ClientboundSetTitleTextPacket.STREAM_CODEC
 */
export const SetTitleText = defineJavaPacket('Set Title Text', 'play/clientbound/set_title_text', {
    text: textComponent
});

/**
 * `Set Subtitle Text` (clientbound): the subtitle the next title shows beneath it.
 * @javaSource ClientboundSetSubtitleTextPacket.STREAM_CODEC
 */
export const SetSubtitleText = defineJavaPacket('Set Subtitle Text', 'play/clientbound/set_subtitle_text', {
    text: textComponent
});

/**
 * `Set Action Bar Text` (clientbound): text above the hotbar.
 * @javaSource ClientboundSetActionBarTextPacket.STREAM_CODEC
 */
export const SetActionBarText = defineJavaPacket('Set Action Bar Text', 'play/clientbound/set_action_bar_text', {
    text: textComponent
});

/**
 * `Set Title Animation Times` (clientbound): how many ticks a title fades in, stays and fades out.
 * @javaSource ClientboundSetTitlesAnimationPacket.STREAM_CODEC
 */
export const SetTitlesAnimation = defineJavaPacket(
    'Set Title Animation Times',
    'play/clientbound/set_titles_animation',
    {
        fadeIn: int,
        stay: int,
        fadeOut: int
    }
);

/**
 * `Clear Titles` (clientbound): takes the title and subtitle off the screen, and with `resetTimes`
 * puts the animation times back to the client's defaults.
 * @javaSource ClientboundClearTitlesPacket.STREAM_CODEC
 */
export const ClearTitles = defineJavaPacket('Clear Titles', 'play/clientbound/clear_titles', { resetTimes: bool });

/** The number format types, by their index in vanilla's `NumberFormatTypes` registry. */
export enum JavaNumberFormatType {
    Blank = 0,
    Styled = 1,
    Fixed = 2
}

/** How a score is drawn: hidden, or replaced by fixed text. The styled format is not read. */
export type JavaNumberFormat =
    | { readonly type: JavaNumberFormatType.Blank }
    | { readonly type: JavaNumberFormatType.Fixed; readonly text: JavaText };

/**
 * A number format: its VarInt type, then a fixed format's text, as vanilla's `NumberFormatTypes`
 * codecs lay it out.
 */
const numberFormat = custom<JavaNumberFormat>(
    'Number Format',
    (s, format) => {
        varInt.write(s, format.type);
        if (format.type === JavaNumberFormatType.Fixed) textComponent.write(s, format.text);
    },
    (s): JavaNumberFormat => {
        const format = varInt.read(s);
        switch (format) {
            case JavaNumberFormatType.Blank:
                return { type: format };
            case JavaNumberFormatType.Fixed:
                return { type: format, text: textComponent.read(s) };
            default:
                throw new ProtocolWireErrors.JavaNumberFormatUnread({ format });
        }
    }
);

/** `Update Objectives` methods, the byte vanilla's `ClientboundSetObjectivePacket` writes. */
export enum JavaObjectiveMethod {
    Add = 0,
    Remove = 1,
    Change = 2
}

/** How an objective's scores are drawn in the tab list: as numbers, or as hearts. */
export enum JavaObjectiveRenderType {
    Integer = 0,
    Hearts = 1
}

/** One `Update Objectives` method and what it carries. */
export type JavaObjectiveChange =
    | {
          readonly method: JavaObjectiveMethod.Add | JavaObjectiveMethod.Change;
          readonly displayName: JavaText;
          readonly renderType: JavaObjectiveRenderType;
          readonly numberFormat: JavaNumberFormat | null;
      }
    | { readonly method: JavaObjectiveMethod.Remove };

const optionalNumberFormat = optional(numberFormat);

/**
 * The method: its byte, then for an add or a change the display name, the render type as a
 * VarInt and the optional number format, as vanilla's `ClientboundSetObjectivePacket.write` lays
 * them out. A removal carries nothing more.
 */
const objectiveChange = custom<JavaObjectiveChange>(
    'Objective Change',
    (s, change) => {
        uint8.write(s, change.method);
        if (change.method === JavaObjectiveMethod.Remove) return;
        textComponent.write(s, change.displayName);
        varInt.write(s, change.renderType);
        optionalNumberFormat.write(s, change.numberFormat);
    },
    (s): JavaObjectiveChange => {
        const method = uint8.read(s);
        switch (method) {
            case JavaObjectiveMethod.Remove:
                return { method };
            case JavaObjectiveMethod.Add:
            case JavaObjectiveMethod.Change:
                return {
                    method,
                    displayName: textComponent.read(s),
                    renderType: varInt.read(s),
                    numberFormat: optionalNumberFormat.read(s)
                };
            default:
                throw new ProtocolWireErrors.JavaObjectiveMethodUnknown({ method });
        }
    }
);

/**
 * `Update Objectives` (clientbound): adds, removes or renames one scoreboard objective. A client
 * shows an objective's scores only once it was added.
 * @javaSource ClientboundSetObjectivePacket.STREAM_CODEC
 */
export const SetObjective = defineJavaPacket('Update Objectives', 'play/clientbound/set_objective', {
    objective: javaString(32_767),
    change: objectiveChange
});

/** Display slots, by vanilla's `DisplaySlot` ids. The team-colored sidebars follow from 3. */
export enum JavaDisplaySlot {
    List = 0,
    Sidebar = 1,
    BelowName = 2
}

/**
 * `Display Objective` (clientbound): which objective a display slot shows, or an empty name for
 * none.
 * @javaSource ClientboundSetDisplayObjectivePacket.STREAM_CODEC
 */
export const SetDisplayObjective = defineJavaPacket('Display Objective', 'play/clientbound/set_display_objective', {
    slot: varInt,
    objective: javaString(32_767)
});

/**
 * `Update Score` (clientbound): one holder's score in one objective, with an optional display
 * name and number format that the objective's own stand in for when absent.
 * @javaSource ClientboundSetScorePacket.STREAM_CODEC
 */
export const SetScore = defineJavaPacket('Update Score', 'play/clientbound/set_score', {
    owner: javaString(32_767),
    objective: javaString(32_767),
    score: varInt,
    displayName: optional(textComponent),
    numberFormat: optionalNumberFormat
});

/**
 * `Reset Score` (clientbound): takes a holder's score out of one objective, or out of every
 * objective when the objective is null.
 * @javaSource ClientboundResetScorePacket.STREAM_CODEC
 */
export const ResetScore = defineJavaPacket('Reset Score', 'play/clientbound/reset_score', {
    owner: javaString(32_767),
    objective: optional(javaString(32_767))
});
