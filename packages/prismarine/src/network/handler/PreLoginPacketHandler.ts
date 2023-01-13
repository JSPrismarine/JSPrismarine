import ClientConnection from '../ClientConnection.js';
import { DataPacket } from '../Packets.js';
import { Server } from '../../Prismarine.js';

export default interface PreLoginPacketHandler<T extends DataPacket> {
    handle(packet: T, server: Server, connection: ClientConnection): Promise<void>;
}
