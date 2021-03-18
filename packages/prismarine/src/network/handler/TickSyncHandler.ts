import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import type TickSyncPacket from '../packet/TickSyncPacket';

export default class TickSyncHandler implements PacketHandler<TickSyncPacket> {
    public static NetID = Identifiers.TickSyncPacket;

    public handle(packet: TickSyncPacket, server: Server, player: Player): void {
        // TODO: stub
    }
}
