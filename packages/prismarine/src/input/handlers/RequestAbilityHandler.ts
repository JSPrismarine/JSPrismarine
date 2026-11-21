import type { InputContext } from '../../network/handler/HandlerContext';
import type PlayerSession from '../../network/PlayerSession';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The one ability a client may ask for in play, by the name the decoder gives it. */
const FLYING = 'FLYING';

/**
 * A request to change one of the player's own abilities.
 *
 * The docs promise the client an answer either way: a granted change is broadcast as the new
 * abilities, and a refused one is answered with the player's unchanged abilities so the client
 * reverts. Flight is the one ability the client asks for in play, through its fly button, and
 * the one the server models per player; `PlayerSession.setFlying` applies it, runs
 * `PlayerToggleFlightEvent`, and broadcasts the result. Every other ability comes from the game
 * mode and op state, so the request is refused by resending the state.
 */
export default class RequestAbilityHandler implements IntentHandler<'requestAbility'> {
    public static readonly Kind = 'requestAbility';

    /** Applies a flight toggle, or sends the current abilities back for anything else. */
    public handle({ ability, value }: Intent<'requestAbility'>, { session, log, step }: InputContext): undefined {
        if (ability === FLYING && typeof value === 'boolean') {
            step.output(this.toggleFlight(session, value));
            return;
        }

        log.debug(
            `${session.identity.name} asked to set ability ${ability} to ${value ?? 'no value'}. Only flight can be requested, so the current abilities were sent back`
        );
        step.output(session.sendAbilities());
    }

    /**
     * Applies a flight toggle, then answers a refusal with the current abilities.
     *
     * Run inside the handler's unit: `PlayerSession.setFlying` posts `PlayerToggleFlightEvent`
     * and writes the state before its first send, so only the sends are left for the input step.
     * Not an async function, which would turn a listener's throw into a rejected send after the
     * unit kept what the listener wrote; the throw leaves the handler, and the unit undoes it.
     */
    private toggleFlight(session: PlayerSession, flying: boolean): Promise<void> {
        const player = session.getPlayer();
        const wasFlying = player.isFlying();
        const sent = session.setFlying(flying);
        // A change broadcasts itself. A refusal, or a request for the state the server
        // already holds, gets the current abilities back so the client's state matches.
        if (player.isFlying() !== wasFlying) return sent;
        return sent.then(() => session.sendAbilities());
    }
}
