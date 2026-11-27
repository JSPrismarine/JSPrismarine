/**
 * The outbound contract in Java Edition packets
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)).
 *
 * It covers what the first milestone shows a Java player: chat and system messages, its own
 * position, and its game mode. The rest of the contract has no Java packet yet and sends nothing,
 * each saying which slice of `docs/plans/java-multiprotocol.md` brings it.
 */
import type { Weather } from '@jsprismarine/engine-systems';
import type { Difficulty } from '@jsprismarine/minecraft';
import { Gametype } from '@jsprismarine/minecraft';
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { JavaEntityDataEntry, JavaItemStack, SectionBlock } from '@jsprismarine/protocol/java/packet/play';
import { LevelChunkWithLight } from '@jsprismarine/protocol/java/chunk/levelChunk';
import {
    AddEntity,
    BossEvent,
    SetExperience,
    TakeItemEntity,
    ChangeDifficulty,
    ClearTitles,
    ForgetLevelChunk,
    RAIN_LEVEL_CHANGE,
    SetChunkCacheRadius,
    SetDefaultSpawnPosition,
    SetSimulationDistance,
    SetTime,
    START_RAINING,
    STOP_RAINING,
    THUNDER_LEVEL_CHANGE,
    TickingState,
    PlayTransfer,
    TickingStep,
    ChunkBatchFinished,
    ChunkBatchStart,
    SetCenterChunk,
    BlockUpdate,
    CHANGE_GAME_MODE,
    ContainerSetContent,
    ContainerSetSlot,
    PlayerCombatKill,
    Respawn,
    SetHealth,
    START_WAITING_FOR_LEVEL_CHUNKS,
    GameEvent,
    PlayerInfoAction,
    PlayerInfoAdd,
    PlayerInfoRemove,
    PlayerInfoUpdateGameMode,
    ResetScore,
    RemoveEntities,
    RotateHead,
    JavaEntityDataIndex,
    JavaEntityDataSerializer,
    JavaEntityFlag,
    JavaEquipmentSlot,
    JavaPose,
    SectionBlocksUpdate,
    SetEntityData,
    SetEquipment,
    SetHeldSlot,
    SetActionBarText,
    SetDisplayObjective,
    SetObjective,
    SetScore,
    SetSubtitleText,
    SetTitlesAnimation,
    SetTitleText,
    SynchronizePlayerPosition,
    JavaDisplaySlot,
    JavaObjectiveMethod,
    JavaObjectiveRenderType,
    JavaBossBarColor,
    JavaBossBarOverlay,
    JavaBossEventOperation,
    SystemChat,
    TeleportEntity
} from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/newest';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import { hyphenatedUuid } from '@jsprismarine/protocol/java/wire/javaTypes';

import { totalExperiencePoints } from '../../entity/Experience';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import { isRecord } from '../../utils/isRecord';
import type {
    BossBarChange,
    SessionPresenter,
    ShownBlockChange,
    ShownBossBar,
    ShownBossBarColor,
    ShownBossBarStyle,
    ShownContainer,
    ShownDeath,
    ShownEntityMove,
    ShownEntityState,
    ShownEquipment,
    ShownExperience,
    ShownInventory,
    ShownMessage,
    ShownDimension,
    ShownMove,
    ShownObjective,
    ShownRespawn,
    ShownScore,
    ShownStack,
    ShownTicking,
    ShownTime,
    ShownTitle,
    ShownVitals,
    ShownWorldSpawn
} from '../../player/presenter/SessionPresenter';
import type { ShownEntity, ShownProfile } from '../../world/ShownActor';
import type { ChunkWire } from '../../player/ChunkView';
import type { EditionTranslation } from './editionTranslation';
import type { JavaChunkLight } from './javaChunk';
import { JavaChunkTranslator } from './javaChunk';
import {
    javaBlockTranslation,
    javaEntityTranslation,
    javaItemTranslation,
    javaWaterloggedOf
} from './editionTranslation';

/** A UUID for an entity that has none of its own to show, made from its id so it stays the same. */
const entityUuidOf = (runtimeId: bigint): string => hyphenatedUuid(runtimeId.toString(16).padStart(32, '0'));

/**
 * A boss bar's UUID, made from the bar's number so it stays the same for the bar's life. A
 * client keys its bars by UUID alone, apart from its entities'.
 * @param id - The bar.
 */
export const bossBarUuidOf = (id: number): string => hyphenatedUuid(id.toString(16).padStart(32, '0'));

/** Java's color for each boss bar color. Java has no rebecca purple, so it draws purple. */
const JAVA_BOSS_BAR_COLOR = {
    pink: JavaBossBarColor.Pink,
    blue: JavaBossBarColor.Blue,
    red: JavaBossBarColor.Red,
    green: JavaBossBarColor.Green,
    yellow: JavaBossBarColor.Yellow,
    purple: JavaBossBarColor.Purple,
    rebeccaPurple: JavaBossBarColor.Purple,
    white: JavaBossBarColor.White
} as const satisfies Record<ShownBossBarColor, JavaBossBarColor>;

