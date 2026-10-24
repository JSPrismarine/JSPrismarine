import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type LabTablePacket from '../packet/LabTablePacket';
import { LabTableType } from '../packet/LabTablePacket';
import type PacketHandler from './PacketHandler';

/**
 * A player working the Education Edition chemistry lab table.
 *
 * The action is recorded at debug level and dropped. Known gap: there is no chemistry recipe
 * table, so a combine produces nothing and no `StartReaction` is sent back.
 */
export default class LabTableHandler implements PacketHandler<LabTablePacket> {
    public static NetID = Identifiers.LabTablePacket;

    /** Logs the action and the table position. */
    public handle(packet: LabTablePacket, server: Server, session: PlayerSession): void {
        const { position } = packet;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ran ${LabTableType[packet.type] ?? packet.type} on the lab table at ${position.getX()}, ${position.getY()}, ${position.getZ()}. Chemistry is not simulated`,
                'LabTableHandler/handle'
            );
    }
}
