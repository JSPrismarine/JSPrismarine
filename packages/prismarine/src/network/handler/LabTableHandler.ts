import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type LabTablePacket from '@jsprismarine/protocol/packet/LabTablePacket';
import { LabTableType } from '@jsprismarine/protocol/packet/LabTablePacket';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/** The one block whose screen sends this packet. */
const LAB_TABLES: ReadonlySet<string> = new Set(['minecraft:lab_table']);

/**
 * A player working the Education Edition chemistry lab table.
 *
 * An action whose position is not a lab table within reach in a loaded chunk is dropped at
 * verbose level. The rest are recorded at debug level and dropped too. Known gap: there is
 * no chemistry recipe table, so a combine produces nothing and no `StartReaction` is sent
 * back.
 */
export default class LabTableHandler implements PacketHandler<LabTablePacket> {
    public static PacketName = 'LabTablePacket';
    public readonly phases = ['play'] as const;

    /** Checks the position names a lab table in reach, then logs the action and position. */
    public handle(packet: LabTablePacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a LabTablePacket without decoded data');

        const position = new BlockPosition(data.position.x, data.position.y, data.position.z);
        const where = `${position.getX()}, ${position.getY()}, ${position.getZ()}`;

        const rejection = blockTargetRejection(player, position, LAB_TABLES);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(
                    `Dropped a lab table action from ${player.getName()} at ${where}: ${rejection}`,
                    'LabTableHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${player.getName()} ran ${LabTableType[data.type] ?? data.type} on the lab table at ${where}. Chemistry is not simulated`,
                'LabTableHandler/handle'
            );
    }
}