/** Java's overlay for each boss bar style. */
const JAVA_BOSS_BAR_OVERLAY = {
    progress: JavaBossBarOverlay.Progress,
    notched6: JavaBossBarOverlay.Notched6,
    notched10: JavaBossBarOverlay.Notched10,
    notched12: JavaBossBarOverlay.Notched12,
    notched20: JavaBossBarOverlay.Notched20
} as const satisfies Record<ShownBossBarStyle, JavaBossBarOverlay>;

/**
 * A dotted lowercase key with a letter in it, such as `entity.minecraft.ender_dragon`, which a
 * client translates.
 */
const TRANSLATION_KEY = /^(?=.*[a-z])[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;

/**
 * A boss bar's title as Java text. A Bedrock client translates a title that is a key, as the
 * dragon fight's is, so a key goes to Java as a translation and anything else as written.
 * @param title - The title.
 * @returns The text.
 */
export const javaBossBarTitleOf = (title: string): JavaText =>
    TRANSLATION_KEY.test(title) ? { translate: title } : title;

/**
 * A boss bar change as Java's `Boss Event` operation. The bar carries no flags: it neither darkens
 * the sky, plays boss music nor makes fog.
 * @param change - What changed.
 * @param bar - The bar after the change.
 * @returns The packet's fields.
 */
export const javaBossEventOf = (change: BossBarChange, bar: ShownBossBar): JavaPayload<typeof BossEvent> => {
    const uuid = bossBarUuidOf(bar.id);
    switch (change) {
        case 'add':
            return {
                uuid,
                operation: {
                    type: JavaBossEventOperation.Add,
                    title: javaBossBarTitleOf(bar.title),
                    progress: bar.progress,
                    color: JAVA_BOSS_BAR_COLOR[bar.color],
                    overlay: JAVA_BOSS_BAR_OVERLAY[bar.style],
                    flags: 0
                }
            };
        case 'remove':
            return { uuid, operation: { type: JavaBossEventOperation.Remove } };
        case 'progress':
            return { uuid, operation: { type: JavaBossEventOperation.UpdateProgress, progress: bar.progress } };
        case 'name':
            return {
                uuid,
                operation: { type: JavaBossEventOperation.UpdateName, title: javaBossBarTitleOf(bar.title) }
            };
    }
};

/** The largest number a signed VarInt holds. */
const MAX_VAR_INT = 2_147_483_647;

/** The player's own inventory window, which the client always has. */
const INVENTORY_WINDOW = 0;

/** The slots of the player's inventory window: the crafting result, its grid, armor, the inventory and the off hand. */
const WINDOW_SLOTS = 46;

/**
 * Where a slot of the player's containers sits in its Java inventory window: armor from 5, head
 * first, the 27 slots above the hotbar from 9, the hotbar from 36, and the off hand at 45.
 * @param container - The container.
 * @param slot - The slot within it, numbered as the server numbers it.
 */
export const javaWindowSlotOf = (container: ShownContainer, slot: number): number => {
    if (container === 'armor') return 5 + slot;
    if (container === 'offhand') return 45;
    return slot < 9 ? 36 + slot : slot;
};

/** Each equipment slot and the Java slot that shows it. */
const JAVA_EQUIPMENT_SLOTS: readonly (readonly [keyof ShownEquipment, JavaEquipmentSlot])[] = [
    ['mainhand', JavaEquipmentSlot.MainHand],
    ['offhand', JavaEquipmentSlot.OffHand],
    ['head', JavaEquipmentSlot.Head],
    ['chest', JavaEquipmentSlot.Chest],
    ['legs', JavaEquipmentSlot.Legs],
    ['feet', JavaEquipmentSlot.Feet],
    ['body', JavaEquipmentSlot.Body]
];

/**
 * An entity's state as Java's shared flags byte and pose.
 * @param state - The state.
 * @returns The two entity data entries.
 */
export const javaEntityDataOf = (state: ShownEntityState): JavaEntityDataEntry[] => {
    const flags =
        (state.onFire ? JavaEntityFlag.OnFire : 0) |
        (state.sneaking ? JavaEntityFlag.Crouching : 0) |
        (state.sprinting ? JavaEntityFlag.Sprinting : 0) |
        (state.swimming ? JavaEntityFlag.Swimming : 0) |
        (state.invisible ? JavaEntityFlag.Invisible : 0) |
        (state.gliding ? JavaEntityFlag.FallFlying : 0);
    // The pose draws the body; one state wins, in the order a client would show them.
    const pose = state.sleeping
        ? JavaPose.Sleeping
        : state.gliding
          ? JavaPose.FallFlying
          : state.swimming
            ? JavaPose.Swimming
            : state.sneaking
              ? JavaPose.Crouching
              : JavaPose.Standing;
    return [
        { index: JavaEntityDataIndex.SharedFlags, serializer: JavaEntityDataSerializer.Byte, value: flags },
        { index: JavaEntityDataIndex.Pose, serializer: JavaEntityDataSerializer.Pose, value: pose }
    ];
};

/** Sends one Java packet to the session's client. */
export type JavaSend = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>) => void;

