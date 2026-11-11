import PlayerEvent from './PlayerEvent';
import type { PlayerEventSubject } from './PlayerEvent';

/**
 * Fired just before a player spawns into the world
 */
export default class PlayerSpawnEvent extends PlayerEvent {
    public constructor(subject: PlayerEventSubject) {
        super(subject);
    }
}
