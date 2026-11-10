import PlayerEvent from './PlayerEvent';
import type Player from '../../Player';

/**
 * Fired as the player toggle sprinting
 */
export default class PlayerToggleSprintEvent extends PlayerEvent {
    private readonly sprinting: boolean;

    public constructor(player: Player, sprinting: boolean) {
        super(player);
        this.sprinting = sprinting;
    }

    public getIsSprinting(): boolean {
        return this.sprinting;
    }
}
