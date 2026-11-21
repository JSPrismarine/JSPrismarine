import { gunzipSync } from 'node:zlib';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { flatWorldGenSettings, setProperty } from './servers.mts';

describe('setProperty', () => {
    it('replaces a key in place and appends one the file lacks', () => {
        const text = 'server-name=Dedicated Server\nview-distance=32\ntick-distance=4\n';
        expect(setProperty(text, 'view-distance', '10')).toBe(
            'server-name=Dedicated Server\nview-distance=10\ntick-distance=4\n'
        );
        expect(setProperty(text, 'level-type', 'FLAT')).toBe(`${text}level-type=FLAT\n`);
    });

    it('matches the whole key, not a key it is the prefix of', () => {
        expect(setProperty('server-port=19132\nserver-portv6=19133\n', 'server-port', '19432')).toBe(
            'server-port=19432\nserver-portv6=19133\n'
        );
    });
});

describe('flatWorldGenSettings', () => {
    it('gives the overworld the flat generator under the seed', () => {
        const root = NBTTagCompound.readFromStream(
            new BinaryStream(gunzipSync(flatWorldGenSettings(7))),
            ByteOrder.BIG_ENDIAN
        );
        const data = root.getCompound('data', false);
        expect(data?.getLong('seed', 0n)).toBe(7n);
        const overworld = data?.getCompound('dimensions', false)?.getCompound('minecraft:overworld', false);
        expect(overworld?.getCompound('generator', false)?.getString('type', '')).toBe('minecraft:flat');
    });
});
