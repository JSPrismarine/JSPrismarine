import BinaryStream from '@jsprismarine/binaryutils';
import { netIdFor } from '../codec/v2193';
import { describe, expect, it } from 'vitest';

import ContainerClosePacket from './ContainerClosePacket';

describe('network', () => {
    describe('ContainerClosePacket', () => {
        it('writes Container Id, Container Type and Server Initiated Close as three bytes', () => {
            const packet = Object.assign(new ContainerClosePacket(), {
                containerId: 124,
                containerType: 7,
                serverInitiatedClose: true
            });
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([netIdFor('ContainerClosePacket'), 124, 7, 1]);
        });

        it('reads a hand-built buffer and consumes all of it', () => {
            const stream = new BinaryStream();
            stream.writeUnsignedVarInt(netIdFor('ContainerClosePacket')!);
            stream.writeByte(3);
            stream.writeByte(0);
            stream.writeBoolean(false);

            const packet = new ContainerClosePacket(stream.getBuffer());
            packet.decode();

            expect(packet.containerId).toBe(3);
            expect(packet.containerType).toBe(0);
            expect(packet.serverInitiatedClose).toBe(false);
            expect(packet.feof()).toBe(true);
        });
    });
});
