import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import { decodePendingTicks, encodePendingTicks } from './PendingTicksCodec';
import { BLOCK_STATE_VERSION } from './PersistentPalette';

/**
 * The `PendingTicks` record of chunk 0, 0 in a world Bedrock Dedicated Server 1.26.51 saved a tick
 * after lava was placed at 2, 200, 2 on a stone floor: the source and the two cells it spreads to
 * first, each due on tick 275, written at tick 248.
 */
const BDS_RECORD = Buffer.from(
    '0a0000030b0063757272656e745469636bf80000000908007469636b4c6973740a030000000a0a00626c6f636b537461' +
        '74650804006e616d650e006d696e6563726166743a6c6176610a0600737461746573030c006c69717569645f64657074' +
        '68000000000003070076657273696f6e213c15010004040074696d651301000000000000030100780200000003010079' +
        'c80000000301007a02000000000a0a00626c6f636b53746174650804006e616d650e006d696e6563726166743a6c6176' +
        '610a0600737461746573030c006c69717569645f6465707468000000000003070076657273696f6e213c150100040400' +
        '74696d651301000000000000030100780100000003010079c80000000301007a02000000000a0a00626c6f636b537461' +
        '74650804006e616d650e006d696e6563726166743a6c6176610a0600737461746573030c006c69717569645f64657074' +
        '68000000000003070076657273696f6e213c15010004040074696d651301000000000000030100780200000003010079' +
        'c80000000301007a010000000000',
    'hex'
);

describe('the PendingTicks record', () => {
    it('reads the ticks Bedrock Dedicated Server saved', () => {
        expect(decodePendingTicks(BDS_RECORD)).toEqual({
            currentTick: 248,
            ticks: [
                { x: 2, y: 200, z: 2, name: 'minecraft:lava', time: 275n },
                { x: 1, y: 200, z: 2, name: 'minecraft:lava', time: 275n },
                { x: 2, y: 200, z: 1, name: 'minecraft:lava', time: 275n }
            ]
        });
    });

    it('writes the same layout back, byte for byte but for the block state version', () => {
        const lava = BlockRuntimeIds.tryGetByState('minecraft:lava', { liquid_depth: 0 });
        if (lava === null) throw new Error('No runtime id for still lava');
        // Bedrock stamps each state with the version its block last changed in, 1.21.60.33 for
        // lava; this server stamps every state with its catalog's, as its sub chunk palettes do.
        const version = Buffer.alloc(4);
        version.writeInt32LE(BLOCK_STATE_VERSION);
        const expected = BDS_RECORD.toString('hex').replaceAll('213c1501', version.toString('hex'));

        const encoded = encodePendingTicks(248, [
            { x: 2, y: 200, z: 2, runtimeId: lava, time: 275 },
            { x: 1, y: 200, z: 2, runtimeId: lava, time: 275 },
            { x: 2, y: 200, z: 1, runtimeId: lava, time: 275 }
        ]);

        expect(encoded?.toString('hex')).toBe(expected);
    });

    it('writes nothing for a chunk with no ticks, which a writer deletes the record for', () => {
        expect(encodePendingTicks(10, [])).toBeNull();
    });
});
