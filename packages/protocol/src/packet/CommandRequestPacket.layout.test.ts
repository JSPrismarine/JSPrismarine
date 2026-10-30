import BinaryStream from '@jsprismarine/binaryutils';
import { commandRequestPacket, layoutAt } from '@jsprismarine/protocol';
import CommandOriginData from '@jsprismarine/protocol/wire/structures/CommandOriginData';
import CommandOriginType from '@jsprismarine/protocol/wire/structures/CommandOriginType';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The origin's player id is negative, because it travels as a signed
 * int64 LE rather than as a varint.
 */
const BYTES = Buffer.from(
    '072f7361792068690a646576636f6e736f6c65efcdab89674523011032547698badcfe057265712d31d6ffffffffffffff010131',
    'hex'
);

const payload = {
    commandName: '/say hi',
    commandOriginData: new CommandOriginData(
        CommandOriginType.DevConsole,
        UUID.fromString('0123456789abcdeffedcba9876543210'),
        'req-1',
        -42n
    ),
    internal: true,
    version: '1'
};

describe('the declarative CommandRequest layout', () => {
    const layout = layoutAt(commandRequestPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
