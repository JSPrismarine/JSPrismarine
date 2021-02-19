import type Player from '../../player/Player';
import PlayerSpawnEvent from './PlayerSpawnEvent';

/**
 * Fired just after a player despawns from the world
 */
export default class PlayerDespawnEvent extends PlayerSpawnEvent {
    public constructor(player: Player) {
        super(player);
    }
}
