import type Player from '../../player/Player.js';
import PlayerSpawnEvent from './PlayerSpawnEvent.js';

/**
 * Fired just after a player despawns from the world
 */
export default class PlayerDespawnEvent extends PlayerSpawnEvent {
    public constructor(player: Player) {
        super(player);
    }
}
