import { describe, expect, it } from 'vitest';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import CommandOriginData from '@jsprismarine/protocol/wire/structures/CommandOriginData';
import CommandOriginType from '@jsprismarine/protocol/wire/structures/CommandOriginType';
import CommandOutputPacket, { CommandOutputType } from './CommandOutputPacket';

describe('CommandOutputPacket', () => {
    // A varuint length prefix followed by UTF-8, for strings shorter than 128 bytes.
    const string = (value: string): Buffer =>
        Buffer.concat([Buffer.from([Buffer.byteLength(value)]), Buffer.from(value)]);

    // 00112233-4455-6677-8899-aabbccddeeff as two uint64 LE halves, most significant first.
    const uuidBytes = Buffer.from([
        0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88
    ]);

    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x4f]), // Header, packet 79
        string('player'), // Origin Data: Type
        uuidBytes, // Origin Data: UUID
        string('request-7'), // Origin Data: RequestId
        Buffer.from([0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Origin Data: PlayerId, int64 LE 42
        string('alloutput'), // Output: Output Type
        Buffer.from([0x01, 0x00, 0x00, 0x00]), // Output: Success Count, uint32 LE 1
        Buffer.from([0x01]), // Output: Output Messages count
        string('commands.tp.success'), // Message ID
        Buffer.from([0x01]), // Successful?
        Buffer.from([0x02]), // Parameters count
        string('Steve'),
        string('Alex'),
        Buffer.from([0x00]) // Output: Data Set, absent
    ]);

    const origin = (): CommandOriginData =>
        new CommandOriginData(
            CommandOriginType.Player,
            UUID.fromString('00112233-4455-6677-8899-aabbccddeeff'),
            'request-7',
            42n
        );

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new CommandOutputPacket(encoded);
        packet.decode();

        expect(packet.originData.type).toBe(CommandOriginType.Player);
        expect(packet.originData.uuid.toString()).toBe('00112233-4455-6677-8899-aabbccddeeff');
        expect(packet.originData.requestId).toBe('request-7');
        expect(packet.originData.uniqueEntityId).toBe(42n);
        expect(packet.outputType).toBe(CommandOutputType.AllOutput);
        expect(packet.successCount).toBe(1);
        expect(packet.outputMessages).toEqual([
            { messageId: 'commands.tp.success', successful: true, parameters: ['Steve', 'Alex'] }
        ]);
        expect(packet.dataSet).toBeNull();
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new CommandOutputPacket();
        packet.originData = origin();
        packet.outputType = CommandOutputType.AllOutput;
        packet.successCount = 1;
        packet.outputMessages = [{ messageId: 'commands.tp.success', successful: true, parameters: ['Steve', 'Alex'] }];
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('writes a present Data Set after its presence byte', () => {
        const packet = new CommandOutputPacket();
        packet.originData = origin();
        packet.outputType = CommandOutputType.DataSet;
        packet.dataSet = 'set';
        packet.encode();

        expect(packet.getBuffer().subarray(-5)).toEqual(Buffer.concat([Buffer.from([0x01]), string('set')]));

        const decoded = new CommandOutputPacket(packet.getBuffer());
        decoded.decode();
        expect(decoded.dataSet).toBe('set');
        expect(decoded.outputType).toBe(CommandOutputType.DataSet);
        expect(decoded.feof()).toBe(true);
    });

    it('reads an output type name whatever its casing', () => {
        const packet = new CommandOutputPacket(
            Buffer.concat([
                Buffer.from([0x4f]),
                string('player'),
                uuidBytes,
                string(''),
                Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
                string('LastOutput'),
                Buffer.from([0x00, 0x00, 0x00, 0x00]),
                Buffer.from([0x00]),
                Buffer.from([0x00])
            ])
        );
        packet.decode();

        expect(packet.outputType).toBe(CommandOutputType.LastOutput);
        expect(packet.feof()).toBe(true);
    });
});
