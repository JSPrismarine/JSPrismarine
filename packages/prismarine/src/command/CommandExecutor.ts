import type Server from '../Server';

/**
 * Represents a server command executor.
 */
export interface CommandExecutor {
    /**
     * Send a message to the executor.
     * @param message - The message to send.
     */
    sendMessage(message: string): void;

    /**
     * Get the name of the executor.
     * @returns The name of the executor.
     */
    getName(): string;

    /**
     * Get the formatted username of the executor.
     * @returns The formatted username of the executor.
     */
    getFormattedUsername(): string;

    /**
     * Get the server instance.
     * @returns The server instance.
     */
    getServer(): Server;
}