/** Java's game modes, by Bedrock's numbers: Bedrock's spectator is 6, Java's is 3. */
export const javaGameModeOf = (gamemode: Gametype): number =>
    gamemode === Gametype.SPECTATOR ? 3 : gamemode === Gametype.CREATIVE ? 1 : gamemode === Gametype.ADVENTURE ? 2 : 0;

/** The dimension type registry a client was configured with, in network id order. */
const DIMENSION_TYPES: readonly string[] =
    CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:dimension_type')?.entries ?? [];

/**
 * The Overworld's world clock, by its index in the `minecraft:world_clock` registry a client was
 * configured with: the clock its sky draws from.
 */
const OVERWORLD_CLOCK = Math.max(
    0,
    (CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:world_clock')?.entries ?? []).indexOf(
        'minecraft:overworld'
    )
);

/** Java's spelling of the vanilla dimensions, which a `dimension_type` id and its level share. */
const OVERWORLD = 'minecraft:overworld';
const NETHER = 'minecraft:the_nether';

/**
 * The world a Java player spawns into, as `Login (play)` and `Respawn` both carry it. The level
 * takes the dimension type's name, as vanilla's three do. A type the client was not configured
 * with, a custom one, is drawn as the Overworld's.
 * @param dimension - The dimension the player is in.
 * @param gamemode - The player's game mode.
 * @returns The spawn fields.
 */
export const javaSpawnInfoOf = ({ id, seaLevel }: ShownDimension, gamemode: Gametype) => {
    const index = DIMENSION_TYPES.indexOf(id);
    return {
        dimensionType: index === -1 ? Math.max(0, DIMENSION_TYPES.indexOf(OVERWORLD)) : index,
        dimension: id,
        hashedSeed: 0n,
        gameMode: javaGameModeOf(gamemode),
        previousGameMode: null,
        isDebug: false,
        isFlat: false,
        deathLocation: null,
        portalCooldown: 0,
        seaLevel
    };
};

/** `Respawn`'s `dataToKeep` for a player who lives on: its attributes (1) and its entity data (2). */
const KEEP_ALL_DATA = 3;

/**
 * A `rawtext` object, as `/tellraw` and `/titleraw` send it, as the Java text it reads: its parts'
 * text joined. Text that is not such an object is shown as written.
 * @param raw - The object as JSON, a command's argument, which is parsed for its text and never run.
 * @returns The text.
 */
export const javaRawTextOf = (raw: string): JavaText => {
    try {
        // A command's argument, parsed for its text and never run.
        const parsed: unknown = JSON.parse(raw);
        const parts = rawtextPartsOf(parsed);
        if (parts !== undefined) return joinedTextOf(parts);
    } catch {
        // Not JSON after all; it is shown as written.
    }
    return raw;
};

/** The parts of a `rawtext` object as Java text, or undefined when the value is no such object. */
const rawtextPartsOf = (value: unknown): JavaText[] | undefined => {
    const rawtext = isRecord(value) ? value.rawtext : undefined;
    return Array.isArray(rawtext) ? rawtext.map(rawtextPartOf) : undefined;
};

/**
 * One `rawtext` part as Java text: its text, or its translation with the arguments `with` gives,
 * as a list of strings or as a `rawtext` object of its own. A part this server cannot fill, such
 * as a selector or a score, shows nothing.
 */
const rawtextPartOf = (part: unknown): JavaText => {
    if (!isRecord(part)) return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.translate !== 'string') return '';
    const args = Array.isArray(part.with)
        ? part.with.map((argument: unknown) => (typeof argument === 'string' ? argument : ''))
        : rawtextPartsOf(part.with);
    return args === undefined || args.length === 0
        ? { translate: part.translate }
        : { translate: part.translate, with: args };
};

/**
 * Parts shown one after another. Plain text joins into one string; a translation among them goes
 * as a translation of `%s` repeated, whose key a client does not know and so formats as written.
 */
const joinedTextOf = (parts: readonly JavaText[]): JavaText => {
    if (parts.every((part) => typeof part === 'string')) return parts.join('');
    const [only] = parts;
    if (parts.length === 1 && only !== undefined) return only;
    return { translate: '%s'.repeat(parts.length), with: [...parts] };
};

/**
 * A title instruction as the Java packet that carries it. A Java client keeps a title's timing
 * until a reset, as a Bedrock client does.
 * @param send - Sends the packet.
 * @param title - The instruction.
 */
export const sendJavaTitle = (send: JavaSend, title: ShownTitle): void => {
    switch (title.kind) {
        case 'clear':
            send(ClearTitles, { resetTimes: false });
            return;
        case 'reset':
            send(ClearTitles, { resetTimes: true });
            return;
        case 'times':
            send(SetTitlesAnimation, { fadeIn: title.fadeIn, stay: title.stay, fadeOut: title.fadeOut });
            return;
    }
    const text = title.raw === true ? javaRawTextOf(title.text) : title.text;
    if (title.kind === 'title') send(SetTitleText, { text });
    else if (title.kind === 'subtitle') send(SetSubtitleText, { text });
    else send(SetActionBarText, { text });
};

