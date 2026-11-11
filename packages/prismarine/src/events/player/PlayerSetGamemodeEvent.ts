import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired as the player's gamemode is changed
 */
export default class PlayerSetGamemodeEvent extends PlayerEvent {
    private readonly gamemode: number;

    public constructor(session: PlayerSession, gamemode: number) {
        super(session);
        this.gamemode = gamemode;
    }

    public getGamemode(): number {
        return this.gamemode;
    }
}
