/**
 * What the server asks one session's client to show, in no edition's terms
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)).
 *
 * A session owns one presenter, chosen by the edition its client speaks, and the presenter turns
 * each call into that edition's packets. Nothing outside a presenter builds an outbound packet
 * for a session's own client once the contract covers it. The contract grows slice by slice, as
 * the plan in `docs/plans/java-multiprotocol.md` describes, from what each slice moves out of
 * `PlayerSession`.
 *
 * Every method queues its packets before it returns and hands back a promise that settles once
 * the transport has taken them, the way `PlayerSession`'s sends always have, so a caller in the
 * input step can hand that promise to the step's outputs.
 */
import type { TitleInstruction } from '@jsprismarine/commands';
import type { Vector3 } from '@jsprismarine/math';
import type { Weather } from '@jsprismarine/engine-systems';
import type { Difficulty, Gametype } from '@jsprismarine/minecraft';
import type { StackComponents } from '../../item/stackComponents';
import type { DamageCause } from '../../entity/DamageCause';

import type { ListedPlayer } from '../../network/playerListEntry';
import type { AbilityTarget } from '../../network/replica/firstSight';
import type { ChunkWire } from '../ChunkView';
import type PlayerSession from '../PlayerSession';
import type { OpenBlockContainer } from '../PlayerSession';
import type { Item } from '../../item/Item';
import type { ShownActor, ShownEntity } from '../../world/ShownActor';
import type { Attribute } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { GameRule } from '@jsprismarine/protocol/bedrock/wire/structures/GameRule';
import type { Metadata } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';

/**
 * How a message is shown.
 *
 * `raw` is a line the server already formatted. `chat` is a player's own message, which the client
 * draws with its author. `translation` is a key the client looks up. `rawText` is a JSON text object
 * the client renders itself, the one `/tellraw` takes.
 */
export type MessageKind = 'raw' | 'chat' | 'translation' | 'system' | 'announcement' | 'whisper' | 'rawText';

/**
 * What produced a player's movement: `normal` movement, a `respawn`, a `teleport`, or a turn of the
 * head alone (`headRotation`), which a client in a vehicle reports.
 */
export type MoveMode = 'normal' | 'respawn' | 'teleport' | 'headRotation';

/** One player's place and facing, as a session's client is told it. */
export interface ShownMove {
    readonly runtimeId: bigint;
    /** Where the player's eyes are. */
    readonly position: Vector3;
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
    readonly onGround: boolean;
    readonly mode: MoveMode;
    /**
     * The client's last input tick when the player is its own, so the client rewinds to it and
     * replays its predictions from there, and zero for anyone else.
     */
    readonly inputTick: bigint;
}

/** One message for a session's client. */
export interface ShownMessage {
    /** The text, or the translation key when `needsTranslation` is set. */
    readonly message: string;
    readonly kind: MessageKind;
    /** What the client substitutes into a translated message. */
    readonly parameters: readonly string[];
    readonly needsTranslation: boolean;
    /** The author's name, for a player's own chat, and empty otherwise. */
    readonly sourceName: string;
    /** The author's XUID, for a player's own chat, and empty without one. */
    readonly xuid: string;
}

/** One entity's move this tick, as plain data. */
export interface ShownEntityMove {
    readonly runtimeId: bigint;
    /** Where Bedrock positions it: a player's eyes, any other entity's feet. */
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
    readonly pitch: number;
    readonly headYaw: number;
    readonly onGround: boolean;
}

/** One block's new state this tick, as plain data. */
export interface ShownBlockChange {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** The block's Bedrock runtime id. */
    readonly runtimeId: number;
    /** Whether water shares the block, which Bedrock keeps in its second storage layer. */
    readonly waterlogged: boolean;
}

/** The dimension a world is, as plain data. */
export interface ShownDimension {
    /** The Java `dimension_type` id, `minecraft:the_nether` for the Nether. */
    readonly id: string;
    /** The world's sea level. */
    readonly seaLevel: number;
}

/** A player spawned again on its client: after a death, or into another world. */
export interface ShownRespawn {
    /** The player's game mode. */
    readonly gamemode: Gametype;
    /** The dimension the player is in from now on. */
    readonly dimension: ShownDimension;
    /** Where the player's feet are from now on. */
    readonly feet: { readonly x: number; readonly y: number; readonly z: number };
    /**
     * Whether the player lives on, as a change of world keeps it, rather than coming back from a
     * death, which keeps nothing.
     */
    readonly keepData: boolean;
    /**
     * Whether the player left another world of the same dimension, such as the Overworld of
     * another level, whose chunks the client still holds under the same name.
     */
    readonly replacesWorld: boolean;
}

