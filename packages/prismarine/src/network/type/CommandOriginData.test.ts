import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import CommandOriginData from './CommandOriginData';
import CommandOriginType from './CommandOriginType';

// A varuint length prefix followed by UTF-8, for strings shorter than 128 bytes.
const string = (value: string): Buffer => Buffer.concat([Buffer.from([Buffer.byteLength(value)]), Buffer.from(value)]);

// 00112233-4455-6677-8899-aabbccddeeff as two uint64 LE halves, most significant first.
const uuid = Buffer.from([
    0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88
]);

// One Buffer per docs field, in wire order.
const origin = (type: string): Buffer =>
    Buffer.concat([
        string(type), // Type
        uuid, // UUID
        string('request-7'), // RequestId
        Buffer.from([0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // PlayerId: int64 LE 42
    ]);

describe('network', () => {
    describe('type', () => {
        describe('CommandOriginData', () => {
            it('reads a hand-built player origin and consumes it all', () => {
                const stream = new BinaryStream(origin('Player'));
                const data = CommandOriginData.networkDeserialize(stream);

                expect(data.type).toBe(CommandOriginType.Player);
                expect(data.uuid.toString()).toBe('00112233-4455-6677-8899-aabbccddeeff');
                expect(data.requestId).toBe('request-7');
                expect(data.uniqueEntityId).toBe(42n);
                expect(stream.feof()).toBe(true);
            });

            it('matches the origin name regardless of case', () => {
                expect(CommandOriginData.networkDeserialize(new BinaryStream(origin('DevConsole'))).type).toBe(
                    CommandOriginType.DevConsole
                );
                expect(CommandOriginData.networkDeserialize(new BinaryStream(origin('DEVCONSOLE'))).type).toBe(
                    CommandOriginType.DevConsole
                );
            });

            it('knows the origins added since protocol 2168', () => {
                expect(CommandOriginData.networkDeserialize(new BinaryStream(origin('Precompiled'))).type).toBe(
                    CommandOriginType.Precompiled
                );
                expect(
                    CommandOriginData.networkDeserialize(new BinaryStream(origin('GameDirectorEntityServer'))).type
                ).toBe(CommandOriginType.GameDirectorEntityServer);
                expect(CommandOriginData.networkDeserialize(new BinaryStream(origin('Scripting'))).type).toBe(
                    CommandOriginType.Scripting
                );
                expect(CommandOriginData.networkDeserialize(new BinaryStream(origin('ExecuteContext'))).type).toBe(
                    CommandOriginType.ExecuteContext
                );
            });

            it('falls back to the player origin for a name it does not know', () => {
                const stream = new BinaryStream(origin('SomethingNew'));
                const data = CommandOriginData.networkDeserialize(stream);

                expect(data.type).toBe(CommandOriginType.Player);
                expect(stream.feof()).toBe(true);
            });

            it('numbers the origin types as the 2193 enum does', () => {
                expect(CommandOriginType.EntityServer).toBe(11);
                expect(CommandOriginType.Precompiled).toBe(12);
                expect(CommandOriginType.GameDirectorEntityServer).toBe(13);
                expect(CommandOriginType.Scripting).toBe(14);
                expect(CommandOriginType.ExecuteContext).toBe(15);
            });
        });
    });
});
