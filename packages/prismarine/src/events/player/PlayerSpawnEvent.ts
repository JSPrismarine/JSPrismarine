import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired just before a player spawns into the world
 */
export default class PlayerSpawnEvent extends PlayerEvent {
    public constructor(session: PlayerSession) {
        super(session);
    }
}