/** Java's display slot for each slot Bedrock has; Java has team-colored sidebars Bedrock lacks. */
const JAVA_DISPLAY_SLOTS: ReadonlyMap<string, JavaDisplaySlot> = new Map([
    ['list', JavaDisplaySlot.List],
    ['sidebar', JavaDisplaySlot.Sidebar],
    ['belowname', JavaDisplaySlot.BelowName]
]);

/**
 * A message as Java text. A player's chat takes vanilla's `chat.type.text` translation, which
 * draws `<name> message`; a Bedrock translation key loses the `%` Bedrock marks it with; a
 * `rawtext` object, which `/tellraw` sends, is read for its text.
 * @param message - The message.
 * @returns The text.
 */
export const javaTextOf = ({ message, kind, parameters, needsTranslation, sourceName }: ShownMessage): JavaText => {
    if (kind === 'chat' && sourceName !== '') return { translate: 'chat.type.text', with: [sourceName, message] };
    if (needsTranslation || kind === 'translation') {
        return {
            translate: message.replace(/^%/, ''),
            with: parameters.map((parameter) => parameter.replace(/^%/, ''))
        };
    }
    if (kind === 'rawText') return javaRawTextOf(message);
    return message;
};

/** One Java client's half of a session. */
export class JavaPresenter implements SessionPresenter {
    public readonly edition = 'java';
    /** The id the next server-initiated move carries; the join's position took 1. */
    private nextTeleport = 2;
    /** The players the client was shown, by entity, whose profiles leave its tab list with them. */
    private readonly shownPlayers = new Map<bigint, string>();
    private readonly entities = javaEntityTranslation();
    /** The shared flags and pose each shown entity was last sent, as `flags,pose`. */
    private readonly entityData = new Map<bigint, string>();
    /** The stack each item entity was shown with, which a merge changes the count of. */
    private readonly itemStacks = new Map<bigint, ShownStack>();
    /** The client's own player's UUID, once its tab list entry was sent. */
    private ownUuid: string | undefined;
    /** The objectives the client was told of, with the display name it was last sent. */
    private readonly objectives = new Map<string, string>();
    /** The objective each Java display slot shows. */
    private readonly slots = new Map<JavaDisplaySlot, string>();
    /** The weather the client was last shown, or undefined before it was shown any. */
    private weather: Weather | undefined;
    /** The holders each known objective has a score sent for, which a later snapshot without them resets. */
    private readonly holders = new Map<string, Set<string>>();

    /**
     * @param send - Sends to the session's client.
     * @param ownRuntimeId - The session's own player, whose moves its client is told.
     * @param blocks - Bedrock runtime ids to Java state ids, which every Java session can share.
     * @param items - Bedrock item identifiers to Java item ids, which every Java session can share.
     * @param columns - The world's chunks as a Java client is sent them, which every Java session
     *   can share.
     */
    public constructor(
        private readonly send: JavaSend,
        private readonly ownRuntimeId: bigint,
        private readonly blocks: EditionTranslation<number, number> = javaBlockTranslation(),
        private readonly items: EditionTranslation<string, number | undefined> = javaItemTranslation(),
        private readonly columns: JavaChunkTranslator = new JavaChunkTranslator(blocks)
    ) {}

    /** The chunk the client's view was last centered on, which a center only moves. */
    private center: { readonly x: number; readonly z: number } | undefined;

    /**
     * Chunks as vanilla sends them: `Set Center Chunk` when the view moves, and each batch between
     * `Chunk Batch Start` and `Chunk Batch Finished`, with the light the server's light engine
     * keeps. The session decides which chunks, and when.
     */
    public readonly chunkWire: ChunkWire = {
        center: async (x, z) => {
            if (this.center?.x === x && this.center.z === z) return;
            this.center = { x, z };
            this.send(SetCenterChunk, { x, z });
        },
        send: async (chunks, session) => {
            const systems = session.getWorld().getSystems();
            const light: JavaChunkLight = {
                sky: (x, y, z) => systems.getSkyLight(x, y, z),
                block: (x, y, z) => systems.getBlockLight(x, y, z)
            };
            this.send(ChunkBatchStart, {});
            for (const chunk of chunks) this.send(LevelChunkWithLight, this.columns.columnOf(chunk, light));
            this.send(ChunkBatchFinished, { batchSize: chunks.length });
        },
        forget: async (chunks) => {
            for (const { x, z } of chunks) this.send(ForgetLevelChunk, { x, z });
        },
        // The server simulates as far as it shows, as the login's two distances say.
        radius: async (distance) => {
            this.send(SetChunkCacheRadius, { radius: distance });
            this.send(SetSimulationDistance, { distance });
        }
    };

    /**
     * The window's state id, which the client echoes with each click so the server can tell a click
     * made on a stale screen. Moved on with every change the server sends.
     */
    private stateId = 0;

    /** A stack in Java's terms; an item Java has nothing for shows as an empty slot. */
    private javaStackOf(stack: ShownStack | null): JavaItemStack | null {
        const item = stack === null ? undefined : this.items.toJava(stack.name);
        return stack === null || item === undefined ? null : { item, count: stack.count };
    }

