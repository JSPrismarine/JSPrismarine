import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired as the player toggle flying
 */
export default class PlayerToggleFlightEvent extends PlayerEvent {
    private readonly flying: boolean;

    public constructor(session: PlayerSession, flying: boolean) {
        super(session);
        this.flying = flying;
    }

    public getIsFlying(): boolean {
        return this.flying;
    }
}
