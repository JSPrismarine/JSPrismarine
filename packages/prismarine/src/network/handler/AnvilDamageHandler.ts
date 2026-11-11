import type AnvilDamagePacket from '@jsprismarine/protocol/packet/AnvilDamagePacket';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

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
export default class AnvilDamageHandler implements ReadLaneHandler<AnvilDamagePacket> {
    public static PacketName = 'AnvilDamagePacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Checks the position names an anvil in reach, then logs it. */
    public handle(packet: AnvilDamagePacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle an AnvilDamagePacket without decoded data');

        const { blockPosition: protocolPosition } = data;
        const blockPosition = new BlockPosition(protocolPosition.x, protocolPosition.y, protocolPosition.z);
        const where = `${blockPosition.getX()}, ${blockPosition.getY()}, ${blockPosition.getZ()}`;

        const rejection = blockTargetRejection(session, blockPosition, ANVILS);
        if (rejection !== null) {
            log.verbose(
                `Dropped an anvil damage request from ${session.identity.name} at ${where}: ${rejection}`,
                'AnvilDamageHandler/handle'
            );
            return;
        }

        log.debug(
            `${session.identity.name} asked to damage the anvil at ${where}. Anvils are not modeled`,
            'AnvilDamageHandler/handle'
        );
    }
}
