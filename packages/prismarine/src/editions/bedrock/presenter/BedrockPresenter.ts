import type { Weather } from '@jsprismarine/engine-systems';
import ContainerSetDataPacket from '@jsprismarine/protocol/bedrock/packet/ContainerSetDataPacket';
import UpdateTradePacket from '@jsprismarine/protocol/bedrock/packet/UpdateTradePacket';
import { blockSlotName } from '../../../inventory/containerSlots';
import type { OpenBlockContainer } from '../../../player/PlayerSession';
import { tradeOffersPayload } from '../tradeOffers';
import type { ProtocolContext } from '@jsprismarine/protocol';
import { ContainerUiId } from '@jsprismarine/minecraft';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import ContainerOpenPacket from '@jsprismarine/protocol/bedrock/packet/ContainerOpenPacket';
import InventoryContentPacket from '@jsprismarine/protocol/bedrock/packet/InventoryContentPacket';
import InventorySlotPacket from '@jsprismarine/protocol/bedrock/packet/InventorySlotPacket';
import MobEquipmentPacket from '@jsprismarine/protocol/bedrock/packet/MobEquipmentPacket';
import type HumanInventory from '../../../inventory/HumanInventory';
import { WindowIds } from '../../../inventory/WindowIds';
import { WindowTypes } from '../../../inventory/WindowTypes';
import type { Item } from '../../../item/Item';
import { wireStackOf } from '../wireStack';
import { armorPackets } from '../../../network/replica/firstSight';
import { Vector3 } from '@jsprismarine/math';
import { Dimension, PlayerRespawnState } from '@jsprismarine/minecraft';
import { PlayerActionType, PlayStatus, PlayStatusPacket, SetHealthPacket } from '@jsprismarine/protocol';
import ChangeDimensionPacket from '@jsprismarine/protocol/bedrock/packet/ChangeDimensionPacket';
import PlayerActionPacket from '@jsprismarine/protocol/bedrock/packet/PlayerActionPacket';
import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';
import DeathInfoPacket from '@jsprismarine/protocol/bedrock/packet/DeathInfoPacket';
import GameRulesChangedPacket from '@jsprismarine/protocol/bedrock/packet/GameRulesChangedPacket';
import RespawnPacket from '@jsprismarine/protocol/bedrock/packet/RespawnPacket';
import SetActorDataPacket from '@jsprismarine/protocol/bedrock/packet/SetActorDataPacket';
import SetActorMotionPacket from '@jsprismarine/protocol/bedrock/packet/SetActorMotionPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAttributesPacket';
import type { Attribute } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { GameRule } from '@jsprismarine/protocol/bedrock/wire/structures/GameRule';
import type { Metadata } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';
import type { Difficulty } from '@jsprismarine/minecraft';
import { Gametype } from '@jsprismarine/minecraft';
import { PositionMode, SetTimePacket, TakeItemActorPacket, TextPacketType } from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import SetDifficultyPacket from '@jsprismarine/protocol/bedrock/packet/SetDifficultyPacket';
import SetSpawnPositionPacket, {
    SpawnPositionType
} from '@jsprismarine/protocol/bedrock/packet/SetSpawnPositionPacket';
import MovePlayerPacket from '@jsprismarine/protocol/bedrock/packet/MovePlayerPacket';
import RemoveActorPacket from '@jsprismarine/protocol/bedrock/packet/RemoveActorPacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';
import TransferPacket from '@jsprismarine/protocol/bedrock/packet/TransferPacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAdventureSettingsPacket';
import UpdatePlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/UpdatePlayerGameTypePacket';
import UnlockedRecipesPacket, {
    UnlockedRecipesType
} from '@jsprismarine/protocol/bedrock/packet/UnlockedRecipesPacket';

import type ClientConnection from '../../../network/ClientConnection';
import type PlayerSession from '../../../player/PlayerSession';
import type { ShownEntity } from '../../../world/ShownActor';
import type { ListedPlayer } from '../../../network/playerListEntry';
import type { AbilityTarget } from '../../../network/replica/firstSight';
import { abilitiesPacket } from '../../../network/replica/firstSight';
import { bossEventOf } from './bedrockBossBar';
import { displaySlotPacketsOf, removeObjectivePacketOf, scorePacketOf } from './bedrockScoreboard';
import { titlePacketOf } from './bedrockTitle';
import { weatherPacketsOf } from './bedrockWeather';
import { killTelemetryOf } from './bedrockTelemetry';
import { playerListAddOf } from './bedrockPlayerList';
import type {
    BossBarChange,
    MessageKind,
    MoveMode,
    RecipeBookChange,
    ReportedKill,
    SessionPresenter,
    ShownActorData,
    ShownBossBar,
    ShownContainer,
    ShownDeath,
    ShownMessage,
    ShownMove,
    ShownObjective,
    ShownRespawnPoint,
    ShownScore,
    ShownTime,
    ShownTitle,
    ShownWorldChange,
    ShownWorldSpawn,
    WorldChangeShown
} from '../../../player/presenter/SessionPresenter';