/**
 * A stack as plain data: the item's Bedrock identifier and how many, and what it changes from the
 * item's defaults. A field left out is the item's own.
 */
export interface ShownStack {
    readonly name: string;
    readonly count: number;
    /** The name an anvil or a command gave it. */
    readonly customName?: string;
    readonly lore?: readonly string[];
    /** How much durability it has spent, for an item that wears. */
    readonly damage?: number;
    /** Its enchantments' levels, by Java enchantment id; an enchanted book's are the ones it applies. */
    readonly enchantments?: ReadonlyMap<string, number>;
    /** Its other Java data components, in Java's JSON form. */
    readonly components?: StackComponents;
}

/** What an entity holds and wears, by slot; a slot left out is empty. */
export type ShownEquipment = Partial<
    Record<'mainhand' | 'offhand' | 'head' | 'chest' | 'legs' | 'feet' | 'body', ShownStack>
>;

/** How an entity carries itself, as every edition draws it. */
export interface ShownEntityState {
    readonly onFire: boolean;
    readonly sneaking: boolean;
    readonly sprinting: boolean;
    readonly swimming: boolean;
    readonly invisible: boolean;
    readonly gliding: boolean;
    readonly sleeping: boolean;
}

/** The containers of a player's own inventory that a client shows. */
export type ShownContainer = 'inventory' | 'armor' | 'offhand' | 'cursor';

/** A player's own inventory as plain stacks, an empty slot null. */
export interface ShownInventory {
    /** The inventory's 36 slots: the hotbar's 9, then the 27 above it. */
    readonly inventory: readonly (ShownStack | null)[];
    /** Head, chest, legs and feet. */
    readonly armor: readonly (ShownStack | null)[];
    readonly offhand: ShownStack | null;
    /** The hotbar slot the hand holds, 0 to 8. */
    readonly handSlot: number;
}

/** A player's own health, food level and saturation. */
export interface ShownVitals {
    readonly health: number;
    readonly food: number;
    readonly saturation: number;
}

/** A player's own experience: whole levels, and how far along the next one the bar is, from 0 to 1. */
export interface ShownExperience {
    readonly level: number;
    readonly progress: number;
}

/**
 * A kill the client's player took part in, which a Bedrock client is told of the way a Bedrock
 * Dedicated Server tells it: `killedMob` when the player dealt the killing blow, `killedBy` when
 * an entity dealt it to the player.
 */
export type ReportedKill =
    | {
          readonly kind: 'killedMob';
          /** The player's runtime id. */
          readonly player: bigint;
          /** The runtime id of the entity that died. */
          readonly victim: bigint;
          readonly cause: DamageCause;
          /** The identifier of the projectile that dealt the blow, when one did. */
          readonly projectile: string | undefined;
      }
    | {
          readonly kind: 'killedBy';
          /** The player's runtime id. */
          readonly player: bigint;
          /** The identifier of the entity that dealt the blow. */
          readonly killer: string;
          readonly cause: DamageCause;
      };

/** Why a player died, as a translation: the key without Bedrock's `%`, and what fills it. */
export interface ShownDeath {
    readonly key: string;
    readonly parameters: readonly string[];
    /** Where the player will come back, which Bedrock's death screen waits for before it offers the button. */
    readonly respawnAt: { readonly x: number; readonly y: number; readonly z: number };
}

/** What {@link SessionPresenter.showActorData} reads of an entity: its id, its actor data and its synced properties. */
export type ShownActorData = Pick<ShownActor, 'getRuntimeId' | 'metadata' | 'getSyncedProperties'>;

/** A boss bar's color. Bedrock has a `rebeccaPurple` that Java lacks. */
export type ShownBossBarColor = 'pink' | 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'rebeccaPurple' | 'white';

/** How a boss bar is divided: one undivided bar, or 6, 10, 12 or 20 notches. */
export type ShownBossBarStyle = 'progress' | 'notched6' | 'notched10' | 'notched12' | 'notched20';

/**
 * What changed about a boss bar: it appeared, it went away, or its fill or its title changed.
 * A change of color goes as a `remove` and an `add`.
 */
export type BossBarChange = 'add' | 'remove' | 'progress' | 'name';

/** One boss bar as it is now. */
export interface ShownBossBar {
    /** The bar, the same number for as long as it exists, which tells one bar from another. */
    readonly id: number;
    /** The actor a Bedrock client binds the bar to. */
    readonly actorUniqueId: bigint;
    /** The title above the bar. */
    readonly title: string;
    /** How full the bar is, 0 to 1. */
    readonly progress: number;
    readonly color: ShownBossBarColor;
    readonly style: ShownBossBarStyle;
}

