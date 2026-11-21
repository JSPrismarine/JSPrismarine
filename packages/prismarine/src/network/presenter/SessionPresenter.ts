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

import type { AbilityTarget } from '../replica/firstSight';

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

/** The outbound contract of one session. */
export interface SessionPresenter {
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
