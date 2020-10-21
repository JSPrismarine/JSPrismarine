import Event from "../Event";
import type Player from "../../player";

/**
 * Fired right just after player spawns into the world
 */
export default class PlayerSpawnEvent extends Event {
    private player;

    constructor(player: Player) {
        super();
        this.player = player;
    }

    getPlayer(): Player {
        return this.player;
    }
};