/**
 * The `Text` type that shows each kind of message. `rawText` is `TextObject`, the one type whose
 * message the client parses as a JSON text object.
 */
const TEXT_TYPE: Readonly<Record<MessageKind, TextPacketType>> = {
    raw: TextPacketType.Raw,
    chat: TextPacketType.Chat,
    translation: TextPacketType.Translate,
    system: TextPacketType.SystemMessage,
    announcement: TextPacketType.Announcement,
    whisper: TextPacketType.Whisper,
    rawText: TextPacketType.TextObject
};

/** The `MovePlayer` mode for each kind of movement. */
const POSITION_MODE: Readonly<Record<MoveMode, PositionMode>> = {
    normal: PositionMode.Normal,
    respawn: PositionMode.Respawn,
    teleport: PositionMode.Teleport,
    headRotation: PositionMode.OnlyHeadRot
};

/** The part of a connection a presenter sends through. */
export type PresenterConnection = Pick<ClientConnection, 'sendDataPacket'>;

/**
 * The `CraftingDataPacket` entries a Java recipe unlocks in the client's book. A recipe with none
 * is not in the book. Without one, a recipe is named by its own id, which is the id its entry
 * goes out under unless it is a transmute.
 */
export type RecipeBookEntries = (recipe: string) => readonly string[];

const UNLOCKED_RECIPES_TYPE = {
    initial: UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES,
    unlocked: UnlockedRecipesType.NEWLY_UNLOCKED_RECIPES,
    locked: UnlockedRecipesType.REMOVE_UNLOCKED_RECIPES
} as const;

/**
 * The session state Bedrock's packets carry beside what the contract hands a presenter: who the
 * player is, as a packet about the player names it, and the client's last input tick, which such
 * a packet stamps so the client rewinds to it.
 */
export interface BedrockSessionState {
    /** The player's runtime id. */
    readonly runtimeId: bigint;
    /** The tick of the last `PlayerAuthInput` the session handled; see `PlayerSession.recordInputTick`. */
    lastInputTick(): bigint;
    /**
     * The player's own slots, in which Bedrock names each stack by a network id the server assigns
     * on the inventory, the codec context the stacks are written in, and the equipment the
     * player is shown wearing. Absent for a presenter built without a session, which shows no
     * inventory.
     */
    readonly inventory?: BedrockInventoryState;
    /** The loading screens the session waits on. Absent for a presenter built without a session. */
    readonly loadingScreens?: BedrockLoadingScreens;
}

/** The loading screens a Bedrock client shows through a change of dimension. */
export interface BedrockLoadingScreens {
    /** Hands out the `Loading Screen Id` of a screen about to open, which the session waits on. */
    begin(): number;
}

/** What a Bedrock presenter reads to show the player its own slots. */
export interface BedrockInventoryState {
    /** The player's inventory. */
    inventory(): HumanInventory;
    /** The context the client's codec writes item stacks in. */
    codecContext(): StackContext;
    /** What the player wears and holds in the off hand, as `MobArmorEquipment` shows it. */
    equipment(): ShownArmor;
    /**
     * Opens a window of `containerType` for the client, which the session records beside the
     * windows its blocks open, and returns its id.
     */
    openWindow(containerType: number): number;
}

/** The block position a `PlayerActionPacket` carries when the action has no block. */
const NO_BLOCK = { x: 0, y: 0, z: 0 };

/** The context an item stack is written in. */
type StackContext = ProtocolContext;

/** A wearer's equipment, as `armorPackets` reads it. */
type ShownArmor = Parameters<typeof armorPackets>[1];

/** Screens whose primary content packet spans several named request containers. */
const COMBINED_BLOCK_CONTENT_SCREENS: ReadonlySet<number> = new Set([
    WindowTypes.FURNACE,
    WindowTypes.BLAST_FURNACE,
    WindowTypes.SMOKER,
    WindowTypes.BREWING_STAND
]);

/** A session with no player yet, as a presenter built before one has an id. */
const NO_SESSION: BedrockSessionState = { runtimeId: 0n, lastInputTick: () => 0n };

/** One of the player's own slots as the wire carries it, under the id the client names the stack by. */
const ownSlotDescriptor = (item: Item | null, context: StackContext) =>
    wireStackOf(item).toStackDescriptor(context, item !== null && item.stackNetworkId > 0 ? item.stackNetworkId : null);

