import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import type PlayerSession from '../PlayerSession';
import type RequestAbilityPacket from '@jsprismarine/protocol/packet/RequestAbilityPacket';
import { RequestAbilityValueType } from '@jsprismarine/protocol/packet/RequestAbilityPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * A request to change one of the player's own abilities.
 *
 * The docs promise the client an answer either way: a granted change is broadcast as
 * `UpdateAbilitiesPacket`, and a refused one is answered with the player's unchanged
 * abilities so the client reverts. Flight is the one ability the client asks for in play,
 * through its fly button, and the one the server models per player; `PlayerSession.setFlying`
 * applies it, runs `PlayerToggleFlightEvent`, and broadcasts the result. Every other ability
 * comes from the game mode and op state, so the request is refused by resending the state.
 */
export default class RequestAbilityHandler implements InputLaneHandler<RequestAbilityPacket> {
    public static PacketName = 'RequestAbilityPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Applies a flight toggle, or sends the current abilities back for anything else. */
    public handle(packet: RequestAbilityPacket, { session, log, step }: InputContext): undefined {
        if (packet.ability === AbilityLayerFlag.FLYING && packet.valueType === RequestAbilityValueType.Bool) {
            step.output(this.toggleFlight(session, packet.boolValue));
            return;
        }

        const value =
            packet.valueType === RequestAbilityValueType.Bool
                ? String(packet.boolValue)
                : packet.valueType === RequestAbilityValueType.Float
                  ? String(packet.floatValue)
                  : 'no value';
        log.debug(
            `${session.identity.name} asked to set ability ${AbilityLayerFlag[packet.ability] ?? packet.ability} to ${value}. Only flight can be requested, so the current abilities were sent back`,
            'RequestAbilityHandler/handle'
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
