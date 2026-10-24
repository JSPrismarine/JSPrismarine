import type Server from '../Server';
import type { Entity } from '../entity/Entity';

/**
 * Something that can issue a command and be answered.
 *
 * A player and the server console have exactly this much in common: a name and somewhere to
 * put a reply. They are not the same kind of thing otherwise - one stands at a position in a
 * world and the other is a terminal attached to the process - so this is an interface rather
 * than a shared base class. Making the console an entity to get these four methods is what
 * forced `isPlayer()` and `isConsole()` to exist in the first place.
 */
export interface CommandExecutor {
    /**
     * Send a message to the executor.
     *
     * Delivery is asynchronous for a player, whose message goes out over the wire, and
     * synchronous for the console, which writes to a terminal. Callers may await either.
     * @param {string} message - The message to send.
     */
    sendMessage(message: string): Promise<void> | void;

    /**
     * Get the name of the executor.
     * @returns {string} The name of the executor.
     */
    getName(): string;

    /**
     * Get the formatted username of the executor.
     * @returns {string} The formatted username of the executor.
     */
    getFormattedUsername(): string;

    /**
     * Get the server instance.
     * @returns {Server} The server instance.
     */
    getServer(): Server;
}

/**
 * Whether a command target can be answered, which is what separates an executor from any other
 * entity. Checks for `sendMessage` with `in` so this module stays free of a runtime import of
 * `Entity`.
 */
export const isCommandExecutor = (target: CommandExecutor | Entity): target is CommandExecutor =>
    'sendMessage' in target;