/**
 * The window and the container name a client numbers each of its player's own slots by, for the
 * containers it always has open. The ender chest is sent when one is opened, and the crafting
 * grid is emptied when its screen closes, so neither is here.
 */
const OWN_SLOT_WINDOWS: Readonly<Record<ShownContainer, { readonly windowId: number; readonly containerId: number }>> =
    {
        inventory: { windowId: WindowIds.INVENTORY, containerId: ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY },
        armor: { windowId: WindowIds.ARMOR, containerId: ContainerUiId.ARMOR_CONTAINER },
        offhand: { windowId: WindowIds.OFFHAND, containerId: ContainerUiId.OFFHAND },
        cursor: { windowId: WindowIds.PLAYER_ONLY_UI, containerId: ContainerUiId.CURSOR }
    };

/** The outbound contract in Bedrock packets, over one client's connection. */
export class BedrockPresenter implements SessionPresenter {
    public readonly edition = 'bedrock';
    private readonly connection: PresenterConnection;
    private readonly bookEntries: RecipeBookEntries;
    private readonly state: BedrockSessionState;

    /**
     * @param connection - The connection the session's client is on.
     * @param bookEntries - The book entries of each recipe; see {@link RecipeBookEntries}.
     * @param state - The session state the packets about the player carry.
     */
    public constructor(
        connection: PresenterConnection,
        bookEntries: RecipeBookEntries = (recipe) => [recipe],
        state: BedrockSessionState = NO_SESSION
    ) {
        this.connection = connection;
        this.bookEntries = bookEntries;
        this.state = state;
    }

    /**
     * The `PlayerInputTick` a packet about `runtimeId` carries: the client's last input tick for
     * its own player, and zero for anything else, as the docs ask.
     */
    private inputTickFor(runtimeId: bigint): bigint {
        return runtimeId === this.state.runtimeId ? this.state.lastInputTick() : 0n;
    }

    /** The session's inventory state, which a presenter built without a session lacks. */
    private inventoryState(): BedrockInventoryState {
        const state = this.state.inventory;
        if (state === undefined) throw new PrismarineNetworkErrors.PresenterHasNoSession();
        return state;
    }

    /**
     * Sends the player's own slots under `windowId`: the inventory, the hand it holds, and the
     * armor, which is a window of its own. Every stack goes out with the id the client will name it
     * by in its requests. The armor's `Full Container Name` has to say armor: the packet defaults
     * to the player's combined hotbar and inventory, which named the wrong container for window
     * 120, and a player would open their screen to four empty slots.
     */
    private async sendOwnInventory(windowId: number): Promise<void> {
        const state = this.inventoryState();
        const inventory = state.inventory();
        const context = state.codecContext();
        inventory.assignStackNetworkIds();

        const contents = new InventoryContentPacket();
        contents.items = inventory
            .container('inventory')
            .items()
            .map((item) => ownSlotDescriptor(item, context));
        contents.windowId = windowId;

        const slot = inventory.getHandSlot();
        const hand = new MobEquipmentPacket({
            runtimeEntityId: this.state.runtimeId,
            item: wireStackOf(inventory.equipment('mainhand')).toStackDescriptor(context),
            inventorySlot: slot,
            hotbarSlot: slot,
            windowId: WindowIds.INVENTORY
        });

        const armor = new InventoryContentPacket();
        armor.items = inventory
            .container('armor')
            .items()
            .map((item) => ownSlotDescriptor(item, context));
        armor.windowId = WindowIds.ARMOR;
        armor.containerId = ContainerUiId.ARMOR_CONTAINER;

        await Promise.all([
            this.connection.sendDataPacket(contents),
            this.connection.sendDataPacket(hand),
            this.connection.sendDataPacket(armor),
            ...armorPackets(this.state.runtimeId, state.equipment(), context).map((packet) =>
                this.connection.sendDataPacket(packet)
            )
        ]);
    }

    /**
     * Sends the player's own slots, read from the session's inventory with the stack ids a Bedrock
     * client names stacks by, rather than from the plain stacks the contract hands a presenter.
     */
    public async showInventory(): Promise<void> {
        await this.sendOwnInventory(WindowIds.INVENTORY);
    }

    /**
     * Opens the player's own inventory under a window of its own rather than under zero, which is
     * the inventory the client always has, and sends its contents under that window: a window whose
     * contents never arrive is one the client has no reason to keep. No position: a container an
     * actor carries is named by the actor, not by a block.
     * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/InventoryManager.php (onClientOpenMainInventory)
     */
    public async openOwnInventory(): Promise<void> {
        const open = new ContainerOpenPacket();
        open.containerType = WindowTypes.INVENTORY;
        open.windowId = this.inventoryState().openWindow(open.containerType);
        open.containerEntityId = this.state.runtimeId;
        await Promise.all([this.connection.sendDataPacket(open), this.sendOwnInventory(open.windowId)]);
    }

