import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type AnvilDamagePacket from '../packet/AnvilDamagePacket';
import type PacketHandler from './PacketHandler';

/**
 * An anvil damage request.
 *
 * The request is recorded at debug level and dropped. Known gap: anvil use is not modeled,
 * so the block is neither chipped nor broken; the client's anvil screen works locally only.
 */
export default class AnvilDamageHandler implements PacketHandler<AnvilDamagePacket> {
    public static NetID = Identifiers.AnvilDamagePacket;

    /** Logs the anvil position. */
    public handle(packet: AnvilDamagePacket, server: Server, session: PlayerSession): void {
        const { blockPosition } = packet;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked to damage the anvil at ${blockPosition.getX()}, ${blockPosition.getY()}, ${blockPosition.getZ()}. Anvils are not modeled`,
                'AnvilDamageHandler/handle'
            );
    }
}
