import type PlayerSession from '../../player/PlayerSession';
import PlayerEvent from './PlayerEvent';

/** A button a player's input reports held or let go. */
export type PlayerInputButton = 'Jump' | 'Sneak';

/**
 * Fired when a player's input reports the jump or sneak button pressed or released, compared with
 * the input before it. Script `world.afterEvents.playerButtonInput` subscribers hear it in the
 * tick's script flush.
 */
export default class PlayerButtonInputEvent extends PlayerEvent {
    private readonly button: PlayerInputButton;
    private readonly pressed: boolean;

    public constructor(session: PlayerSession, button: PlayerInputButton, pressed: boolean) {
        super(session);
        this.button = button;
        this.pressed = pressed;
    }

    /** The button. */
    public getButton(): PlayerInputButton {
        return this.button;
    }

    /** Whether the button is held now; false when it was let go. */
    public isPressed(): boolean {
        return this.pressed;
    }
}
