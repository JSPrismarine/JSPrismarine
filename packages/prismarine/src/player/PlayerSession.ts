import type { GenerationPriority } from '@jsprismarine/chunkgen';
import { Vector3 } from '@jsprismarine/math';
import { CraftingDataPacket, CreativeContentPacket, PlayerActionType } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { Gametype } from '@jsprismarine/minecraft';
import { CommandPermissionLevel, ContainerUiId, Dimension, DisconnectReason } from '@jsprismarine/minecraft';
import { advancementChangedDimension, advancementPlayerTick } from '../advancement/triggers';
import type { PlayerIdentity } from '../playerIdentity';
import { playerKeyOf } from '../playerIdentity';
import { Chat, ChatType } from '../chat/Chat';
import { chatRecipientOf } from '../chat/ChatManager';
import type { ChatRecipient } from '../chat/ChatManager';
import type { DamageSource } from '../entity/DamageSource';
import { deathMessage } from '../entity/DeathMessages';
import type { DataEntity } from '../entity/data/DataEntity';
import type { ExperienceHolder } from '../entity/Experience';
import type { ViewableEquipment } from '../entity/predicateView';
import { blockMiningOf } from '../world/BlockMining';
import { sameSpawnPoint } from '../world/RespawnPoint';
import type { StoredSpawnPoint } from '../world/RespawnPoint';
import type { KeyedPlayer } from '../keyedPlayer';
import type { EntityRuntime } from '../entity/data/EntityRuntime';
import { boxOf } from '../entity/data/facts';
import type { EntityBox } from '../entity/data/facts';
import type { LiveEntityRuntime } from '../entity/data/live';
import { DetachedPlayerView, moveStorePlayer, StorePlayerActor } from '../entity/data/storePlayers';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { mayFlyIn } from '../entity/playerComponents';
import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';
import PlayerDespawnEvent from '../events/player/PlayerDespawnEvent';
import PlayerConnectEvent from '../events/player/PlayerConnectEvent';
import PlayerDisconnectEvent from '../events/player/PlayerDisconnectEvent';
import PlayerSetGamemodeEvent from '../events/player/PlayerSetGamemodeEvent';
import PlayerGamemodeChangedEvent from '../events/player/PlayerGamemodeChangedEvent';
import PlayerDimensionChangedEvent from '../events/player/PlayerDimensionChangedEvent';
import PlayerContainerEvent from '../events/player/PlayerContainerEvent';
import type { ContainerOwner } from '../events/player/PlayerContainerEvent';
import PlayerToggleFlightEvent from '../events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from '../events/player/PlayerToggleSprintEvent';
import { loadAdvancements } from '../advancement/progress';
import { enchantmentSeedOf } from '../enchantment/enchantingTable';
import { AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import Timer from '../utils/Timer';
import { lastPlayerRecord } from '../world/PlayerRecords';
import { applyPlayerRecord, recordedPosition } from '../world/playerRecord';
import type { RespawnAnswer, RespawnRequest } from '../world/RespawnSearch';
import { spawnTarget } from '../world/portal/DimensionTravel';
import type { respawnPoint } from '../world/SpawnPlacement';
import { outsideTick } from '../world/TickContext';
import { allSent } from '../network/allSent';
import { tickCarriedMaps } from './carriedMaps';
import type Server from '../Server';
import { commandPermissionOf } from '../command/CommandManager';
import { consoleFirstNodeOf, namesNode } from '../command/updateCommands';
import { PLAYER_SOFT_ENUM } from '../command/jsprismarineCommands';
import { CommandEnum } from '@jsprismarine/protocol/bedrock/wire/structures/CommandEnum';
import { commandDataOf, commandNameEnumOf } from '../command/availableCommands';
import type { Attribute, Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { ShownActor, ShownEntity } from '../world/ShownActor';
import { armorPackets, statusEffectPacket } from '../network/replica/firstSight';
import type { ShownPlayer } from '../world/ShownPlayer';
import type { LiveOffer, TradeContext, TradeResult } from '@jsprismarine/trading';
import UpdateTradePacket from '@jsprismarine/protocol/bedrock/packet/UpdateTradePacket';
import { tradeOffersPayload } from '../editions/bedrock/tradeOffers';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import type { Metadata } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';
import type { DeathMessage } from '../entity/DeathMessages';
import { eyePositionAt } from '../entity/playerEyes';
import type HumanInventory from '../inventory/HumanInventory';
import { blockContainerOf } from '../inventory/blockContainers';
import { showContainerLid } from '../inventory/containerLid';
import { blockSlotName } from '../inventory/containerSlots';
import { openContainerSlots } from '../inventory/containerStore';
import { WindowIds } from '../inventory/WindowIds';
import type { EntityContainer } from '../inventory/slotLog';
import { entityContainerNamed } from '../inventory/slotLog';
import { WindowTypes } from '../inventory/WindowTypes';
import { Item } from '../item/Item';
import CraftingInput from '../crafting/CraftingInput';
import { KEEP_INVENTORY, gameRuleValue } from '../content/world/gameRules';
import BlockPosition from '../world/BlockPosition';
import { Position } from '../world/Position';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import CoordinateUtils from '../world/CoordinateUtils';
import { chunkViewArea } from '../world/ChunkViewArea';
import { DEFAULT_VIEW_DISTANCE_CHUNKS, effectiveViewDistance, toChunk } from '../world/Proximity';
import type { PlayerSpawn } from '../world/SpawnPlacement';
import { dimensionByBedrockId } from '../world/DimensionType';
import { maxSubChunk, minSubChunk } from '../world/Dimension';
import type Chunk from '../world/chunk/Chunk';
import { translateChunkPayload } from '../world/chunk/translateNetworkPalettes';
import { blockTranslationFor } from '../network/codec/blockTranslation';
import type ClientConnection from '../network/ClientConnection';
import { forgetAdvancements } from '../advancement/progress';
import { forgetRecipeBook, loadRecipeBook, rewardedRecipesOf, showRecipeBook } from '../crafting/recipeBook';
import { forgetEnchantmentSeed } from '../enchantment/enchantingTable';
import { BossBar } from './BossBar';
import { EntityTracker } from './EntityTracker';
import type { SessionPlayer, SessionPlayerRef, SessionPlayers } from './sessionPlayers';
import {
    craftingRecipeCount,
    joinContentPayloads,
    limitCraftingData,
    recipeBookEntriesOf
} from '../editions/bedrock/contentPayloads';
import { sendCachedJoinPacket } from '../editions/bedrock/joinPacketCache';
import { creativeContentFrom } from '../editions/bedrock/payloadAdapters';
import { knownOverworldSpawnOf, overworldSpawnOf, playerSpawnPositionPacket } from '../editions/bedrock/spawnPosition';
import AvailableCommandsPacket from '@jsprismarine/protocol/bedrock/packet/AvailableCommandsPacket';
import ChangeDimensionPacket from '@jsprismarine/protocol/bedrock/packet/ChangeDimensionPacket';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/bedrock/packet/ShowCreditsPacket';
import ChunkRadiusUpdatedPacket from '@jsprismarine/protocol/bedrock/packet/ChunkRadiusUpdatedPacket';
import ContainerOpenPacket from '@jsprismarine/protocol/bedrock/packet/ContainerOpenPacket';
import ContainerSetDataPacket from '@jsprismarine/protocol/bedrock/packet/ContainerSetDataPacket';
import InventoryContentPacket from '@jsprismarine/protocol/bedrock/packet/InventoryContentPacket';
import InventorySlotPacket from '@jsprismarine/protocol/bedrock/packet/InventorySlotPacket';
import LevelChunkPacket from '@jsprismarine/protocol/bedrock/packet/LevelChunkPacket';
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/bedrock/packet/ClientCacheMissResponsePacket';
import SubChunkPacket, { SubChunkRequestResult } from '@jsprismarine/protocol/bedrock/packet/SubChunkPacket';
import type SubChunkRequestPacket from '@jsprismarine/protocol/bedrock/packet/SubChunkRequestPacket';
import type { SubChunkEntry } from '@jsprismarine/protocol/bedrock/packet/SubChunkPacket';
import SubChunkPos from '@jsprismarine/protocol/bedrock/structure/SubChunkPos';
import SubChunkPosOffset from '@jsprismarine/protocol/bedrock/structure/SubChunkPosOffset';
import SubChunkHeightmapData from '@jsprismarine/protocol/bedrock/structure/SubChunkHeightmapData';
import type ClientCacheBlobStatusPacket from '@jsprismarine/protocol/bedrock/packet/ClientCacheBlobStatusPacket';
import MobEquipmentPacket from '@jsprismarine/protocol/bedrock/packet/MobEquipmentPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/bedrock/packet/MoveActorAbsolutePacket';
import type { ChunkCoord } from '@jsprismarine/protocol/bedrock/packet/NetworkChunkPublisherUpdatePacket';
import NetworkChunkPublisherUpdatePacket from '@jsprismarine/protocol/bedrock/packet/NetworkChunkPublisherUpdatePacket';
import { PlayStatus, PlayStatusPacket } from '@jsprismarine/protocol';
import PlayerActionPacket from '@jsprismarine/protocol/bedrock/packet/PlayerActionPacket';
import { playerListAddOf, playerListRemoveOf } from '../editions/bedrock/presenter/bedrockPlayerList';
import { listedPlayerOf, setPlayerListName } from '../network/playerListEntry';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/bedrock/packet/RespawnPacket';
import DeathInfoPacket from '@jsprismarine/protocol/bedrock/packet/DeathInfoPacket';
import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';
import SetActorDataPacket from '@jsprismarine/protocol/bedrock/packet/SetActorDataPacket';
import SetActorMotionPacket from '@jsprismarine/protocol/bedrock/packet/SetActorMotionPacket';
import StopSoundPacket from '@jsprismarine/protocol/bedrock/packet/StopSoundPacket';
import { SetHealthPacket } from '@jsprismarine/protocol';
import { BedrockPresenter } from '../editions/bedrock/presenter/BedrockPresenter';
import type { MoveMode, SessionPresenter, ShownDimension, ShownMessage } from './presenter/SessionPresenter';
import { shownInventoryOf, shownStackOf } from './presenter/shownInventory';
import { EXPERIENCE_ATTRIBUTES, experienceOf, VITAL_ATTRIBUTES, vitalsOf } from './presenter/shownVitals';
import type { GameRule } from '@jsprismarine/protocol/bedrock/wire/structures/GameRule';
import GameRulesChangedPacket from '@jsprismarine/protocol/bedrock/packet/GameRulesChangedPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAttributesPacket';
import type ChunkSender from './ChunkSender';
import type { CenteredView } from './ChunkView';
import { ChunkView, insideView } from './ChunkView';
import type { ChunkWire } from './ChunkView';
import ChunkBatchCache from '../editions/bedrock/ChunkBatchCache';
import { ClientBlobCache } from '../editions/bedrock/ClientBlobCache';
import type { CachedChunkDelivery } from '../world/ChunkScheduler';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

/**
 * Chunks queued before a flush, and the reason this group is small.
 *
 * Each chunk is compressed as its own batch so identical chunk revisions can share the same
 * bytes across players. Keeping only a few queued together bounds per-player memory and lets
 * a flush dispatch the chunks promptly instead of waiting for a large region.
 *
 * Four queued chunks still fit comfortably inside the tick's generation throughput.
 */
const CHUNKS_PER_FLUSH = 4;

/** What a chunk an edition's own wire sends counts against the queue's limit, as an estimate. */
const WIRE_CHUNK_BYTES = 64 * 1024;

/** The payload of a chunk an edition's own wire writes, which the session never serializes. */
const EMPTY_PAYLOAD = Buffer.alloc(0);
const MAX_QUEUED_CHUNK_BYTES = 8 * 1024 * 1024;

const chunkBatchCache = new ChunkBatchCache();

interface QueuedChunk {
    readonly chunk: Chunk;
    readonly payload: Buffer;
    readonly revision: number;
    /**
     * The sub chunk count `payload` was serialized with. Read when the chunk is queued, not when
     * it is sent: the column can grow in between, and a whole-chunk payload declared with the
     * newer count told the reader of the payload to expect sub chunks it does not hold.
     */
    readonly subChunkCount: number;
    /** Bytes retained by this queued request-mode packet. */
    readonly memoryBytes: number;
}

/**
 * How close a chunk has to be for a player to be counted as waiting on it.
 *
 * Two rings out: the chunk they stand in, the eight around it and the sixteen around those.
 * That is what a player walking at full speed reaches inside a second, and what they are
 * looking at when the terrain in front of them has not arrived.
 */
const URGENT_CHUNK_DISTANCE = 2;

/**
 * Where a player lands when {@link PlayerSession.changeWorld} moves them.
 *
 * The position is the feet position in `world`, as a portal's exit, the End platform, a spawn
 * block and `/tp` all produce it. A player's own position is their eyes (see
 * `EYE_HEIGHT`), so `changeWorld` raises the arrival once, and
 * `ChangeDimensionPacket` and the `MovePlayer` teleport at the end of the change both carry
 * those eyes.
 */
export interface Arrival {
    /** The world the player arrives in. */
    world: World;
    /** Feet position in `world`, never the eyes. */
    position: Vector3;
    yaw: number;
    pitch: number;
    /** Whether the change follows a death rather than a portal or a teleport. Defaults to false. */
    respawn?: boolean;
    /**
     * Whether the client closes a loading screen for this change, which the change then stays
     * pending on. Defaults to true; a respawn after a death is the one the client does not.
     */
    closesLoadingScreen?: boolean;
}

/** A dimension change the client has not yet closed the loading screen for. */
export interface PendingDimensionChange {
    /** The `Loading Screen Id` the client has to report `EndLoadingScreen` with. */
    loadingScreenId: number;
    arrival: Arrival;
}

/**
 * How long input positions stay ignored after a teleport when the client never says it handled
 * it: five seconds. Long enough for a slow client to apply the teleport, short enough that one
 * which does not set `HandledTeleport` can move again.
 */
const TELEPORT_ACK_TIMEOUT_TICKS = 100;

/** How far from the teleport's target, in blocks, the acknowledging input may be. */
const TELEPORT_ACK_RADIUS = 4;

/**
 * Ticks a client has to close the loading screen of a dimension change before the server
 * finishes the change for it: a minute, well past the slowest world build.
 *
 * A client that never reports `EndLoadingScreen` would otherwise keep every later change held
 * and its own input dropped for as long as it stayed connected.
 */
const LOADING_SCREEN_TIMEOUT_TICKS = 1200;

/**
 * The longest a dimension change holds its first columns back waiting for the client to open the
 * change's loading screen: two seconds. A client that never reports it, such as one whose player
 * is dead and so shows no screen, gets its columns after this instead of not at all.
 */
const ARRIVAL_HOLD_TICKS = 40;

/** The block position a `PlayerActionPacket` carries when the action has no block. */
const NO_BLOCK = { x: 0, y: 0, z: 0 };

/**
 * Experience points a death drops per level, Java's `Player.getBaseExperienceReward`.
 *
 * @javaSource Player.getBaseExperienceReward
 */
const DEATH_EXPERIENCE_PER_LEVEL = 7;

/** The most experience points a death drops, whatever the level. */
const MAX_DEATH_EXPERIENCE = 100;

/** The curse that destroys a stack where a death would drop it, by its Java id. */
const VANISHING_CURSE = 'minecraft:vanishing_curse';

/** Screens whose primary content packet spans several named request containers. */
const COMBINED_BLOCK_CONTENT_SCREENS = new Set([
    WindowTypes.FURNACE,
    WindowTypes.BLAST_FURNACE,
    WindowTypes.SMOKER,
    WindowTypes.BREWING_STAND
]);

/** A screen a block opened for one player, as the session remembers it. */
export interface OpenBlockContainer {
    /** The `Container Id` it was opened under. */
    readonly windowId: number;
    /** The block it belongs to, which is what an enchanting table needs to count bookshelves. */
    readonly position: Vector3;
    /** The block standing there when it was opened. */
    readonly identifier: string;
    /** The `Container Type` the client is drawing. */
    readonly screen: WindowTypes;
    /**
     * The workstation's own input slots, in the order that station's recipe declares them.
     *
     * They live on the window rather than on the block because they are the player's: closing
     * the screen is what gives them back, and a second player at the same table has their own
     * inputs.
     */
    readonly inputs: (Item | null)[];
    /**
     * Bookshelves around an enchanting table, as the last redraw counted them.
     *
     * Kept rather than recounted when a row is taken, so the rows the player was shown and the
     * row that is applied are drawn from one number. Zero for every other screen.
     */
    bookshelfPower: number;
    /** Set when the window is a villager's trade screen rather than a block's container. */
    readonly trade?: OpenTrade;
}

/** What a trade screen needs from the trader it is open on. */
export interface TradeSource {
    /**
     * The offers with the prices the player pays now. A change this makes to the trader, such as
     * a cured discount drawn on the first ask, is logged as the trader's `merchant` field.
     */
    offers(context?: TradeContext): readonly LiveOffer[];
    /**
     * Runs one trade; see `Merchant.trade`. The trade has to log the trader's `merchant`
     * field: that entry is what sends an open screen its new offers, and nothing else redraws it.
     */
    trade(index: number, context?: TradeContext): TradeResult;
    /** The experience each level asks for. */
    tierRequirements(): readonly number[];
    /** The trader's level, from one. */
    readonly level: number;
}

/** What a trade screen reads of its trader: the actor the screen is bound to, and its name for the title. */
export type TradingActor = Pick<ShownActor, 'getRuntimeId' | 'getPosition' | 'getType'> & { getName(): string };

/** A trade screen's trader, and what happens when the player stops trading. */
export interface OpenTrade {
    readonly trader: TradingActor;
    /** The title of the screen as a translation key, such as `entity.villager.farmer`; the trader's name when absent. */
    readonly title?: string;
    readonly source: TradeSource;
    /** The player's own state the discounts read, such as Hero of the Village. */
    context(): TradeContext;
    /** Called once when the screen closes, so the trader is free to trade with someone else. */
    release(): void;
    /** Called after each trade that went through, for what the villager does about it. */
    traded?(result: TradeResult): void;
}

/**
 * The first protocol whose clients are sent chunks in request mode, a skeleton and then the sub
 * chunks they ask for.
 *
 * A 2225 client completes its join that way. A 2193 client does not: it requests the sub chunks
 * and then never closes its loading screen, in any world tall enough to have more than one, so
 * it is sent whole chunks instead. Both measured with the e2e client built for each protocol.
 */
const SUB_CHUNK_REQUESTS_SINCE = 2225;

/**
 * Where a player comes back after a death: the world, and the three positions the respawn
 * exchange needs in it. See {@link respawnPoint} for what each position is.
 */
export type RespawnDestination = ReturnType<typeof respawnPoint> & { readonly world: World };

/** How often the two per-player triggers are checked, which is Java's one second. */
const ADVANCEMENT_CHECK_TICKS = 20;

/** A slot as the wire carries it: an empty slot is an air stack of none, at its position. */
const wireStackOf = (item: Item | null): Item => item ?? Item.air();

/** One of the player's own slots as the wire carries it, under the id the client names the stack by. */
const ownSlotDescriptor = (item: Item | null, context: Parameters<Item['toStackDescriptor']>[0]) =>
    wireStackOf(item).toStackDescriptor(context, item !== null && item.stackNetworkId > 0 ? item.stackNetworkId : null);

/**
 * The window and the container name a client numbers each of its player's own slots by, for the
 * containers it always has open. The ender chest is sent when one is opened, and the crafting
 * grid is emptied when its screen closes, so neither is here.
 */
const OWN_SLOT_WINDOWS: Partial<Record<EntityContainer, { readonly windowId: number; readonly containerId: number }>> =
    {
        inventory: { windowId: WindowIds.INVENTORY, containerId: ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY },
        armor: { windowId: WindowIds.ARMOR, containerId: ContainerUiId.ARMOR_CONTAINER },
        offhand: { windowId: WindowIds.OFFHAND, containerId: ContainerUiId.OFFHAND },
        cursor: { windowId: WindowIds.PLAYER_ONLY_UI, containerId: ContainerUiId.CURSOR }
    };

/** Where the client's view was last centered, in chunks, and the area it keeps around that. */
type PublishedView = CenteredView;

/** The view in effect when a chunk went out, and how many views its flush had seen published by then. */
type SentUnder = { readonly view: PublishedView | null; readonly later: number };

/** What a move packet reads of the actor that moved: its id, where it is, where it faces and whether it stands. */
export type MovedActor = Pick<ShownActor, 'getRuntimeId' | 'getPosition' | 'pitch' | 'yaw' | 'headYaw' | 'isOnGround'>;

/** A message for {@link PlayerSession.sendMessage}: the text, and what to show it as where it is not a raw line. */
export type SessionMessage = Pick<ShownMessage, 'message'> & Partial<Omit<ShownMessage, 'message'>>;

export default class PlayerSession {
    private connection: ClientConnection;
    private readonly server: Server;

    /** The player's entity id, as the wire carries it. */
    public readonly runtimeId: bigint;

    /** Who logged in on this session. */
    public readonly identity: PlayerIdentity;
    /**
     * What turns the server's outbound calls into packets of this client's edition
     * ([ADR 0026](../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)).
     * The session's own send methods that the contract covers delegate to it.
     */
    public readonly presenter: SessionPresenter;

    /** Where {@link PlayerSession.getPlayer} finds the player by {@link PlayerSession.runtimeId}. */
    private readonly players: SessionPlayers<SessionPlayer>;

    /**
     * The world the player is in, or is about to enter: its store holds the player's entity. The
     * login's world until {@link PlayerSession.join} reads the one the player's record names.
     */
    private world: World;

    /** What this client is shown of its own player while the player is in no store. */
    private detached: DetachedPlayerView | undefined;

    /** Whether the player finished joining and has not left; see {@link PlayerSession.isConnected}. */
    private joined = false;
    /** Set for a GameTest simulated player, which has no client and no saved record. */
    private simulated = false;

    /**
     * Whether everyone was told this player joined. The login marks a player joined before the
     * resource pack phase, and the join message goes out only at the end of it, so a player
     * kicked in between has joined without anyone hearing of it.
     */
    private joinAnnounced = false;

    /** How long the join took, for the debug log. */
    private readonly timer = new Timer();

    /** The player as the chat fan-out reaches them, held so the leave leaves with the same object. */
    private readonly chatRecipient: ChatRecipient;

    /**
     * Entity movement produced by this tick, waiting to go out as one batch.
     *
     * Keyed by runtime id rather than a list, so one entity contributes one packet however
     * many times it moved within the tick - see {@link PlayerSession.queueMoveActor}.
     */
    private readonly queuedMoves: Map<number, MoveActorAbsolutePacket> = new Map();

    private readonly chunkSendQueue: QueuedChunk[] = [];
    private queuedChunkBytes = 0;
    private readonly queuedChunkBytesLimit = MAX_QUEUED_CHUNK_BYTES;
    private readonly chunkQueueCapacityWaiters = new Set<() => void>();
    private readonly clientBlobCache = new ClientBlobCache();
    private clientCacheEnabled = false;

    /** Serializes sends when several generated chunks complete at the same time. */
    private chunkBatchFlush: Promise<void> = Promise.resolve();

    /** Which chunks the client holds and still has to receive, the same for both editions. */
    private readonly chunks = new ChunkView();

    /**
     * The chunk the last `NetworkChunkPublisherUpdate` was centered on, and the radius it named
     * in chunks, or null before the first. The client drops every chunk outside it, so a chunk
     * sent outside it is not counted as loaded: see {@link PlayerSession.flushQueuedChunks}.
     */
    private publishedView: PublishedView | null = null;

    /**
     * One list for each running {@link PlayerSession.flushQueuedChunks}, which every publisher
     * update sent meanwhile is added to. A chunk the client kept was inside the view in effect
     * when it was sent and inside every view published after it.
     */
    private readonly publishedViewWatchers = new Set<PublishedView[]>();

    /**
     * Which entities this client currently has on screen.
     *
     * Kept here, beside the chunk state, because it has exactly the same life: it is despawned
     * and emptied when the player changes world and it dies with the session, so nothing has
     * to remember to tidy it up.
     */
    private readonly entityTracker: EntityTracker;

    /** Set while a visibility pass runs, so two cannot overlap and spawn the same entity twice. */
    private reconciling = false;

    /**
     * Whether the spawn chunks and the PlayerSpawn status have gone out yet.
     *
     * They wait for the client's first `RequestChunkRadius`: see {@link PlayerSession.setViewDistance}.
     */
    private spawnChunksSent = false;

    /**
     * The chunk radius the client asked for and was answered with, in chunks, or zero until its
     * first `RequestChunkRadius`. See {@link PlayerSession.setViewDistance}.
     */
    private viewDistance = 0;

    /**
     * Where the player was placed on joining, or null when they came back to a saved position.
     *
     * Kept for the join packets: a Bedrock Dedicated Server reports the requested spot in
     * `StartGame` and the final one in the `Respawn` that releases the client.
     */
    private joinSpawn: PlayerSpawn | null = null;

    /** Set while the spawn chunks are still draining - see {@link PlayerSession.announceSpawnIfReady}. */
    private spawnChunksPending = false;

    /** Where a respawn change is waiting to tell the client it comes back: see {@link PlayerSession.answerRespawnIfReady}. */
    private pendingRespawnAnswer: Vector3 | undefined;

    /**
     * The chunk the player was in when anything last checked.
     *
     * Crossing a boundary is what triggers both a chunk request and a visibility pass, and it
     * is also the early-out that stops `needNewChunks` rebuilding its heap twenty times a
     * second for a player standing still.
     */
    private lastChunkX: number | null = null;
    private lastChunkZ: number | null = null;

    /** The last window id handed out; see {@link PlayerSession.nextWindowId}. */
    private windowId = 0;

    /**
     * The container windows this session has opened on the client and not yet seen closed,
     * by window id, each holding the `Container Type` it was opened as.
     *
     * The server's side of what the docs call the container manager: a `ContainerClose` from
     * the client is checked against it, see {@link PlayerSession.closeWindow}.
     */
    private readonly openWindows = new Map<number, number>();

    /**
     * The block container this session has open, or undefined for none.
     *
     * One at a time, which is what the client allows: a player with a chest open who clicks a
     * furnace has closed the chest. Kept because a later `ItemStackRequest` names a container
     * by its `ContainerUiId` and not by the block it belongs to, so the block it belongs to has
     * to be remembered here.
     */
    private blockContainer: OpenBlockContainer | undefined;

    /**
     * The last value sent for each `ContainerSetData` property of the open block container.
     *
     * A cooking station ticks every tick and its counters move on most of them, so without
     * this a furnace would be three packets a tick per watcher. Cleared with the window, so a
     * player who opens one mid-cook is sent the whole state rather than the tail of it.
     */
    private readonly containerData = new Map<number, number>();

    /**
     * The tick of the last `PlayerAuthInputPacket` handled for this client, or `0n` before the
     * first one.
     *
     * Client-bound packets about the player carry a `PlayerInputTick`, and the docs want it to be
     * this value, not the server's tick counter. The client matches it against its own input
     * history to undo predictions it made while the packet was in flight. The server's counter
     * is not in that history, so it told the client nothing; zero is what the docs allow before
     * any input has arrived.
     */
    private lastInputTick = 0n;

    /** How many `PlayerAuthInputPacket`s were handled for this client; see {@link handledInputs}. */
    private inputCount = 0;

    /**
     * The `Loading Screen Id` the next `ChangeDimensionPacket` gets. The docs ask for an
     * unsigned integer that increments for ever and is unique among the screens still open.
     */
    private nextLoadingScreenId = 1;

    /** Ids from {@link PlayerSession.beginLoadingScreen} whose end the client has not reported. */
    private readonly openLoadingScreens = new Set<number>();

    /**
     * The world change the client is still loading into, with the dimension name it left for
     * the advancement hook. See {@link PlayerSession.changeWorld}.
     */
    private pendingChange:
        | (PendingDimensionChange & {
              left: string;
              sinceTick: number;
              /** Whether the arrival columns may go out; see {@link PlayerSession.releaseArrivalChunks}. */
              arrivalReleased?: boolean;
              /**
               * Whether the change still waits for where it lands, so its columns are held
               * whatever the client reports; see {@link PlayerSession.landHeldArrival}.
               */
              awaitingArrival?: boolean;
          })
        | undefined;
    /**
     * The move a caller asked for while {@link pendingChange} was open, run once it closes, with
     * what follows it.
     */
    private queuedChange: { readonly arrival: Arrival; readonly then: (() => void) | undefined } | undefined;

    /**
     * The arrival held back while the end credits roll on the client, or undefined when no
     * credits are pending. See {@link PlayerSession.startCredits}.
     */
    private pendingCredits: Arrival | undefined;

    /** The last teleport sent to this client that it has not said it handled, and when. */
    private teleportAwaitingAck: { readonly x: number; readonly z: number; readonly sentAtTick: number } | undefined;

    /**
     * @param server - The server the session belongs to.
     * @param connection - The connection it speaks through.
     * @param player - The id and identity of the player it speaks for.
     * @param players - Where the player is filed by that id.
     * @param world - The world the login puts the player in, until its record names another.
     */
    public constructor(
        server: Server,
        connection: ClientConnection,
        player: SessionPlayerRef,
        players: SessionPlayers<SessionPlayer>,
        world: World,
        presenter: SessionPresenter = new BedrockPresenter(
            connection,
            recipeBookEntriesOf(server, () => connection.codec.itemData)
        )
    ) {
        this.server = server;
        this.connection = connection;
        this.presenter = presenter;
        this.runtimeId = player.runtimeId;
        this.identity = player.identity;
        this.players = players;
        this.world = world;
        // Built once and kept, because the fan-out only lets the recipient that joined leave.
        this.chatRecipient = chatRecipientOf(player, server);

        const config = this.server.getConfig();
        this.entityTracker = new EntityTracker({
            hysteresis: config.getEntityTrackingHysteresis(),
            enabled: config.getProximityBroadcast()
        });
    }

    /**
     * Puts this client into the server-wide rotation that feeds it chunks.
     *
     * Not done in the constructor: a session that is built and then thrown away - a join that
     * fails part way through - would stay in the scheduler's set for the life of the server,
     * because the scheduler only ever skips the disconnected and removes on request.
     *
     * Posts `playerConnect`, which {@link PlayerSession.leave} pairs with `playerDisconnect`.
     * @group Lifecycle
     */
    public enable(): void {
        this.server.getChunkScheduler().add(this);
        this.server
            .getKernel()
            .events.post('playerConnect', new PlayerConnectEvent(this, this.connection.getAddress()));
    }

    /**
     * Takes this client back out of the chunk rotation and off every boss bar, lets go of the
     * player's state kept outside the player, and forgets the player itself, after which
     * {@link PlayerSession.getPlayer} throws. Paired with {@link PlayerSession.enable} and safe to
     * call more than once.
     *
     * {@link PlayerSession.leave} runs this after the player has been saved and taken off the
     * server, whether or not that succeeded or the join ever completed.
     * @group Lifecycle
     */
    public disable(): void {
        this.server.getChunkScheduler().remove(this);
        // A delivery the scheduler started before the removal finishes after it, and its flush
        // read the forgotten player. The new epoch makes it, and any batch it queued, stop short.
        this.clearChunks();
        this.joined = false;
        // Only once: a second call finds the player forgotten already.
        if (!this.players.delete(Number(this.runtimeId))) return;
        BossBar.releasePlayer(this.runtimeId);
        const key = playerKeyOf(this.identity);
        forgetAdvancements(key);
        forgetRecipeBook(key);
        forgetEnchantmentSeed(key);
    }

    /**
     * Takes the player off the server and then this session down with it: the player is saved,
     * taken out of its world and the player list, and said to have left, and
     * {@link PlayerSession.disable} runs whether or not that succeeded.
     *
     * `ClientConnection.closePlayerSession` calls this once per connection. Outside a unit of the
     * world's change log, every write is made and every packet queued before this returns. Inside
     * one, such as a kick from an input, all of it waits for the unit to end, whether it commits
     * or is undone. The record's save is handed to work outside the tick, and a later read of the
     * record waits for it.
     * @throws {Error} What the player's leave threw, after the session is disabled, when no unit
     *   is open. Inside one, the store reports it.
     * @group Lifecycle
     */
    public leave(): void {
        // Not in the unit, though it writes: a leave cannot be undone, since the goodbye is
        // queued and the connection hangs up whatever the unit does. Inside the unit, an undo
        // brought the player's entity back into the world with no session behind it.
        this.world.getEntityStore().afterUnit(() => {
            try {
                // Before anything is taken down, so a listener still finds the player in its world.
                this.server
                    .getKernel()
                    .events.post('playerDisconnect', new PlayerDisconnectEvent(this, this.connection.getAddress()));
                this.takePlayerOff();
            } finally {
                this.disable();
            }
        });
    }

    /**
     * Loads what the server knows about this session's player and marks it joined.
     *
     * @remarks Sends nothing. This runs from `LoginHandler`, before the client has been told
     * its login succeeded, and a retail client at protocol 2193 that is handed game packets in
     * that state drops the connection with `InitialConnection-90` (bad packet). The game mode,
     * adventure settings and abilities go out from the join burst after `StartGame`, and
     * `AddPlayer` carries each other player's position when they come into view.
     * @group Lifecycle
     */
    public async join(): Promise<void> {
        const player = this.getPlayer();
        // The world of the dimension the record was written in, which is not always the one
        // the login built them in: a player who logged out of the nether used to come back in
        // the default world. Moved before anything reads the record, and without a packet:
        // nothing has been told where this player is yet. The level builds the world when its
        // stem is lazy and nobody has been there since the boot.
        const record = await lastPlayerRecord(player, this.world);
        this.world = record.world;

        const playerData = record.data;

        // Before anything can be earned, so a returning player keeps what they
        // had rather than earning their first advancement twice.
        const keyed = this.keyed();
        loadAdvancements(keyed, playerData.advancements);
        // After the progress, which a record from before the book was saved fills the book from.
        loadRecipeBook(keyed, playerData.recipeBook, this.presenter, () => rewardedRecipesOf(keyed));
        enchantmentSeedOf(keyed, playerData.enchantmentSeed);

        // Onto the store player while it is in no store, so the load logs nothing.
        applyPlayerRecord(player, playerData, this.server.getConfig().getGamemode(), this.server.getContent());

        // A returning player goes back where they were; a new one is placed the way BDS
        // places them, which may not be the spawn point itself.
        const recorded = recordedPosition(playerData);
        let position: Vector3;
        if (recorded) {
            this.joinSpawn = null;
            position = Vector3.fromObject(recorded);
        } else {
            const placed = await this.world.placePlayerSpawn();
            this.joinSpawn = placed;
            position = eyePositionAt(placed.position);
        }

        // Not broadcast: `StartGame` carries the position, so the client has no use for a
        // `MovePlayer` here.
        await this.setPlayerPosition(
            {
                position,
                pitch: recorded?.pitch ?? 0,
                yaw: recorded?.yaw ?? 0,
                headYaw: recorded?.headYaw ?? 0,
                type: 'respawn'
            },
            false
        );

        // Joined here rather than at the login, and only once the rest has succeeded: a player
        // whose join failed part way through would otherwise stay in the fan-out for the life of
        // the process.
        this.server.getChatManager().join(this.chatRecipient);

        this.server.getLogger().debug(`(Complete player creation took ${this.timer.stop()} ms)`);
        this.joined = true;
    }

    /**
     * Joins a GameTest simulated player: a player with no client, which reads no saved record and
     * leaves none. It stands where the test put it, in the game mode the test asked for, and joins
     * the chat as any player does. Unlike {@link PlayerSession.join} it waits for nothing, so the
     * script that spawned it sees it among the players at once, as on BDS.
     * @param feet - Where the player's feet go, in the session's world.
     * @param gamemode - The game mode, as `/gamemode` names it.
     * @group Lifecycle
     */
    public joinSimulated(feet: { readonly x: number; readonly y: number; readonly z: number }, gamemode: string): void {
        const player = this.getPlayer();
        this.simulated = true;
        applyPlayerRecord(player, { gamemode }, gamemode, this.server.getContent());
        player.standAt(feet);
        this.joinSpawn = null;
        this.server.getChatManager().join(this.chatRecipient);
        this.joined = true;
    }

    /** Whether the player is a GameTest simulated player, with no client. */
    public isSimulated(): boolean {
        return this.simulated;
    }

    /**
     * The player's half of {@link PlayerSession.leave}: everything {@link PlayerSession.join}
     * claimed is released here and nothing else is. A player that never finished joining has
     * nothing to take down: it was never added to a world or the player list, and announcing its
     * departure would name somebody who never arrived.
     */
    private takePlayerOff(): void {
        if (!this.joined) return;

        // Each claim is let go of even when a step before it throws, and the first failure is
        // passed on. A step that stopped the rest left the session in the world's player map
        // and the chat fan-out for the life of the process, after `disable` forgot its player.
        let failure: { readonly error: unknown } | undefined;
        const release = (step: () => void): void => {
            try {
                step();
            } catch (error: unknown) {
                failure ??= { error };
            }
        };

        release(() => this.stopMining());

        // Whether or not they have an XUID: `keyOfPlayer` falls back to the name for an offline
        // player, and this server accepts offline players. The record is built here and written
        // off the tick.
        // A simulated player leaves no record, as on BDS.
        if (!this.simulated) {
            release(
                () =>
                    void this.world
                        .savePlayerData(this.getPlayer())
                        .catch((error: unknown) => this.server.getLogger().error(error))
            );
        }
        // Tells everyone who could see this player to take them away, world-scoped and only the
        // clients that actually had them.
        // Posted while the player's entity is still in the world, for a listener that reads it
        // on the way out, such as a script's `world.beforeEvents.playerLeave`.
        release(() => this.server.getKernel().events.post('playerDespawn', new PlayerDespawnEvent(this)));
        release(() => this.world.removePlayer(this));
        release(() => this.released(this.removeFromPlayerList()));

        // Announce disconnection, to players who were told of the join. The leaving player is
        // still in the fan-out here.
        const chat = this.server.getChatManager();
        if (this.joinAnnounced) {
            release(() =>
                this.released(
                    chat.send(
                        new Chat({
                            sender: this.server.getConsoleSender(),
                            // The bare translation key, for the reason given in `announceArrival`.
                            message: `%multiplayer.player.left`,
                            parameters: [this.identity.name],
                            needsTranslation: true,
                            type: ChatType.TRANSLATION
                        })
                    )
                )
            );
        }

        this.joined = false;
        this.joinAnnounced = false;
        chat.leave(this.chatRecipient);
        if (failure !== undefined) throw failure.error;
    }

    /** The queue the scheduler drains - see `ChunkRecipient`. */
    public get sender(): ChunkSender {
        return this.chunks.sender;
    }

    /**
     * Produces one chunk and queues it for the next batch. Called only by the scheduler.
     *
     * The scheduler takes a coordinate off the queue before calling this, so a failure here
     * has to put the bookkeeping back: the view's loading set is what stops `needNewChunks` from
     * asking for the same chunk twice, and leaving the hash in it after nothing was sent
     * means that chunk is never requested again - a permanent hole in the player's world for
     * as long as they stay in range of it.
     */
    public async deliver(x: number, z: number): Promise<void> {
        const epoch = this.chunks.epoch;
        try {
            await this.requestChunk(x, z);
            if (epoch !== this.chunks.epoch) return;
            if (this.chunkSendQueue.length >= CHUNKS_PER_FLUSH) await this.flushChunkBatch();
        } catch (error: unknown) {
            this.chunks.produceFailed(x, z);
            throw error;
        }
    }

    /** Queues a resident chunk without entering the generation and disk-read depth gate. */
    public tryDeliverLoaded(x: number, z: number): CachedChunkDelivery {
        const world = this.getWorld();
        const chunk = world.getLoadedChunk(x, z);
        if (chunk === null) return { kind: 'not-loaded', inline: world.getGenerator().generatesInline === true };

        const queued = this.prepareQueuedChunk(chunk);
        const queuedBytes = queued.memoryBytes;
        if (!this.hasChunkQueueCapacity(queuedBytes)) return { kind: 'backpressure' };

        this.queueChunkNow(queued);
        return { kind: 'queued', queuedBytes };
    }

    /** Enables or clears client blob caching for subsequent subchunk requests. */
    public setClientCacheEnabled(enabled: boolean): void {
        this.clientCacheEnabled = enabled;
        if (!enabled) this.clientBlobCache.clear();
    }

    /** Whether this session will use cached blobs in request-mode subchunk responses. */
    public getClientCacheEnabled(): boolean {
        return this.clientCacheEnabled;
    }

    /**
     * Responds to requested blob misses and applies the client's acknowledgements.
     *
     * Every status is answered, with an empty `ClientCacheMissResponse` when the client missed
     * nothing. Bedrock Dedicated Server 1.26.60 does the same, 105 answers to 105 statuses in the
     * capture docs/research/sub-chunk-requests-and-blob-cache.md describes. Do not skip the empty
     * one to save a packet: the answer is what closes the client's cache transaction.
     * @returns How many blobs went out.
     */
    public async handleClientCacheBlobStatus(packet: ClientCacheBlobStatusPacket): Promise<number> {
        if (!this.clientCacheEnabled) return 0;

        const blobs = this.clientBlobCache.respond(packet.missingIds, packet.foundIds);

        const response = new ClientCacheMissResponsePacket();
        response.blobs = blobs;
        await this.send(response);
        return blobs.length;
    }

    /**
     * Answers requested sections with their bytes, block entities, heightmaps, and cache ids.
     *
     * The shape of each entry follows a capture of Bedrock Dedicated Server 1.26.60 answering a
     * retail client, recorded in docs/research/sub-chunk-requests-and-blob-cache.md. With the
     * client's blob cache on:
     *
     * - A section with blocks carries the hash of its terrain and a payload that is present even
     *   when empty. The payload holds the section's block entities only.
     * - An all-air section carries neither payload nor hash.
     * - The answer is the same whether or not the client has confirmed the blob before.
     *
     * These look like things to simplify, such as dropping an empty payload or sending the terrain
     * inline to save a round trip. A retail client leaves with a bad packet error
     * (`ClientDisconnection-90`) on either, so change them only against a new capture.
     * @param packet - The requested chunk columns and absolute subchunk center.
     */
    public async handleSubChunkRequest(packet: SubChunkRequestPacket): Promise<number> {
        if (packet.offsets.length === 0) return 0;

        const online = this.isConnected();
        const world = online ? this.getWorld() : undefined;
        const dimension = world?.getDimension();
        const cacheEnabled = this.clientCacheEnabled;
        const entries: SubChunkEntry[] = [];
        for (const offset of packet.offsets) {
            const y = packet.centerPos.y + offset.y;
            const entry: SubChunkEntry = {
                offset: new SubChunkPosOffset(offset.x, offset.y, offset.z),
                result: SubChunkRequestResult.PLAYER_DOESNT_EXIST,
                heightMaps: new SubChunkHeightmapData()
            };

            if (!online || world === undefined || dimension === undefined) {
                entries.push(entry);
                continue;
            }
            if (packet.dimensionType !== dimension.bedrockId) {
                entry.result = SubChunkRequestResult.WRONG_DIMENSION;
                entries.push(entry);
                continue;
            }
            const clientRange = dimension.custom ? dimension : (dimensionByBedrockId(dimension.bedrockId) ?? dimension);
            if (y < minSubChunk(clientRange) || y > maxSubChunk(clientRange)) {
                entry.result = SubChunkRequestResult.INDEX_OUT_OF_BOUNDS;
                entries.push(entry);
                continue;
            }

            const x = packet.centerPos.x + offset.x;
            const z = packet.centerPos.z + offset.z;
            let chunk = world.getLoadedChunk(x, z);
            // A chunk this client was told about has to be answerable. The client asks for its
            // sub chunks only once, and a "doesn't exist" is final for that column, so one the
            // world evicted between the announcement and the request would stay a hole for as
            // long as the player stood there. Read it back instead; a chunk nobody announced is
            // not loaded on a client's say-so.
            if (chunk === null && this.chunks.holds(x, z)) {
                chunk = await world.getChunk(x, z, { urgency: 'immediate' });
            }
            if (chunk === null || chunk.getX() !== x || chunk.getZ() !== z) {
                // Debug: a client that has moved or changed dimension asks for columns of its old
                // view, one line per sub chunk, and there is nothing for an operator to do about it.
                this.server
                    .getLogger()
                    .debug(`${this.identity.name} asked for sub chunk ${x}, ${y}, ${z}, which is not loaded`);
                entry.result = SubChunkRequestResult.LEVEL_CHUNK_DOESNT_EXIST;
                entries.push(entry);
                continue;
            }

            const translation = blockTranslationFor(this.connection.codec.protocolVersion);
            const worldData = chunk.networkSerializeRequestSubChunk(y);
            // The terrain opens the payload as one sub chunk, and the block entities after it
            // are copied as they are.
            const data = translation.changes ? translateChunkPayload(worldData, 1, translation.toClient) : worldData;
            const allAir = data.byteLength === 2 && data[0] === 8 && data[1] === 0;
            entry.result = allAir ? SubChunkRequestResult.SUCCESS_ALL_AIR : SubChunkRequestResult.SUCCESS;
            entry.heightMaps = chunk.networkSubChunkHeightmaps(y);

            if (!cacheEnabled) {
                Object.assign(entry, { serializedSubChunk: data });
                entries.push(entry);
                continue;
            }
            // Mojang's packet documentation: the payload is "absent when cache enabled and result
            // is SuccessAllAir", and such a section queues no blob either. With the cache off the
            // payload stays, which is why this check sits below the uncached branch.
            if (allAir) {
                entries.push(entry);
                continue;
            }

            // With the blob cache on, the terrain never travels in this packet. The entry names
            // its hash, the client answers which hashes it lacks, and those go out in a
            // ClientCacheMissResponse. The payload is still there and holds the section's block
            // entities, empty when it has none: a game client reads a successful entry's payload
            // whether or not it is cached, and leaves with a bad packet error when it is absent.
            const blob = this.clientBlobCache.prepareRequestSubChunk(chunk, y, translation);
            this.clientBlobCache.track([blob]);
            Object.assign(entry, { blobId: blob.id, serializedSubChunk: blob.blockEntities });
            entries.push(entry);
        }

        const response = new SubChunkPacket({
            cacheEnabled,
            dimension: packet.dimensionType,
            centerPos: new SubChunkPos(packet.centerPos.x, packet.centerPos.y, packet.centerPos.z),
            entries
        });
        await this.send(response);
        return entries.length;
    }

    /**
     * Records that the join burst told everyone this player joined, so that its leave tells
     * them it left. A player kicked before this, such as one that refused the resource packs,
     * leaves without a message.
     * @group Lifecycle
     */
    public announcedJoin(): void {
        this.joinAnnounced = true;
    }

    /** Whether the player has joined and not left. */
    public isConnected(): boolean {
        return this.joined;
    }

    /** Queues the chunks around a position, nearest first, without sending anything yet. */
    public queueChunks(centerX: number, centerZ: number, coordinates: Array<[number, number]>): void {
        this.chunks.queue(centerX, centerZ, coordinates);
    }

    /**
     * Per-tick work for this client: terrain to request, entities to show or hide.
     *
     * Both hang off the same question - has the player walked into a different chunk. Asking
     * it here rather than inside each is what stops `needNewChunks` rebuilding a heap of a few
     * hundred candidates twenty times a second for a player who has not moved, and it is what
     * makes a moving player see entities appear within a tick rather than on the next interval.
     * @param tick - The current server tick.
     */
    public update(tick: number): void {
        const pending = this.pendingChange;
        // A change still waiting for its arrival is not overdue: the client cannot close a screen
        // it has no terrain for, and whoever holds the change lands it. The minute starts then.
        if (
            pending !== undefined &&
            pending.awaitingArrival !== true &&
            tick - pending.sinceTick >= LOADING_SCREEN_TIMEOUT_TICKS
        ) {
            this.server
                .getLogger()
                .warn(
                    `${this.identity.name} never closed loading screen ${pending.loadingScreenId} of the change to ${pending.arrival.world.getName()}; finishing it for them`
                );
            this.endLoadingScreen(pending.loadingScreenId);
            this.completeDimensionChange(pending.loadingScreenId);
        } else if (
            pending !== undefined &&
            pending.arrivalReleased !== true &&
            tick - pending.sinceTick >= ARRIVAL_HOLD_TICKS
        ) {
            this.server
                .getLogger()
                .debug(
                    `${this.identity.name} has not opened loading screen ${pending.loadingScreenId}; sending its arrival columns anyway`
                );
            pending.arrivalReleased = true;
            // Chunk delivery, which runs outside the tick and is not waited for.
            this.released(this.flush());
        }

        if (!this.viewDistance) return;

        const position = this.own().getPosition();
        const chunkX = toChunk(position.getX());
        const chunkZ = toChunk(position.getZ());

        if (chunkX === this.lastChunkX && chunkZ === this.lastChunkZ) return;

        this.lastChunkX = chunkX;
        this.lastChunkZ = chunkZ;

        this.released(this.needNewChunks());
        this.released(this.reconcileTrackedEntities());
    }

    /**
     * Whether this client knows about the entity.
     *
     * True for the player's own entity, which the tracker itself never holds - a client is
     * not sent a spawn for the thing it is driving, but it plainly *has* it. Without this the
     * gates built on `tracks` would drop a player's own hurt animation and the pickup
     * animation for the item they just walked over.
     * @param {bigint} runtimeId - The entity's runtime id.
     * @returns {boolean} `true` if the client can act on a packet naming that id.
     */
    public tracks(runtimeId: bigint): boolean {
        return runtimeId === this.runtimeId || this.entityTracker.tracks(runtimeId);
    }

    /**
     * Shows and hides entities so the client matches where the player now is.
     *
     * Records an entity as tracked only *after* its spawn has gone out. Marking first would
     * mean a spawn that failed left the entity flagged as delivered, and nothing would ever
     * send it again - the same lesson `flushChunkBatch` records for chunks, where it left a
     * permanent hole in the world.
     * @param {Iterable<ShownEntity>} [entities] - Every entity in the world, and it must be every
     * one - anything tracked and absent from it is taken to have left and is despawned.
     * Defaults to asking the world. For a single arrival, use {@link PlayerSession.considerEntity}.
     */
    public reconcileTrackedEntities(entities?: Iterable<ShownEntity>): Promise<void> {
        if (this.reconciling || !this.isConnected()) return allSent([]);

        this.reconciling = true;
        const sends: Promise<void>[] = [];
        try {
            const change = this.entityTracker.plan({
                viewer: this.getViewPosition(),
                viewDistance: this.viewDistance,
                self: this.runtimeId,
                entities: entities ?? this.world.shownEntities()
            });

            for (const entity of change.spawn) {
                const sent = this.presenter.showEntity(entity, this);
                sends.push(this.trackedOnceSent(entity.getRuntimeId(), sent));
            }

            for (const runtimeId of change.despawn) {
                this.entityTracker.remove(runtimeId);
                sends.push(this.sendRemoveActorById(runtimeId));
            }
        } finally {
            this.reconciling = false;
        }
        return allSent(sends);
    }

    /**
     * Shows one entity to this client, if it is close enough and not already shown.
     *
     * The single-entity path, for something that has just entered the world rather than a
     * whole pass over everything in it.
     * @param {ShownEntity} entity - The entity to consider.
     */
    public considerEntity(entity: ShownEntity): Promise<void> {
        if (!this.isConnected()) return allSent([]);
        if (entity.getRuntimeId() === this.runtimeId) return allSent([]);
        if (!this.entityTracker.shouldSpawn(entity, this.own().getPosition(), this.viewDistance)) return allSent([]);

        return this.trackedOnceSent(entity.getRuntimeId(), this.presenter.showEntity(entity, this));
    }

    /**
     * Tracks a spawn from when it is queued, and forgets it again if the transport fails to
     * frame it, so the next pass sends it rather than leave the entity invisible for good.
     * Tracked first because the next pass may run before the send settles, and it must not send
     * the same spawn twice.
     *
     * Only the spawn that is still the tracked one is forgotten. A send can fail after its entity
     * was dropped and spawned again under the same runtime id, and that newer spawn's record
     * has to stay for the drop that follows it ({@link EntityTracker.removeSpawn}).
     */
    private trackedOnceSent(runtimeId: bigint, sent: Promise<void>): Promise<void> {
        const spawn = this.entityTracker.add(runtimeId);
        return sent.catch((error: unknown) => {
            this.entityTracker.removeSpawn(runtimeId, spawn);
            throw error;
        });
    }

    /**
     * Hides one entity from this client if it is showing, and forgets it either way.
     *
     * Unconditional forgetting matters: a stale id left behind would make the tracker believe
     * the client still has an entity it does not, and block it from ever being sent again.
     * @param entity - The entity that is going away.
     */
    public dropEntity(entity: Pick<ShownActor, 'getRuntimeId'>): Promise<void> {
        if (!this.entityTracker.remove(entity.getRuntimeId())) return allSent([]);
        return this.sendRemoveActorById(entity.getRuntimeId());
    }

    /**
     * Hides every tracked entity from this client and forgets them all.
     *
     * For a world change. A dimension change does not make the client drop what it holds, so
     * the mobs of the world being left stayed on screen in the new one. Not routed through
     * {@link PlayerSession.reconcileTrackedEntities}: that returns early while another pass
     * runs, and a world change cannot be skipped.
     */
    public despawnAllTrackedEntities(): Promise<void> {
        return allSent([...this.entityTracker.clear()].map((runtimeId) => this.sendRemoveActorById(runtimeId)));
    }

    /**
     * Sends what has been produced but not yet dispatched.
     *
     * Called by the scheduler at the end of its pass, so a partial batch does not sit until
     * the next tick.
     */
    public async flush(): Promise<void> {
        if (this.chunkSendQueue.length > 0) await this.flushChunkBatch();
    }

    /**
     * Serialises, compresses and dispatches the pending chunks.
     *
     * Deliberately called from within {@link deliver}, which the scheduler awaits inside its
     * time budget. Doing it here instead of once per tick elsewhere is what makes that
     * budget honest: serialising and compressing is the larger part of the cost, and while
     * it happened outside the measured window the scheduler was timing `deliver` - nearly
     * free for a cached chunk - and believing it had spent almost nothing.
     */
    private flushChunkBatch(): Promise<void> {
        const flush = this.chunkBatchFlush.then(() => this.flushQueuedChunks());
        this.chunkBatchFlush = flush.catch(() => {});
        return flush;
    }

    /** Sends one queued batch after any earlier batch has finished. */
    private async flushQueuedChunks(): Promise<void> {
        // Kept queued, not sent, until the client has opened the change's loading screen.
        if (this.holdsArrivalChunks()) return;
        const chunksToSend = this.chunkSendQueue.splice(0, this.chunkSendQueue.length);
        if (chunksToSend.length === 0) return;
        const epoch = this.chunks.epoch;
        const payloadBytes = chunksToSend.reduce((total, { memoryBytes }) => total + memoryBytes, 0);
        const wire = this.presenter.chunkWire;
        if (wire !== undefined) return this.flushThroughWire(wire, chunksToSend, epoch, payloadBytes);

        // The publisher update has to come first, and has to be current.
        //
        // It names the point around which chunks stay visible and how far that reaches; the
        // client ignores anything outside the radius of the most recent one, and shows
        // nothing at all if none was ever sent. Chunks now arrive spread over many ticks, so
        // a single update sent at join goes stale the moment the player walks - which is why
        // chunks stopped appearing, or appeared out of order. Vanilla servers send this
        // continuously at the player's position, and so does this.
        //
        // `saved_chunks` stays empty on purpose: the client takes that list as the set that
        // should be showing, so naming only the current batch un-rendered everything sent
        // before it. What governs visibility is the radius around the position.
        // https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/proto.yml
        const publisherSend = this.sendNetworkChunkPublisher(effectiveViewDistance(this.viewDistance), []);
        const laterViews: PublishedView[] = [];
        this.publishedViewWatchers.add(laterViews);
        // For each chunk, the view in effect when it went out and how many views the flush
        // had seen published by then: the ones after it can make the client drop it too.
        const sentUnder: SentUnder[] = [];
        // How many sends completed, and whether the chunks were settled after them: a failure
        // settles the first like a successful flush and retries only the rest.
        let sent = 0;
        let settled = false;

        try {
            await publisherSend;
            const compressionLevel = this.server.getConfig().getPacketCompressionLevel();
            const requestMode = this.usesSubChunkRequests();
            // With the client's blob cache on, a request-mode chunk names its biomes by hash and
            // carries only the border block count, as Bedrock Dedicated Server 1.26.60 sends it.
            // Sending the biomes inline with the cache off would be simpler and one round trip
            // shorter, but the sub chunk answers that follow use the cache, and the server this
            // was captured from never mixes the two for one client.
            const cached = requestMode && this.clientCacheEnabled;
            for (const { chunk, payload, revision, subChunkCount: queuedSubChunkCount } of chunksToSend) {
                // A world change while an earlier chunk was compressing or sending: the rest are
                // the old world's, and the client has already been told it is somewhere else.
                if (epoch !== this.chunks.epoch) return;
                const biomes = cached ? this.clientBlobCache.prepareRequestBiomes(chunk) : undefined;
                if (biomes !== undefined) this.clientBlobCache.track([biomes]);
                // A request-mode client asks for its sub chunks later and is answered from the
                // column as it is then, so it is told the current limit. A whole-chunk payload
                // carries its sub chunks, and declares the count it was serialized with.
                const subChunkCount = requestMode ? chunk.getNetworkSubChunkRequestLimit() : queuedSubChunkCount;
                const batch = await chunkBatchCache.getOrCreate(
                    chunk,
                    revision,
                    this.connection.codec,
                    compressionLevel,
                    () => [
                        new LevelChunkPacket({
                            chunkX: chunk.getX(),
                            chunkZ: chunk.getZ(),
                            dimension: chunk.getDimension().bedrockId,
                            subChunkCount,
                            clientSubChunkRequestsEnabled: requestMode,
                            ...(biomes === undefined
                                ? {
                                      cached: false,
                                      payload: this.clientChunkPayload(payload, requestMode, subChunkCount)
                                  }
                                : { cached: true, blobHashes: [biomes.id], payload: biomes.tail })
                        })
                    ],
                    this.connection.compressionAlgorithm,
                    this.connection.compressionThreshold,
                    biomes !== undefined ? 'request-mode-cached' : requestMode ? 'request-mode' : 'uncached'
                );
                if (epoch !== this.chunks.epoch) return;

                // Shared compression is safe; framing and encryption remain ordered per connection.
                sentUnder.push({ view: this.publishedView, later: laterViews.length });
                await this.connection.sendSharedCompressedBatchAsync(
                    batch.content,
                    batch.packets,
                    false,
                    batch.packetBuffers
                );
                sent += 1;
            }

            // A world change happened while the batch was compressing. These were the old world's
            // chunks; the sets were cleared for the new one and the hashes must not come back.
            if (epoch !== this.chunks.epoch) return;

            for (const [index, { chunk }] of chunksToSend.entries()) {
                this.settleSentChunk(chunk, sentUnder[index], laterViews);
            }
            settled = true;

            // The spawn status waits for this, not the other way round.
            await this.announceSpawnIfReady();
            await this.answerRespawnIfReady();
        } catch (error: unknown) {
            // A chunk whose send completed is settled as if the flush had succeeded, not sent
            // again: in sub chunk request mode a second `LevelChunk` resets the column the client
            // holds, and a player standing on it falls through. After a world change the sets
            // belong to the new world, and these hashes must not touch them.
            if (!settled && epoch === this.chunks.epoch) {
                for (const [index, { chunk }] of chunksToSend.entries()) {
                    if (index < sent) this.settleSentChunk(chunk, sentUnder[index], laterViews);
                    else this.retryUnsentChunk(chunk);
                }
            }
            throw error;
        } finally {
            this.publishedViewWatchers.delete(laterViews);
            this.releaseChunkQueueBytes(payloadBytes);
        }
    }

    /**
     * Sends one queued batch through an edition's own wire, behind the view's center, and settles
     * it as a Bedrock batch is settled: kept when it was inside the view the client had when it
     * went out, queued again when the send failed.
     */
    private async flushThroughWire(
        wire: ChunkWire,
        chunksToSend: readonly QueuedChunk[],
        epoch: number,
        payloadBytes: number
    ): Promise<void> {
        let settled = false;
        try {
            await this.sendNetworkChunkPublisher(effectiveViewDistance(this.viewDistance), []);
            if (epoch !== this.chunks.epoch) return;
            const view = this.publishedView;
            await wire.send(
                chunksToSend.map(({ chunk }) => chunk),
                this
            );
            if (epoch !== this.chunks.epoch) return;
            for (const { chunk } of chunksToSend) this.settleSentChunk(chunk, { view, later: 0 }, []);
            settled = true;

            await this.announceSpawnIfReady();
            await this.answerRespawnIfReady();
        } catch (error: unknown) {
            if (!settled && epoch === this.chunks.epoch) {
                for (const { chunk } of chunksToSend) this.retryUnsentChunk(chunk);
            }
            throw error;
        } finally {
            this.releaseChunkQueueBytes(payloadBytes);
        }
    }

    /**
     * Records a chunk whose send completed.
     *
     * Loaded only once it is actually on the wire, and only when the client kept it: it was
     * inside the view in effect when it was sent and inside every view published since. The
     * client drops a chunk outside either, so counting that one as held would leave a hole that
     * is never sent again while the player stays in view of it. Such a chunk is forgotten
     * instead, so the next `needNewChunks` that covers it asks again, unless it has already been
     * queued anew.
     */
    private settleSentChunk(chunk: Chunk, sent: SentUnder | undefined, laterViews: readonly PublishedView[]): void {
        const x = chunk.getX();
        const z = chunk.getZ();
        const kept =
            sent !== undefined &&
            insideView(sent.view, x, z) &&
            laterViews.slice(sent.later).every((view) => insideView(view, x, z));
        this.chunks.settle(x, z, kept, (x, z) => this.inCurrentView(x, z));
    }

    /**
     * Queues again a chunk whose batch failed before its send completed.
     *
     * Forgetting it alone waits for the next `needNewChunks`, which runs only when the player
     * crosses into another chunk, so a player standing still kept the hole, and one arriving in
     * another dimension sat on the loading screen until its timeout.
     */
    private retryUnsentChunk(chunk: Chunk): void {
        this.chunks.retry(chunk.getX(), chunk.getZ(), (x, z) => this.inCurrentView(x, z));
    }

    /**
     * Sends one packet to this client.
     *
     * Returns the send rather than dropping it: without this, every `await session.send(...)`
     * and every `Promise.all` over a broadcast resolved immediately and any framing error
     * went nowhere.
     * @param packet - The packet to send.
     */
    public async send(packet: NetworkPacket<unknown>): Promise<void> {
        return this.connection.sendDataPacket(packet);
    }

    /**
     * Lets sends that are already queued go without waiting for the transport, and logs a
     * failure to frame them. For simulation code, which never reads the result of a send.
     * @param sends - The sends, already started.
     */
    public released(sends: Promise<void>): void {
        void sends.catch((error: unknown) => this.server.getLogger().error(error));
    }

    /**
     * Notify a client about change(s) to the adventure settings.
     *
     * @param player - The client-controlled entity
     */
    public async sendSettings(player?: Pick<ShownPlayer, 'gamemode'>): Promise<void> {
        await this.presenter.sendInteractionSettings((player ?? this.own()).gamemode);
    }

    /**
     * Sends this session's player's game mode, adventure settings and abilities where each
     * belongs.
     *
     * The two halves have different audiences, and sending both to everyone was a bug.
     * `UpdateAdventureSettingsPacket` carries no target actor - it describes the client
     * receiving it and nothing else - so pushing one player's settings to every session made
     * a single spectator set `worldImmutable` on everybody else's client. It goes to this
     * client alone. `UpdateAbilitiesPacket` does carry `targetActorUniqueId`, so it is
     * genuinely about this player and belongs with everyone who can see them: the clients that
     * track this player's entity. A client in another world, or one that has not spawned the
     * player yet, has no actor for it, and gets the abilities with the player's first sight.
     */
    public announceSettings(): Promise<void> {
        return allSent([
            this.sendGamemode(),
            this.sendSettings(),

            // Explicitly, because the fan-out below leaves this client out: it needs its own
            // player's abilities too, and this is the one copy it gets.
            this.sendAbilities(this.shown()),

            ...this.server
                .getSessionManager()
                .getSessions()
                .filter((session) => session !== this && session.tracks(this.runtimeId))
                .map(async (session) => session.sendAbilities(this.shown()))
        ]);
    }

    /**
     * Tells this client what `player` may do.
     *
     * @param player - The player described. Defaults to this session's own player.
     */
    public async sendAbilities(player?: ShownPlayer): Promise<void> {
        const target = player ?? this.shown();
        await this.presenter.sendAbilities({
            runtimeId: target.getRuntimeId(),
            gamemode: target.gamemode,
            canFly: target.metadata.canFly,
            flying: target.isFlying(),
            op: target.isOp(),
            commandLevel: target.getCommandLevel()
        });
    }

    public needNewChunks(forceResend = false, dist?: number): Promise<void> {
        const position = this.own().getPosition();
        const currentXChunk = CoordinateUtils.fromBlockToChunk(position.getX());
        const currentZChunk = CoordinateUtils.fromBlockToChunk(position.getZ());

        const viewDistance = this.viewDistance || dist || 0;

        const unloaded = this.chunks.need(currentXChunk, currentZChunk, viewDistance, forceResend);
        // A Java client keeps a chunk until it is told to drop it; a Bedrock one drops it itself
        // once it leaves the radius the publisher below names.
        if (unloaded.length > 0 && this.presenter.chunkWire !== undefined) {
            this.released(this.presenter.chunkWire.forget(unloaded));
        }

        if (unloaded.length === 0 && this.chunkSendQueue.length !== 0)
            return this.sendNetworkChunkPublisher(dist ?? viewDistance, []);
        return allSent([]);
    }

    /** Whether a chunk is inside the area around the player that `needNewChunks` asks for. */
    private inCurrentView(x: number, z: number): boolean {
        if (!this.viewDistance || !this.isConnected()) return false;
        const position = this.own().getPosition();
        return chunkViewArea(this.viewDistance).contains(
            x - CoordinateUtils.fromBlockToChunk(position.getX()),
            z - CoordinateUtils.fromBlockToChunk(position.getZ())
        );
    }

    public async requestChunk(x: number, z: number): Promise<void> {
        const epoch = this.chunks.epoch;
        const chunk = await this.getWorld().getChunk(x, z, { urgency: this.urgencyOf(x, z) });
        await this.queueChunk(chunk, epoch);
    }

    private async queueChunk(chunk: Chunk, epoch: number): Promise<void> {
        while (epoch === this.chunks.epoch) {
            const queued = this.prepareQueuedChunk(chunk);
            if (queued.memoryBytes > this.queuedChunkBytesLimit) {
                throw new PrismarineNetworkErrors.ChunkTooLargeForQueue({
                    memoryBytes: queued.memoryBytes,
                    queuedChunkBytesLimit: this.queuedChunkBytesLimit
                });
            }
            if (this.hasChunkQueueCapacity(queued.memoryBytes)) {
                this.queueChunkNow(queued);
                return;
            }

            // A capacity wait may last across a network send. Drop this temporary entry before yielding.
            if (this.chunkSendQueue.length > 0) {
                await this.flushChunkBatch();
            } else {
                await new Promise<void>((resolve) => this.chunkQueueCapacityWaiters.add(resolve));
            }
        }
    }

    private queueChunkNow(queued: QueuedChunk): void {
        this.chunkSendQueue.push(queued);
        this.queuedChunkBytes += queued.memoryBytes;
    }

    /**
     * A chunk payload with its block ids as this client's release writes them.
     *
     * Built inside the batch cache's factory, which keeps one batch per codec, so an older
     * session pays for the copy once per chunk revision. A request-mode payload carries no sub
     * chunks; those are translated as they are requested.
     */
    private clientChunkPayload(payload: Buffer, requestMode: boolean, subChunkCount: number): Buffer {
        const translation = blockTranslationFor(this.connection.codec.protocolVersion);
        if (requestMode || !translation.changes) return payload;
        return translateChunkPayload(payload, subChunkCount, translation.toClient);
    }

    /** Whether this client is sent chunks in request mode; see {@link SUB_CHUNK_REQUESTS_SINCE}. */
    private usesSubChunkRequests(): boolean {
        return this.connection.codec.context.protocolVersion >= SUB_CHUNK_REQUESTS_SINCE;
    }

    private prepareQueuedChunk(chunk: Chunk): QueuedChunk {
        // An edition that writes its chunks itself is handed the chunk, and its bytes are counted
        // as an estimate against the queue's limit.
        if (this.presenter.chunkWire !== undefined) {
            return {
                chunk,
                payload: EMPTY_PAYLOAD,
                revision: chunk.getNetworkRevision(),
                subChunkCount: chunk.getNetworkSubChunkCount(),
                memoryBytes: WIRE_CHUNK_BYTES
            };
        }
        const payload = this.usesSubChunkRequests()
            ? chunk.networkSerializeRequestSkeleton()
            : chunk.networkSerialize();
        return {
            chunk,
            payload,
            revision: chunk.getNetworkRevision(),
            subChunkCount: chunk.getNetworkSubChunkCount(),
            memoryBytes: payload.byteLength
        };
    }

    private hasChunkQueueCapacity(bytes: number): boolean {
        return this.queuedChunkBytes + bytes <= this.queuedChunkBytesLimit;
    }

    private releaseChunkQueueBytes(bytes: number): void {
        this.queuedChunkBytes -= bytes;
        for (const resolve of this.chunkQueueCapacityWaiters) resolve();
        this.chunkQueueCapacityWaiters.clear();
    }

    /**
     * How badly this player needs one of their chunks, by how close it is to them.
     *
     * The queue is already drained nearest first, so this is about what happens when the
     * generator is behind: the ring a player can see into has to come before the rim of
     * somebody else's view distance, whichever was asked for first.
     *
     * Chebyshev distance, because that is the shape of a view distance square.
     *
     * @param x - Chunk x.
     * @param z - Chunk z.
     */
    private urgencyOf(x: number, z: number): GenerationPriority {
        if (this.lastChunkX === null || this.lastChunkZ === null) return 'immediate';

        const distance = Math.max(Math.abs(x - this.lastChunkX), Math.abs(z - this.lastChunkZ));
        if (distance <= URGENT_CHUNK_DISTANCE) return 'immediate';

        return distance <= this.viewDistance / 2 ? 'soon' : 'idle';
    }

    /**
     * Clear the currently loaded and loading chunks.
     *
     * @remarks
     * Usually used for changing dimension, world, etc.
     *
     * Everything in flight goes with them. The two sets are only the bookkeeping; the queue
     * of coordinates still to send and the chunks already produced but not yet dispatched
     * are the actual work, and they belong to the world being left. Left in place, a
     * dimension change sent the old world's terrain into the new one, and resolved the
     * leftover coordinates against a world where they mean somewhere else entirely.
     */
    public clearChunks(): void {
        this.chunks.clear();
        const abandonedBytes = this.chunkSendQueue.reduce((total, { memoryBytes }) => total + memoryBytes, 0);
        this.chunkSendQueue.length = 0;
        this.releaseChunkQueueBytes(abandonedBytes);

        // So the next `update` sees a chunk change and asks for terrain again, rather than
        // comparing against where the player stood in the world it just left.
        this.lastChunkX = null;
        this.lastChunkZ = null;
    }

    /**
     * The id the client will name a block's stack by, or null for an empty slot.
     *
     * A stack sent without one cannot be picked up: the server authoritative inventory has
     * nothing to name it by, so the click on a furnace's input never became a request.
     */
    private stackIdFor(item: Item): number | null {
        const id = this.own().getInventory().assignStackNetworkId(item);
        return id > 0 ? id : null;
    }

    /**
     * Tells the client what the player is carrying.
     *
     * The send was commented out, so the client was never told: it had no model of the
     * player's own slots, and the server authoritative inventory system will not move a stack
     * into a container it does not know. Every drag was refused on the client's side, before
     * an `ItemStackRequest` was ever sent.
     */
    public sendInventory(windowId: number = WindowIds.INVENTORY): Promise<void> {
        const player = this.own();
        const inventory = player.getInventory();
        // A client of another edition is handed plain stacks, which its presenter encodes.
        if (this.presenter.edition !== 'bedrock') return this.presenter.showInventory(shownInventoryOf(inventory));
        const context = this.connection.codec.context;
        // Every stack goes out with the id the client will name it by in its requests.
        inventory.assignStackNetworkIds();

        const pk = new InventoryContentPacket();
        pk.items = inventory
            .container('inventory')
            .items()
            .map((item) => ownSlotDescriptor(item, context));
        pk.windowId = windowId;
        const sends = [this.connection.sendDataPacket(pk)];

        sends.push(this.sendHandItem(wireStackOf(inventory.equipment('mainhand'))));

        // The armor container is a window of its own, so the main inventory's contents say
        // nothing about it and a player would open their screen to four empty slots. Its
        // `Full Container Name` has to say armor too: the packet defaults to the player's
        // combined hotbar and inventory, which named the wrong container for window 120.
        const armor = new InventoryContentPacket();
        armor.items = inventory
            .container('armor')
            .items()
            .map((item) => ownSlotDescriptor(item, context));
        armor.windowId = WindowIds.ARMOR;
        armor.containerId = ContainerUiId.ARMOR_CONTAINER;
        sends.push(this.connection.sendDataPacket(armor), this.sendArmorFor(this.shown()));
        return allSent(sends);
    }

    /**
     * Tells this client that one slot of a container it has open now holds something else.
     *
     * An `ItemStackResponse` only ever reaches the client that sent the request, so this is the
     * only way to tell the other players standing at the same chest that a stack has gone.
     *
     * @param windowId - The `Container Id` this client opened the block under, which is its own.
     * @param containerId - The `Container Name` the client numbers the slot by.
     * @param slot - The slot within that container.
     * @param item - What is in it now, or `null` to empty it.
     */
    public async sendContainerSlot(
        windowId: number,
        containerId: number,
        slot: number,
        item: Item | null
    ): Promise<void> {
        const packet = new InventorySlotPacket();
        packet.windowId = windowId;
        packet.containerId = containerId;
        packet.inventorySlot = slot;
        packet.item =
            item?.toStackDescriptor(
                this.connection.codec.context,
                item.stackNetworkId > 0 ? item.stackNetworkId : null
            ) ?? null;

        await this.connection.sendDataPacket(packet);
    }

    /**
     * Tells this client what one of its player's own slots holds now, under the stack network id
     * the client is to name it by. Replication sends it for a `slot-shown` occurrence: a slot
     * whose write was undone holds a stack with a new id.
     * @param container - The container, as an `inventory-slot` entry names it.
     * @param slot - The slot within that container.
     * @returns The send, or a settled promise for a container the client has no window for.
     */
    public sendOwnSlot(container: string, slot: number): Promise<void> {
        const named = entityContainerNamed(container);
        const window = named === undefined ? undefined : OWN_SLOT_WINDOWS[named];
        if (named === undefined || window === undefined) return allSent([]);

        const inventory = this.own().getInventory();
        if (this.presenter.edition !== 'bedrock') {
            const item = inventory.slotItem(named, slot);
            if (item === undefined || (named !== 'inventory' && named !== 'armor' && named !== 'offhand')) {
                return allSent([]);
            }
            return this.presenter.showOwnSlot(named, slot, shownStackOf(item));
        }
        inventory.assignStackNetworkIds();
        const item = inventory.slotItem(named, slot);
        if (item === undefined) return allSent([]);

        const packet = new InventorySlotPacket();
        packet.windowId = window.windowId;
        packet.containerId = window.containerId;
        packet.inventorySlot = slot;
        packet.item =
            item?.toStackDescriptor(
                this.connection.codec.context,
                item.stackNetworkId > 0 ? item.stackNetworkId : null
            ) ?? null;
        return this.connection.sendDataPacket(packet);
    }

    /**
     * Opens the player's own inventory, as the client asked.
     *
     * Under its own window id rather than under zero. Zero is the inventory the client always
     * has open; asking it to *open* that one is asking for something it is already doing, and
     * it answered by closing the window again straight away - which is as far as opening an
     * inventory ever got, so no drag inside it was ever attempted.
     *
     * The contents follow the open, because a window whose contents never arrive is one the
     * client has no reason to keep.
     * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/InventoryManager.php (onClientOpenMainInventory)
     */
    public openMainInventory(): Promise<void> {
        const packet = new ContainerOpenPacket();
        packet.windowId = this.nextWindowId();
        packet.containerType = WindowTypes.INVENTORY;
        // No position: a container an actor carries is named by the actor, not by a block.
        packet.containerEntityId = this.runtimeId;
        this.openWindows.set(packet.windowId, packet.containerType);
        return allSent([this.connection.sendDataPacket(packet), this.sendInventory(packet.windowId)]);
    }

    /**
     * Opens the screen a block draws, with whatever the block is holding.
     *
     * The one call the interaction path needs. Until this existed no block opened a container
     * anywhere in this server: a chest, a furnace and a crafting table all did nothing when
     * they were clicked, because `openMainInventory` was the only `ContainerOpen` ever sent.
     *
     * The contents follow the open for the same reason they do there: a window whose contents
     * never arrive is one the client has no reason to keep. Each packet uses the container name
     * that screen assigns to its slots, so a furnace's fuel list arrives under its fuel name.
     * A workstation stores nothing of its own, so no contents follow its open. A crafting table
     * is followed by the player's own inventory under window 0 instead, which is what a Bedrock
     * Dedicated Server 1.26.52 sent after a click on one. Repeated requests for the same open
     * block return the current window without sending another open packet.
     *
     * @param at - The block position, which is what `ContainerOpen` carries for a block.
     * @param identifier - The block standing there, which decides the screen.
     * @param contents - What the block holds, one entry per slot.
     * @returns The window it was opened under, or undefined when the block opens no screen.
     */
    public async openBlockContainer(
        at: Vector3,
        identifier: string,
        contents: readonly (Item | null)[] = []
    ): Promise<OpenBlockContainer | undefined> {
        const container = blockContainerOf(identifier);
        if (container === undefined) return undefined;

        const current = this.blockContainer;
        if (
            current?.identifier === identifier &&
            current.position.getX() === at.getX() &&
            current.position.getY() === at.getY() &&
            current.position.getZ() === at.getZ()
        ) {
            return current;
        }

        const packet = new ContainerOpenPacket();
        packet.windowId = this.nextWindowId();
        packet.containerType = container.screen;
        packet.containerPos = at;
        // -1 for a block's container, which is what the field means: the actor it belongs to,
        // and a block is not an actor.
        packet.containerEntityId = -1n;
        this.openWindows.set(packet.windowId, packet.containerType);
        // A fresh screen has been told nothing yet, so the next tick sends it everything.
        this.containerData.clear();
        const opened: OpenBlockContainer = {
            windowId: packet.windowId,
            position: at,
            identifier,
            screen: container.screen,
            inputs: [null, null, null],
            bookshelfPower: 0
        };
        this.blockContainer = opened;
        this.reportContainer(opened, true);

        try {
            await this.connection.sendDataPacket(packet);

            // What the caller read out of the block rather than what the block type says it holds:
            // a double chest is 54 entries from two block entities, which `blockContainerOf` does
            // not know about and the caller does.
            if (contents.length > 0) {
                const context = this.connection.codec.context;

                // Furnaces and brewing stands expose named containers for requests, but their
                // open packet is followed by one complete primary inventory. Sending one partial
                // content packet per named slot leaves clients without the window's full storage
                // model, so moves into those slots are rejected before a request is sent.
                if (COMBINED_BLOCK_CONTENT_SCREENS.has(container.screen)) {
                    const content = new InventoryContentPacket();
                    content.windowId = packet.windowId;
                    content.containerId = ContainerUiId.LEVEL_ENTITY_CONTAINER;
                    content.items = contents.map((held) => {
                        const item = wireStackOf(held);
                        return item.toStackDescriptor(context, this.stackIdFor(item));
                    });
                    await this.connection.sendDataPacket(content);
                } else {
                    // Screens with separate primary inventories name each complete slot list
                    // under the container the client uses for requests to that part of the screen.
                    const byContainer = new Map<number, (Item | null)[]>();
                    contents.forEach((held, slot) => {
                        const named = blockSlotName(container.screen, slot);
                        const slots = byContainer.get(named.containerId) ?? [];
                        slots[named.slotId] = held;
                        byContainer.set(named.containerId, slots);
                    });

                    for (const [containerId, slots] of byContainer) {
                        const content = new InventoryContentPacket();
                        content.windowId = packet.windowId;
                        content.containerId = containerId;
                        content.items = slots.map((held) => {
                            const item = wireStackOf(held);
                            return item.toStackDescriptor(context, this.stackIdFor(item));
                        });
                        await this.connection.sendDataPacket(content);
                    }
                }
            }

            // What a Bedrock Dedicated Server 1.26.52 sent after a click on a crafting table: the
            // open, then the player's inventory under window 0. The other workstations were not
            // recorded, and send nothing more until they are.
            if (container.screen === WindowTypes.WORKBENCH) await this.sendInventory();
        } catch (error) {
            this.openWindows.delete(packet.windowId);
            if (this.blockContainer === opened) this.blockContainer = current;
            throw error;
        }

        // Counted once the window is this session's, and again for the one it replaced.
        if (current !== undefined && current.trade === undefined) this.showLid(current);
        this.showLid(opened);

        return opened;
    }

    /**
     * Opens a villager's trade screen and shows it the trader's offers.
     *
     * The screen is a window like a block's: it has two payment slots the player's items go into
     * and a result the trade comes out of, and closing it gives the payment back. It differs in
     * being open on an actor, which the packet names, and in what follows the open: an
     * `UpdateTradePacket` carrying the offers, which the client draws the screen from.
     *
     * @param trade - The trader, where its offers come from and what happens when the player leaves.
     * @returns The window, or undefined when this session already has a trade open on that trader.
     */
    public async openTradeWindow(trade: OpenTrade): Promise<OpenBlockContainer | undefined> {
        if (this.blockContainer?.trade?.trader === trade.trader) return undefined;
        this.releaseTrade();

        const packet = new ContainerOpenPacket();
        packet.windowId = this.nextWindowId();
        packet.containerType = WindowTypes.TRADE;
        packet.containerPos = trade.trader.getPosition();
        packet.containerEntityId = trade.trader.getRuntimeId();
        this.openWindows.set(packet.windowId, packet.containerType);
        this.containerData.clear();
        const opened: OpenBlockContainer = {
            windowId: packet.windowId,
            position: trade.trader.getPosition(),
            identifier: trade.trader.getType(),
            screen: WindowTypes.TRADE,
            inputs: [null, null],
            bookshelfPower: 0,
            trade
        };
        this.blockContainer = opened;
        this.reportContainer(opened, true);

        try {
            await this.connection.sendDataPacket(packet);
            await this.sendTradeOffers(opened);
        } catch (error) {
            this.openWindows.delete(packet.windowId);
            if (this.blockContainer === opened) this.blockContainer = undefined;
            trade.release();
            throw error;
        }

        return opened;
    }

    /** Sends the open trade screen the trader's offers as they stand, after a trade or a restock. */
    public async sendTradeOffers(window: OpenBlockContainer | undefined = this.blockContainer): Promise<void> {
        const trade = window?.trade;
        if (window === undefined || trade === undefined) return;

        const context = trade.context();
        const offers = trade.source.offers(context);
        const packet = new UpdateTradePacket({
            containerId: window.windowId,
            type: WindowTypes.TRADE,
            size: offers.length,
            traderTier: trade.source.level - 1,
            entityUniqueId: trade.trader.getRuntimeId(),
            lastTradingPlayer: this.runtimeId,
            displayName: trade.title ?? trade.trader.getName(),
            useNewTradeScreen: true,
            usingEconomyTrade: true,
            data: tradeOffersPayload(offers, trade.source.tierRequirements())
        });
        await this.connection.sendDataPacket(packet);
    }

    /** Tells the trader the player has stopped trading, if a trade screen is open. */
    private releaseTrade(): void {
        const trade = this.blockContainer?.trade;
        if (trade === undefined) return;

        this.blockContainer = undefined;
        trade.release();
    }

    /** Shows the lid of a block container this session opened or closed in its current state. */
    private showLid(container: OpenBlockContainer): void {
        const at = container.position;
        showContainerLid(this.world, { x: at.getX(), y: at.getY(), z: at.getZ() }, container.identifier);
    }

    /** The block container this session has open, or undefined for none. */
    public getOpenBlockContainer(): OpenBlockContainer | undefined {
        return this.blockContainer;
    }

    /**
     * Sets properties on the open block container's screen, which is how a progress bar moves.
     *
     * A property whose value has not changed since the last send is skipped; see
     * `PlayerSession.containerData`. Nothing is sent when the screen was opened from a
     * different block, so a station ticking across the world cannot write over the screen the
     * player is actually looking at.
     *
     * @param at - The block the properties belong to.
     * @param properties - The property values by id, as the station reports them.
     */
    public sendContainerData(at: Vector3, properties: ReadonlyMap<number, number>): Promise<void> {
        const open = this.blockContainer;
        if (open === undefined) return allSent([]);
        if (
            open.position.getX() !== at.getX() ||
            open.position.getY() !== at.getY() ||
            open.position.getZ() !== at.getZ()
        ) {
            return allSent([]);
        }

        const sends: Promise<void>[] = [];
        for (const [id, value] of properties) {
            if (this.containerData.get(id) === value) continue;
            this.containerData.set(id, value);

            const packet = new ContainerSetDataPacket();
            packet.containerId = open.windowId;
            packet.id = id;
            packet.value = value;
            sends.push(this.send(packet));
        }
        return allSent(sends);
    }

    /**
     * Shows the open block container's screen what some of its slots hold now.
     *
     * For a change the block made itself, such as a furnace finishing an item, which no
     * `ItemStackResponse` reports. Each stack goes out under a stack network id of this
     * player's, as it does when the screen opens, so the client can still take it. Nothing is
     * sent when the screen was opened from a different block.
     *
     * @param at - The block whose slots changed.
     * @param slots - The changed slots, numbered as the block entity numbers them.
     */
    public sendBlockContainerSlots(at: Vector3, slots: readonly number[]): Promise<void> {
        const open = this.blockContainer;
        if (
            open === undefined ||
            open.position.getX() !== at.getX() ||
            open.position.getY() !== at.getY() ||
            open.position.getZ() !== at.getZ()
        ) {
            return allSent([]);
        }

        const held = openContainerSlots(this, { x: at.getX(), y: at.getY(), z: at.getZ() }, open.identifier);
        if (held === undefined) return allSent([]);

        const context = this.connection.codec.context;
        const sends = slots.map((slot) => {
            const named = blockSlotName(open.screen, slot);
            const item = wireStackOf(held.get(slot));
            const packet = new InventorySlotPacket();
            packet.windowId = open.windowId;
            packet.containerId = named.containerId;
            packet.inventorySlot = named.slotId;
            packet.item = item.toStackDescriptor(context, this.stackIdFor(item));
            return this.send(packet);
        });
        return allSent(sends);
    }

    /**
     * Forgets a window the client reports closed.
     *
     * The docs have the server delete its container manager when the client's `ContainerClose`
     * arrives, before answering it. Only a window this session opened can be closed here; any
     * other id is left alone and reported through the return value so the handler can log it.
     * @param {number} windowId - the `Container Id` the client sent.
     * @returns {boolean} whether a window with that id was open.
     */
    public closeWindow(windowId: number): boolean {
        const open = this.blockContainer;
        if (open?.windowId === windowId) {
            this.blockContainer = undefined;
            this.reportContainer(open, false);
            this.containerData.clear();
            if (open.trade === undefined) this.showLid(open);
            else open.trade.release();
        }

        return this.openWindows.delete(windowId);
    }

    /** Raises `playerContainer` for a block's or a trader's screen this session opened or closed. */
    private reportContainer(window: OpenBlockContainer, opened: boolean): void {
        const { events } = this.server.getKernel();
        if (!events.hasListeners('playerContainer')) return;
        const world = this.getWorld();
        const trader = window.trade?.trader;
        let owner: ContainerOwner;
        if (trader === undefined) {
            const x = window.position.getX();
            const y = window.position.getY();
            const z = window.position.getZ();
            const block = world.loadedBlockAt(x, y, z);
            owner = { block: { x, y, z, name: block?.name ?? window.identifier, states: block?.states ?? {} } };
        } else owner = { entity: { runtimeId: trader.getRuntimeId(), type: trader.getType() } };
        events.post('playerContainer', new PlayerContainerEvent(this, world, opened, owner));
    }

    /**
     * The next window id to open a container under.
     *
     * The range is not invented: `ContainerID` documents where a server's own windows begin
     * and end, and everything outside it is spoken for - zero is the player inventory, and
     * the hundreds are the armor, the offhand and the player-only UI. Wrapping keeps a long
     * session inside it.
     */
    private nextWindowId(): number {
        const span = WindowIds.LAST - WindowIds.FIRST + 1;
        this.windowId = ((this.windowId - WindowIds.FIRST + 1) % span) + WindowIds.FIRST;

        return this.windowId;
    }

    /**
     * Tells the client which recipes exist.
     *
     * Until it has these the client proposes nothing and never sends a `CRAFTING_RECIPE`, so
     * everything below this - the matcher, the stations, the grid - is invisible without it.
     *
     * The recipes come from the content build's recipe book, and a recipe's net id is its
     * position in that book, which is what an `ItemStackRequest` names it by. A build that
     * produced no payload sends nothing, so the client proposes nothing it cannot craft.
     *
     * How many go out is `crafting-recipe-limit` in the config: `0` sends nothing, `-1`
     * sends everything, and it starts at one. See there for why.
     */
    public async sendCraftingData(): Promise<void> {
        const limit = this.server.getConfig().getCraftingRecipeLimit();
        if (limit === 0) return;

        const content = this.server.getContent();
        const payloads = joinContentPayloads(content, this.server.getLogger(), {
            itemData: this.connection.codec.itemData
        });
        if (payloads === undefined || craftingRecipeCount(payloads.crafting) === 0) return;

        const all = craftingRecipeCount(payloads.crafting);
        const crafting = limit < 0 ? payloads.crafting : limitCraftingData(payloads.crafting, limit);

        await sendCachedJoinPacket(
            this.connection,
            content,
            limit,
            this.server.getConfig().getPacketCompressionLevel(),
            new CraftingDataPacket(crafting)
        );

        const sent = craftingRecipeCount(crafting);
        this.server.getLogger().debug(`Sent §b${sent}§r of §b${all}§r recipe(s) to ${this.identity.name}`);

        // After the recipes, so every entry the book names is one the client has.
        await showRecipeBook(this.keyed());
    }

    public async sendCreativeContents(empty = false): Promise<void> {
        if (empty) {
            await this.connection.sendDataPacket(new CreativeContentPacket({ groups: [], entries: [] }));
            return;
        }

        // The same list a creative pick is resolved through, so that the position the client
        // sends back names the entry it was shown. `creativePick` reads the same two sources
        // in the same order.
        const { server } = this;
        const content = server.getContent();
        const payloads = joinContentPayloads(content, server.getLogger(), {
            itemData: this.connection.codec.itemData
        });
        if (payloads === undefined) {
            const creative = server.getCreativeInventory();
            await this.connection.sendDataPacket(
                new CreativeContentPacket(creativeContentFrom(creative.getGroups(), creative.getEntries()))
            );
            return;
        }

        await sendCachedJoinPacket(
            this.connection,
            content,
            this.server.getConfig().getCraftingRecipeLimit(),
            this.server.getConfig().getPacketCompressionLevel(),
            new CreativeContentPacket(payloads.creative)
        );
    }

    /**
     * Sets the item in the player hand.
     * @param {Item} item - The entity.
     */
    public async sendHandItem(item: Item): Promise<void> {
        const slot = this.own().getInventory().getHandSlot();
        await this.connection.sendDataPacket(
            new MobEquipmentPacket({
                runtimeEntityId: this.runtimeId,
                item: item.toStackDescriptor(this.connection.codec.context),
                inventorySlot: slot,
                hotbarSlot: slot,
                windowId: WindowIds.INVENTORY
            })
        );
    }

    /**
     * Tells the client the time on the clock of the level its player is in: the time of day, the
     * game time and whether the day moves on.
     * @param level - The level, when the player is moving to another one.
     */
    public sendTime(level: Level = this.getWorld().getLevel()): Promise<void> {
        return this.presenter.sendTime({
            dayTime: level.getDayTime(),
            gameTime: level.getTicks(),
            advancing: level.isDayTimeAdvancing()
        });
    }

    /**
     * Send gamemode to a client.
     *
     * Async so that a player who has left rejects the promise rather than throwing at the call,
     * which the input step routes only as a rejection.
     * @param {Gametype} gamemode - the numeric gamemode ID.
     */
    public async sendGamemode(gamemode?: Gametype): Promise<void> {
        return this.presenter.sendGamemode(gamemode ?? this.own().gamemode);
    }

    /**
     * Tells this client which game type a player now has.
     *
     * The tick is this client's last input tick when the player is its own, so the client can
     * reconcile the movement it predicted while the change was in flight, and zero for anyone
     * else, as the docs allow.
     * @param {ShownPlayer} target - The player whose game type changed.
     */
    public async sendGameTypeFor(target: ShownPlayer): Promise<void> {
        const own = target.getRuntimeId() === this.runtimeId;
        await this.presenter.sendPlayerGameMode(target.getRuntimeId(), target.gamemode, own ? this.lastInputTick : 0n);
    }

    /**
     * The first sends of a game mode change: this client's own game type, and the game type every
     * client in the world caches for this player. Replication sends the metadata a game mode
     * decides, not the game type, so these are the sends. {@link PlayerSession.sendAbilityChange} follows them.
     */
    public sendGameTypeChange(): Promise<void> {
        return allSent([
            this.sendGamemode(),

            // Everyone in the world, this player included, caches each player's game type and
            // permission flags, so the docs have the server follow an accepted change with
            // `UpdatePlayerGameTypePacket` to every client.
            ...this.getWorld()
                .getViewers()
                .map(async (session) => session.sendGameTypeFor(this.shown()))
        ]);
    }

    /**
     * The last sends of a game mode change, which read off the new game mode: the settings, the
     * game type again, whether the player may fly, which is in its metadata, and its abilities.
     */
    public sendAbilityChange(): Promise<void> {
        const sends = [this.announceSettings(), this.sendGamemode()];

        // Whether the player may fly is in its metadata. In a store, replication sends it to the
        // player and everyone who sees them from the logged game mode.
        if (this.getActor() === undefined) sends.push(this.sendMetadata());

        // The abilities are read off the gamemode, so they are stale the moment it changes -
        // and they were never re-sent. Among them is `INSTABUILD`, which is what tells the
        // client it may help itself from the creative menu.
        sends.push(this.sendAbilities());
        return allSent(sends);
    }

    /**
     * Tells this client that game rules changed.
     * @param {GameRule[]} rules - The rules that changed, spelled as the client spells them.
     */
    public async sendGameRules(rules: GameRule[]): Promise<void> {
        const packet = new GameRulesChangedPacket();
        packet.rulesList = rules;
        await this.connection.sendDataPacket(packet);
    }

    public async sendNetworkChunkPublisher(distance: number, savedChunks: ChunkCoord[]): Promise<void> {
        const position = BlockPosition.fromVector3(this.own().getPosition());
        // Recorded before the send, in the order the packets reach the connection.
        const view: PublishedView = {
            x: toChunk(position.getX()),
            z: toChunk(position.getZ()),
            area: chunkViewArea(distance)
        };
        this.publishedView = view;
        for (const watcher of this.publishedViewWatchers) watcher.push(view);
        // An edition with its own wire centers its client's view its own way.
        if (this.presenter.chunkWire !== undefined) return this.presenter.chunkWire.center(view.x, view.z);
        const pk = new NetworkChunkPublisherUpdatePacket({
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            radius: distance << 4,
            savedChunks
        });
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Tells the client which commands this player may run and what each one takes.
     *
     * One `CommandData` per command, each branch of its tree an overload, with overloads that
     * come out the same folded into one. Only commands the player's permissions allow are
     * sent, so the list is built per recipient and sent again when those permissions change.
     *
     * The list is the command manager's one registry, already flattened into Bedrock's
     * overload shape by `@jsprismarine/commands`, which carries chained subcommands and
     * therefore the chained `/execute` tree.
     */
    public async sendAvailableCommands(): Promise<void> {
        const pk = new AvailableCommandsPacket();
        // The names `/ban` and `/pardon` complete from. The packet keeps the first soft enum of a
        // name it meets, so this one, with values, wins over the empty one a parameter names.
        const players = new CommandEnum();
        players.soft = true;
        players.name = PLAYER_SOFT_ENUM;
        players.values = this.server
            .getSessionManager()
            .getSessions()
            .map(({ identity }) => identity.name);
        pk.softEnums = [players];

        const commandManager = this.server.getCommandManager();
        const own = this.getCommandLevel();
        const sent = commandManager.getVanillaCommandList().filter((command) => {
            // A command above an operator's level is the console's alone, such as `addon`.
            if (command.permissionLevel > CommandPermissionLevel.OWNER) return false;
            // The console's by default, such as `restart`: offered only to a player whose entry
            // names the node, since the command refuses an operator's `*`.
            const consoleFirst = consoleFirstNodeOf(command.name);
            if (consoleFirst !== undefined) return namesNode(this, consoleFirst);
            // A script's command has no permission node: its level alone decides, as on BDS.
            if (commandManager.isScriptCommand(command.name)) return command.permissionLevel <= own;
            return this.server.getPermissionManager().can(this).execute(commandPermissionOf(command.name));
        });
        // The level the command declares, capped at the player's own: a
        // client hides a command whose level is above its own even though
        // the server would run it, which is what a player granted one
        // operator command by name would otherwise see.
        pk.commandData = sent.map((command) => commandDataOf(command, Math.min(command.permissionLevel, own)));
        // Without it the client offers no namespaced command, such as a script's `jsp:tpsbar`.
        pk.hardcodedEnums = [commandNameEnumOf(sent)];

        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * The world this session's player is in, which is the world its chunks are streamed from.
     *
     * During a dimension change it is the destination from the moment the player moves, while
     * the client may still be on its loading screen.
     * @returns The world.
     */
    public getWorld(): World {
        return this.world;
    }

    /**
     * The dimension of the world this session's player is in, as a client of another edition is
     * told it.
     * @returns The dimension.
     */
    public shownDimension(): ShownDimension {
        return { id: this.world.getDimension().id, seaLevel: this.world.getSeaLevel() };
    }

    /**
     * Where this client sees the world from: its player's eyes, the point chunk streaming,
     * entity tracking and a world's broadcasts measure from.
     * @returns The position.
     */
    public getViewPosition(): Vector3 {
        return this.own().getPosition();
    }

    /**
     * The chunk radius this client sees, as it asked for it, in chunks.
     * @returns The radius, or zero until the client's first `RequestChunkRadius`.
     */
    public getViewDistance(): number {
        return this.viewDistance;
    }

    /**
     * Where the player was placed on joining, or null when they came back to a saved position.
     */
    public getJoinSpawn(): PlayerSpawn | null {
        return this.joinSpawn;
    }

    /**
     * Records where the join placed the player, which the join packets report.
     * @param spawn - The placement, or null for a player who came back to a saved position.
     */
    public setJoinSpawn(spawn: PlayerSpawn | null): void {
        this.joinSpawn = spawn;
    }

    /**
     * Opens the window the client accepts chunks in and queues the chunks around the player, with
     * an initial view radius of {@link DEFAULT_VIEW_DISTANCE_CHUNKS}, as a join and a world change
     * start.
     */
    public sendInitialSpawnChunks(): Promise<void> {
        const position = this.own().getPosition();
        const centerX = CoordinateUtils.fromBlockToChunk(position.getX());
        const centerZ = CoordinateUtils.fromBlockToChunk(position.getZ());
        const minX = centerX - DEFAULT_VIEW_DISTANCE_CHUNKS;
        const minZ = centerZ - DEFAULT_VIEW_DISTANCE_CHUNKS;
        const maxX = centerX + DEFAULT_VIEW_DISTANCE_CHUNKS;
        const maxZ = centerZ + DEFAULT_VIEW_DISTANCE_CHUNKS;

        const savedChunks: ChunkCoord[] = [];
        for (let chunkX = minX; chunkX <= maxX; ++chunkX) {
            for (let chunkZ = minZ; chunkZ <= maxZ; ++chunkZ) {
                // TODO: vanilla does not send all of them, but in a range
                // for example it does send them from x => [-3; 3] and z => [-3; 2]
                savedChunks.push({ x: chunkX, z: chunkZ });
            }
        }

        // One update to open the window the client will accept chunks in. It lists nothing:
        // `saved_chunks` describes chunks already sent, and at this point none have been.
        // The session re-sends this every tick that carries chunks, keeping it centered on
        // the player as they move.
        const publisher = this.sendNetworkChunkPublisher(DEFAULT_VIEW_DISTANCE_CHUNKS, []);

        // Queued, not sent: the player joins immediately and the world fills in around them
        // from the middle outwards, instead of everyone waiting while 81 chunks are built.
        this.queueChunks(
            centerX,
            centerZ,
            savedChunks.map((coord): [number, number] => [coord.x, coord.z])
        );
        return publisher;
    }

    /**
     * Finishes bringing this session's player into the game: position, gamemode, inventory,
     * settings, and the attributes, metadata and status effects the spawning client threw away.
     * @remarks Named apart from `StorePlayerActor.spawnTo` on purpose. This used to be called
     * `sendSpawn`, overriding the entity method of that name with a different signature and
     * an unrelated meaning - one is "put me into the world", the other is "show me to
     * somebody". Adding a player to a world therefore ran this by accident.
     */
    public completeSpawn(): Promise<void> {
        const actor = this.getActor();
        const sends = actor === undefined ? [] : [this.world.broadcastMove(actor)];
        sends.push(this.setGamemode(), this.sendInventory(), this.announceSettings());

        // Sent again here, not only during the join sequence: the client throws away the
        // local player it had while it is spawning, taking health, hunger and breath with it.
        sends.push(this.sendAttributes(), this.sendMetadata(), this.sendStatusEffects(this.shown()));
        return allSent(sends);
    }

    /**
     * Set the client's maximum view distance.
     *
     * @param distance - The view distance
     */
    public async setViewDistance(distance: number): Promise<void> {
        this.viewDistance = distance;
        const packet = new ChunkRadiusUpdatedPacket({ radius: distance });
        await (this.presenter.chunkWire?.radius(distance) ?? this.connection.sendDataPacket(packet));
        // The request is applied in an input step, and a removal later in the same step, such as
        // a login of the same account replacing this one, can take the player off meanwhile.
        if (!this.isConnected()) return;

        // A retail client discards every LevelChunk that reaches it before it has asked for a
        // radius and been answered with the ChunkRadiusUpdated above - that exchange is the
        // handshake that opens the window it will accept terrain in. So the spawn chunks and the
        // PlayerSpawn status wait for the first radius request, here, rather than going out in
        // the join burst. Sending them earlier left a real client with a radius but no terrain:
        // it threw the early chunks away, was never sent them again, and sat at world generation
        // without ever sending SetLocalPlayerAsInitialized. The server's own client tolerated the
        // wrong order, which is why nothing here was ever caught. A later radius change just tops
        // the chunks up.
        if (this.spawnChunksSent) {
            await this.needNewChunks();
            return;
        }

        this.spawnChunksSent = true;
        this.spawnChunksPending = true;
        await this.sendInitialSpawnChunks();

        // Nothing queued - there is no flush coming that would do it, so announce here.
        await this.announceSpawnIfReady();
    }

    /**
     * Answers a respawn change with the two `Respawn` states once its terrain is on the wire.
     * Called whenever a batch of chunks lands, and when the change is made.
     */
    private answerRespawnIfReady(): Promise<void> {
        const at = this.pendingRespawnAnswer;
        if (at === undefined) return allSent([]);
        if (this.chunks.isLoading() || this.chunkSendQueue.length > 0) return allSent([]);

        this.pendingRespawnAnswer = undefined;
        return allSent([
            this.sendRespawn(at, PlayerRespawnState.SEARCHING_FOR_SPAWN),
            this.sendRespawn(eyePositionAt(at), PlayerRespawnState.READY_TO_SPAWN)
        ]);
    }

    /**
     * Tells the client it has spawned, once the terrain it spawns into is actually on the wire.
     *
     * The order is taken from a Bedrock Dedicated Server 1.26.51: it answers `RequestChunkRadius`
     * with `ChunkRadiusUpdated`, streams every spawn chunk, and only then sends
     * `PlayStatus(PlayerSpawn)` - with the entity spawns after that again. This server sent the
     * status first and the entities before any terrain, which tells a real client it has spawned
     * into a world it has no ground for: it waits, never sends `SetLocalPlayerAsInitialized`, and
     * drops the connection. The server's own client did not care about any of it.
     */
    private async announceSpawnIfReady(): Promise<void> {
        if (!this.spawnChunksPending) return;
        if (this.chunks.isLoading() || this.chunkSendQueue.length > 0) return;

        this.spawnChunksPending = false;
        await this.sendPlayStatus(PlayStatus.PlayerSpawn);
        await this.reconcileTrackedEntities();
    }

    /**
     * Send the player's whole attribute set.
     *
     * The client rebuilds the local player during the spawn sequence, so this has to be sent
     * again once the player is in the world - anything sent before that is thrown away, which
     * is why the hunger bar sat empty however correct the values were here.
     * @param {Attributes} [attributes] - The attributes to send, the player's own by default.
     */
    public sendAttributes(attributes: Attributes = this.own().attributes): Promise<void> {
        const sent = this.sendAttributeList(attributes.getAttributes());
        attributes.clearDirty();
        return this.dirtyUnlessSent(attributes, sent);
    }

    /**
     * Send only the attributes that changed since the last sync, if any.
     *
     * Called every tick from the player's update: a value nothing tells the client about is
     * a value that only exists on the server.
     */
    public syncAttributes(): Promise<void> {
        const { attributes } = this.own();
        const dirty = attributes.getDirty();
        if (dirty.length === 0) return allSent([]);

        const sent = this.sendAttributeList(dirty);
        attributes.clearDirty();
        return this.dirtyUnlessSent(attributes, sent);
    }

    /**
     * Marks the attributes changed again when their send fails to frame, so the next sync sends
     * them: cleared only on success, a value that did not change again would stay stale on the
     * client. Every attribute, since the set is small and a full list is what the client accepts.
     */
    private dirtyUnlessSent(attributes: Attributes, sent: Promise<void>): Promise<void> {
        return sent.catch((error: unknown) => {
            attributes.markAllDirty();
            throw error;
        });
    }

    private async sendAttributeList(attributes: Attribute[]): Promise<void> {
        await this.sendAttributesFor(this.shown(), attributes);
    }

    /**
     * Tell this client about *another* entity's changed attributes.
     *
     * The gap that made mob combat invisible. Everything above sends the local player's own
     * attributes, with their runtime id baked in, so a mob losing health changed a number on the
     * server that no client was ever told about - the health bar over a hurt zombie never moved,
     * and it died in one apparent hit from full. Attributes only reached a client once, inside
     * the `AddActorPacket` that spawned the entity.
     * @param entity - Whose attributes these are.
     * @param {Attribute[]} attributes - The ones that changed; nothing is sent for an empty list.
     */
    public async sendAttributesFor(entity: Pick<ShownActor, 'getRuntimeId'>, attributes: Attribute[]): Promise<void> {
        if (attributes.length === 0) return;
        // A client of another edition is shown its own vitals as plain values; other entities'
        // attributes come with their replication there.
        if (this.presenter.edition !== 'bedrock') {
            if (entity.getRuntimeId() !== this.runtimeId) return;
            const own = this.own().attributes;
            const names = attributes.map((attribute) => attribute.getName());
            const shown: Promise<void>[] = [];
            if (names.some((name) => VITAL_ATTRIBUTES.has(name))) shown.push(this.presenter.showVitals(vitalsOf(own)));
            if (names.some((name) => EXPERIENCE_ATTRIBUTES.has(name)))
                shown.push(this.presenter.showExperience(experienceOf(own)));
            await Promise.all(shown);
            return;
        }

        const packet = new UpdateAttributesPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.attributes = attributes;
        // `PlayerInputTick`: the client's last input tick for its own player, zero for anything
        // that is not the player, as the docs ask. See {@link PlayerSession.recordInputTick}.
        packet.tick = entity.getRuntimeId() === this.runtimeId ? this.lastInputTick : 0n;
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Remember the tick of a `PlayerAuthInputPacket` just handled, so packets about this player
     * can carry it as their `PlayerInputTick`.
     *
     * Ticks only move forward; an input that arrives out of order does not wind the value back.
     * @param {bigint} tick - The packet's `Tick` field.
     */
    public recordInputTick(tick: bigint): void {
        this.inputCount += 1;
        if (tick > this.lastInputTick) this.lastInputTick = tick;
    }

    /**
     * How many `PlayerAuthInputPacket`s were handled for this client: one per tick of its own
     * simulation, as the client sends one an input tick.
     *
     * A clock in the client's ticks that the server counts itself. It keeps running while the
     * server skips ticks to catch up, which the server's tick counter does not, and the client
     * cannot move it on without sending the inputs, unlike the `Tick` field each input claims.
     */
    public handledInputs(): number {
        return this.inputCount;
    }

    /**
     * Hands out the `Loading Screen Id` for a `ChangeDimensionPacket` about to be sent, and
     * remembers it until {@link PlayerSession.endLoadingScreen} hears the client close that
     * screen.
     * @returns A uint32 no other open screen on this session uses.
     */
    public beginLoadingScreen(): number {
        const id = this.nextLoadingScreenId;
        this.nextLoadingScreenId = (id + 1) >>> 0;
        this.openLoadingScreens.add(id);
        return id;
    }

    /**
     * Records that the client closed a loading screen.
     * @param {number} id - The `Loading Screen Id` from the client's `ServerboundLoadingScreenPacket`.
     * @returns Whether the id belonged to a screen this session had opened and not yet closed.
     */
    public endLoadingScreen(id: number): boolean {
        return this.openLoadingScreens.delete(id);
    }

    /**
     * Moves the player to another world and walks the client through the dimension change.
     *
     * Server side first: the record is saved to the world being left, stamped with that
     * world's dimension, the player leaves its roster, the old world's entities come off the
     * client, the chunk bookkeeping is cleared, the position moves, and the player joins the
     * new roster. Then the wire sequence Dragonfly, Geyser and Nukkit agree on: one
     * `ChangeDimension` with the target's Bedrock id, `StopSound` for everything playing,
     * `NetworkChunkPublisherUpdate` at the arrival, the server-sent `PlayerAction
     * ChangeDimensionAck`, the arrival chunks, and `PlayStatus PlayerSpawn`. The change stays
     * pending, and the client's `PlayerAuthInput` is dropped, until the client closes the
     * screen with the id this handed out: see {@link PlayerSession.completeDimensionChange}.
     *
     * A client sent `ChangeDimension` to the dimension it is already in never closes the
     * screen, so a move between two worlds of the same Bedrock id detours through another
     * dimension first.
     *
     * A second arrival while a change is pending is held until the client closes the first
     * screen, then carried out; only the latest is kept. A caller whose arrival goes stale
     * while it waits, such as a portal, instead passes `whenPending: 'drop'`: the
     * player is still ticked on the loading screen, and one who arrived inside the exit portal
     * would otherwise be sent back once the 10 tick cooldown ran out, before the client ever
     * closed the first screen. Custom dimension ids are sent after the level announces them in
     * `DimensionData`.
     *
     * Every write is made and every packet queued before this returns, so the input step that
     * runs it waits for nothing. The record's save is handed to work outside the tick.
     * @param arrival - The world, feet position and rotation the player lands at.
     * @param options - What to do with this arrival when a change is already pending, and what
     *   follows the change: `then` runs once the change is carried out, so a held change takes it
     *   along and a dropped one drops it. `holdArrival` opens the client's loading screen at a
     *   provisional arrival and keeps its columns back until {@link PlayerSession.landHeldArrival}
     *   names where the player really lands, for a destination still being prepared.
     * @returns Settles once the transport has framed the packets.
     */
    public changeWorld(
        arrival: Arrival,
        options: {
            readonly whenPending?: 'queue' | 'drop';
            readonly then?: () => void;
            readonly holdArrival?: boolean;
        } = {}
    ): Promise<void> {
        const player = this.getPlayer();
        const { world } = arrival;
        const target = world.getDimension();

        const pending = this.pendingChange;
        if (pending !== undefined) {
            const queue = (options.whenPending ?? 'queue') === 'queue';
            if (queue) this.queuedChange = { arrival, then: options.then };
            this.server
                .getLogger()
                .debug(
                    `${queue ? 'Holding' : 'Dropped'} the move of ${this.identity.name} to ${world.getName()}: a change to ${pending.arrival.world.getName()} is pending on loading screen ${pending.loadingScreenId}`
                );
            return allSent([]);
        }
        // A dead client can leave the screen of a change sent under its death screen unopened, so
        // the change stayed pending for the whole timeout and held every later move behind it.
        // It waits for the respawn instead: see {@link PlayerSession.releaseChangeHeldOverDeath}.
        // The respawn's own change runs while the player is still dead, and is not held.
        if (player.getHealth() <= 0 && arrival.closesLoadingScreen !== false) {
            const queue = (options.whenPending ?? 'queue') === 'queue';
            if (queue) this.queuedChange = { arrival, then: options.then };
            this.server
                .getLogger()
                .debug(
                    `${queue ? 'Holding' : 'Dropped'} the move of ${this.identity.name} to ${world.getName()}: they are dead`
                );
            return allSent([]);
        }
        const from = this.world;
        const left = from.getDimension();
        const eyesBefore = player.getPosition();
        const feetBefore = new Vector3(eyesBefore.getX(), eyesBefore.getY() - EYE_HEIGHT, eyesBefore.getZ());

        // The cracks belong to a block in the world being left.
        this.stopMining();
        const sends: Promise<void>[] = [];

        // The record goes to the level being left while the player is still in it, so it
        // carries that world's dimension and the next login finds them where they were should
        // nothing save them again. The record is built here and written off the tick.
        void from.savePlayerData(player).catch((error: unknown) => this.server.getLogger().error(error));

        // Out of the old world first, so it stops broadcasting to us and its players are told
        // we left. Then the old world's entities come off this client, before `addPlayer`
        // below fills the tracker with the new world's.
        from.removePlayer(this);
        sends.push(this.despawnAllTrackedEntities());
        this.clearChunks();

        // The arrival is feet; the position a player holds is their eyes, like everything their
        // client reports. Raised here and nowhere else, so the stored position, the packet and
        // the teleport that closes the change agree. Written in as feet, the player would
        // stand 1.62 blocks down in the arrival floor.
        const eyes = eyePositionAt(arrival.position);

        // Not broadcast: nobody in the new world sees the player yet, and the client's own
        // teleport waits for the screen to close.
        sends.push(
            this.setPlayerPosition(
                {
                    position: Position.fromVector3(eyes, world),
                    type: 'teleport',
                    pitch: arrival.pitch,
                    yaw: arrival.yaw,
                    headYaw: arrival.yaw
                },
                false
            )
        );
        world.addPlayer(this);

        // A client of another edition has no loading screen to close: it is spawned again into
        // the new world, and the change is complete at once.
        if (this.presenter.edition !== 'bedrock') {
            sends.push(
                this.presenter.showRespawn({
                    gamemode: player.gamemode,
                    dimension: this.shownDimension(),
                    feet: { x: arrival.position.getX(), y: arrival.position.getY(), z: arrival.position.getZ() },
                    keepData: arrival.respawn !== true,
                    replacesWorld: left.id === target.id
                })
            );
            // A death's respawn is moved into place by the respawn that follows.
            if (arrival.closesLoadingScreen !== false) sends.push(this.arrived(world, left.name));
            this.postDimensionChanged(from, feetBefore, arrival, left.name);
            options.then?.();
            return allSent(sends);
        }

        if (left.bedrockId === target.bedrockId) sends.push(this.detourFrom(target.bedrockId, eyes));

        const loadingScreenId = this.beginLoadingScreen();
        // A death's respawn change is not pending: the client does not close a loading screen for
        // it, the `Respawn` exchange that follows settles it. Held as pending, it blocked every
        // later change, a `/tp` into another dimension among them, for the whole timeout.
        if (arrival.closesLoadingScreen !== false) {
            this.pendingChange = {
                loadingScreenId,
                arrival,
                left: left.name,
                sinceTick: this.server.getTick(),
                ...(options.holdArrival === true ? { awaitingArrival: true } : {})
            };
        }
        sends.push(
            this.send(
                new ChangeDimensionPacket({
                    dimension: target.bedrockId,
                    position: eyes,
                    respawn: arrival.respawn ?? false,
                    loadingScreenId
                })
            )
        );

        const stopSound = new StopSoundPacket();
        stopSound.stopAllSounds = true;
        sends.push(this.send(stopSound));

        sends.push(this.sendNetworkChunkPublisher(effectiveViewDistance(this.viewDistance), []));

        // Since 1.19.50 the server sends the acknowledgment that used to be the client's, and
        // sends it before any chunk; the client still answers with its own copy afterwards.
        sends.push(
            this.send(
                new PlayerActionPacket({
                    runtimeEntityId: this.runtimeId,
                    action: PlayerActionType.ChangeDimensionAck,
                    blockPosition: NO_BLOCK,
                    resultPosition: NO_BLOCK,
                    blockFace: 0
                })
            )
        );

        sends.push(this.sendInitialSpawnChunks());
        sends.push(this.sendPlayStatus(PlayStatus.PlayerSpawn));
        this.postDimensionChanged(from, feetBefore, arrival, left.name);
        options.then?.();
        return allSent(sends);
    }

    /** Raises `playerDimensionChanged` for a change of world that also changed the dimension. */
    private postDimensionChanged(from: World, feetBefore: Vector3, arrival: Arrival, left: string): void {
        if (left === arrival.world.getDimension().name) return;
        this.server
            .getKernel()
            .events.post(
                'playerDimensionChanged',
                new PlayerDimensionChangedEvent(this, from, feetBefore, arrival.world, arrival.position)
            );
    }

    /**
     * The four-step detour for a change between two worlds of the same Bedrock id: the
     * current id, another, that other again, and back, each with its own screen and spawn
     * status, ahead of the real `ChangeDimension`. It is what a change of world sent for every
     * change before dimensions existed, kept for the one case where the client would
     * otherwise never close the screen.
     * @param position - The eyes the real `ChangeDimension` carries.
     */
    private detourFrom(bedrockId: number, position: Vector3): Promise<void> {
        const away = bedrockId === Dimension.NETHER ? Dimension.OVERWORLD : Dimension.NETHER;
        const sends: Promise<void>[] = [];
        for (const dimension of [bedrockId, away, away]) {
            sends.push(
                this.send(
                    new ChangeDimensionPacket({
                        dimension,
                        position,
                        respawn: false,
                        loadingScreenId: this.beginLoadingScreen()
                    })
                )
            );
            sends.push(this.sendPlayStatus(PlayStatus.PlayerSpawn));
        }
        return allSent(sends);
    }

    /**
     * Files the change {@link PlayerSession.changeWorld} held while the player was dead, for the
     * next input step. Called by the respawn once the client is told its player
     * is alive. A change still pending, the respawn's own included, files the held one when it
     * closes instead.
     */
    public releaseChangeHeldOverDeath(): void {
        if (this.pendingChange !== undefined) return;
        this.fileQueuedChange();
    }

    /**
     * Files the change {@link PlayerSession.changeWorld} held, as a message the next input step
     * carries out through `DimensionTravel.move`, so whoever releases it waits for nothing.
     */
    private fileQueuedChange(): void {
        const queued = this.queuedChange;
        this.queuedChange = undefined;
        if (queued !== undefined) this.server.getDimensionTravel().move(this, queued.arrival, queued.then);
    }

    /**
     * The world change the client has not yet finished loading into, or undefined when the
     * player is settled. While one is pending, the client's positions are still the old
     * world's and `PlayerAuthInputHandler` drops them.
     */
    public pendingDimensionChange(): PendingDimensionChange | undefined {
        return this.pendingChange;
    }

    /**
     * Rolls the end credits on the client and holds the arrival until they finish.
     *
     * Sent on a player's first exit through the End's portal. The world change waits for the
     * client's `ShowCredits Finished` rather than going out under the credits screen, because
     * a `ChangeDimension` during the credits has not been verified against a retail client
     * (open question 4 of the End dragon fight plan); Java holds its transfer the same way,
     * on the `PERFORM_RESPAWN` exchange. While the arrival is held, the client's
     * `PlayerAuthInput` is dropped, as during a pending dimension change. The held change is
     * completed by {@link PlayerSession.completeCredits}. A disconnect in between strands
     * nobody: the player record already carries `seenCredits`, so the next join finds the
     * player still in the End, standing in the portal, and transfers them at once.
     *
     * A second start while one is pending is logged at debug and dropped, like a second
     * `changeWorld`.
     * @param arrival - Where the player lands once the credits are over.
     * @returns Settles once the transport has framed the packet, which is queued before this returns.
     */
    public startCredits(arrival: Arrival): Promise<void> {
        if (this.pendingCredits !== undefined) {
            this.server
                .getLogger()
                .debug(`Refused to roll the credits for ${this.identity.name}: they are already rolling`);
            return allSent([]);
        }

        this.pendingCredits = arrival;
        const packet = new ShowCreditsPacket();
        packet.playerRuntimeId = this.runtimeId;
        packet.creditsState = CreditsState.Start;
        return this.send(packet);
    }

    /**
     * Finishes held credits: the full dimension change sequence to the held arrival, sent as
     * a respawn, which is how Java's `PlayerList.respawn(player, true, ...)` answers the
     * credits. Called by `ShowCreditsHandler` when the client reports the credits finished.
     *
     * The change is a message: it runs at the next input step through `DimensionTravel.move`,
     * so the handler that reports the finish waits for nothing.
     * @returns Whether credits were pending. A finish with none pending changes nothing.
     * @javaSource PlayerList.respawn
     */
    public completeCredits(): boolean {
        const arrival = this.pendingCredits;
        if (arrival === undefined) return false;

        this.pendingCredits = undefined;
        this.server.getDimensionTravel().move(this, { ...arrival, respawn: true, closesLoadingScreen: false }, () => {
            // A respawn change is settled by the respawn exchange, as after a death: the client
            // waits for where it comes back and shows its loading screen until it is told, so
            // without it the client sat there until the server gave up on it a minute later. It
            // goes out once the terrain is on the wire: told sooner, the client stands the
            // player in a world with no ground and falls through it.
            this.pendingRespawnAnswer = arrival.position;
            this.released(this.answerRespawnIfReady());
        });
        return true;
    }

    /**
     * The arrival held while the credits roll on the client, or undefined when none are.
     * While one is held, the client's `PlayerAuthInput` is dropped, as it is during a pending
     * dimension change.
     */
    public pendingCreditsArrival(): Arrival | undefined {
        return this.pendingCredits;
    }

    /**
     * Lets the columns of a pending dimension change go out, once the client says it has opened
     * that change's loading screen, and sends the ones already waiting.
     *
     * Until then they are held. A client that decodes a column before it has switched dimension
     * files it under the dimension it is leaving and drops it at the switch, then waits on its
     * loading screen for a column the server believes it has: cinnabar did this on about one full
     * e2e run in two. The client reports the screen open only after its switch has begun, so a
     * column sent from then on lands in the new dimension. Sending the lost ones again is not a
     * remedy: in sub chunk request mode a second `LevelChunk` resets the column the client holds,
     * and a player standing on it falls through. `ARRIVAL_HOLD_TICKS` bounds the wait for a
     * client that never reports the screen.
     * @param loadingScreenId - The id the client's `StartLoadingScreen` carried.
     * @returns Whether this released the pending change's columns. Any other id changes nothing.
     */
    public releaseArrivalChunks(loadingScreenId: number): Promise<boolean> {
        const pending = this.pendingChange;
        if (pending === undefined || pending.loadingScreenId !== loadingScreenId || pending.arrivalReleased === true) {
            return Promise.resolve(false);
        }
        pending.arrivalReleased = true;
        return this.flush().then(() => true);
    }

    /** Whether a pending dimension change is holding its columns back. */
    private holdsArrivalChunks(): boolean {
        const pending = this.pendingChange;
        return pending !== undefined && (pending.arrivalReleased !== true || pending.awaitingArrival === true);
    }

    /**
     * Whether the pending dimension change was opened with `holdArrival` and still waits for
     * {@link PlayerSession.landHeldArrival}.
     * @param loadingScreenId - The change's loading screen, so a caller holding an older change
     *   does not land a newer one.
     */
    public awaitsArrival(loadingScreenId: number): boolean {
        const pending = this.pendingChange;
        return pending !== undefined && pending.loadingScreenId === loadingScreenId && pending.awaitingArrival === true;
    }

    /**
     * Lands a change {@link PlayerSession.changeWorld} opened with `holdArrival`, once its
     * destination is ready.
     *
     * The client has been on the loading screen since the change went out, with every column
     * held. The player moves to where they really land, without a broadcast, as the change
     * placed them; when that is another column, the chunks queued around the provisional
     * arrival are dropped and the ones around this one queued instead. The columns then go out
     * if the client has opened the screen, and on its report otherwise, and the teleport that
     * closes the change carries this position. The loading screen timeout starts now.
     * @param loadingScreenId - The change's loading screen.
     * @param arrival - Where the player lands, in the world the change took them to.
     * @returns Settles once the transport has framed what this queued, the released columns
     *   included; false when no change of that screen waits for its arrival, or the arrival names
     *   another world, and nothing changed.
     */
    public landHeldArrival(loadingScreenId: number, arrival: Arrival): Promise<boolean> {
        const pending = this.pendingChange;
        if (!this.awaitsArrival(loadingScreenId) || pending === undefined || arrival.world !== this.world) {
            return Promise.resolve(false);
        }

        const sends: Promise<void>[] = [];
        const eyes = eyePositionAt(arrival.position);
        const before = this.own().getPosition();
        const moved =
            CoordinateUtils.fromBlockToChunk(before.getX()) !== CoordinateUtils.fromBlockToChunk(eyes.getX()) ||
            CoordinateUtils.fromBlockToChunk(before.getZ()) !== CoordinateUtils.fromBlockToChunk(eyes.getZ());
        sends.push(
            this.setPlayerPosition(
                {
                    position: Position.fromVector3(eyes, arrival.world),
                    type: 'teleport',
                    pitch: arrival.pitch,
                    yaw: arrival.yaw,
                    headYaw: arrival.yaw
                },
                false
            )
        );
        if (moved) {
            this.clearChunks();
            sends.push(this.sendInitialSpawnChunks());
        }

        this.pendingChange = {
            ...pending,
            arrival: { ...pending.arrival, position: arrival.position, yaw: arrival.yaw, pitch: arrival.pitch },
            sinceTick: this.server.getTick(),
            awaitingArrival: false
        };
        // Chunk delivery, which the caller hands to work outside the tick rather than waiting for.
        if (pending.arrivalReleased === true) sends.push(this.flush());
        return allSent(sends).then(() => true);
    }

    /**
     * Finishes a pending world change once the client reports its loading screen closed.
     *
     * Teleports the client to the exact arrival position, re-sends the attributes and the
     * inventory, which a dimension change is not known to keep, tells the client where its
     * spawn point is from the new dimension, and raises the changed dimension advancement
     * hook, in that order. A change held while this one was pending is filed last, as a message
     * the next input step carries out. Called by `ServerboundLoadingScreenHandler` in its unit,
     * and by the tick for a client that never closed the screen. Every packet is queued before
     * this returns.
     * @param loadingScreenId - The id the client's `EndLoadingScreen` carried.
     * @returns Whether a change was pending under that id. Any other id changes nothing.
     */
    public completeDimensionChange(loadingScreenId: number): boolean {
        const pending = this.pendingChange;
        if (pending === undefined || pending.loadingScreenId !== loadingScreenId) return false;
        this.pendingChange = undefined;
        this.released(this.arrived(pending.arrival.world, pending.left));
        this.fileQueuedChange();
        return true;
    }

    /**
     * What ends a change of world once the client is in the new one: the teleport to the exact
     * arrival, the attributes, the inventory and the spawn point again, and the changed
     * dimension advancement hook. Every packet is queued before this returns.
     * @param world - The world the player arrived in.
     * @param left - The name of the dimension the player left.
     */
    private arrived(world: World, left: string): Promise<void> {
        const sends = [this.sendMove(this.shown(), 'teleport'), this.sendAttributes(), this.sendInventory()];
        // The compass and the map point at the spawn across dimensions, so the client needs
        // the spawn's dimension again now that its own has changed. The level knows its spawn
        // once anybody has joined it; before that it is searched outside the tick, and the
        // packet follows the search.
        const spawn = knownOverworldSpawnOf(world);
        sends.push(
            spawn === null
                ? outsideTick(() => overworldSpawnOf(world)).then((found) =>
                      // A later change, or a disconnect, may have come first: the packet names this
                      // world's level, and would overwrite what the client shows for the newer one.
                      this.isConnected() && this.world === world
                          ? this.send(playerSpawnPositionPacket(this.getPlayer(), world, found))
                          : undefined
                  )
                : this.send(playerSpawnPositionPacket(this.getPlayer(), world, spawn))
        );
        advancementChangedDimension(this, left, world.getDimension().name);
        return allSent(sends);
    }

    /**
     * Hand the client a velocity and let it move the player itself.
     *
     * The only way to shove a player. Their position is theirs - the server stores what it is
     * told - so setting it from here is overruled by the next movement packet and read as
     * rubber-banding. A velocity is a request the client is happy to honor.
     *
     * The `Tick` is the client's last input tick, as the docs ask for a packet about the
     * player: the client rewinds to that tick, applies the velocity and replays what it
     * predicted since. See {@link PlayerSession.recordInputTick}.
     * @param {Vector3} motion - Blocks per tick, in each axis.
     */
    public async sendMotion(motion: Vector3): Promise<void> {
        const packet = new SetActorMotionPacket();
        packet.runtimeEntityId = this.runtimeId;
        packet.motion = motion;
        packet.tick = this.lastInputTick;
        await this.connection.sendDataPacket(packet);
    }

    public async sendMetadata(metadata?: Metadata): Promise<void> {
        await this.sendMetadataFor(this.shown(), metadata);
    }

    /**
     * Tell this client what *another* entity now looks like.
     *
     * The same gap `sendAttributesFor` fills, for the other half of an entity's state: everything
     * above had the local player's runtime id baked in, so metadata reached a client exactly once,
     * inside the packet that spawned the entity. A creeper could light its fuse, a mob could catch
     * fire, and nobody would ever see either.
     * @param entity - Whose metadata this is.
     * @param {Metadata} [metadata] - What to send; the entity's own by default.
     */
    public async sendMetadataFor(
        entity: Pick<ShownActor, 'getRuntimeId' | 'metadata' | 'getSyncedProperties'>,
        metadata?: Metadata
    ): Promise<void> {
        const packet = new SetActorDataPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.metadata = metadata ?? entity.metadata;
        packet.syncedProperties = entity.getSyncedProperties();
        // `PlayerInputTick`: the client's last input tick for its own player, zero for anything
        // that is not the player, as the docs ask. See {@link PlayerSession.recordInputTick}.
        packet.tick = entity.getRuntimeId() === this.runtimeId ? this.lastInputTick : 0n;
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Tells the client its player is alive again, as a Bedrock Dedicated Server 1.26.52 does
     * when the respawn button is pressed: `ActorEvent(SPAWN_ALIVE)` for the player, its
     * health, then its attributes and actor data.
     *
     * No `MovePlayer`: the client has put itself at the `ReadyToSpawn` position already.
     */
    public sendRespawned(): Promise<void> {
        const player = this.own();
        const event = new ActorEventPacket();
        event.runtimeEntityId = this.runtimeId;
        event.event = ActorEvent.SPAWN_ALIVE;
        const sends = [this.connection.sendDataPacket(event)];

        const health = new SetHealthPacket({ health: Math.ceil(player.getHealth()) });
        sends.push(this.connection.sendDataPacket(health));

        sends.push(this.sendAttributes());
        sends.push(this.sendMetadata());
        return allSent(sends);
    }

    /**
     * One of the server's two halves of the respawn exchange.
     *
     * The order matters and is not obvious. `SearchingForSpawn` goes out the moment
     * the player dies, carrying where they will reappear; the client then shows its death
     * screen. `ReadyToSpawn` is the *answer* to the client saying it has finished
     * loading, and goes out only then.
     *
     * Sending the second in place of the first leaves the client on "Respawning" for ever:
     * it is waiting to be told where it will come back before it will even offer the button.
     *
     * `Player Runtime Id` is always 0, as in every `Respawn` a Bedrock Dedicated Server 1.26.52
     * sends, at the join and after a death.
     * @param {Vector3} position - Where the player will reappear.
     * @param {PlayerRespawnState} state - Which half of the exchange this is.
     * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
     */
    public async sendRespawn(position: Vector3, state: PlayerRespawnState): Promise<void> {
        const packet = new RespawnPacket({
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            state,
            runtimeEntityId: 0n
        });
        await this.connection.sendDataPacket(packet);
    }

    /**
     * The death screen's half of a death, once the respawn search has answered: where the player
     * will come back, which the client waits for before it offers the respawn button, and then
     * the screen's own copy of the cause, as PocketMine's `DeathPacketHandler` sends it after the
     * `Respawn`.
     * @param announced - Where the player will reappear.
     * @param cause - The death message, as the chat line has it. `DeathInfo` takes the key without
     *   the `%` the chat packet wants.
     */
    public sendDeathScreen(announced: Vector3, { key, parameters }: DeathMessage): Promise<void> {
        if (this.presenter.edition !== 'bedrock') {
            return this.presenter.showDeath({ key: key.replace(/^%/, ''), parameters });
        }
        return allSent([
            this.sendRespawn(announced, PlayerRespawnState.SEARCHING_FOR_SPAWN),
            this.connection.sendDataPacket(new DeathInfoPacket({ cause: key.replace(/^%/, ''), messages: parameters }))
        ]);
    }

    /**
     * Send a chat message to the client.
     *
     * A bare string is a raw line, which is how a command answers the player that ran it.
     * @param delivery - The message, or the message with what to show it as. The kind defaults
     *   to `raw`, the parameters to none, and the author's name and XUID to empty.
     * @returns A promise that resolves when the message is sent.
     */
    public async sendMessage(delivery: string | SessionMessage): Promise<void> {
        const {
            message,
            kind = 'raw',
            parameters = [],
            needsTranslation = false,
            sourceName = '',
            xuid = ''
        } = typeof delivery === 'string' ? { message: delivery } : delivery;
        if (!message) throw new PrismarineNetworkErrors.EmptyMessage();

        await this.presenter.sendMessage({ message, kind, parameters, needsTranslation, sourceName, xuid });
    }

    /**
     * Sends one player's movement to this client.
     *
     * Named for what it does. It was `broadcastMove`, which reads as a fan-out and is not
     * one - the fan-out is `World.broadcastMove`, and having both made it easy to write the
     * wrong one.
     *
     * For this client's own player the packet is a server-initiated move: a teleport, a
     * respawn, or a reset after a canceled move event. Its `Tick` is the client's last input
     * tick, as the docs ask, so the client rewinds to it and replays its predictions from
     * there. For any other player the packet is what this client sees of them, and the tick is
     * zero because it relates to none of this client's inputs.
     * @param player - The player that moved.
     * @param {MoveMode} [mode='normal'] - What produced the movement.
     */
    public async sendMove(player: ShownActor, mode: MoveMode = 'normal'): Promise<void> {
        const position = player.getPosition();
        const own = player.getRuntimeId() === this.runtimeId;
        // From here until the client says it handled the teleport, its inputs still name where
        // it was; see holdsMovementForTeleport.
        if (own && mode === 'teleport') {
            this.teleportAwaitingAck = { x: position.getX(), z: position.getZ(), sentAtTick: this.server.getTick() };
        }
        await this.presenter.sendMove({
            runtimeId: player.getRuntimeId(),
            position,
            pitch: player.pitch,
            yaw: player.yaw,
            headYaw: player.headYaw,
            onGround: player.isOnGround(),
            mode,
            inputTick: own ? this.lastInputTick : 0n
        });
    }

    /**
     * Whether an input's position must be ignored because the client has not yet handled a
     * teleport the server sent it.
     *
     * Mojang's packet documentation, on `HandledTeleport`: "The server should ignore any client
     * predicted positions from the moment a MovePlayerPacket was sent until receipt of this
     * action." That covers every teleport, the one that ends a dimension change included.
     *
     * The client goes on sending inputs from where it was until it applies the `MovePlayer`, and
     * the first input from the new place carries `HandledTeleport`. A retail client was captured
     * doing exactly that, with one stale input arriving after the teleport about one time in
     * three. Taking the stale position moves the player back on the server while the client
     * stands at the target, and the server then sends chunks for the wrong place. A client that
     * stops sending inputs while it waits for chunks never recovers from that.
     *
     * The hold ends on a `HandledTeleport` input at the target, which tells two teleports sent
     * in a row apart, or after `TELEPORT_ACK_TIMEOUT_TICKS`, so a client that never sets the
     * flag is not frozen in place.
     * @param position - Where the input says the player is.
     * @param handledTeleport - Whether the input carries `HandledTeleport`.
     */
    public holdsMovementForTeleport(position: Vector3, handledTeleport: boolean): boolean {
        const awaiting = this.teleportAwaitingAck;
        if (awaiting === undefined) return false;

        const dx = position.getX() - awaiting.x;
        const dz = position.getZ() - awaiting.z;
        const atTarget = dx * dx + dz * dz <= TELEPORT_ACK_RADIUS * TELEPORT_ACK_RADIUS;
        const timedOut = this.server.getTick() - awaiting.sentAtTick > TELEPORT_ACK_TIMEOUT_TICKS;
        if ((handledTeleport && atTarget) || timedOut) {
            this.teleportAwaitingAck = undefined;
            return false;
        }
        return true;
    }

    /**
     * Adds the client to the player list of every player inside
     * the server and also to the player itself.
     */
    public async addToPlayerList(): Promise<void> {
        const entry = listedPlayerOf(this.shown());

        this.server.getSessionManager().getPlayerList().set(this.identity.uuid, entry);

        await this.server.broadcastPacket(playerListAddOf([entry]));
    }

    /**
     * Removes a player from other players list
     */
    public async removeFromPlayerList(): Promise<void> {
        const uuid = this.own().getUUID();

        this.server.getSessionManager().getPlayerList().delete(this.identity.uuid);

        await this.server.broadcastPacket(playerListRemoveOf([uuid]));
    }

    /**
     * Changes the name every client's player list shows for this player, or gives it the login
     * name back. The entry later joiners get changes too. Chat and the name above the head keep
     * the login name.
     * @param name - The name to show, or the login name when left out.
     */
    public setPlayerListName(name?: string): Promise<void> {
        return setPlayerListName(
            this.server.getSessionManager().getPlayerList(),
            (packet) => this.server.broadcastPacket(packet),
            this.shown(),
            this.identity.uuid,
            name
        );
    }

    /**
     * Sends the full player list to the player.
     */
    public async sendPlayerList(): Promise<void> {
        await this.presenter.sendPlayerList([...this.server.getSessionManager().getPlayerList().values()]);
    }

    /**
     * Sends every active effect after the actor that owns them has spawned.
     * @param {ShownActor} entity - The spawned actor.
     */
    public sendStatusEffects(entity: ShownActor): Promise<void> {
        return allSent(entity.getStatusEffects().map((effect) => this.sendStatusEffect(entity, effect, 'add')));
    }

    /**
     * Sends one effect state change to this client.
     * @param {Pick<ShownActor, 'getRuntimeId'>} entity - The actor whose effect changed.
     * @param {StatusEffect} effect - The effect state.
     * @param {StatusEffectChange} change - Whether it was added, updated, or removed.
     */
    public async sendStatusEffect(
        entity: Pick<ShownActor, 'getRuntimeId'>,
        effect: StatusEffect,
        change: StatusEffectChange
    ): Promise<void> {
        const runtimeId = entity.getRuntimeId();
        const packet = statusEffectPacket(
            runtimeId,
            effect,
            change,
            runtimeId === this.runtimeId ? this.lastInputTick : 0n
        );
        if (packet !== undefined) await this.send(packet);
    }

    /**
     * Tells this client what a human is wearing and holding in the off hand (`armorPackets`),
     * read from the wearer's equipment, which for a player is its inventory.
     * @param {ShownActor} wearer - Whose armor it is.
     */
    public sendArmorFor(wearer: ShownActor): Promise<void> {
        return allSent(
            armorPackets(wearer.getRuntimeId(), wearer.getEquipment(), this.connection.codec.context).map((packet) =>
                this.send(packet)
            )
        );
    }

    /**
     * Takes an entity off this connection.
     * @param {ShownActor} entity - The entity to remove.
     */
    public async sendRemoveActor(entity: ShownActor): Promise<void> {
        await this.sendRemoveActorById(entity.getRuntimeId());
    }

    /**
     * Takes an entity off this client by id.
     *
     * By id rather than by entity because the tracker has to be able to hide something that
     * has already left the world - there is no object left to ask. Correct for every kind of
     * entity, players included: `RemoveActorPacket` names only the id.
     * @param {bigint} runtimeId - The entity's runtime id.
     */
    public sendRemoveActorById(runtimeId: bigint): Promise<void> {
        return this.presenter.hideEntity(runtimeId);
    }

    /**
     * Where an entity is, as the packet that says so.
     *
     * The rotation goes with it. Without it every field was left at zero, so a mob walking south
     * faced north the whole way, and a herd of cows all faced the same direction whatever they were
     * doing - which reads as broken however smooth the movement underneath it is.
     *
     * Ordinary movement stays interpolated. A teleport sets the snap flag so a client does not
     * animate the actor across the distance between its old and new positions.
     * @param {MovedActor} entity - The entity that moved.
     * @param {boolean} teleport - Whether clients should snap to the new position.
     * @returns {MoveActorAbsolutePacket} The packet, not yet sent.
     */
    private static movePacketFor(entity: MovedActor, teleport = false): MoveActorAbsolutePacket {
        const packet = new MoveActorAbsolutePacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.position = entity.getPosition();

        packet.pitch = entity.pitch;
        packet.yaw = entity.yaw;
        packet.headYaw = entity.headYaw;

        // The on-ground flag, which was hardcoded clear because nothing tracked the state. The
        // data runtime does: a mob is carried through the air only while an impulse is still
        // spending itself, and `coast` ends that by landing it on the first cell it cannot fall
        // into. Everything else reports false and is drawn from the client's own guess, which is
        // what every entity got while the flag was never set.
        packet.flags =
            (entity.isOnGround() ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0) |
            (teleport ? MoveActorAbsolutePacket.FLAG_TELEPORT : 0);

        return packet;
    }

    /**
     * Tells this connection an entity has moved, on its own.
     *
     * For a move that happens outside the world tick - a teleport, a command. Movement produced by
     * the tick goes through {@link queueMoveActor} instead.
     * @param {MovedActor} entity - The entity that moved.
     */
    public async sendMoveActor(entity: MovedActor): Promise<void> {
        await this.send(PlayerSession.movePacketFor(entity));
    }

    /**
     * Adds an entity's movement to this tick's batch.
     *
     * Sending each one on its own is what made mobs move in fits and starts, and for two reasons.
     * Every packet became its own compressed batch and its own RakNet frame, so thirty mobs cost
     * thirty compressions and thirty frames a tick, per player. Worse, `sendDataPacket` queues
     * behind any chunk still compressing - so while a walking player streams terrain, every mob's
     * movement waited behind it and then arrived in a burst. Mobs froze and jumped in exactly the
     * rhythm the chunks were arriving in.
     *
     * One batch a tick fixes both: one compression, one frame, and one place in the queue for the
     * lot of them.
     * @param {MovedActor} entity - The entity that moved.
     */
    public queueMoveActor(entity: MovedActor, teleport = false): void {
        // Keyed by entity, so an entity that moved more than once this tick goes out once, at
        // where it ended up, rather than one packet for each axis it moved along. A `Map` keeps
        // insertion order, so the batch is ordered as the moves were.
        this.queuedMoves.set(Number(entity.getRuntimeId()), PlayerSession.movePacketFor(entity, teleport));
    }

    /**
     * Sends this tick's movement as one batch.
     *
     * Called once per world tick, after every entity has had its update.
     * @returns {Promise<void>} Resolves once the batch has been framed.
     */
    public async flushQueuedMoves(): Promise<void> {
        if (this.queuedMoves.size === 0) return;

        const packets = [...this.queuedMoves.values()];
        this.queuedMoves.clear();

        // Not `direct`: movement is not urgent enough to force a datagram of its own, and letting
        // RakNet coalesce it with whatever else is going out is the point of batching it at all.
        this.connection.sendPackets(packets, { direct: false });
        // The session queue can include other tick traffic; this method still resolves only after
        // the batch holding the movement has been framed.
        await this.connection.flushOutboundPackets();
    }

    /**
     * Disconnects this client with a reason it shows, and hangs up its connection.
     *
     * @remarks Torn down through the connection rather than by calling `disable` directly, so
     * the player and its session are released together and exactly once, and the RakNet session
     * is hung up on rather than left for a client that never hangs up to hold its slot.
     * @param reason - Shown to the client.
     * @param code - The code the client shows beside the reason. `Server.shutdown` passes
     *   `SHUTDOWN`.
     */
    public async kick(reason = 'unknown reason', code: DisconnectReason = DisconnectReason.KICKED): Promise<void> {
        await this.connection.disconnect(reason, false, code);
        this.server.getLogger().verbose(`Player with id §b${this.runtimeId}§r was kicked: ${reason}`);
    }

    /** Sends a `PlayStatus` to this player's client. */
    public async sendPlayStatus(status: PlayStatus): Promise<void> {
        await this.connection.sendDataPacket(new PlayStatusPacket({ status }), true);
    }

    public getConnection(): ClientConnection {
        return this.connection;
    }

    /**
     * The player this session speaks for, found by its entity id.
     *
     * The one way from a session to its player's state, the store player the server's
     * directory files by that id. Code that needs only the id, the name or the key reads
     * {@link PlayerSession.runtimeId} or {@link PlayerSession.identity} instead.
     * @returns The player.
     * @throws {Error} Once {@link PlayerSession.disable} has forgotten the player.
     */
    public getPlayer(): SessionPlayer {
        const player = this.players.of(Number(this.runtimeId));
        if (player === undefined) {
            throw new PrismarineNetworkErrors.PlayerHasLeft({
                name: this.identity.name,
                runtimeId: this.runtimeId
            });
        }
        return player;
    }

    /**
     * {@link PlayerSession.getPlayer}, under the name the session's own sends read it by.
     * @returns The player.
     * @throws {Error} Once {@link PlayerSession.disable} has forgotten the player.
     */
    private own(): SessionPlayer {
        return this.getPlayer();
    }

    /**
     * The player's entity and its runtime while the entity is in the store of the player's world,
     * or undefined from the login to its spawn and between two worlds.
     */
    private placed(): { readonly live: LiveEntityRuntime; readonly entity: DataEntity } | undefined {
        const player = this.getPlayer();
        if (player.entity === undefined) return undefined;
        const live = this.world.dataEntities();
        const entity = live.runtime.entityOfPlayer(player);
        return entity === undefined ? undefined : { live, entity };
    }

    /**
     * The entity runtime of the player's world, whose player inputs write what the client reports:
     * through its player systems while the player is in its store, and onto the store player's
     * components while it is in none.
     */
    public inputs(): EntityRuntime {
        return this.world.dataEntities().runtime;
    }

    /**
     * The player's actor while its entity is in the store of its world: what entity code is handed
     * in the player's place, such as a blow's attacker, the portal touch and the entity events.
     * Undefined from the login to the spawn and between two worlds, when nothing can reach the
     * player.
     */
    public getActor(): StorePlayerActor | undefined {
        const placed = this.placed();
        const actor = placed?.live.actors.actorOf(placed.entity.id);
        return actor instanceof StorePlayerActor ? actor : undefined;
    }

    /**
     * The session's own player as clients are shown it: its actor while it is in a store, and
     * otherwise what this client is shown of it before its spawn and between two worlds.
     * @returns The player as it is shown.
     * @throws {Error} Once {@link PlayerSession.disable} has forgotten the player.
     */
    public shown(): ShownPlayer {
        const actor = this.getActor();
        if (actor !== undefined) return actor;
        this.detached ??= new DetachedPlayerView(this.getPlayer(), {
            box: () => this.getBox(),
            isOp: () => this.isOp(),
            commandLevel: () => this.getCommandLevel()
        });
        return this.detached;
    }

    /** The box the player's body takes up, from the type's collision box. */
    public getBox(): EntityBox {
        return boxOf(this.server.getContent().entities.registry, PLAYER_IDENTIFIER);
    }

    /** The server this session belongs to. */
    public getServer(): Server {
        return this.server;
    }

    // The player as the content, the advancements, the workstations and the commands read it:
    // this session's server, world and sends, and its store player's state. Each read of the
    // state is the store player's.

    /** The key and the server the player's advancements and enchantment seed are kept by. */
    public keyed(): KeyedPlayer {
        return { key: playerKeyOf(this.identity), server: this.getServer() };
    }

    /** The player's entity id. */
    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    /** The type of the player's entity, `minecraft:player`. */
    public getType(): string {
        return PLAYER_IDENTIFIER;
    }

    /** The XUID the login carried, or null when it carried none. */
    public getXUID(): string | null {
        return this.getPlayer().getXUID();
    }

    /** Where the player's eyes are, as its client reports them. */
    public getPosition(): Vector3 {
        return this.getPlayer().getPosition();
    }

    /** The bottom of the player's body. */
    public getFeetY(): number {
        return this.getPlayer().getFeetY();
    }

    public get yaw(): number {
        return this.getPlayer().yaw;
    }

    public get pitch(): number {
        return this.getPlayer().pitch;
    }

    /** The game mode. */
    public get gamemode(): Gametype {
        return this.getPlayer().gamemode;
    }

    /** The client's attribute table: food, experience and the rest, and a copy of the health. */
    public get attributes(): Attributes {
        return this.getPlayer().attributes;
    }

    /** What the player carries. */
    public getInventory(): HumanInventory {
        return this.getPlayer().getInventory();
    }

    /** What the player wears and holds. */
    public getEquipment(): ViewableEquipment {
        return this.getPlayer().getEquipment();
    }

    /** The status effects on the player. */
    public getStatusEffects(): readonly StatusEffect[] {
        return this.getPlayer().getStatusEffects();
    }

    /** Whether the client last reported the player on the ground. */
    public isOnGround(): boolean {
        return this.getPlayer().isOnGround();
    }

    /** Whether the client last reported the player sprinting. */
    public isSprinting(): boolean {
        return this.getPlayer().isSprinting();
    }

    /** Whether the client last reported the player sneaking. */
    public isSneaking(): boolean {
        return this.getPlayer().isSneaking();
    }

    /** Whether the player is flying. */
    public isFlying(): boolean {
        return this.getPlayer().isFlying();
    }

    /** Food, out of 20. */
    public getFood(): number {
        return this.getPlayer().getFood();
    }

    /** The hidden buffer spent before food. */
    public getSaturation(): number {
        return this.getPlayer().getSaturation();
    }

    /** Feeds the player, as eating does. */
    public addFood(food: number, saturation = 0): void {
        this.getPlayer().addFood(food, saturation);
    }

    /** How far the player has fallen since it was last supported. */
    public getFallDistance(): number {
        return this.getPlayer().getFallDistance();
    }

    /** The experience, written through logged setters. */
    public getExperience(): ExperienceHolder {
        return this.getPlayer().getExperience();
    }

    /** Sets an attribute, through the component field it is kept in when it has one, so it is logged. */
    public setAttributeValue(name: string, value: number): boolean {
        return this.getPlayer().setAttributeValue(name, value);
    }

    /** The player's own spawn point, or undefined for the world spawn. */
    public getSpawnPoint(): StoredSpawnPoint | undefined {
        return this.getPlayer().getSpawnPoint();
    }

    /** Moves the player's own spawn point, or clears it back to the world spawn. */
    public setSpawnPoint(spawn: StoredSpawnPoint | undefined): void {
        this.getPlayer().setSpawnPoint(spawn);
    }

    /** The name the player logged in with. */
    public getName(): string {
        return this.identity.name;
    }

    /** The name as a chat line attributes it. */
    public getFormattedUsername(): string {
        return `<${this.identity.name}>`;
    }

    /** Whether the player is an operator. */
    public isOp(): boolean {
        return this.server.getPermissionManager().isOp(this.identity.subject);
    }

    /**
     * Every node that applies to the player, in resolution order, read from the permission
     * manager on every call so a revoked operator status or grant applies at once.
     */
    public getPermissions(): string[] {
        return this.server.getPermissionManager().nodesOf(this.identity);
    }

    /** Whether the player holds a node after resolution, read on every call like {@link PlayerSession.isOp}. */
    public hasPermission(node: string): boolean {
        return this.server.getPermissionManager().has(this.identity, node);
    }

    /** The command level the player runs at: the `level` meta, or 4 for an operator. */
    public getCommandLevel(): CommandPermissionLevel {
        return this.server.getPermissionManager().commandLevelOf(this.identity);
    }

    /**
     * Runs the player's own part of a tick, which its actor runs after the entity's part: this
     * session, the attribute sync and the triggers. Breath, hunger, a meal, the void and the
     * mining cracks are the store's, in its entity pass.
     * @param tick - The current world-tick.
     */
    public updatePlayer(tick: number): void {
        this.update(tick);

        // Anything that moved an attribute this tick - hunger, most of the time - goes out
        // here, as a single packet holding just what changed. The health is the entity's, so it
        // is copied into the client's table first.
        this.showOwnHealth();
        this.released(this.syncAttributes());

        // The maps the player carries fill in and send what changed, as Java's player tick does.
        this.released(allSent(tickCarriedMaps(this)));

        // Every second, which is Java's own period for this pair. The `location` conditions are
        // about where the player is standing rather than about anything that happened, so there
        // is nothing else to hang the 67 vanilla criteria that use them on.
        if (tick % ADVANCEMENT_CHECK_TICKS === 0) advancementPlayerTick(this);

        // Every five minutes of ticks.
        if (tick % (20 * 5 * 60 * 1) === 0) this.released(this.sendTime());
    }

    /**
     * Copies the entity's health into the client's attribute table, which this client is sent,
     * so a change goes out with the next attribute sync.
     */
    private showOwnHealth(): void {
        const player = this.getPlayer();
        player.attributes.setValue(AttributeIds.Health, player.getHealth());
    }

    /**
     * Stops the cracks on the block the player was mining, if any, and forgets it.
     *
     * For whatever ends the mining without the client saying so: a disconnect, a change of game
     * mode or of world. A death is the player systems', inside the blow. Left alone, the cracks
     * would go out every tick for good.
     */
    public stopMining(): void {
        const components = this.getPlayer().getComponents();
        const mining = blockMiningOf(components.get('mining.block'));
        if (mining === null) return;

        components.set('mining.block', null);
        this.world.stopBlockCracking(mining.position);
    }

    /**
     * Changes the player's game mode, after the `playerSetGamemode` event, and tells this client
     * and every client that caches it.
     *
     * Every write is made, and every packet queued, before this returns. The promise only says
     * when the transport has framed the packets.
     * @param mode - The new mode; the current one by default, which sends it again.
     */
    public setGamemode(mode?: Gametype): Promise<void> {
        const player = this.getPlayer();
        mode ??= player.gamemode;

        const previous = player.gamemode;
        const event = new PlayerSetGamemodeEvent(this, mode, previous);
        this.server.getKernel().events.post('playerSetGamemode', event);
        if (event.isCanceled()) return allSent([]);

        const sends: Promise<void>[] = [];
        // A new game mode changes how, or whether, the player breaks blocks, so the mining in
        // progress does not carry over into it.
        if (event.getGamemode() !== player.gamemode) this.stopMining();

        // A logged component field, which the store's player systems and the actor read.
        this.inputs().setPlayerGamemode(player, event.getGamemode());
        sends.push(this.sendGameTypeChange());
        if (!mayFlyIn(player.gamemode)) sends.push(this.setFlying(false));
        sends.push(this.sendAbilityChange());
        if (event.getGamemode() !== previous) {
            this.server
                .getKernel()
                .events.post(
                    'playerGamemodeChanged',
                    new PlayerGamemodeChangedEvent(this, previous, event.getGamemode())
                );
        }
        return allSent(sends);
    }

    /**
     * Starts or stops the player flying, after the `playerToggleFlight` event, and sends the
     * settings. A game mode that may not fly only ever lands.
     *
     * The flight is written and the settings queued before this returns.
     */
    public setFlying(flying: boolean): Promise<void> {
        const player = this.getPlayer();
        if (flying === player.isFlying()) return allSent([]);

        if (!mayFlyIn(player.gamemode)) {
            this.inputs().setPlayerFlying(player, false);
            return this.announceSettings();
        }

        const event = new PlayerToggleFlightEvent(this, flying);
        this.server.getKernel().events.post('playerToggleFlight', event);
        if (event.isCanceled()) return allSent([]);

        this.inputs().setPlayerFlying(player, event.getIsFlying());
        return this.announceSettings();
    }

    /** Starts or stops the player sprinting, after the `playerToggleSprint` event. */
    public async setSprinting(sprinting: boolean): Promise<void> {
        const player = this.getPlayer();
        if (sprinting === player.isSprinting()) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.server.getKernel().events.post('playerToggleSprint', event);
        if (event.isCanceled()) return;

        // Replication shows the logged change to the player and its viewers.
        this.inputs().setPlayerSprinting(player, event.getIsSprinting());
    }

    /**
     * Moves the player to another world, arriving at that world's spawn.
     *
     * The stored spawn is the block under a joining player's feet, so the feet go one block
     * above it, centered, as `requestedSpawnPosition` says before the terrain is
     * consulted. The move is a message: `DimensionTravel.moveTo` files it, a world that has not
     * found its spawn searches for it outside every tick, and the next input step at which the
     * spawn is known carries out {@link PlayerSession.changeWorld}. This is the entry point for
     * callers that have a world and no arrival of their own, such as the `changeWorld` command.
     * @param world - The new world.
     */
    public setWorld(world: World): void {
        const player = this.getPlayer();
        this.server.getDimensionTravel().moveTo(this, spawnTarget(world, { yaw: player.yaw, pitch: player.pitch }));
    }

    /**
     * What happens when the player runs out of health, which the store's damage pipeline calls
     * once the unit of the blow that killed them has kept its writes, after the player systems
     * ended the drowning and the mining and after the `entityDeath` event and the kill triggers.
     *
     * The client puts up its own death screen as soon as health reaches zero, so the work here is
     * telling everyone else and waiting: the player stays dead, in the store, until they ask to
     * come back, which arrives as a `RESPAWN` player action.
     * @param source - What killed them, and who is answerable for it.
     * @internal
     */
    public async die(source: DamageSource): Promise<void> {
        const actor = this.getActor();
        if (actor === undefined) return;

        // The bare translation key, as with the join and leave messages: the client renders it in
        // its own language. Which key it is depends on whether anybody is to blame - see
        // `DeathMessages`.
        const message = deathMessage(actor, source);
        const { key, parameters } = message;

        // Where they will come back. The client will not offer the respawn button until it knows,
        // which is why a death screen that never became a respawn screen was stuck on
        // "Respawning". The search reads chunks that may not be loaded, so the death files it
        // and the input step that answers it sends the death screen (`world/RespawnRequests.ts`),
        // unless the player came back or left before then.
        this.server
            .getRespawnRequests()
            .request(this.world.getLevel().getRespawnSearch(), this.respawnRequest(), (answer) => {
                if (this.getPlayer().getHealth() > 0 || !this.isConnected()) return;
                this.forgetLostSpawnPoint(answer);
                this.released(this.sendDeathScreen(Vector3.fromObject(answer.announced), message));
            });

        // Before anything is awaited, so a send that fails cannot leave the player holding what
        // the rule says they drop, and the attribute send below carries the emptied experience bar.
        if (gameRuleValue(this.world.getGameRuleManager(), KEEP_INVENTORY) !== true) {
            this.released(this.dropOnDeath(actor));
        }

        this.showOwnHealth();
        await this.sendAttributes();
        this.world.sendActorEvent(actor, ActorEvent.DEATH_ANIMATION);

        await this.server.getChatManager().send(
            new Chat({
                sender: this.server.getConsoleSender(),
                message: key,
                parameters,
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );
    }

    /**
     * What a death without `minecraft:keep_inventory` leaves where the player fell, Java's
     * `Player.dropEquipment` and `getBaseExperienceReward`: every stack the player holds, less the
     * ones cursed with vanishing, which are destroyed, and seven experience points a level, at
     * most a hundred.
     *
     * Every stack is the inventory, the armor and the off hand, and also the cursor, the crafting
     * grid and the inputs of an open window, which a later close would otherwise hand back. The
     * window is closed on the server, and the experience is taken here rather than at the
     * respawn, so the rule is read once and a change before the respawn cannot contradict it.
     *
     * Everything is taken before the first await; the promise is the drop's and the sends'.
     */
    private async dropOnDeath(actor: StorePlayerActor): Promise<void> {
        const player = this.getPlayer();
        const inventory = this.getInventory();
        const held: Item[] = [];
        for (const name of ['inventory', 'armor', 'offhand', 'cursor'] as const) {
            const container = inventory.container(name);
            held.push(...container.stacks());
            container.clear();
        }
        const grid = player.getCraftingInput();
        for (let slot = 0; slot < CraftingInput.SLOTS; slot += 1) {
            const item = grid.get(slot);
            if (item === null) continue;
            held.push(item);
            grid.set(slot, null);
        }
        const open = this.getOpenBlockContainer();
        if (open !== undefined) {
            held.push(...open.inputs.filter((item) => item !== null));
            this.closeWindow(open.windowId);
        }

        const experience = this.getExperience();
        const points = Math.min(experience.getLevel() * DEATH_EXPERIENCE_PER_LEVEL, MAX_DEATH_EXPERIENCE);
        experience.setLevel(0);
        experience.setProgress(0);
        const at = actor.getPosition();
        this.world.dataEntities().runtime.experienceOrbs.award({ x: at.getX(), y: at.getY(), z: at.getZ() }, points);

        const dropped = held.filter(
            (item) => item.getName() !== 'minecraft:air' && !item.getEnchantments().has(VANISHING_CURSE)
        );
        await Promise.all([this.world.dropContents(at, dropped, { pastLimit: true }), this.sendInventory()]);
    }

    /**
     * Where the player comes back after a death, given as a Bedrock Dedicated Server gives it.
     *
     * Their own spawn point when they have one that still holds, in the world it was set in,
     * which need not be the one they died in: a player who dies in the Nether with an Overworld
     * bed comes back in the Overworld, as Java's `findRespawnPositionAndUseSpawnBlock` has it.
     * Otherwise the Overworld spawn of the default level, which is Java's `server.overworld()`.
     * A bed or a respawn anchor only holds a spawn while the block is still there with somewhere
     * free to stand beside it, and a point `/spawnpoint` set is used whatever is standing there.
     * The level's respawn search answers the question from plain data. A spawn that stopped
     * holding is cleared here, so the player is told once rather than on every death.
     *
     * The caller compares `world` with the player's own and changes world first when they
     * differ: see `RespawnHandler`.
     *
     * The search reads loaded chunks only, so the answer is not always there at once
     * ({@link attemptRespawnPoint}).
     *
     * @see {@link respawnPoint} for the three positions the exchange needs.
     */
    public requestRespawnPoint(apply: (destination: RespawnDestination) => void): void {
        this.server
            .getRespawnRequests()
            .request(this.world.getLevel().getRespawnSearch(), this.respawnRequest(), (answer) =>
                apply(this.destinationOf(answer))
            );
    }

    /**
     * {@link requestRespawnPoint} for a caller that asks again at each input step until it has
     * the answer, such as a trip out of the End. Each attempt that lacks a chunk holds a ticket
     * for it in the player's name.
     *
     * @returns The destination, or undefined while the search waits for what it lacks.
     */
    public attemptRespawnPoint(): RespawnDestination | undefined {
        const attempt = this.world.getLevel().getRespawnSearch().attempt(this.respawnRequest());
        return attempt.kind === 'answer' ? this.destinationOf(attempt.answer) : undefined;
    }

    /**
     * Gives up the chunk tickets {@link attemptRespawnPoint} took, for a caller that stops asking
     * before it has the answer, such as a trip out of the End that was dropped. A respawn request
     * of the same player that still waits takes its ticket again at its next attempt.
     * @param level - The level whose search took the tickets, the player's own by default. A
     *   player who moved to another level since asks a different search, so a caller that knows
     *   where the search ran names it.
     */
    public abandonRespawnPoint(level: Pick<Level, 'getRespawnSearch'> = this.world.getLevel()): void {
        level.getRespawnSearch().release(playerKeyOf(this.identity));
    }

    /** Clears a spawn point the answer says was lost, and names the world the answer is in. */
    private destinationOf(answer: RespawnAnswer): RespawnDestination {
        const level = this.world.getLevel();
        this.forgetLostSpawnPoint(answer);

        // Built and ready: the search reads ready worlds only.
        const own = answer.spawn === 'own' ? level.readyWorld(answer.dimension) : undefined;
        if (answer.spawn === 'own' && own === undefined)
            throw new PrismarineNetworkErrors.RespawnDimensionNotReady({ dimension: answer.dimension });
        return {
            world: own ?? this.server.getWorldManager().getEntryWorld(),
            announced: Vector3.fromObject(answer.announced),
            block: Vector3.fromObject(answer.block),
            eyes: Vector3.fromObject(answer.eyes)
        };
    }

    /**
     * Clears a spawn point the search found no longer holds, and tells the player once.
     *
     * Java's "Your home bed was missing or obstructed", which is a message this server has no
     * translation path for yet. Cleared so the next death goes straight to the world spawn rather
     * than walking the bed's neighbors again.
     */
    private forgetLostSpawnPoint(answer: RespawnAnswer): void {
        // The search may have waited for chunks, and a point set meanwhile is not the lost one.
        if (!answer.spawnPointLost || !sameSpawnPoint(this.getPlayer().getSpawnPoint(), answer.spawnPoint)) return;

        this.getPlayer().setSpawnPoint(undefined);
        this.released(
            this.sendMessage({
                message: 'tile.bed.notValid',
                kind: 'translation',
                needsTranslation: true
            })
        );
    }

    /** What the level's respawn search is asked for this player. */
    private respawnRequest(): RespawnRequest {
        const { width, height } = this.getBox();
        return {
            player: playerKeyOf(this.identity),
            spawnPoint: this.getPlayer().getSpawnPoint(),
            body: { width, height, eyeHeight: EYE_HEIGHT }
        };
    }

    /**
     * Brings the player back after a death, at its respawn point and in one piece.
     *
     * @remarks Called when the client asks, not when the player dies - the death screen is the
     * client's, and it decides how long it stays up. The client reports `ClientReadyToSpawn`
     * before it sends this, and has already put itself where the answer to that said: see
     * `RespawnHandler`.
     *
     * The respawn waits for the search's answer, so it is filed as a request and the input step
     * that has the answer applies it ({@link requestRespawnPoint}).
     */
    public requestRespawn(): void {
        this.server
            .getRespawnRequests()
            .request(this.world.getLevel().getRespawnSearch(), this.respawnRequest(), (answer) =>
                this.respawnAt(answer)
            );
    }

    /** The respawn {@link requestRespawn} files, once the search has answered. */
    private respawnAt(answer: RespawnAnswer): void {
        const player = this.getPlayer();
        // A player the server does not consider dead is put back where they already are, and
        // keeps everything. The answer still goes out: the client repeats the request once a
        // second until it gets one, and silence is what leaves it on the death screen.
        if (player.getHealth() <= 0) {
            const destination = this.destinationOf(answer);
            const { eyes } = destination;
            const bedrock = this.presenter.edition === 'bedrock';
            // A Java client is spawned again before it is moved, into the world it comes back
            // in; a Bedrock one came back at the `ReadyToSpawn` position already, after
            // `RespawnHandler` moved it to that world.
            if (!bedrock && destination.world !== this.world) {
                this.released(
                    this.changeWorld({
                        world: destination.world,
                        position: destination.block,
                        yaw: player.yaw,
                        pitch: player.pitch,
                        respawn: true,
                        closesLoadingScreen: false
                    })
                );
            } else if (!bedrock) {
                this.released(
                    this.presenter.showRespawn({
                        gamemode: player.gamemode,
                        dimension: this.shownDimension(),
                        feet: { x: destination.block.getX(), y: destination.block.getY(), z: destination.block.getZ() },
                        keepData: false,
                        replacesWorld: false
                    })
                );
                // A client spawned again holds no chunks, so the view around it is sent afresh.
                this.clearChunks();
            }
            // The entity never left the store: the revival brings it back with the same id at
            // full health, and the player systems reset the attributes, the lungs and the movement
            // flags. Each write is logged.
            this.inputs().revivePlayer(player);
            this.showOwnHealth();

            // Where the `ReadyToSpawn` put the client, and without a `MovePlayer`: a Bedrock
            // Dedicated Server sends none here, and the client is already there. A Java client
            // has no `ReadyToSpawn`, so it is told where it stands.
            this.released(this.setPlayerPosition({ position: eyes, type: 'respawn' }, !bedrock));
        }

        this.released(this.sendRespawned());
        this.releaseChangeHeldOverDeath();
    }

    /**
     * Records whether the client reports the player on the ground, as a move to where the player
     * already is: the store pays for a fall the moment it lands.
     */
    public setOnGround(onGround: boolean): void {
        const player = this.getPlayer();
        const placed = this.placed();
        if (placed === undefined || onGround === player.isOnGround()) return;
        const { entity } = placed;
        moveStorePlayer(placed.live.runtime, player, {
            position: { ...entity.position },
            yaw: entity.body.yaw,
            pitch: entity.body.pitch,
            onGround,
            headYaw: player.headYaw
        });
    }

    /**
     * Moves the player, with a movement mode.
     *
     * The client owns a player's movement (ADR 0008), so a move the server makes is a request
     * the client has to acknowledge, and the positions it reports until then are dropped
     * ({@link PlayerSession.holdsMovementForTeleport}).
     * @param options - The options to set the position.
     * @param options.position - The new eye position. A `Position` in another world, given
     *   while the player is in no store, is the world it enters next.
     * @param options.type - The position mode.
     * @param options.pitch - The new pitch.
     * @param options.yaw - The new yaw.
     * @param options.headYaw - The new head yaw.
     * @param broadcast - Whether to tell this client.
     * @remarks Observers snap to a respawn or a teleport instead of interpolating to it.
     */
    public setPlayerPosition(
        {
            position,
            type = 'normal',
            pitch,
            yaw,
            headYaw
        }: {
            position: Vector3;
            type?: MoveMode;
            pitch?: number;
            yaw?: number;
            headYaw?: number;
        },
        broadcast = true
    ): Promise<void> {
        const player = this.getPlayer();
        pitch ??= player.pitch;
        yaw ??= player.yaw;
        headYaw ??= player.headYaw;
        const feet = { x: position.getX(), y: position.getY() - EYE_HEIGHT, z: position.getZ() };
        const placed = this.placed();
        if (placed === undefined) {
            // In no store: the player holds where it is, and a position in another world is the
            // world it enters next, as a dimension change places it before its arrival.
            if (position instanceof Position) this.world = position.getWorld();
            player.placeAt({ x: feet.x, y: position.getY(), z: feet.z, yaw, pitch, headYaw });
        } else if (type === 'normal') {
            // The client's own move, which the store charges for and adds to the fall in progress.
            moveStorePlayer(placed.live.runtime, player, {
                position: feet,
                yaw,
                pitch,
                onGround: player.isOnGround(),
                headYaw
            });
        } else {
            // A reset or a teleport is not the player walking, so it costs nothing - and it must not
            // count as a fall either, or arriving anywhere below where you left would hurt.
            const { body } = placed.entity;
            body.yaw = yaw;
            body.pitch = pitch;
            player.headYaw = headYaw;
            placed.live.runtime.teleportPlayer(placed.entity.id, feet);
        }

        // Every move goes to the clients that see the player, a head turn included, which the
        // actor's own pose comparison leaves out.
        const actor = this.getActor();
        const sends =
            actor === undefined ? [] : [this.world.broadcastMove(actor, type === 'teleport' || type === 'respawn')];

        if (broadcast) sends.push(this.sendMove(this.shown(), type));
        return allSent(sends);
    }
}
