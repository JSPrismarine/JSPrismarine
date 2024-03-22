import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerSession } from '@';
import type Server from '../../Server';
import type TickSyncPacket from '../packet/TickSyncPacket';

export default class TickSyncHandler implements PacketHandler<TickSyncPacket> {
    public static NetID = Identifiers.TickSyncPacket;

    public handle(_packet: TickSyncPacket, _server: Server, _session: PlayerSession): void {
        // TODO: stub
    }
}
