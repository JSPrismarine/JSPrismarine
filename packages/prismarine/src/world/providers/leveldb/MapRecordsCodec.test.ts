import { describe, expect, it } from 'vitest';

import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { mapsFromNbt } from './MapRecordsCodec';

describe('the saved maps record', () => {
    it('reads a map saved before maps had pixels as an explorer map whose preview is still to draw', () => {
        // The shape `jsprismarine:maps` had when it held explorer maps only.
        const entry = new NBTTagCompound('');
        entry.addValue('id', new Types.NumberVal(4));
        entry.addValue('dimension', new Types.StringVal('minecraft:overworld'));
        entry.addValue('centerX', new Types.NumberVal(320));
        entry.addValue('centerZ', new Types.NumberVal(-704));
        entry.addValue('scale', new Types.NumberVal(1));
        entry.addValue('decorations', new Set());
        const root = new NBTTagCompound('');
        root.addValue('maps', new Set([entry]));

        expect(mapsFromNbt(root).get(4)).toEqual({
            dimension: 'minecraft:overworld',
            centerX: 320,
            centerZ: -704,
            scale: 1,
            decorations: [],
            trackingPosition: true,
            unlimitedTracking: true,
            locked: false,
            colors: undefined
        });
    });
});