    /**
     * Sends `Update Time` with the game time and the Overworld's clock, which runs at the client
     * between updates unless the day is held.
     */
    public async sendTime({ dayTime, gameTime, advancing }: ShownTime): Promise<void> {
        this.send(SetTime, {
            gameTime: BigInt(gameTime),
            clocks: [{ clock: OVERWORLD_CLOCK, totalTicks: BigInt(dayTime), partialTick: 0, rate: advancing ? 1 : 0 }]
        });
    }

    /** Sends `Game Event` 3, which sets the client's own game mode. */
    public async sendGamemode(gamemode: Gametype): Promise<void> {
        this.send(GameEvent, { event: CHANGE_GAME_MODE, value: javaGameModeOf(gamemode) });
    }

    /** Not shown: a Java client is not told the server's default game mode. */
    public async sendDefaultGameMode(): Promise<void> {}

    /** Nothing to answer: a Java client does not wait for the server to confirm a close. */
    public async containerClosed(): Promise<void> {}

    /**
     * Sends `Player Info Update` with a listed player's game mode, which its tab list entry
     * shows. A player the client has no entry for is not shown.
     */
    public async sendPlayerGameMode(runtimeId: bigint, gamemode: Gametype): Promise<void> {
        const uuid = runtimeId === this.ownRuntimeId ? this.ownUuid : this.shownPlayers.get(runtimeId);
        if (uuid === undefined) return;
        this.send(PlayerInfoUpdateGameMode, {
            actions: PlayerInfoAction.UpdateGameMode,
            players: [{ uuid, gameMode: javaGameModeOf(gamemode) }]
        });
    }

    /** Not shown: Java has no packet of its own for these; its abilities carry what it needs. */
    public async sendInteractionSettings(): Promise<void> {}

    /** Not shown yet: abilities come with PR 10's player state, and a client keeps its own meanwhile. */
    public async sendAbilities(): Promise<void> {}

    /** Not sent: a Java client's tab list fills as players come into view, from {@link showEntity}. */
    public async sendPlayerList(): Promise<void> {}

    /**
     * Lists a profile in the client's tab list. A Java client draws a player's skin from the
     * `textures` property of its entry, its own player's included, and the default skin without one.
     * A profile with a game mode is listed with it.
     * @param profile - The player's profile.
     */
    public listProfile({ uuid, name, textures, gamemode }: ShownProfile): void {
        this.send(PlayerInfoAdd, {
            actions: PlayerInfoAction.AddPlayer | PlayerInfoAction.UpdateListed,
            players: [
                {
                    uuid,
                    name,
                    properties: textures === undefined ? [] : [{ name: 'textures', ...textures }],
                    listed: true
                }
            ]
        });
        if (gamemode === undefined) return;
        this.send(PlayerInfoUpdateGameMode, {
            actions: PlayerInfoAction.UpdateGameMode,
            players: [{ uuid, gameMode: javaGameModeOf(gamemode) }]
        });
    }

    /**
     * Lists the client's own player in its tab list, which later changes of its game mode update.
     * @param profile - The player's profile.
     */
    public listOwnProfile(profile: ShownProfile): void {
        this.ownUuid = profile.uuid;
        this.listProfile(profile);
    }

    /**
     * Moves the client's own player, whose feet Java places where the contract names its eyes,
     * less the eye height. Another player's move comes with other players in PR 10.
     */
    public async sendMove({ runtimeId, position, yaw, pitch }: ShownMove): Promise<void> {
        if (runtimeId !== this.ownRuntimeId) return;
        this.send(SynchronizePlayerPosition, {
            teleportId: this.nextTeleport++,
            x: position.getX(),
            y: position.getY() - EYE_HEIGHT,
            z: position.getZ(),
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            yaw,
            pitch,
            flags: 0
        });
    }

    /**
     * Shows an entity by its plain facts: a player's profile first, which a player entity needs
     * in the client's tab list, then `Spawn Entity` and the head's facing. An entity with no facts,
     * or of a type Java has no entity for, is not shown.
     */
    public async showEntity(entity: ShownEntity): Promise<void> {
        const facts = entity.describe?.();
        const type = facts === undefined ? undefined : this.entities.toJava(facts.type);
        if (facts === undefined || type === undefined) return;
        const runtimeId = entity.getRuntimeId();
        if (facts.player !== undefined) {
            this.listProfile(facts.player);
            this.shownPlayers.set(runtimeId, facts.player.uuid);
        }
        this.send(AddEntity, {
            entityId: Number(runtimeId),
            uuid: facts.player?.uuid ?? entityUuidOf(runtimeId),
            type,
            x: facts.feet.x,
            y: facts.feet.y,
            z: facts.feet.z,
            velocity: null,
            pitch: facts.pitch,
            yaw: facts.yaw,
            headYaw: facts.headYaw,
            data: 0
        });
        this.send(RotateHead, { entityId: Number(runtimeId), headYaw: facts.headYaw });
        // Only what it has: a client shows an entity it was just told of with empty hands.
        const equipment = this.javaEquipmentOf(facts.equipment ?? {}).filter(({ item }) => item !== null);
        if (equipment.length > 0) this.send(SetEquipment, { entityId: Number(runtimeId), equipment });
        this.entityData.delete(runtimeId);
        if (facts.state !== undefined) await this.showEntityState(runtimeId, facts.state);
        // What an item and an orb are drawn as: without it, an item is a stack of nothing and an
        // orb the smallest there is.
        if (facts.item !== undefined) {
            this.itemStacks.set(runtimeId, facts.item);
            this.sendItemStack(runtimeId, facts.item);
        }
        if (facts.experience !== undefined) {
            this.send(SetEntityData, {
                entityId: Number(runtimeId),
                entries: [
                    {
                        index: JavaEntityDataIndex.ExperienceOrbValue,
                        serializer: JavaEntityDataSerializer.Int,
                        value: facts.experience
                    }
                ]
            });
        }
    }

