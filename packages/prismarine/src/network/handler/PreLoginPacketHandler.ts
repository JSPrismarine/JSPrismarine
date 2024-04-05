import { NetworkPacket } from '@jsprismarine/protocol';
import ClientConnection from '../ClientConnection';
import { Server } from '@';

export default interface PreLoginPacketHandler<T extends NetworkPacket<unknown>> {
    handle(packet: T, server: Server, connection: ClientConnection): Promise<void>;
}
