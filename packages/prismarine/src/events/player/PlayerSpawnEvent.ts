import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired just before a player of either edition spawns into the world on joining. Cancelling it
 * with `preventDefault` disconnects the player before they are shown the world.
 */
export default class PlayerSpawnEvent extends PlayerEvent {
    public constructor(session: PlayerSession) {
        super(session);
    }
}
