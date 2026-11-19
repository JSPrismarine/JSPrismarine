import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired once a player's game mode changed to another. Script
 * `world.afterEvents.playerGameModeChange` subscribers hear it in the tick's script flush.
 */
export default class PlayerGamemodeChangedEvent extends PlayerEvent {
    private readonly from: number;
    private readonly to: number;

    public constructor(session: PlayerSession, from: number, to: number) {
        super(session);
        this.from = from;
        this.to = to;
    }

    /** The mode the player had. */
    public getFrom(): number {
        return this.from;
    }

    /** The mode the player has now. */
    public getTo(): number {
        return this.to;
    }
}