    /**
     * Sends `Set Entity Metadata` with the shared flags and the pose, when they differ from what
     * the client was last sent; a client shows a new entity standing, with no flags. Bedrock's
     * metadata changes for much a Java client does not show, such as the air a player has left.
     */
    public async showEntityState(runtimeId: bigint, state: ShownEntityState): Promise<void> {
        const entries = javaEntityDataOf(state);
        const shown = entries.map(({ value }) => value).join(',');
        if ((this.entityData.get(runtimeId) ?? '0,0') === shown) return;
        this.entityData.set(runtimeId, shown);
        this.send(SetEntityData, { entityId: Number(runtimeId), entries });
    }

    /** Every slot, so one emptied since the last send is cleared, in Java's slots and items. */
    private javaEquipmentOf(equipment: ShownEquipment) {
        return JAVA_EQUIPMENT_SLOTS.map(([name, slot]) => ({ slot, item: this.javaStackOf(equipment[name] ?? null) }));
    }

    /** Sends `Set Equipment` with every slot, the empty ones included. */
    public async showEquipment(runtimeId: bigint, equipment: ShownEquipment): Promise<void> {
        this.send(SetEquipment, { entityId: Number(runtimeId), equipment: this.javaEquipmentOf(equipment) });
    }

    /** Sends `Set Entity Metadata` with the item entity's stack and its new count. */
    public async showItemCount(item: bigint, count: number): Promise<void> {
        const shown = this.itemStacks.get(item);
        if (shown === undefined) return;
        const stack = { ...shown, count };
        this.itemStacks.set(item, stack);
        this.sendItemStack(item, stack);
    }

    /** Sends the stack an item entity holds, which Java has no count-only update for. */
    private sendItemStack(runtimeId: bigint, stack: ShownStack): void {
        this.send(SetEntityData, {
            entityId: Number(runtimeId),
            entries: [
                {
                    index: JavaEntityDataIndex.ItemEntityStack,
                    serializer: JavaEntityDataSerializer.ItemStack,
                    value: this.javaStackOf(stack)
                }
            ]
        });
    }

    /** Sends `Remove Entities`, and takes a player off the tab list too. */
    public async hideEntity(runtimeId: bigint): Promise<void> {
        this.entityData.delete(runtimeId);
        this.itemStacks.delete(runtimeId);
        this.send(RemoveEntities, { entityIds: [Number(runtimeId)] });
        const uuid = this.shownPlayers.get(runtimeId);
        if (uuid === undefined) return;
        this.shownPlayers.delete(runtimeId);
        this.send(PlayerInfoRemove, { uuids: [uuid] });
    }

    /** Sends each move as `Teleport Entity` and the head's facing; a player's eyes become its feet. */
    public async moveEntities(moves: readonly ShownEntityMove[]): Promise<void> {
        for (const { runtimeId, position, yaw, pitch, headYaw, onGround } of moves) {
            const lift = this.shownPlayers.has(runtimeId) ? EYE_HEIGHT : 0;
            this.send(TeleportEntity, {
                entityId: Number(runtimeId),
                x: position.x,
                y: position.y - lift,
                z: position.z,
                velocityX: 0,
                velocityY: 0,
                velocityZ: 0,
                yaw,
                pitch,
                flags: 0,
                onGround
            });
            this.send(RotateHead, { entityId: Number(runtimeId), headYaw });
        }
    }

    /**
     * Sends a section's one changed block as `Block Update`, and a section's several as one
     * `Update Section Blocks`, as vanilla does. A later change to a block in the same tick wins.
     */
    public async showBlocks(changes: readonly ShownBlockChange[]): Promise<void> {
        const sections = new Map<string, { x: number; y: number; z: number; blocks: Map<number, SectionBlock> }>();
        for (const { x, y, z, runtimeId, waterlogged } of changes) {
            const key = `${x >> 4},${y >> 4},${z >> 4}`;
            let section = sections.get(key);
            if (section === undefined) {
                section = { x: x >> 4, y: y >> 4, z: z >> 4, blocks: new Map() };
                sections.set(key, section);
            }
            const main = this.blocks.toJava(runtimeId);
            const state = waterlogged ? javaWaterloggedOf(main) : main;
            const block = { state, x: x & 15, y: y & 15, z: z & 15 };
            section.blocks.set((block.x << 8) | (block.z << 4) | block.y, block);
        }
        for (const section of sections.values()) {
            const blocks = [...section.blocks.values()];
            const [only] = blocks;
            if (blocks.length === 1 && only !== undefined) {
                this.send(BlockUpdate, {
                    position: { x: section.x * 16 + only.x, y: section.y * 16 + only.y, z: section.z * 16 + only.z },
                    state: only.state
                });
            } else this.send(SectionBlocksUpdate, { section: { x: section.x, y: section.y, z: section.z }, blocks });
        }
    }

