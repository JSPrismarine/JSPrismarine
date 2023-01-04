import Event from '../Event.js';
import type Player from '../../Player.js';

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

    public getPlayer(): Player {
        return this.player;
    }

    public getIsFlying(): boolean {
        return this.flying;
    }
}
