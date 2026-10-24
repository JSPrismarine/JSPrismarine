import { describe, expect, it } from 'vitest';

import CodeBuilderPacket from './CodeBuilderPacket';

// Packet id 150 as a varuint.
const HEADER = [0x96, 0x01];

const URL = 'ws://localhost:19131';
const URL_BYTES = [0x14, ...Buffer.from(URL, 'utf8')];

describe('CodeBuilderPacket', () => {
    it('writes the url then the open flag', () => {
        const packet = new CodeBuilderPacket();
        packet.url = URL;
        packet.shouldOpenCodeBuilder = true;
        packet.encode();

        expect(URL.length).toBe(0x14);
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...URL_BYTES, 0x01]));
    });

    it('reads the url and the open flag, consuming the whole buffer', () => {
        const packet = new CodeBuilderPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...URL_BYTES, 0x00]));
        packet.decode();

        expect(packet.url).toBe(URL);
        expect(packet.shouldOpenCodeBuilder).toBe(false);
        expect(packet.feof()).toBe(true);
    });
});
