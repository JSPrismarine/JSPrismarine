import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../player/PlayerSession';

/**
 * Fired as the player's gamemode is changed, before anything is written. Cancellable, and the
 * new mode is writable. Script `world.beforeEvents.playerGameModeChange` subscribers see it
 * here, and `playerGamemodeChanged` follows a change that went through.
 */
export default class PlayerSetGamemodeEvent extends PlayerEvent {
    private gamemode: number;
    private readonly previous: number;

    /**
     * @param gamemode - The mode the player changes to.
     * @param previous - The mode the player has now; the new mode when not given.
     */
    public constructor(session: PlayerSession, gamemode: number, previous = gamemode) {
        super(session);
        this.gamemode = gamemode;
        this.previous = previous;
    }

    /** The mode the player changes to. */
    public getGamemode(): number {
        return this.gamemode;
    }

    /** Changes the mode the player changes to. */
    public setGamemode(gamemode: number): void {
        this.gamemode = gamemode;
    }

    /** The mode the player has before the change. */
    public getPreviousGamemode(): number {
        return this.previous;
    }
}
