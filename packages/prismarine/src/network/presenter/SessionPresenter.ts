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
import type { Vector3 } from '@jsprismarine/math';
import type { Gametype } from '@jsprismarine/minecraft';

import type { ListedPlayer } from '../playerListEntry';
import type { AbilityTarget } from '../replica/firstSight';
import type PlayerSession from '../PlayerSession';
import type { ShownEntity } from '../../world/ShownActor';

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

/** A stack as plain data: the item's Bedrock identifier and how many. */
export interface ShownStack {
    readonly name: string;
    readonly count: number;
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
export type ShownContainer = 'inventory' | 'armor' | 'offhand';

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

/** Why a player died, as a translation: the key without Bedrock's `%`, and what fills it. */
export interface ShownDeath {
    readonly key: string;
    readonly parameters: readonly string[];
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
     * Tells the client the world's time of day.
     *
     * @param tick - The time, in ticks.
     */
    sendTime(tick: number): Promise<void>;

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
     * Opens the client's death screen, for a client the session's Bedrock respawn exchange does
     * not reach.
     *
     * @param death - Why the player died.
     */
    showDeath(death: ShownDeath): Promise<void>;

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
}
