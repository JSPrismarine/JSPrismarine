import type PlayerSession from '../../network/PlayerSession';
import PlayerEvent from './PlayerEvent';

/**
 * Fired when a player plays an emote, once the server relays it to the players that see them.
 * Script `world.afterEvents.playerEmote` subscribers hear it in the tick's script flush.
 */
export default class PlayerEmoteEvent extends PlayerEvent {
    private readonly emote: string;

    /** @param emote - The emote's persona piece id, a uuid. */
    public constructor(session: PlayerSession, emote: string) {
        super(session);
        this.emote = emote;
    }

    /** The emote's persona piece id. */
    public getEmote(): string {
        return this.emote;
    }
}