    /**
     * Sends `InventorySlot` for one of the player's own slots, read from the session's inventory
     * under the stack network id the client is to name it by. Replication sends it for a
     * `slot-shown` occurrence: a slot whose write was undone holds a stack with a new id.
     */
    public async showOwnSlot(container: ShownContainer, slot: number): Promise<void> {
        const state = this.inventoryState();
        const inventory = state.inventory();
        inventory.assignStackNetworkIds();
        const item = inventory.slotItem(container, slot);
        if (item === undefined) return;

        const window = OWN_SLOT_WINDOWS[container];
        const packet = new InventorySlotPacket();
        packet.windowId = window.windowId;
        packet.containerId = window.containerId;
        packet.inventorySlot = slot;
        packet.item =
            item?.toStackDescriptor(state.codecContext(), item.stackNetworkId > 0 ? item.stackNetworkId : null) ?? null;
        await this.connection.sendDataPacket(packet);
    }

    /** The stack network id the player's inventory gives `item` in a window, or null for air. */
    private stackIdFor(item: Item): number | null {
        const id = this.inventoryState().inventory().assignStackNetworkId(item);
        return id > 0 ? id : null;
    }

    /**
     * Sends `ContainerOpen` for a block's screen or a trader's, and what the block holds.
     *
     * The contents follow the open because a window whose contents never arrive is one the client
     * has no reason to keep. A furnace's or a brewing stand's go out as one complete primary
     * inventory: one packet per named slot left the client without the window's whole storage
     * model, and it refused moves into those slots before it sent a request. Every other screen
     * names each slot list under the container the client uses for requests to that part of it.
     * A crafting table is followed by the player's inventory under window 0 and its armor. The
     * pinned servers follow every screen with all four of the player's windows, at every protocol
     * ([#3890](https://github.com/JSPrismarine/JSPrismarine/issues/3890)).
     * @bdsSee open-crafting-table
     */
    public async openContainer(window: OpenBlockContainer, contents: readonly (Item | null)[]): Promise<void> {
        const open = new ContainerOpenPacket();
        open.windowId = window.windowId;
        open.containerType = window.screen;
        open.containerPos = window.position;
        // A trader's screen is open on the actor; -1 for a block's, which is no actor.
        open.containerEntityId = window.trade?.trader.getRuntimeId() ?? -1n;
        await this.connection.sendDataPacket(open);

        if (contents.length > 0) {
            const context = this.inventoryState().codecContext();
            const descriptor = (held: Item | null) => {
                const item = wireStackOf(held);
                return item.toStackDescriptor(context, this.stackIdFor(item));
            };
            if (COMBINED_BLOCK_CONTENT_SCREENS.has(window.screen)) {
                const content = new InventoryContentPacket();
                content.windowId = window.windowId;
                content.containerId = ContainerUiId.LEVEL_ENTITY_CONTAINER;
                content.items = contents.map(descriptor);
                await this.connection.sendDataPacket(content);
            } else {
                const byContainer = new Map<number, (Item | null)[]>();
                contents.forEach((held, slot) => {
                    const named = blockSlotName(window.screen, slot);
                    const slots = byContainer.get(named.containerId) ?? [];
                    slots[named.slotId] = held;
                    byContainer.set(named.containerId, slots);
                });
                for (const [containerId, slots] of byContainer) {
                    const content = new InventoryContentPacket();
                    content.windowId = window.windowId;
                    content.containerId = containerId;
                    content.items = slots.map(descriptor);
                    await this.connection.sendDataPacket(content);
                }
            }
        }

        if (window.screen === WindowTypes.WORKBENCH) await this.sendOwnInventory(WindowIds.INVENTORY);
    }

    /** Sends `UpdateTrade`, the offers the client draws a trade screen from. */
    public async showTradeOffers(window: OpenBlockContainer): Promise<void> {
        const trade = window.trade;
        if (trade === undefined) return;
        const offers = trade.source.offers(trade.context());
        await this.connection.sendDataPacket(
            new UpdateTradePacket({
                containerId: window.windowId,
                type: WindowTypes.TRADE,
                size: offers.length,
                traderTier: trade.source.level - 1,
                entityUniqueId: trade.trader.getRuntimeId(),
                lastTradingPlayer: this.state.runtimeId,
                displayName: trade.title ?? trade.trader.getName(),
                useNewTradeScreen: true,
                usingEconomyTrade: true,
                data: tradeOffersPayload(offers, trade.source.tierRequirements())
            })
        );
    }

