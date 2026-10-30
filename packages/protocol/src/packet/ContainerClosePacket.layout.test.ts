import BinaryStream from '@jsprismarine/binaryutils';
import { containerClosePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import ContainerClosePacket from './ContainerClosePacket';

/** The layout must write the bytes the hand-written encoder wrote, and read them back whole. */
describe('the declarative ContainerClose layout', () => {
    const fill = (): ContainerClosePacket => {
        const packet = new ContainerClosePacket();
        packet.containerId = 3;
        packet.containerType = 7;
        packet.serverInitiatedClose = true;
        return packet;
    };

    const payloadOf = (packet: ContainerClosePacket) => ({
        containerId: packet.containerId,
        containerType: packet.containerType,
        serverInitiatedClose: packet.serverInitiatedClose
    });

    it('matches the bytes the class wrote', () => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeByte(packet.containerId);
        expected.writeByte(packet.containerType);
        expected.writeBoolean(packet.serverInitiatedClose);

        const stream = new BinaryStream();
        layoutAt(containerClosePacket, 2193).encode(stream, payloadOf(packet));

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new ContainerClosePacket(sent.getBuffer());
        received.decodePayload();

        expect(payloadOf(received)).toEqual(payloadOf(sent));
        expect(received.feof()).toBe(true);
    });
});
