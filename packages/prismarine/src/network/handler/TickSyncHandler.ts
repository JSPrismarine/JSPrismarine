import Identifiers from '../Identifiers';
import { type PlayerSession } from '../../';
import type Server from '../../Server';
import type PacketHandler from './PacketHandler';
import type { PacketData } from '@jsprismarine/protocol';

export default class TickSyncHandler implements PacketHandler<PacketData.TickSync> {
    public static NetID = Identifiers.TickSyncPacket;

    public handle(_data: PacketData.TickSync, _server: Server, _session: PlayerSession): void {
        // TODO: stub
    }
}
