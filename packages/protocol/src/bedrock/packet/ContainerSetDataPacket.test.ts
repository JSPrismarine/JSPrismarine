import { describe, expect, it } from 'vitest';
import ContainerSetDataPacket from './ContainerSetDataPacket';

describe('ContainerSetDataPacket', () => {
    // Header 0x33. Container 1, property 0, and value -5 zigzagged to 9.
    const encoded = Buffer.from([0x33, 0x01, 0x00, 0x09]);

    it('decodes the container, property and value, consuming the whole buffer', () => {
        const packet = new ContainerSetDataPacket(encoded);
        packet.decode();

        expect(packet.containerId).toBe(1);
        expect(packet.id).toBe(0);
        expect(packet.value).toBe(-5);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the property back to the same bytes', () => {
        const packet = new ContainerSetDataPacket();
        packet.containerId = 1;
        packet.id = 0;
        packet.value = -5;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
