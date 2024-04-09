import type { Server } from '../../';
import type ClientConnection from '../ClientConnection';

export default interface PreLoginPacketHandler<T extends object> {
    handle(data: T, server: Server, connection: ClientConnection): Promise<void>;
}
