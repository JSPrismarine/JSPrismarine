import Event from '../Event';
import type Player from '../../player/Player';

/**
 * Fired just before a player spawns into the world
 */
export default class PlayerSpawnEvent extends Event {
    private readonly player;

    constructor(player: Player) {
        super();
        this.player = player;
    }

    getPlayer(): Player {
        return this.player;
    }
}
