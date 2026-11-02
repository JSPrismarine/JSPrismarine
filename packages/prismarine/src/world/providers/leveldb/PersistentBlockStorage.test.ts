import { createHash } from 'node:crypto';

import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import BlockStorage from '../../chunk/BlockStorage';
import { decodePersistentStorage, encodePersistentStorage } from './PersistentBlockStorage';

const runtimeIds = (names: readonly string[]): number[] => names.map((name) => BlockRuntimeIds.getByName(name));

const encodedDigest = (storage: BlockStorage): string => {
    const stream = new BinaryStream();
    encodePersistentStorage(storage, stream);
    return createHash('sha256').update(stream.getBuffer()).digest('hex');
};

describe('PersistentBlockStorage', () => {
    it('keeps sparse-column disk bytes unchanged', () => {
        const storage = new BlockStorage({});
        const [stone, dirt, granite] = runtimeIds(['minecraft:stone', 'minecraft:dirt', 'minecraft:granite']);
        if (stone === undefined || dirt === undefined || granite === undefined) throw new Error('Missing test palette');
        storage.setBlock(0, 0, 0, stone);
        storage.setBlock(15, 15, 15, dirt);
        storage.setBlock(7, 8, 9, granite);

        expect(encodedDigest(storage)).toBe('3c2fc7ca20842d4be5e07f757a8cc98491912a6fcf5d72392a59a578b3e51b77');
    });

    it('keeps dense-column disk bytes unchanged', () => {
        const storage = new BlockStorage({});
        const palette = runtimeIds([
            'minecraft:stone',
            'minecraft:dirt',
            'minecraft:sand',
            'minecraft:gravel',
            'minecraft:granite',
            'minecraft:diorite',
            'minecraft:andesite',
            'minecraft:cobblestone',
            'minecraft:bedrock'
        ]);
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                for (let z = 0; z < 16; z++) {
                    const runtimeId = palette[(x + y * 3 + z * 7) % palette.length];
                    if (runtimeId === undefined) throw new Error('Missing dense test palette entry');
                    storage.setBlock(x, y, z, runtimeId);
                }
            }
        }

        expect(encodedDigest(storage)).toBe('8dddcceb91fac84af031120ef85f4081d9f0f0f02cbf7258ad45c3143338589f');
    });

    it('decodes persistent storage and adopts its owned index buffer', () => {
        const source = new BlockStorage({});
        source.setBlock(1, 2, 3, BlockRuntimeIds.getByName('minecraft:stone'));
        const stream = new BinaryStream();
        encodePersistentStorage(source, stream);

        const decoded = decodePersistentStorage(new BinaryStream(stream.getBuffer()));

        expect(decoded.getRuntimeId(1, 2, 3)).toBe(BlockRuntimeIds.getByName('minecraft:stone'));
        expect(Reflect.get(decoded, 'blocks')).toBeInstanceOf(Uint16Array);
    });

    it('takes ownership only through the internal factory', () => {
        const indices = new Uint16Array(4096);
        const storage = BlockStorage.fromOwnedIndices(indices, runtimeIds(['minecraft:air', 'minecraft:stone']));

        expect(Reflect.get(storage, 'blocks')).toBe(indices);
    });

    it('keeps the public constructor defensive when given a typed index buffer', () => {
        const indices = new Uint16Array(4096);
        indices[0] = 1;
        const [air, stone] = runtimeIds(['minecraft:air', 'minecraft:stone']);
        if (air === undefined || stone === undefined) throw new Error('Missing test palette');

        const storage = new BlockStorage({ blocks: indices, palette: [air, stone] });
        indices[0] = 0;

        expect(storage.getRuntimeId(0, 0, 0)).toBe(stone);
    });
});
