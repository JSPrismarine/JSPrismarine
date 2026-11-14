import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';
import { setCommandsEnabledPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import SetCommandsEnabledPacket from './SetCommandsEnabledPacket';
import { capture } from '../testing/evidence.test.helper';

describe('SetCommandsEnabledPacket', () => {
    it('decodes the flag from a packet buffer', () => {
        const packet = new SetCommandsEnabledPacket(Buffer.from([0x3b, 0x01]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ commandsEnabled: true });
    });

    it('encodes a disabled client as a zero byte', () => {
        const packet = new SetCommandsEnabledPacket({ commandsEnabled: false });
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x3b, 0x00]));
    });

    it('encodes an enabled client as a one byte', () => {
        const packet = new SetCommandsEnabledPacket({ commandsEnabled: true });
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x3b, 0x01]));
    });

    it.each([2193, 2225])('round-trips the Bedrock Dedicated Server capture at protocol %i', (protocolVersion) => {
        const captured = capture(protocolVersion, 0x3b);
        const layout = layoutAt(setCommandsEnabledPacket, protocolVersion);
        const decoded = layout.decode(new BinaryStream(captured));
        const encoded = new BinaryStream();
        layout.encode(encoded, decoded);

        expect(decoded).toEqual({ commandsEnabled: true });
        expect(encoded.getBuffer()).toEqual(captured);
    });
});