/**
 * A title instruction: text for the title, the subtitle or the action bar, the timing, or a clear
 * or reset of what the screen shows. `/title`, `/titleraw` and the scripts' `ScreenDisplay` send
 * these.
 */
export type ShownTitle = TitleInstruction;

/** One holder's line in an objective. */
export interface ShownScore {
    /** The holder's name, which a Java client keys the line by. */
    readonly holder: string;
    /** The scoreboard's id for the holder, which a Bedrock client keys the line by. */
    readonly identity: bigint;
    readonly value: number;
}

/** The objective a display slot shows, and every score in it. */
export interface ShownObjective {
    readonly name: string;
    readonly displayName: string;
    readonly criterion: string;
    readonly sortOrder: 'ascending' | 'descending';
    readonly scores: readonly ShownScore[];
}

/** The time on a level's clock. */
export interface ShownTime {
    /** The time of day in ticks, which draws the sun and the sky. */
    readonly dayTime: number;
    /** The ticks since the level was created. */
    readonly gameTime: number;
    /** Whether the time of day moves on with the game time, or is held still. */
    readonly advancing: boolean;
}

/** A world's spawn: the point a compass shows, in the world it is in. */
export interface ShownWorldSpawn {
    /** The world's dimension, by its Java id and its Bedrock number. */
    readonly dimension: { readonly id: string; readonly bedrockId: number };
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
}

/** The rate the server ticks at, and whether its worlds are frozen. */
export interface ShownTicking {
    readonly rate: number;
    readonly frozen: boolean;
}

/**
 * A change to a player's recipe book, naming recipes by their Java recipe ids. `initial` is the
 * whole book, sent once at join, and `unlocked` and `locked` are deltas.
 */
export interface RecipeBookChange {
    readonly kind: 'initial' | 'unlocked' | 'locked';
    readonly recipes: readonly string[];
}

/** The outbound contract of one session. */
export interface SessionPresenter {
    /**
     * The edition the client speaks. Bedrock clients share the world's encoded batches, which the
     * replicator builds once per codec; a client of another edition is handed the same changes as
     * plain data instead.
     */
    readonly edition: 'bedrock' | 'java';

    /**
     * How the client is sent chunks, for an edition that sends them its own way; Bedrock's go out
     * in the session's own batches. The session's `ChunkView` decides which, either way.
     */
    readonly chunkWire?: ChunkWire;

    /**
     * Tells the client the time on its level's clock.
     *
     * @param time - The time.
     */
    sendTime(time: ShownTime): Promise<void>;

    /**
     * Tells the client its own game mode.
     *
     * @param gamemode - The game mode the player now has.
     */
    sendGamemode(gamemode: Gametype): Promise<void>;

    /**
     * Tells the client the server's default game mode.
     *
     * @param gamemode - The default the server holds.
     */
    sendDefaultGameMode(gamemode: Gametype): Promise<void>;

    /**
     * Tells the client which game mode a player has, its own included, for an edition whose
     * client keeps every player's game mode.
     *
     * @param runtimeId - The player whose game mode it is.
     * @param gamemode - The player's game mode.
     * @param inputTick - The client's last input tick when the player is its own, so it can
     *   reconcile what it predicted meanwhile, and zero for anyone else.
     */
    sendPlayerGameMode(runtimeId: bigint, gamemode: Gametype, inputTick: bigint): Promise<void>;

    /**
     * Tells the client what its own game mode lets it do to the world and to other players.
     *
     * @param gamemode - The client's own game mode.
     */
    sendInteractionSettings(gamemode: Gametype): Promise<void>;

    /**
     * Tells the client what a player may do: fly, build, take damage and run commands.
     *
     * @param target - The player, the client's own or one it sees.
     */
    sendAbilities(target: AbilityTarget): Promise<void>;

    /**
     * Answers a client that closed a container screen.
     *
     * An edition whose client waits for the server to confirm a close answers here; one whose
     * client does not sends nothing.
     *
     * @param window - The window the client closed.
     * @param clientContainerType - The container type the client named with the close, which an
     *   edition that echoes it puts in the answer.
     */
    containerClosed(window: number, clientContainerType: number): Promise<void>;

    /**
     * Shows the client an entity that came into its view.
     *
     * @param entity - The entity, with the Bedrock spawn it builds itself and its plain facts.
     * @param session - The session the client is on, which a Bedrock spawn is queued through.
     */
    showEntity(entity: ShownEntity, session: PlayerSession): Promise<void>;

