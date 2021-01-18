import Event from '../Event';
import type Player from '../../player/Player';

/**
 * Fired as the player toggle sprinting
 */
export default class PlayerToggleSprintEvent extends Event {
    private readonly player;
    private readonly sprinting: boolean;

    public constructor(player: Player, sprinting: boolean) {
        super();
        this.player = player;
        this.sprinting = sprinting;
    }

    getPlayer(): Player {
        return this.player;
    }

    getIsSprinting(): boolean {
        return this.sprinting;
    }
}
