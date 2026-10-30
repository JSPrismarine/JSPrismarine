import { describe, expect, it } from 'vitest';
import SetCommandsEnabledPacket from './SetCommandsEnabledPacket';

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
});