    /**
     * Takes an entity out of the client's view.
     *
     * @param runtimeId - The entity.
     */
    hideEntity(runtimeId: bigint): Promise<void>;

    /**
     * Moves entities the client sees, for a client the shared Bedrock batches do not reach.
     *
     * @param moves - This tick's moves of entities the client tracks.
     */
    moveEntities(moves: readonly ShownEntityMove[]): Promise<void>;

    /**
     * Changes blocks the client sees, for a client the shared Bedrock batches do not reach.
     *
     * @param changes - This tick's changes to the blocks in the client's view, in the order made.
     */
    showBlocks(changes: readonly ShownBlockChange[]): Promise<void>;

    /**
     * Shows the player its whole inventory, for a client the session's Bedrock sends do not reach.
     *
     * @param inventory - What the player carries.
     */
    showInventory(inventory: ShownInventory): Promise<void>;

    /**
     * Shows the player what one of its own slots holds now, for a client the session's Bedrock
     * sends do not reach.
     *
     * @param container - The container.
     * @param slot - The slot within it.
     * @param stack - What it holds, or null.
     */
    showOwnSlot(container: ShownContainer, slot: number, stack: ShownStack | null): Promise<void>;

    /**
     * Opens the player's own inventory screen, as the client asked. A client that opens it without
     * the server, as Java's does, has nothing to send.
     */
    openOwnInventory(): Promise<void>;

    /**
     * Opens the screen of a block, or of the trader `window.trade` names, which the session has
     * recorded as `window`, and shows what the block holds, one entry per slot.
     */
    openContainer(window: OpenBlockContainer, contents: readonly (Item | null)[]): Promise<void>;

    /** Shows the open trade screen the trader's offers as they stand. */
    showTradeOffers(window: OpenBlockContainer): Promise<void>;

    /** Shows the properties of the open screen that changed, by id, which is how a progress bar moves. */
    showContainerData(window: OpenBlockContainer, properties: ReadonlyMap<number, number>): Promise<void>;

    /** Shows what some slots of the open block's screen hold now, numbered as its block entity numbers them. */
    showContainerSlots(
        window: OpenBlockContainer,
        slots: readonly { readonly slot: number; readonly item: Item | null }[]
    ): Promise<void>;

    /**
     * Shows what an entity the client sees holds and wears now, for a client the replicator's
     * Bedrock packets do not reach.
     *
     * @param runtimeId - The entity.
     * @param equipment - Everything it holds and wears; every other slot is empty.
     */
    showEquipment(runtimeId: bigint, equipment: ShownEquipment): Promise<void>;

    /**
     * Shows how an entity the client sees carries itself now, for a client the replicator's
     * Bedrock packets do not reach.
     *
     * @param runtimeId - The entity.
     * @param state - Its state.
     */
    showEntityState(runtimeId: bigint, state: ShownEntityState): Promise<void>;

    /**
     * Shows the player its own health, food and saturation, for a client the session's Bedrock
     * attribute sends do not reach.
     *
     * @param vitals - The values now.
     */
    showVitals(vitals: ShownVitals): Promise<void>;

    /**
     * Shows the player its own experience bar and level, for a client the session's Bedrock
     * attribute sends do not reach.
     *
     * @param experience - The values now.
     */
    showExperience(experience: ShownExperience): Promise<void>;

    /**
     * Shows an item, an arrow or an orb flying into the entity that picked it up, which the client
     * draws before the item leaves its view.
     *
     * @param item - The runtime id of what was picked up.
     * @param collector - The runtime id of the entity that took it.
     * @param count - How many of the stack it took.
     */
    showPickUp(item: bigint, collector: bigint, count: number): Promise<void>;

    /**
     * Shows a dropped item's new count, after a merge with a stack beside it grew it, for a client
     * the world's stack size event does not reach.
     *
     * @param item - The item entity's runtime id.
     * @param count - How many items its stack holds now.
     */
    showItemCount(item: bigint, count: number): Promise<void>;

    /**
     * Opens the client's death screen, for a client the session's Bedrock respawn exchange does
     * not reach.
     *
     * @param death - Why the player died.
     */
    showDeath(death: ShownDeath): Promise<void>;

    /**
     * Shows the attributes of an entity that changed, the player's own or another's. A client
     * that has its own vitals and experience shown through {@link showVitals} and
     * {@link showExperience}, and other entities' with their replication, has nothing to send.
     */
    showAttributes(runtimeId: bigint, attributes: readonly Attribute[]): Promise<void>;

