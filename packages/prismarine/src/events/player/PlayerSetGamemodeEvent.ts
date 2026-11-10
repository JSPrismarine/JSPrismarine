import PlayerEvent from './PlayerEvent';
import type Player from '../../Player';

/**
 * Fired as the player's gamemode is changed
 */
export default class PlayerSetGamemodeEvent extends PlayerEvent {
    private readonly gamemode: number;

    public constructor(player: Player, gamemode: number) {
        super(player);
        this.gamemode = gamemode;
    }

    public getGamemode(): number {
        return this.gamemode;
    }
}
