import Event from '../Event.js';
import type Player from '../../Player.js';

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

    public getPlayer(): Player {
        return this.player;
    }

    public getIsSprinting(): boolean {
        return this.sprinting;
    }
}