    /** Shows the player's own velocity, in blocks a tick, after a knockback or an impulse. */
    showMotion(motion: { readonly x: number; readonly y: number; readonly z: number }): Promise<void>;

    /** Shows an entity's actor data, its own by default: its flags, its values and its synced properties. */
    showActorData(entity: ShownActorData, metadata?: Metadata): Promise<void>;

    /** Shows the player alive again after a respawn, at `health`, before its attributes and actor data. */
    showRespawned(health: number): Promise<void>;

    /** Shows the game rules that changed, spelled as the client spells them. */
    showGameRules(rules: readonly GameRule[]): Promise<void>;

    /**
     * Tells the client of a kill its player took part in, for an edition whose client counts
     * kills itself, as Bedrock's does for Xbox achievements.
     *
     * @param kill - Who killed what, and how.
     */
    reportKill(kill: ReportedKill): Promise<void>;

    /**
     * Spawns the player again on its client, for a client the session's Bedrock respawn exchange
     * and dimension change do not reach: after a death, before the session moves it to where it
     * comes back, and on a change of world, after the session moved it there.
     *
     * @param respawn - The dimension the player is in and where it stands.
     */
    showRespawn(respawn: ShownRespawn): Promise<void>;

    /**
     * Gives a joining client the whole player list.
     *
     * @param players - Everyone listed, the client's own player included.
     */
    sendPlayerList(players: readonly ListedPlayer[]): Promise<void>;

    /**
     * Moves a player on the client, the client's own one included.
     *
     * @param move - The player's place and facing, and what moved it.
     */
    sendMove(move: ShownMove): Promise<void>;

    /**
     * Shows the client a chat line or a system message.
     *
     * @param message - The message, which the session has checked is not empty.
     */
    sendMessage(message: ShownMessage): Promise<void>;

    /**
     * Shows the client a change to a boss bar at the top of its screen.
     *
     * @param change - What changed.
     * @param bar - The bar as it is after the change; a `remove` still names everything it showed.
     */
    showBossBar(change: BossBarChange, bar: ShownBossBar): Promise<void>;

    /**
     * Shows the client a title, a subtitle or action bar text, sets how long titles show, or
     * clears them.
     *
     * @param title - The instruction.
     */
    showTitle(title: ShownTitle): Promise<void>;

    /**
     * Draws one display slot of the scoreboard from scratch: the objective it shows with every
     * score, or nothing.
     *
     * @param slot - The slot, such as `sidebar`; a client of an edition without it shows nothing.
     * @param objective - What it shows, or undefined to empty it.
     */
    showDisplaySlot(slot: string, objective: ShownObjective | undefined): Promise<void>;

    /**
     * Shows a change to one score of an objective a slot shows.
     *
     * @param objective - The objective.
     * @param holder - Whose score changed.
     * @param value - The new score, or undefined when the score was reset.
     */
    showScore(objective: string, holder: Omit<ShownScore, 'value'>, value: number | undefined): Promise<void>;

    /**
     * Takes an objective that was removed off the client's scoreboard.
     *
     * @param objective - The objective.
     */
    removeObjective(objective: string): Promise<void>;

    /**
     * Shows the client the weather of the world it is in.
     *
     * @param from - The weather the client was last shown, or undefined when it may hold any.
     * @param to - The weather now.
     */
    showWeather(from: Weather | undefined, to: Weather): Promise<void>;

    /**
     * Shows the client the server's difficulty.
     *
     * @param difficulty - The difficulty.
     */
    showDifficulty(difficulty: Difficulty): Promise<void>;

    /**
     * Shows the client a world's spawn, which its compass points to.
     *
     * @param spawn - The spawn.
     */
    showWorldSpawn(spawn: ShownWorldSpawn): Promise<void>;

    /**
     * Shows the client the tick rate and whether the game is frozen, which a client that runs
     * its own ticks follows.
     *
     * @param ticking - The state.
     */
    showTicking(ticking: ShownTicking): Promise<void>;

    /**
     * Shows the client a step of a frozen game.
     *
     * @param ticks - How many ticks it runs, or 0 when a step ends.
     */
    showTickStep(ticks: number): Promise<void>;

    /**
     * Shows the client a change to the player's recipe book.
     *
     * @param change - The recipes the book now holds, or the ones it gained or lost.
     */
    showRecipeBook(change: RecipeBookChange): Promise<void>;

    /**
     * Sends the client to another server, as `/transfer` does. The client leaves this one and
     * connects to that one as it would from its server list.
     *
     * @param host - The other server's host name or address.
     * @param port - Its port.
     */
    transfer(host: string, port: number): Promise<void>;
}
