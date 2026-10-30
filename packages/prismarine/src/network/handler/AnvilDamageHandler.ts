import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type AnvilDamagePacket from '@jsprismarine/protocol/packet/AnvilDamagePacket';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/** The three anvils, from new to one hit from breaking. */
const ANVILS: ReadonlySet<string> = new Set(['minecraft:anvil', 'minecraft:chipped_anvil', 'minecraft:damaged_anvil']);

/**
 * An anvil damage request.
 *
 * A request whose position is not an anvil within reach in a loaded chunk is dropped at
 * verbose level. The rest are recorded at debug level and dropped too. Known gap: anvil use
 * is not modeled, so the block is neither chipped nor broken; the client's anvil screen works
 * locally only.
 */
export default class AnvilDamageHandler implements PacketHandler<AnvilDamagePacket> {
    public static PacketName = 'AnvilDamagePacket';
    public readonly phases = ['play'] as const;

    /** Checks the position names an anvil in reach, then logs it. */
    public handle(packet: AnvilDamagePacket, server: Server, session: PlayerSession): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle an AnvilDamagePacket without decoded data');

        const player = session.getPlayer();
        const { blockPosition: protocolPosition } = data;
        const blockPosition = new BlockPosition(protocolPosition.x, protocolPosition.y, protocolPosition.z);
        const where = `${blockPosition.getX()}, ${blockPosition.getY()}, ${blockPosition.getZ()}`;

        const rejection = blockTargetRejection(player, blockPosition, ANVILS);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(
                    `Dropped an anvil damage request from ${player.getName()} at ${where}: ${rejection}`,
                    'AnvilDamageHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${player.getName()} asked to damage the anvil at ${where}. Anvils are not modeled`,
                'AnvilDamageHandler/handle'
            );
    }
}
