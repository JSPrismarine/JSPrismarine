import { describe, expect, it } from 'vitest';
import AutomationClientConnectPacket from './AutomationClientConnectPacket';

describe('AutomationClientConnectPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x5f]), // Header, packet 95
        Buffer.from([0x11]),
        Buffer.from('localhost:8000/ws') // Web Socket Data: Websocket Server URI
    ]);

    it('decodes the address and consumes the whole buffer', () => {
        const packet = new AutomationClientConnectPacket(encoded);
        packet.decode();

        expect(packet.websocketServerUri).toBe('localhost:8000/ws');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new AutomationClientConnectPacket();
        packet.websocketServerUri = 'localhost:8000/ws';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
