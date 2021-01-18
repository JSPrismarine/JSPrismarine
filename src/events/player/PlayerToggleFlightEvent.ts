import Event from '../Event';
import type Player from '../../player/Player';

/**
 * Fired as the player toggle flying
 */
export default class PlayerToggleFlightEvent extends Event {
    private readonly player;
    private readonly flying: boolean;

    public constructor(player: Player, flying: boolean) {
        super();
        this.player = player;
        this.flying = flying;
    }

    getPlayer(): Player {
        return this.player;
    }

    getIsFlying(): boolean {
        return this.flying;
    }
}
