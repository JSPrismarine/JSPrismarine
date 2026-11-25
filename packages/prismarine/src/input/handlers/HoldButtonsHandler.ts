import PlayerButtonInputEvent from '../../events/player/PlayerButtonInputEvent';
import type { PlayerInputButton } from '../../events/player/PlayerButtonInputEvent';
import type { InputContext } from '../../player/context/HandlerContext';
import type PlayerSession from '../../player/PlayerSession';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The buttons each player held at its last report. */
const held = new WeakMap<PlayerSession, Readonly<Record<PlayerInputButton, boolean>>>();

/** Which buttons the player holds, as both editions report them each time they change. */
export default class HoldButtonsHandler implements IntentHandler<'holdButtons'> {
    public static readonly Kind = 'holdButtons';

    /**
     * Raises `playerButtonInput` for each button pressed or let go since the last report. The
     * first report of a session sets what later ones are compared with, and a button held in it
     * counts as pressed.
     */
    public handle({ jump, sneak }: Intent<'holdButtons'>, { session, services }: InputContext): undefined {
        const before = held.get(session);
        const now = { Jump: jump, Sneak: sneak };
        held.set(session, now);
        for (const button of ['Jump', 'Sneak'] as const) {
            if ((before?.[button] ?? false) === now[button]) continue;
            services.events.post('playerButtonInput', new PlayerButtonInputEvent(session, button, now[button]));
        }
    }
}
