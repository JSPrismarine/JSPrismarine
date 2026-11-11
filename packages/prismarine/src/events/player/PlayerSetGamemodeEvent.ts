import PlayerEvent from './PlayerEvent';
import type { PlayerEventSubject } from './PlayerEvent';

/**
 * Fired as the player's gamemode is changed
 */
export default class PlayerSetGamemodeEvent extends PlayerEvent {
    private readonly gamemode: number;

    public constructor(subject: PlayerEventSubject, gamemode: number) {
        super(subject);
        this.gamemode = gamemode;
    }

    public getGamemode(): number {
        return this.gamemode;
    }
}
