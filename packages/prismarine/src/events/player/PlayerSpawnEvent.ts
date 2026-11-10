import PlayerEvent from './PlayerEvent';
import type Player from '../../Player';

/**
 * Fired just before a player spawns into the world
 */
export default class PlayerSpawnEvent extends PlayerEvent {
    public constructor(player: Player) {
        super(player);
    }
}