    /** Sends the inventory window's whole content, then the hotbar slot the hand holds. */
    public async showInventory({ inventory, armor, offhand, handSlot }: ShownInventory): Promise<void> {
        const items = new Array<JavaItemStack | null>(WINDOW_SLOTS).fill(null);
        inventory.forEach((stack, slot) => (items[javaWindowSlotOf('inventory', slot)] = this.javaStackOf(stack)));
        armor.forEach((stack, slot) => (items[javaWindowSlotOf('armor', slot)] = this.javaStackOf(stack)));
        items[javaWindowSlotOf('offhand', 0)] = this.javaStackOf(offhand);
        this.send(ContainerSetContent, { window: INVENTORY_WINDOW, stateId: ++this.stateId, items, carried: null });
        this.send(SetHeldSlot, { slot: handSlot });
    }

    /** Sends one slot of the inventory window. */
    public async showOwnSlot(container: ShownContainer, slot: number, stack: ShownStack | null): Promise<void> {
        this.send(ContainerSetSlot, {
            window: INVENTORY_WINDOW,
            stateId: ++this.stateId,
            slot: javaWindowSlotOf(container, slot),
            item: this.javaStackOf(stack)
        });
    }

    /** Sends `Set Health`: Java's food level is a whole number, as the hunger bar's halves are. */
    public async showVitals({ health, food, saturation }: ShownVitals): Promise<void> {
        this.send(SetHealth, { health, food: Math.round(food), saturation });
    }

    /**
     * Sends `Set Experience`, with the total points the level and the bar hold. Java's total is a
     * signed VarInt, which a level in the tens of thousands overflows, so it stops at the largest.
     */
    public async showExperience(experience: ShownExperience): Promise<void> {
        this.send(SetExperience, {
            progress: experience.progress,
            level: experience.level,
            total: Math.min(totalExperiencePoints(experience), MAX_VAR_INT)
        });
    }

    /** Sends `Pickup Item`. */
    public async showPickUp(item: bigint, collector: bigint, count: number): Promise<void> {
        this.send(TakeItemEntity, { itemId: Number(item), collectorId: Number(collector), amount: count });
    }

    /** Sends `Combat Death` for the client's own player, which opens its death screen with the message. */
    public async showDeath({ key, parameters }: ShownDeath): Promise<void> {
        this.send(PlayerCombatKill, {
            playerId: Number(this.ownRuntimeId),
            message: { translate: key, with: [...parameters] }
        });
    }

