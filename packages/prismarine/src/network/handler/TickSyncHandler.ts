import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';
import type TickSyncPacket from '../packet/TickSyncPacket.js';

export default class TickSyncHandler implements PacketHandler<TickSyncPacket> {
    public static NetID = Identifiers.TickSyncPacket;

    public handle(_packet: TickSyncPacket, _server: Server, _session: PlayerSession): void {
        // TODO: stub
    }
}
