import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '../wire/WireLayout';
import { commandOutputPacket, CommandOutputType } from '../wire/definitions/commands';
import CommandOriginData from '../wire/structures/CommandOriginData';
import CommandOriginType from '../wire/structures/CommandOriginType';
import UUID from '../wire/structures/UUID';
import { describe, expect, it } from 'vitest';

const originData = new CommandOriginData(
    CommandOriginType.DevConsole,
    UUID.fromString('0123456789abcdeffedcba9876543210'),
    'req-1',
    -42n
);

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The success count is above what a signed int32 holds, because it travels
 * as an unsigned uint32 LE.
 */
const WITH_DATA_SET = Buffer.from(
    '0a646576636f6e736f6c65efcdab89674523011032547698badcfe057265712d31d6ffffffffffffff09616c6c' +
        '6f7574707574efbeadde0213636f6d6d616e64732e74702e7375636365737301020161016203626164000001026473',
    'hex'
);

/** The same encoder with no `Data Set`: the optional is a lone zero byte at the end. */
const WITHOUT_DATA_SET = Buffer.from(
    '0a646576636f6e736f6c65efcdab89674523011032547698badcfe057265712d31d6ffffffffffffff046e6f6e65010000000000',
    'hex'
);

const withDataSet = {
    originData,
    outputType: CommandOutputType.AllOutput,
    successCount: 0xdeadbeef,
    outputMessages: [
        { messageId: 'commands.tp.success', successful: true, parameters: ['a', 'b'] },
        { messageId: 'bad', successful: false, parameters: [] }
    ],
    dataSet: 'ds'
};

const withoutDataSet = {
    originData,
    outputType: CommandOutputType.None,
    successCount: 1,
    outputMessages: [],
    dataSet: null
};

describe('the declarative CommandOutput layout', () => {
    const layout = layoutAt(commandOutputPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, withDataSet);

        expect(stream.getBuffer()).toEqual(WITH_DATA_SET);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(WITH_DATA_SET))).toEqual(withDataSet);
    });

    it('writes the bytes the hand-written encoder wrote without a data set', () => {
        const stream = new BinaryStream();
        layout.encode(stream, withoutDataSet);

        expect(stream.getBuffer()).toEqual(WITHOUT_DATA_SET);
    });

    it('reads those bytes back too', () => {
        expect(layout.decode(new BinaryStream(WITHOUT_DATA_SET))).toEqual(withoutDataSet);
    });

    it('reads an output type name it does not know as None', () => {
        // The recorded `alloutput` bytes, with the name's first byte changed so it matches
        // no type at all.
        const unknown = Buffer.from(WITH_DATA_SET);
        unknown[unknown.indexOf(Buffer.from('616c6c6f7574707574', 'hex'))] = 0x78;

        expect(layout.decode(new BinaryStream(unknown)).outputType).toBe(CommandOutputType.None);
    });
});
