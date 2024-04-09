import type { NetworkInterface } from './NetworkInterface';

export class InterfaceRegistry {
    private readonly interfaces = new Set<NetworkInterface>();

    public registerInterface(iface: NetworkInterface): void {
        this.interfaces.add(iface);
    }

    public unregisterInterface(iface: NetworkInterface): void {
        this.interfaces.delete(iface);
    }

    public getInterfaces(): Set<NetworkInterface> {
        return this.interfaces;
    }

    public handleOpenSession(params: any): void {
        for (const iface of this.interfaces) {
            if (!iface.handleOpenSession(params)) {
                throw new Error(`Failed to open session for interface ${iface.constructor.name}`);
            }
        }
    }

    public handleCloseSession(): void {
        for (const iface of this.interfaces) {
            if (!iface.handleCloseSession()) {
                throw new Error(`Failed to close session for interface ${iface.constructor.name}`);
            }
        }
    }

    public handleRawPacket(buffer: Buffer): void {
        for (const iface of this.interfaces) {
            iface.handleRawPacket(buffer);
        }
    }

    public tick(): void {
        for (const iface of this.interfaces) {
            iface.tick();
        }
    }

    public initialize(): void {
        for (const iface of this.interfaces) {
            iface.initialize();
        }
    }

    public shutdown(): void {
        for (const iface of this.interfaces) {
            iface.shutdown();
        }
    }
}
