import type LabTablePacket from '@jsprismarine/protocol/packet/LabTablePacket';
import { LabTableType } from '@jsprismarine/protocol/packet/LabTablePacket';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

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
export default class LabTableHandler implements ReadLaneHandler<LabTablePacket> {
    public static PacketName = 'LabTablePacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Checks the position names a lab table in reach, then logs the action and position. */
    public handle(packet: LabTablePacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a LabTablePacket without decoded data');

        const position = new BlockPosition(data.position.x, data.position.y, data.position.z);
        const where = `${position.getX()}, ${position.getY()}, ${position.getZ()}`;

        const rejection = blockTargetRejection(session, position, LAB_TABLES);
        if (rejection !== null) {
            log.verbose(
                `Dropped a lab table action from ${session.identity.name} at ${where}: ${rejection}`,
                'LabTableHandler/handle'
            );
            return;
        }

        log.debug(
            `${session.identity.name} ran ${LabTableType[data.type] ?? data.type} on the lab table at ${where}. Chemistry is not simulated`,
            'LabTableHandler/handle'
        );
    }
}
