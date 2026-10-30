import { describe, expect, it } from 'vitest';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import CommandOriginData from '@jsprismarine/protocol/wire/structures/CommandOriginData';
import CommandOriginType from '@jsprismarine/protocol/wire/structures/CommandOriginType';
import CommandRequestPacket from './CommandRequestPacket';

// A varuint length prefix followed by UTF-8, for strings shorter than 128 bytes.
const string = (value: string): Buffer => Buffer.concat([Buffer.from([Buffer.byteLength(value)]), Buffer.from(value)]);

// 00112233-4455-6677-8899-aabbccddeeff as two uint64 LE halves, most significant first.
const uuid = Buffer.from([
    0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88
]);

// One Buffer per docs field, in wire order.
const encoded = Buffer.concat([
    Buffer.from([0x4d]), // Header, packet 77
    string('/say hi'), // Command
    string('player'), // Origin: Type
    uuid, // Origin: UUID
    string('request-7'), // Origin: RequestId
    Buffer.from([0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Origin: PlayerId, int64 LE 42
    Buffer.from([0x00]), // IsInternal
    string('Latest') // Version, a CurrentCmdVersion member name
]);

describe('CommandRequestPacket', () => {
    it('decodes every field and consumes the whole buffer', () => {
        const packet = new CommandRequestPacket(encoded);
        packet.decode();

        expect(packet.commandName).toBe('/say hi');
        expect(packet.commandOriginData.type).toBe(CommandOriginType.Player);
        expect(packet.commandOriginData.uuid.toString()).toBe('00112233-4455-6677-8899-aabbccddeeff');
        expect(packet.commandOriginData.requestId).toBe('request-7');
        expect(packet.commandOriginData.uniqueEntityId).toBe(42n);
        expect(packet.internal).toBe(false);
        expect(packet.version).toBe('Latest');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new CommandRequestPacket();
        packet.commandName = '/say hi';
        packet.commandOriginData = new CommandOriginData(
            CommandOriginType.Player,
            UUID.fromString('00112233-4455-6677-8899-aabbccddeeff'),
            'request-7',
            42n
        );
        packet.version = 'Latest';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('reads the internal flag as the byte after the origin', () => {
        const internal = Buffer.from(encoded);
        internal[encoded.length - string('Latest').length - 1] = 0x01;

        const packet = new CommandRequestPacket(internal);
        packet.decode();

        expect(packet.internal).toBe(true);
        expect(packet.version).toBe('Latest');
    });
});
