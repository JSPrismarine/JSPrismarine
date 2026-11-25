import type { Item } from '../../item/Item';
import type PlayerSession from '../../player/PlayerSession';
import PlayerEvent from './PlayerEvent';

/**
 * Fired when a player's client reports their arm swinging. Script
 * `world.afterEvents.playerSwingStart` subscribers hear it in the tick's script flush.
 */
export default class PlayerSwingEvent extends PlayerEvent {
    /**
     * @param source - What the client says caused the swing, such as `attack` or `mine`, or null when it says nothing.
     */
    public constructor(
        session: PlayerSession,
        private readonly source: string | null
    ) {
        super(session);
    }

    /** What the client says caused the swing, or null when it says nothing. */
    public getSource(): string | null {
        return this.source;
    }

    /** What the player holds now, or null for an empty hand. */
    public getItem(): Item | null {
        return this.getSession().getPlayer().getInventory().equipment('mainhand');
    }
}
