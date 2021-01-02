import Event from '../Event';
import type Player from '../../player/Player';

/**
 * Fired as the player's gamemode is changed
 */
export default class PlayerSetGamemodeEvent extends Event {
    private readonly player;
    private readonly gamemode: number;

    constructor(player: Player, gamemode: number) {
        super();
        this.player = player;
        this.gamemode = gamemode;
    }

    getPlayer(): Player {
        return this.player;
    }

    getGamemode(): number {
        return this.gamemode;
    }
}
