import type Server from '../Server';
import type { CommandExecutor } from './CommandExecutor';

/**
 * The server itself as the author of a message or command.
 *
 * Join and leave announcements, death messages, and command feedback need a sender that is
 * not a player. The interactive console used to fill that role, but a headless server has
 * no interactive console, so this class carries the console identity on its own. The server
 * constructs exactly one instance, whether or not it runs headless, and replies to it land in
 * the server log at info level.
 */
export class ConsoleSender implements CommandExecutor {
    public constructor(private readonly server: Server) {}

    /**
     * Logs the message at info level through the server logger.
     */
    public sendMessage(message: string): void {
        this.server.getLogger().info(message);
    }

    /**
     * Returns `CONSOLE`, the name the server signs its messages with.
     */
    public getName(): string {
        return 'CONSOLE';
    }

    /**
     * Returns `[CONSOLE]`, the display name shown in chat and command feedback.
     */
    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    /**
     * Returns the server this sender belongs to.
     */
    public getServer(): Server {
        return this.server;
    }
}
