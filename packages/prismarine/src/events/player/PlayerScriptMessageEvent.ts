import type PlayerSession from '../../player/PlayerSession';
import PlayerEvent from './PlayerEvent';

/**
 * Fired when a player's client sends the server's scripts a message, as a `ScriptMessagePacket`.
 * Script `world.afterEvents.messageReceive` subscribers hear it in the tick's script flush.
 */
export default class PlayerScriptMessageEvent extends PlayerEvent {
    public constructor(
        session: PlayerSession,
        private readonly messageId: string,
        private readonly message: string
    ) {
        super(session);
    }

    /** The message's id, by convention `namespace:name`. */
    public getMessageId(): string {
        return this.messageId;
    }

    /** The message itself. */
    public getMessage(): string {
        return this.message;
    }
}
