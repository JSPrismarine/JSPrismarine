import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';
import type TickSyncPacket from '../packet/TickSyncPacket';

export default class TickSyncHandler implements PacketHandler<TickSyncPacket> {
    public static NetID = Identifiers.TickSyncPacket;

    public handle(_packet: TickSyncPacket, _server: Server, connection: PlayerConnection): void {
        // TODO: stub
    }
}
