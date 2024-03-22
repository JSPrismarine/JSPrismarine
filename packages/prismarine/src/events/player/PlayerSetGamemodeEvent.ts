import Event from '../Event';
import type Player from '../../Player';

/**
 * Fired as the player's gamemode is changed
 */
export default class PlayerSetGamemodeEvent extends Event {
    private readonly player;
    private readonly gamemode: number;

    public constructor(player: Player, gamemode: number) {
        super();
        this.player = player;
        this.gamemode = gamemode;
    }

    public getPlayer(): Player {
        return this.player;
    }

    public getGamemode(): number {
        return this.gamemode;
    }
}
