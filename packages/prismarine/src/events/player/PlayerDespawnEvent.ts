import type PlayerSession from '../../network/PlayerSession';
import PlayerSpawnEvent from './PlayerSpawnEvent';

/**
 * Fired just after a player despawns from the world
 */
export default class PlayerDespawnEvent extends PlayerSpawnEvent {
    public constructor(session: PlayerSession) {
        super(session);
    }
}
