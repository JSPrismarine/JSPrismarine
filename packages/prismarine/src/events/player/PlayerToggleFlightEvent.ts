import PlayerEvent from './PlayerEvent';
import type { PlayerEventSubject } from './PlayerEvent';

/**
 * Fired as the player toggle flying
 */
export default class PlayerToggleFlightEvent extends PlayerEvent {
    private readonly flying: boolean;

    public constructor(subject: PlayerEventSubject, flying: boolean) {
        super(subject);
        this.flying = flying;
    }

    public getIsFlying(): boolean {
        return this.flying;
    }
}
