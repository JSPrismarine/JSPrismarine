import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { encodeSubChunk } from '../providers/leveldb/SubChunkCodec';
import BlockStorage from './BlockStorage';
import Chunk from './Chunk';
import SubChunk from './SubChunk';

const runtimeId = (name: string): number => BlockRuntimeIds.getByName(name);
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const persistedBytes = (chunk: Chunk): Buffer =>
    Buffer.concat(Array.from(chunk.getSubChunkEntries(), ([index, subChunk]) => encodeSubChunk(subChunk, index)));

const buildUniformChunk = (): Chunk => {
    const uniformStorage = (name: string): BlockStorage => {
        const blockRuntimeId = runtimeId(name);
        return new BlockStorage({
            blocks: new Uint8Array(4096).fill(1),
            palette: [runtimeId('minecraft:air'), blockRuntimeId]
        });
    };
    const subChunk = new SubChunk(
        new Map([
            [0, uniformStorage('minecraft:stone')],
            [1, uniformStorage('minecraft:water')]
        ])
    );
    return new Chunk(0, 0, new Map([[0, subChunk]]));
};

const mutationPaths = [
    {
        name: 'Chunk.setBlockRuntimeId',
        layer: 0,
        mutate: (chunk: Chunk, block: number) => chunk.setBlockRuntimeId(1, 2, 3, block)
    },
    {
        name: 'a storage-layer write',
        layer: 1,
        mutate: (chunk: Chunk, block: number) => chunk.getSubChunk(0)!.getStorages()[1]!.setBlock(1, 2, 3, block)
    },
    {
        name: 'mutable SubChunk access',
        layer: 0,
        mutate: (chunk: Chunk, block: number) => chunk.getSubChunk(0)!.setBlock(1, 2, 3, block, 0)
    }
];

describe('uniform block storage interning', () => {
    it.each(mutationPaths)('preserves bytes and detaches on $name', ({ layer, mutate }) => {
        const left = buildUniformChunk();
        const right = buildUniformChunk();
        const leftStorage = left.getSubChunk(0)!.getStorages()[layer]!;
        const rightStorage = right.getSubChunk(0)!.getStorages()[layer]!;
        const leftNetworkDigest = digest(left.networkSerialize());
        const rightNetworkDigest = digest(right.networkSerialize());
        const leftPersistentDigest = digest(persistedBytes(left));
        const rightPersistentDigest = digest(persistedBytes(right));

        expect(leftStorage).not.toBe(rightStorage);

        left.packBlockStorage();
        right.packBlockStorage();

        expect(leftStorage.getPalette()).toBe(rightStorage.getPalette());
        expect(Object.isFrozen(leftStorage.getPalette())).toBe(true);
        expect(digest(left.networkSerialize())).toBe(leftNetworkDigest);
        expect(digest(right.networkSerialize())).toBe(rightNetworkDigest);
        expect(digest(persistedBytes(left))).toBe(leftPersistentDigest);
        expect(digest(persistedBytes(right))).toBe(rightPersistentDigest);

        const replacement = runtimeId('minecraft:gold_block');
        mutate(left, replacement);

        expect(left.getBlockRuntimeId(1, 2, 3, layer)).toBe(replacement);
        expect(right.getBlockRuntimeId(1, 2, 3, layer)).toBe(
            layer === 0 ? runtimeId('minecraft:stone') : runtimeId('minecraft:water')
        );
        expect(digest(left.networkSerialize())).not.toBe(leftNetworkDigest);
        expect(digest(persistedBytes(left))).not.toBe(leftPersistentDigest);
        expect(digest(right.networkSerialize())).toBe(rightNetworkDigest);
        expect(digest(persistedBytes(right))).toBe(rightPersistentDigest);
    });
});
