import type { NetworkPacket } from '@jsprismarine/protocol';
import { LoginPacket, Packet, PacketIdentifier, RequestNetworkSettingsPacket } from '@jsprismarine/protocol';
import { Handlers } from './Protocol';
import type PacketHandler from './handler/PacketHandler';

interface Constructor<T> {
    new (...args: any[]): T;
}

export default class PacketRegistry2 {
    private static readonly packets: Record<number, Constructor<NetworkPacket<unknown>>> = {};
    private static readonly handlers: Record<number, PacketHandler<any>> = {};

    static {
        for (const [, value] of Object.entries(Packet)) {
            this.packets[value.constructor.prototype.id] = value as any;
        }

        console.log(this.packets);

        for (const [, value] of Object.entries(Handlers)) {
            this.handlers[value.NetID] = new (value as any)();
        }
    }

    public static getHandler(id: number): PacketHandler<any> | null {
        if (!this.handlers.hasOwnProperty(id)) {
            // console.error(`Handler with id ${id} does not exist.`);
            return null;
        }
        return this.handlers[id]!;
    }

    public static getPacket(id: number): NetworkPacket<unknown> {
        /* if (!this.packets.hasOwnProperty(id)) {
            console.error(`Packet with id ${id} does not exist.`);
            return null;
        } */

        switch (id) {
            case PacketIdentifier.REQUEST_NETWORK_SETTINGS:
                return new RequestNetworkSettingsPacket();
            case PacketIdentifier.LOGIN:
                return new LoginPacket();
            default:
                throw new Error(`Packet with id ${id} does not exist.`);
        }
    }
}
