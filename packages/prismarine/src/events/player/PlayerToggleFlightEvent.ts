import PlayerEvent from './PlayerEvent';
import type Player from '../../Player';

/**
 * Fired as the player toggle flying
 */
export default class PlayerToggleFlightEvent extends PlayerEvent {
    private readonly flying: boolean;

    public constructor(player: Player, flying: boolean) {
        super(player);
        this.flying = flying;
    }

    public getIsFlying(): boolean {
        return this.flying;
    }
}