    /** Sends one `ContainerSetData` per property, which is how a progress bar moves. */
    public async showContainerData(window: OpenBlockContainer, properties: ReadonlyMap<number, number>): Promise<void> {
        await Promise.all(
            [...properties].map(([id, value]) => {
                const packet = new ContainerSetDataPacket();
                packet.containerId = window.windowId;
                packet.id = id;
                packet.value = value;
                return this.connection.sendDataPacket(packet);
            })
        );
    }

    /**
     * Sends `InventorySlot` for slots of an open block's screen, each under the container that
     * screen numbers it in and under a stack network id of this player's, as when it opened, so
     * the client can still take it.
     */
    public async showContainerSlots(
        window: OpenBlockContainer,
        slots: readonly { readonly slot: number; readonly item: Item | null }[]
    ): Promise<void> {
        const context = this.inventoryState().codecContext();
        await Promise.all(
            slots.map(({ slot, item: held }) => {
                const named = blockSlotName(window.screen, slot);
                const item = wireStackOf(held);
                const packet = new InventorySlotPacket();
                packet.windowId = window.windowId;
                packet.containerId = named.containerId;
                packet.inventorySlot = named.slotId;
                packet.item = item.toStackDescriptor(context, this.stackIdFor(item));
                return this.connection.sendDataPacket(packet);
            })
        );
    }

    /** Sends `UpdateAttributes`, the player's vitals and experience among them. */
    public async showAttributes(runtimeId: bigint, attributes: readonly Attribute[]): Promise<void> {
        const packet = new UpdateAttributesPacket();
        packet.runtimeEntityId = runtimeId;
        packet.attributes = [...attributes];
        packet.tick = this.inputTickFor(runtimeId);
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Sends `SetActorMotion` for the player. Its `Tick` is the client's last input tick: the
     * client rewinds to that tick, applies the velocity and replays what it predicted since.
     */
    public async showMotion({
        x,
        y,
        z
    }: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    }): Promise<void> {
        const packet = new SetActorMotionPacket();
        packet.runtimeEntityId = this.state.runtimeId;
        packet.motion = new Vector3(x, y, z);
        packet.tick = this.state.lastInputTick();
        await this.connection.sendDataPacket(packet);
    }

