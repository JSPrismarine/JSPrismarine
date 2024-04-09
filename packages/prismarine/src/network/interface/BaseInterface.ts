import type { EventManager } from '../../Managers';
import type ClientConnection from '../ClientConnection';
import { type NetworkInterface } from './NetworkInterface';

export abstract class BaseInterface implements NetworkInterface {
    protected readonly connections: Map<string, ClientConnection> = new Map();

    public constructor(protected readonly eventManager: EventManager) {}

    public abstract initialize(): void;

    public abstract tick(): void;

    public abstract handleOpenSession(...params: any): boolean;

    public abstract handleRawPacket(...params: any): void;

    public abstract handleCloseSession(...params: any): boolean;

    public getConnections(): Array<ClientConnection> {
        return Array.from(this.connections.values());
    }

    public abstract shutdown(): void;
}
