import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import BlockPosition from '../../world/BlockPosition';
import { MAX_BLOCK_TARGET_DISTANCE, blockTargetRejection } from './BlockTarget';

const LECTERNS: ReadonlySet<string> = new Set(['minecraft:lectern']);

describe('blockTargetRejection', () => {
    it('accepts one of the expected blocks in a loaded chunk within reach', () => {
        const { player } = sessionNearBlocks({ '1,2,3': 'minecraft:lectern' });

        expect(blockTargetRejection(player, new BlockPosition(1, 2, 3), LECTERNS)).toBeNull();
    });

    it('rejects a position further away than the bound', () => {
        const { player } = sessionNearBlocks({ '0,0,8': 'minecraft:lectern' });

        expect(blockTargetRejection(player, new BlockPosition(0, 0, 8), LECTERNS)).toBe('it is 8.0 blocks away');
        expect(MAX_BLOCK_TARGET_DISTANCE).toBeLessThan(8);
    });

    it('rejects a position whose chunk is not loaded without loading it', () => {
        // Within reach of a player standing on the chunk border, but in the chunk next door.
        const { player } = sessionNearBlocks({});

        expect(blockTargetRejection(player, new BlockPosition(-1, 0, 0), LECTERNS)).toBe('its chunk is not loaded');
    });

    it('rejects a position holding some other block, naming it', () => {
        const { player } = sessionNearBlocks({ '1,0,0': 'minecraft:stone' });

        expect(blockTargetRejection(player, new BlockPosition(1, 0, 0), LECTERNS)).toBe(
            'the block there is minecraft:stone'
        );
        expect(blockTargetRejection(player, new BlockPosition(2, 0, 0), LECTERNS)).toBe(
            'the block there is minecraft:air'
        );
    });

    it('rejects a position that is not a number instead of throwing', () => {
        const { player } = sessionNearBlocks({});

        expect(blockTargetRejection(player, new BlockPosition(Number.NaN, 0, 0), LECTERNS)).toBe(
            'it is NaN blocks away'
        );
    });
});
