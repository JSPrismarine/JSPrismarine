import { describe, expect, it } from 'vitest';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import * as Packets from '../Packets';
import { TitleType } from '@jsprismarine/minecraft';
import SetTitlePacket from './SetTitlePacket';

describe('SetTitlePacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x58]), // Header, packet 88
        Buffer.from([0x04]), // Title Type: varint32 2 (TITLE) zigzags to 4
        Buffer.from([0x02]),
        Buffer.from('hi'), // Title Text
        Buffer.from([0x14]), // Fade In Time: varint32 10 zigzags to 20
        Buffer.from([0x28]), // Stay Time: varint32 20 zigzags to 40
        Buffer.from([0x0a]), // Fade Out Time: varint32 5 zigzags to 10
        Buffer.from([0x01]),
        Buffer.from('x'), // Xuid
        Buffer.from([0x00]), // Platform Online Id: empty
        Buffer.from([0x00]) // Filtered Title Message: empty
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new SetTitlePacket(encoded);
        packet.decode();

        expect(packet.titleType).toBe(TitleType.TITLE);
        expect(packet.titleText).toBe('hi');
        expect(packet.fadeInTime).toBe(10);
        expect(packet.stayTime).toBe(20);
        expect(packet.fadeOutTime).toBe(5);
        expect(packet.xuid).toBe('x');
        expect(packet.platformOnlineId).toBe('');
        expect(packet.filteredTitleMessage).toBe('');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new SetTitlePacket();
        packet.titleType = TitleType.TITLE;
        packet.titleText = 'hi';
        packet.fadeInTime = 10;
        packet.stayTime = 20;
        packet.fadeOutTime = 5;
        packet.xuid = 'x';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('is registered for packet 0x58', () => {
        expect(Packets.SetTitlePacket).toBe(SetTitlePacket);
        expect(netIdFor('SetTitlePacket')).toBe(0x58);
    });
});
