import ClientConnection from '../ClientConnection';
import { DataPacket } from '../Packets';
import { Server } from '@';

export default interface PreLoginPacketHandler<T extends DataPacket> {
    handle(packet: T, server: Server, connection: ClientConnection): Promise<void>;
}