    /**
     * Sends `Respawn` into the player's dimension, keeping the player's data unless it died, and
     * the event that has the client wait for the chunks around where it comes back, as vanilla
     * does. The position follows from the session.
     *
     * The client keeps the chunks it holds when `Respawn` names the dimension it is already in,
     * so a move between two worlds of one dimension goes through another dimension first.
     */
    public async showRespawn({ gamemode, dimension, keepData, replacesWorld }: ShownRespawn): Promise<void> {
        const dataToKeep = keepData ? KEEP_ALL_DATA : 0;
        if (replacesWorld) {
            const away = dimension.id === NETHER ? OVERWORLD : NETHER;
            this.send(Respawn, { ...javaSpawnInfoOf({ ...dimension, id: away }, gamemode), dataToKeep });
        }
        this.send(Respawn, { ...javaSpawnInfoOf(dimension, gamemode), dataToKeep });
        this.send(GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
        // A client spawned again holds no chunks, so the next center is sent whatever it is.
        this.center = undefined;
        // Nor its weather, which the world's resend of the current weather shows it again.
        this.weather = undefined;
    }

    /** Sends `System Chat Message` with the message as Java text; see {@link javaTextOf}. */
    public async sendMessage(message: ShownMessage): Promise<void> {
        this.send(SystemChat, { content: javaTextOf(message), overlay: false });
    }

    /** Sends `Boss Event`; see {@link javaBossEventOf}. */
    public async showBossBar(change: BossBarChange, bar: ShownBossBar): Promise<void> {
        this.send(BossEvent, javaBossEventOf(change, bar));
    }

    /** Sends the title packet the instruction names; see {@link sendJavaTitle}. */
    public async showTitle(title: ShownTitle): Promise<void> {
        sendJavaTitle(this.send, title);
    }

    /** Tells the client of an objective, or of its new display name, before a slot shows it. */
    private declareObjective({ name, displayName }: ShownObjective): void {
        const known = this.objectives.get(name);
        if (known === displayName) return;
        this.objectives.set(name, displayName);
        if (known === undefined) this.holders.set(name, new Set());
        this.send(SetObjective, {
            objective: name,
            change: {
                method: known === undefined ? JavaObjectiveMethod.Add : JavaObjectiveMethod.Change,
                displayName,
                renderType: JavaObjectiveRenderType.Integer,
                numberFormat: null
            }
        });
    }

    /** Takes an objective no slot shows any more off the client, so a later display starts clean. */
    private forgetUnshown(objective: string): void {
        if ([...this.slots.values()].includes(objective) || !this.objectives.delete(objective)) return;
        this.holders.delete(objective);
        this.send(SetObjective, { objective, change: { method: JavaObjectiveMethod.Remove } });
    }

    /**
     * Sends `Display Objective` for the slot, after `Update Objectives` for an objective the client
     * does not know, then `Update Score` for every score and `Reset Score` for each holder the
     * client still shows that the snapshot no longer has. A slot Java lacks shows nothing. Java
     * sorts the sidebar highest first whatever the sort order.
     */
    public async showDisplaySlot(slot: string, objective: ShownObjective | undefined): Promise<void> {
        const javaSlot = JAVA_DISPLAY_SLOTS.get(slot);
        if (javaSlot === undefined) return;
        const before = this.slots.get(javaSlot);
        if (objective === undefined) {
            if (before === undefined) return;
            this.slots.delete(javaSlot);
            this.send(SetDisplayObjective, { slot: javaSlot, objective: '' });
            this.forgetUnshown(before);
            return;
        }
        this.declareObjective(objective);
        this.slots.set(javaSlot, objective.name);
        this.send(SetDisplayObjective, { slot: javaSlot, objective: objective.name });
        if (before !== undefined && before !== objective.name) this.forgetUnshown(before);
        const current = new Set(objective.scores.map(({ holder }) => holder));
        for (const holder of this.holders.get(objective.name) ?? []) {
            if (!current.has(holder)) this.resetScore(objective.name, holder);
        }
        for (const { holder, value } of objective.scores) this.sendScore(objective.name, holder, value);
    }

    private sendScore(objective: string, owner: string, score: number): void {
        this.holders.get(objective)?.add(owner);
        this.send(SetScore, { owner, objective, score, displayName: null, numberFormat: null });
    }

    private resetScore(objective: string, owner: string): void {
        this.holders.get(objective)?.delete(owner);
        this.send(ResetScore, { owner, objective });
    }

    /** Sends `Update Score`, or `Reset Score` for a reset, for an objective the client knows. */
    public async showScore(
        objective: string,
        { holder }: Omit<ShownScore, 'value'>,
        value: number | undefined
    ): Promise<void> {
        if (!this.objectives.has(objective)) return;
        if (value === undefined) this.resetScore(objective, holder);
        else this.sendScore(objective, holder, value);
    }

    /** Sends `Update Objectives` removing an objective the client knows. */
    public async removeObjective(objective: string): Promise<void> {
        for (const [slot, shown] of this.slots) if (shown === objective) this.slots.delete(slot);
        if (!this.objectives.delete(objective)) return;
        this.holders.delete(objective);
        this.send(SetObjective, { objective, change: { method: JavaObjectiveMethod.Remove } });
    }

    /**
     * Sends the game events that take the client's sky to the weather: rain begins or ends, then
     * its strength and the storm's, each 0 or 1, as vanilla's join and weather cycle send them.
     * The client is only told of a change from what it was last shown; a Bedrock client's resend
     * of the same weather sends nothing.
     */
    public async showWeather(_from: Weather | undefined, to: Weather): Promise<void> {
        const shown = this.weather;
        if (shown === to) return;
        this.weather = to;
        const raining = to !== 'clear';
        const wasRaining = shown !== undefined && shown !== 'clear';
        if (raining !== wasRaining) this.send(GameEvent, { event: raining ? START_RAINING : STOP_RAINING, value: 0 });
        this.send(GameEvent, { event: RAIN_LEVEL_CHANGE, value: raining ? 1 : 0 });
        this.send(GameEvent, { event: THUNDER_LEVEL_CHANGE, value: to === 'thunder' ? 1 : 0 });
    }

    /** Sends `Change Difficulty`; Bedrock numbers the difficulties as Java does, and none is locked. */
    public async showDifficulty(difficulty: Difficulty): Promise<void> {
        this.send(ChangeDifficulty, { difficulty, locked: false });
    }

    /** Sends `Set Default Spawn Position`, which the client's compass points to. */
    public async showWorldSpawn({ dimension, position, yaw }: ShownWorldSpawn): Promise<void> {
        this.send(SetDefaultSpawnPosition, { dimension: dimension.id, position, yaw, pitch: 0 });
    }

    /** Sends `Set Ticking State`, which the client runs its own ticks at. */
    public async showTicking({ rate, frozen }: ShownTicking): Promise<void> {
        this.send(TickingState, { tickRate: rate, frozen });
    }

    /** Sends `Step Tick`. */
    public async showTickStep(ticks: number): Promise<void> {
        this.send(TickingStep, { steps: ticks });
    }

    /**
     * Not shown: this server sends a Java client no recipes, so there is no book to change.
     * @see https://github.com/JSPrismarine/JSPrismarine/issues/3769
     */
    public async showRecipeBook(): Promise<void> {}

    /** Sends `Transfer (play)`. */
    public async transfer(host: string, port: number): Promise<void> {
        this.send(PlayTransfer, { host, port });
    }
}
