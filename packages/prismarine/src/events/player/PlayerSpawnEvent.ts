import Event from '../Event';
import type Player from '../../Player';

/**
 * Fired just before a player spawns into the world
 */
export default class PlayerSpawnEvent extends Event {
    private readonly player;

    public constructor(player: Player) {
        super();
        this.player = player;
    }

    public getPlayer(): Player {
        return this.player;
    }
}
