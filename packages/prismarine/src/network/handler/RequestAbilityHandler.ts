import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type RequestAbilityPacket from '../packet/RequestAbilityPacket';
import { RequestAbilityValueType } from '../packet/RequestAbilityPacket';
import type PacketHandler from './PacketHandler';

/**
 * A request to change one of the player's abilities.
 *
 * The request is recorded at debug level and nothing changes. Known gap: the server does not
 * model per-player abilities beyond the game mode defaults, so it cannot grant or refuse the
 * request. Once it does, it should answer with `UpdateAbilitiesPacket` carrying either the
 * new state or the unchanged one, which is how the client learns whether it was allowed.
 */
export default class RequestAbilityHandler implements PacketHandler<RequestAbilityPacket> {
    public static NetID = Identifiers.RequestAbilityPacket;

    /** Logs the requested ability and value. */
    public handle(packet: RequestAbilityPacket, server: Server, session: PlayerSession): void {
        const value =
            packet.valueType === RequestAbilityValueType.Bool
                ? String(packet.boolValue)
                : packet.valueType === RequestAbilityValueType.Float
                  ? String(packet.floatValue)
                  : 'no value';

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked to set ability ${AbilityLayerFlag[packet.ability] ?? packet.ability} to ${value}. Abilities are not modeled, so nothing changed`,
                'RequestAbilityHandler/handle'
            );
    }
}
