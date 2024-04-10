import type ClientConnection from '../ClientConnection';
import type { DataPacket } from '../Packets';
import type { Server } from '../../';

export default interface PreLoginPacketHandler<T extends DataPacket> {
    handle(packet: T, server: Server, connection: ClientConnection): Promise<void>;
}