    /** Sends `SetActorData`. */
    public async showActorData(entity: ShownActorData, metadata?: Metadata): Promise<void> {
        const packet = new SetActorDataPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.metadata = metadata ?? entity.metadata;
        packet.syncedProperties = entity.getSyncedProperties();
        packet.tick = this.inputTickFor(entity.getRuntimeId());
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Sends `ActorEvent(SPAWN_ALIVE)` for the player and its health, as an unpinned Bedrock
     * Dedicated Server does when the respawn button is pressed. No `MovePlayer`: the client has
     * put itself at the `ReadyToSpawn` position already.
     */
    public async showRespawned(health: number): Promise<void> {
        const event = new ActorEventPacket();
        event.runtimeEntityId = this.state.runtimeId;
        event.event = ActorEvent.SPAWN_ALIVE;
        await Promise.all([
            this.connection.sendDataPacket(event),
            this.connection.sendDataPacket(new SetHealthPacket({ health }))
        ]);
    }

    /** Sends `GameRulesChanged`. */
    public async showGameRules(rules: readonly GameRule[]): Promise<void> {
        const packet = new GameRulesChangedPacket();
        packet.rulesList = [...rules];
        await this.connection.sendDataPacket(packet);
    }

    /** Sends `SetTime`. */
    public async sendTime({ dayTime }: ShownTime): Promise<void> {
        await this.connection.sendDataPacket(new SetTimePacket({ time: dayTime }));
    }

    /** Sends `SetPlayerGameType`. */
    public async sendGamemode(gamemode: Gametype): Promise<void> {
        await this.connection.sendDataPacket(new SetPlayerGameTypePacket({ gametype: gamemode }));
    }

    /** Sends `SetDefaultGameType`. */
    public async sendDefaultGameMode(gamemode: Gametype): Promise<void> {
        const reply = new SetDefaultGameTypePacket();
        reply.gamemode = gamemode;
        await this.connection.sendDataPacket(reply);
    }

    /**
     * Sends `UpdatePlayerGameType`, which the docs have the server send to every client after it
     * accepts a game type change, because each client caches the game type and permission flags
     * of every player it knows about.
     */
    public async sendPlayerGameMode(runtimeId: bigint, gamemode: Gametype, inputTick: bigint): Promise<void> {
        await this.connection.sendDataPacket(
            new UpdatePlayerGameTypePacket({ playerGameType: gamemode, targetPlayer: runtimeId, tick: inputTick })
        );
    }

    /**
     * Sends `UpdateAdventureSettings`. It names no actor and describes the client receiving it,
     * so it goes to that client alone: a spectator's `worldImmutable` sent to everyone froze the
     * world for every other client.
     */
    public async sendInteractionSettings(gamemode: Gametype): Promise<void> {
        const spectator = gamemode === Gametype.SPECTATOR;
        await this.connection.sendDataPacket(
            new UpdateAdventureSettingsPacket({
                worldImmutable: spectator,
                noAttackingPlayers: spectator,
                noAttackingMobs: spectator,
                autoJump: true,
                showNameTags: true
            })
        );
    }

    /** Sends `UpdateAbilities` (`abilitiesPacket`). */
    public async sendAbilities(target: AbilityTarget): Promise<void> {
        await this.connection.sendDataPacket(abilitiesPacket(target));
    }

    /** Queues the entity's own first-sight batch, which it builds once a flush for each codec. */
    public showEntity(entity: ShownEntity, session: PlayerSession): Promise<void> {
        return entity.spawnTo(session);
    }

    /** Sends `RemoveActor`; the server gives an entity one id for its runtime and unique ids. */
    public async hideEntity(runtimeId: bigint): Promise<void> {
        const packet = new RemoveActorPacket();
        packet.uniqueEntityId = runtimeId;
        await this.connection.sendDataPacket(packet);
    }

    /** Sends nothing: a Bedrock client's moves go in the replicator's shared batches. */
    public async moveEntities(): Promise<void> {}

    /** Sends nothing: a Bedrock client's block changes go in the replicator's shared batches. */
    public async showBlocks(): Promise<void> {}

    /** Sends nothing: a Bedrock client's entity data goes in the replicator's shared batches. */
    public async showEntityState(): Promise<void> {}

    /** Sends nothing: a Bedrock client's equipment goes in the replicator's shared batches. */
    public async showEquipment(): Promise<void> {}

    /** Sends nothing: a Bedrock client's vitals are attributes, which {@link showAttributes} sends. */
    public async showVitals(): Promise<void> {}

    /** Sends nothing: a Bedrock client's experience is two attributes, which {@link showAttributes} sends. */
    public async showExperience(): Promise<void> {}

    /** Sends nothing: the world's `UPDATE_STACK_SIZE` actor event tells a Bedrock client. */
    public async showItemCount(): Promise<void> {}

    /** Sends `TakeItemActor`, which carries no count: the client animates the whole stack. */
    public async showPickUp(item: bigint, collector: bigint): Promise<void> {
        const take = new TakeItemActorPacket();
        take.itemRuntimeEntityId = item;
        take.takerRuntimeEntityId = collector;
        await this.connection.sendDataPacket(take);
    }

    /** Sends `Respawn(SearchingForSpawn)`, the first half of Bedrock's respawn exchange, and `DeathInfo`. */
    public async showDeath({ key, parameters, respawnAt }: ShownDeath): Promise<void> {
        // The screen's copy of the cause, then `Respawn(SearchingForSpawn)`, which says where the
        // player will come back and which the client waits for before it offers the button. The
        // pinned servers send them in this order, at every protocol, and the `Respawn`'s
        // `Player Runtime Id` is 0. PocketMine's `DeathPacketHandler` sends them the other way.
        // @bdsSee death-screen
        // Both sent before either is awaited: the connection keeps the order they are called in.
        await Promise.all([
            this.connection.sendDataPacket(new DeathInfoPacket({ cause: key, messages: [...parameters] })),
            this.connection.sendDataPacket(
                new RespawnPacket({
                    position: respawnAt,
                    state: PlayerRespawnState.SEARCHING_FOR_SPAWN,
                    runtimeEntityId: 0n
                })
            )
        ]);
    }

    /** Sends `LegacyTelemetryEvent` as BDS does; see {@link killTelemetryOf}. */
    public async reportKill(kill: ReportedKill): Promise<void> {
        await this.connection.sendDataPacket(killTelemetryOf(kill));
    }

    /**
     * True: a Bedrock client stands its player at the `ReadyToSpawn` position
     * {@link showRespawnPoint} sent, and keeps its chunks.
     */
    public readonly placesItselfOnRespawn = true;

    /** Sends nothing: a Bedrock client comes back where {@link showRespawnPoint} told it. */
    public async showRespawn(): Promise<void> {}

    /**
     * Sends the server's half of Bedrock's respawn exchange: `Respawn(SearchingForSpawn)` at the
     * block, then `Respawn(ReadyToSpawn)` at the eyes, or the second alone without a block.
     *
     * Sending only `ReadyToSpawn` to a dead player leaves the client on "Respawning" for ever: it
     * waits to be told where it comes back before it offers the button. `Player Runtime Id` is
     * always 0, as in every `Respawn` the pinned servers send, at every protocol.
     * @bdsSee respawn
     */
    public async showRespawnPoint({ block, eyes }: ShownRespawnPoint): Promise<void> {
        const respawn = (position: ShownRespawnPoint['eyes'], state: PlayerRespawnState) =>
            this.connection.sendDataPacket(new RespawnPacket({ position, state, runtimeEntityId: 0n }));
        await Promise.all([
            ...(block === undefined ? [] : [respawn(block, PlayerRespawnState.SEARCHING_FOR_SPAWN)]),
            respawn(eyes, PlayerRespawnState.READY_TO_SPAWN)
        ]);
    }

    /**
     * Sends `ChangeDimension` under a new loading screen, and the server's
     * `PlayerAction(ChangeDimensionAck)`, which the session's chunks follow. The client shows the
     * screen until it has loaded into the new dimension, and the session waits for it to close.
     *
     * The pinned servers send no `StopSound` and no `PlayStatus` in this exchange, at every
     * protocol: the client stops its sounds itself, and `PlayStatus(PlayerSpawn)` is the join's.
     * They send the acknowledgment after the publisher updates that bring the chunks in. This
     * sends it ahead of the chunks, which the client takes as well.
     * @bdsSee change-dimension
     *
     * A client sent `ChangeDimension` into the dimension it is already in never closes the
     * screen, so a move between two worlds of one Bedrock id first goes through another
     * dimension and back, each step under a screen of its own.
     */
    public showWorldChange({ from, dimension, eyes, keepData }: ShownWorldChange): WorldChangeShown {
        const sends: Promise<void>[] = [];
        if (from.bedrockId === dimension.bedrockId) sends.push(this.detourFrom(dimension.bedrockId, eyes));
        const loadingScreen = this.loadingScreens().begin();
        sends.push(
            this.connection.sendDataPacket(
                new ChangeDimensionPacket({
                    dimension: dimension.bedrockId,
                    position: new Vector3(eyes.x, eyes.y, eyes.z),
                    respawn: !keepData,
                    loadingScreenId: loadingScreen
                })
            ),
            // Since 1.19.50 the server sends the acknowledgment that used to be the client's; the
            // client still answers with its own copy afterwards.
            this.connection.sendDataPacket(
                new PlayerActionPacket({
                    runtimeEntityId: this.state.runtimeId,
                    action: PlayerActionType.ChangeDimensionAck,
                    blockPosition: NO_BLOCK,
                    resultPosition: NO_BLOCK,
                    blockFace: 0
                })
            )
        );
        return { sent: Promise.all(sends).then(() => undefined), loadingScreen };
    }

    /**
     * The detour {@link showWorldChange} takes between two worlds of one Bedrock id: the current
     * id, another and that other again, each with its own screen and spawn status, ahead of the
     * real `ChangeDimension`.
     */
    private detourFrom(bedrockId: number, eyes: ShownWorldChange['eyes']): Promise<void> {
        const away = bedrockId === Dimension.NETHER ? Dimension.OVERWORLD : Dimension.NETHER;
        const position = new Vector3(eyes.x, eyes.y, eyes.z);
        const sends: Promise<void>[] = [];
        for (const dimension of [bedrockId, away, away]) {
            sends.push(
                this.connection.sendDataPacket(
                    new ChangeDimensionPacket({
                        dimension,
                        position,
                        respawn: false,
                        loadingScreenId: this.loadingScreens().begin()
                    })
                ),
                this.connection.sendDataPacket(new PlayStatusPacket({ status: PlayStatus.PlayerSpawn }))
            );
        }
        return Promise.all(sends).then(() => undefined);
    }

    /** The session's loading screens, which a presenter built without a session lacks. */
    private loadingScreens(): BedrockLoadingScreens {
        const screens = this.state.loadingScreens;
        if (screens === undefined) throw new PrismarineNetworkErrors.PresenterHasNoSession();
        return screens;
    }

    /** Sends one `PlayerList` Add with every entry. */
    public async sendPlayerList(players: readonly ListedPlayer[]): Promise<void> {
        await this.connection.sendDataPacket(playerListAddOf(players));
    }

    /** Sends `MovePlayer`. */
    public async sendMove({
        runtimeId,
        position,
        pitch,
        yaw,
        headYaw,
        onGround,
        mode,
        inputTick
    }: ShownMove): Promise<void> {
        await this.connection.sendDataPacket(
            new MovePlayerPacket({
                runtimeEntityId: runtimeId,
                position,
                pitch,
                yaw,
                headYaw,
                mode: POSITION_MODE[mode],
                onGround,
                // "If client bound this has no meaning", so it is always zero here.
                ridingEntityRuntimeId: 0n,
                // The server does not model why a teleport happened, so the cause is Unknown (0)
                // and the source actor type is 0.
                teleportData: mode === 'teleport' ? { cause: 0, sourceActorType: 0 } : null,
                tick: inputTick
            })
        );
    }

    /**
     * Sends `ContainerClose` back with the id and type the client sent, and `Server Initiated
     * Close` false, since the player closed this one. A Bedrock client takes its screen down
     * first and waits for this answer before it opens the next container.
     */
    public async containerClosed(window: number, clientContainerType: number): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.containerId = window;
        pk.containerType = clientContainerType;
        pk.serverInitiatedClose = false;
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sends `Text`, with `Filtered Message` empty: it is the text after chat filtering, which a
     * dedicated server leaves empty for its own messages. Repeating the message there doubled
     * the payload.
     */
    public async sendMessage({
        message,
        kind,
        parameters,
        needsTranslation,
        sourceName,
        xuid
    }: ShownMessage): Promise<void> {
        await this.connection.sendDataPacket(
            new TextPacket({
                type: TEXT_TYPE[kind],
                needsTranslation,
                sourceName,
                message,
                parameters: [...parameters],
                xuid,
                platformChatId: '',
                filtered: ''
            })
        );
    }

    /** Sends `BossEvent`; see {@link bossEventOf}. */
    public async showBossBar(change: BossBarChange, bar: ShownBossBar): Promise<void> {
        await this.connection.sendDataPacket(bossEventOf(change, bar));
    }

    /** Sends `SetTitle`; see {@link titlePacketOf}. */
    public async showTitle(title: ShownTitle): Promise<void> {
        await this.connection.sendDataPacket(titlePacketOf(title));
    }

    /** Sends `SetDisplayObjective`, then `SetScore` with every score the slot shows. */
    public async showDisplaySlot(slot: string, objective: ShownObjective | undefined): Promise<void> {
        // Queued together, so no other packet comes between the header and its scores.
        await Promise.all(
            displaySlotPacketsOf(slot, objective).map((packet) => this.connection.sendDataPacket(packet))
        );
    }

    /** Sends `SetScore` with the holder's new score, or its removal. */
    public async showScore(
        objective: string,
        holder: Omit<ShownScore, 'value'>,
        value: number | undefined
    ): Promise<void> {
        await this.connection.sendDataPacket(scorePacketOf(objective, holder, value));
    }

    /** Sends `RemoveObjective`. */
    public async removeObjective(objective: string): Promise<void> {
        await this.connection.sendDataPacket(removeObjectivePacketOf(objective));
    }

    /** Sends the level events that take the client's sky to the weather; see {@link weatherPacketsOf}. */
    public async showWeather(from: Weather | undefined, to: Weather): Promise<void> {
        await Promise.all(weatherPacketsOf(from, to).map((packet) => this.connection.sendDataPacket(packet)));
    }

    /** Sends `SetDifficulty`. */
    public async showDifficulty(difficulty: Difficulty): Promise<void> {
        await this.connection.sendDataPacket(new SetDifficultyPacket({ difficulty }));
    }

    /** Sends `SetSpawnPosition` as the world's spawn. */
    public async showWorldSpawn({ dimension, position }: ShownWorldSpawn): Promise<void> {
        const blockPosition = { x: position.x, y: position.y, z: position.z };
        await this.connection.sendDataPacket(
            new SetSpawnPositionPacket({
                type: SpawnPositionType.WorldSpawn,
                position: blockPosition,
                dimension: dimension.bedrockId,
                blockPosition
            })
        );
    }

    /** Not shown: a Bedrock client follows the server's ticks and has no tick rate of its own. */
    public async showTicking(): Promise<void> {}

    /** Not shown: a Bedrock client follows the server's ticks and has no tick rate of its own. */
    public async showTickStep(): Promise<void> {}

    /**
     * Sends `UnlockedRecipes` with the book entries of the recipes. A delta that names no entry
     * is not sent; the whole book is, so a player with none still gets an empty book.
     */
    public async showRecipeBook(change: RecipeBookChange): Promise<void> {
        const recipes = change.recipes.flatMap(this.bookEntries);
        if (recipes.length === 0 && change.kind !== 'initial') return;

        await this.connection.sendDataPacket(
            new UnlockedRecipesPacket({ type: UNLOCKED_RECIPES_TYPE[change.kind], recipes })
        );
    }

    /** Sends `Transfer`, which keeps the world the client has loaded until the other server's arrives. */
    public async transfer(host: string, port: number): Promise<void> {
        await this.connection.sendDataPacket(
            new TransferPacket({
                address: host,
                port,
                reloadWorld: false,
                gatheringsConfig: null,
                transferSettings: null
            })
        );
    }
}
