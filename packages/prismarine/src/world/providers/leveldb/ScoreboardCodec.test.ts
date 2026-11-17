import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { dynamicPropertiesFromNbt, dynamicPropertiesToNbt } from '../../dynamicProperties';
import { Scoreboard } from '../../Scoreboard';
import { scoreboardFromNbt, scoreboardToNbt } from './ScoreboardCodec';

/**
 * The `DynamicProperties` record the pinned BDS 1.26.51.1 wrote for a pack that set a number, a
 * boolean, a string and a vector (docs/plans/script-api-host.md, slice 12).
 */
const BDS_DYNAMIC_PROPERTIES =
    '0a00000a240030643565376330612d303030302d343030302d383030302d3030303030303030303066310108006a73703a626f6f6c010607006a73703a6e756d000000000000f83f0807006a73703a737472020068690907006a73703a76656305030000000000803f00002040000040c00000';

/**
 * The `scoreboard` record the same server wrote after a script added `jspobj` (`JSP Objective`),
 * scored the fake player `fake` 5 and an entity 9, added `second` and scored `other` -2, and
 * `/scoreboard` added `cmdobj` (`Cmd`) and scored `cmdfake` 11, with `second` below names,
 * `cmdobj` in the list and `jspobj` in the sidebar.
 */
const BDS_SCOREBOARD =
    '0a000009080043726974657269610000000000091100446973706c61794f626a656374697665730a030000000804004e616d65090062656c6f776e616d65080d004f626a6563746976654e616d6506007365636f6e64010900536f72744f7264657201000804004e616d6504006c697374080d004f626a6563746976654e616d650600636d646f626a010900536f72744f7264657201000804004e616d65070073696465626172080d004f626a6563746976654e616d6506006a73706f626a010900536f72744f726465720100090700456e74726965730a04000000080e0046616b65506c617965724e616d650700636d6466616b65010c004964656e746974795479706503040c0053636f7265626f6172644964040000000000000000080e0046616b65506c617965724e616d6505006f74686572010c004964656e746974795479706503040c0053636f7265626f6172644964030000000000000000040800456e74697479494401000000ffffffff010c004964656e746974795479706502040c0053636f7265626f6172644964020000000000000000080e0046616b65506c617965724e616d65040066616b65010c004964656e746974795479706503040c0053636f7265626f6172644964010000000000000000040c004c617374556e6971756549440400000000000000090a004f626a656374697665730a030000000808004372697465726961050064756d6d79080b00446973706c61794e616d650300436d640804004e616d650600636d646f626a09060053636f7265730a0100000003050053636f72650b000000040c0053636f7265626f6172644964040000000000000000000808004372697465726961050064756d6d79080b00446973706c61794e616d6506007365636f6e640804004e616d6506007365636f6e6409060053636f7265730a0100000003050053636f7265feffffff040c0053636f7265626f6172644964030000000000000000000808004372697465726961050064756d6d79080b00446973706c61794e616d650d004a5350204f626a6563746976650804004e616d6506006a73706f626a09060053636f7265730a0200000003050053636f726509000000040c0053636f7265626f617264496402000000000000000003050053636f726505000000040c0053636f7265626f61726449640100000000000000000000';

const read = (hex: string): NBTTagCompound => {
    const reader = new NBTReader(new BinaryStream(Buffer.from(hex, 'hex')), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(false);
    return reader.parse();
};

const write = (nbt: NBTTagCompound): string => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(nbt);
    return stream.getBuffer().toString('hex');
};

describe('world', () => {
    describe("BDS's level records", () => {
        it('reads the dynamic properties BDS wrote and writes the same bytes back', () => {
            const properties = dynamicPropertiesFromNbt(read(BDS_DYNAMIC_PROPERTIES));
            expect(properties).toEqual(
                new Map([
                    [
                        '0d5e7c0a-0000-4000-8000-0000000000f1',
                        new Map<string, unknown>([
                            ['jsp:bool', true],
                            ['jsp:num', 1.5],
                            ['jsp:str', 'hi'],
                            ['jsp:vec', { x: 1, y: 2.5, z: -3 }]
                        ])
                    ]
                ])
            );
            expect(write(dynamicPropertiesToNbt(properties))).toBe(BDS_DYNAMIC_PROPERTIES);
        });

        it('writes properties in byte order of their ids, whatever order they were set in', () => {
            const properties = new Map([
                [
                    'pack',
                    new Map<string, number | boolean>([
                        ['b', 1],
                        ['a', true],
                        ['B', 2]
                    ])
                ]
            ]);
            const pack = dynamicPropertiesFromNbt(read(write(dynamicPropertiesToNbt(properties)))).get('pack');
            expect([...(pack?.keys() ?? [])]).toEqual(['B', 'a', 'b']);
        });

        it('reads the scoreboard BDS wrote and writes the same bytes back', () => {
            const saved = scoreboardFromNbt(read(BDS_SCOREBOARD));
            expect(saved.lastId).toBe(4);
            expect(saved.participants).toEqual([
                { id: 1, type: 'FakePlayer', name: 'fake' },
                { id: 2, type: 'Entity', name: '-4294967295', saved: -4294967295n },
                { id: 3, type: 'FakePlayer', name: 'other' },
                { id: 4, type: 'FakePlayer', name: 'cmdfake' }
            ]);
            expect(saved.objectives.map(({ name, displayName, scores }) => ({ name, displayName, scores }))).toEqual([
                {
                    name: 'jspobj',
                    displayName: 'JSP Objective',
                    scores: [
                        { participant: 1, score: 5 },
                        { participant: 2, score: 9 }
                    ]
                },
                { name: 'second', displayName: 'second', scores: [{ participant: 3, score: -2 }] },
                { name: 'cmdobj', displayName: 'Cmd', scores: [{ participant: 4, score: 11 }] }
            ]);

            const board = new Scoreboard();
            board.restore(saved);
            expect(write(scoreboardToNbt(board.saved()))).toBe(BDS_SCOREBOARD);
        });

        it('gives a participant the next id after the saved ones, and keeps a live entity by its saved id', () => {
            const board = new Scoreboard();
            board.restore(scoreboardFromNbt(read(BDS_SCOREBOARD)));
            expect(board.score('fake', 'jspobj')).toBe(5);
            expect(board.write('jspobj', { name: 'new' }, 1).participant.id).toBe(5);

            // The entity loads with a runtime id, and is found by its saved id until scored again.
            const entity = { type: 'Entity', name: '77', saved: -4294967295n } as const;
            expect(board.participant({ entity: '77' }, entity.saved)?.id).toBe(2);
            expect(board.write('jspobj', { entity: '77' }, 10, entity).participant).toMatchObject({
                id: 2,
                live: '77'
            });
            expect(board.saved((live) => (live === '77' ? -4294967295n : undefined)).participants[1]).toEqual({
                id: 2,
                type: 'Entity',
                name: '-4294967295',
                saved: -4294967295n
            });
        });
    });
});
