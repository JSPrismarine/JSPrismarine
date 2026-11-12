/**
 * What a packet handler of a player session is handed in place of the `Server`
 * ([ADR 0014](../../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * The context has the session the packet arrived on, a logger and the settings a handler reads.
 * An input-lane handler also gets the server-wide services it may use and the hooks of the input
 * step that applies it. Nothing else of the server is reachable from the context: a handler that
 * needs more names it here, so the list stays the one record of what handlers depend on.
 */
import type { Logger } from '@jsprismarine/logger';
import type { ChatManager } from '../../chat/ChatManager';
import type { CommandManager } from '../../command/CommandManager';
import type { ConsoleSender } from '../../command/ConsoleSender';
import type { Config } from '../../config/Config';
import type { ServerContent } from '../../content/ServerContent';
import type { ServerWorldHandle } from '../../content/world/serverSource';
import type { ServerEventBus } from '../../events/ServerEvents';
import type { CreativeInventory } from '../../inventory/CreativeInventory';
import type { PermissionManager } from '../../permission/PermissionManager';
import type { WorldMessages } from '../../world/WorldMessages';
import type SessionManager from '../../SessionManager';
import type { WorldReplicators } from '../NetworkWorldReplicator';
import type PlayerSession from '../PlayerSession';

/** The logger levels a handler writes at. */
export type HandlerLog = Pick<Logger, 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error'>;

/** The server settings a handler may read. */
export type HandlerConfig = Pick<
    Config,
    | 'getViewDistance'
    | 'getDifficulty'
    | 'getGamemode'
    | 'getServerAuthoritativeBlockBreaking'
    | 'getCraftingRecipeLimit'
    | 'getPacketCompressionLevel'
>;

/** What every handler of a player session is handed, and all a connection-lane or read-lane one gets. */
export interface SessionContext {
    /** The session the packet arrived on. */
    readonly session: PlayerSession;
    /** Where the handler logs. */
    readonly log: HandlerLog;
    /** The settings the handler may read. */
    readonly config: HandlerConfig;
}

/**
 * The server-wide services an input-lane handler may use, each narrowed to the members handlers
 * call. Each runs to its end in the handler's unit and hands back a promise only for what it
 * leaves to the transport or the disk. A service that writes a file changes memory at once and
 * writes the file off the tick.
 */
export interface HandlerServices {
    /** The content registries: items, blocks, recipes and enchantments. */
    readonly content: ServerContent;
    /** The item actors of each dimension, which the content interactions read. */
    readonly contentWorld: Pick<ServerWorldHandle, 'actorsAt'>;
    /** The creative inventory, for a creative pick the content payloads do not answer. */
    readonly creativeInventory: Pick<CreativeInventory, 'get'>;
    /** The other sessions on the server, and the player list. */
    readonly sessions: Pick<SessionManager, 'getSessions' | 'sessionOf' | 'getPlayerList'>;
    /**
     * The operator list and permission checks. `setOpNow` changes the list in memory and writes
     * the operator file off the tick.
     */
    readonly permissions: Pick<PermissionManager, 'isOp' | 'setOpNow' | 'can'>;
    /**
     * The command dispatcher. `runCommand` runs a command in the handler's unit and hands back
     * what the command started, which the handler gives to {@link InputStep.output}.
     */
    readonly commands: Pick<CommandManager, 'runCommand'>;
    /**
     * Chat fan-out, which calls the plugins' chat listeners as it is called; what an
     * asynchronous listener does after its first wait runs after the input.
     */
    readonly chat: Pick<ChatManager, 'send'>;
    /** The per-world replicators, for a handler that relays a packet to the players near a point. */
    readonly replicators: Pick<WorldReplicators, 'for'>;
    /**
     * Changes for another world, which its input step applies. A handler applies an input in
     * the sender's world and files what it changes anywhere else here.
     */
    readonly messages: Pick<WorldMessages, 'send'>;
    /** The console, as the sender of a server-issued line. */
    readonly console: ConsoleSender;
    /** The plugin events a handler raises. */
    readonly events: Pick<ServerEventBus, 'post'>;
    /**
     * The server's default game mode, which `SetDefaultGameType` changes. It changes in memory
     * at once, and the config file is written off the tick.
     */
    readonly defaults: Pick<Config, 'setGamemode'>;
}

/** The hooks of the input step that applies an input. */
export interface InputStep {
    /** The tick whose input step applies the input. */
    readonly tick: number;
    /**
     * Hands the step something the handler started and does not wait for: a send whose packets
     * are already queued, or what a command left running, such as a kick. The step lets it finish
     * outside the tick and reports a failure as the handler's. The handler's writes are committed
     * by then, so a failed send does not undo them.
     *
     * @param send - The send, already started.
     */
    output(send: Promise<void>): void;
}

/** What an input-lane handler is handed. */
export interface InputContext extends SessionContext {
    /** The server-wide services the handler may use. */
    readonly services: HandlerServices;
    /** The input step that applies the input. */
    readonly step: InputStep;
}

/** The context the server hands each lane's handlers. */
export interface ServerLaneContexts {
    readonly connection: SessionContext;
    readonly read: SessionContext;
    readonly input: InputContext;
}
