import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type RequestAbilityPacket from '../packet/RequestAbilityPacket';
import { RequestAbilityValueType } from '../packet/RequestAbilityPacket';
import type PacketHandler from './PacketHandler';

/**
 * A request to change one of the player's own abilities.
 *
 * The docs promise the client an answer either way: a granted change is broadcast as
 * `UpdateAbilitiesPacket`, and a refused one is answered with the player's unchanged
 * abilities so the client reverts. Flight is the one ability the client asks for in play,
 * through its fly button, and the one the server models per player; `Player.setFlying`
 * applies it, runs `PlayerToggleFlightEvent`, and broadcasts the result. Every other ability
 * comes from the game mode and op state, so the request is refused by resending the state.
 */
export default class RequestAbilityHandler implements PacketHandler<RequestAbilityPacket> {
    public static NetID = Identifiers.RequestAbilityPacket;

    /** Applies a flight toggle, or sends the current abilities back for anything else. */
    public async handle(packet: RequestAbilityPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        if (packet.ability === AbilityLayerFlag.FLYING && packet.valueType === RequestAbilityValueType.Bool) {
            const wasFlying = player.isFlying();
            await player.setFlying(packet.boolValue);
            // A change broadcasts itself. A refusal, or a request for the state the server
            // already holds, gets the current abilities back so the client's state matches.
            if (player.isFlying() !== wasFlying) return;
            await session.sendAbilities();
            return;
        }

        const value =
            packet.valueType === RequestAbilityValueType.Bool
                ? String(packet.boolValue)
                : packet.valueType === RequestAbilityValueType.Float
                  ? String(packet.floatValue)
                  : 'no value';
        server
            .getLogger()
            .debug(
                `${player.getName()} asked to set ability ${AbilityLayerFlag[packet.ability] ?? packet.ability} to ${value}. Only flight can be requested, so the current abilities were sent back`,
                'RequestAbilityHandler/handle'
            );
        await session.sendAbilities();
    }
}
