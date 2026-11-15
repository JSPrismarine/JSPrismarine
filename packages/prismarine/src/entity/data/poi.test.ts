import type { NavigationView } from '@jsprismarine/entity-goals';
import { describe, expect, it } from 'vitest';

import { PointsOfInterest } from './poi';

/** A flat world with a bell at the origin, which counts every block the index reads. */
const bellWorld = () => {
    const blocks = new Map<string, string>([['0,64,0', 'minecraft:bell']]);
    let reads = 0;
    const navigation: NavigationView = {
        blockAt: ({ x, y, z }) => {
            reads++;
            return blocks.get(`${x},${y},${z}`) ?? (y < 64 ? 'minecraft:stone' : 'minecraft:air');
        },
        isPassable: ({ y }) => y >= 64,
        isSolid: ({ y }) => y < 64,
        isWater: () => false,
        isLava: () => false
    };
    const interest = new PointsOfInterest({ navigation: () => navigation });
    return { interest, blocks, reads: () => reads };
};

const AT = { x: 3.5, y: 64, z: 3.5 };

describe('PointsOfInterest', () => {
    it('reads again only the chunk that changed', () => {
        const { interest, reads } = bellWorld();
        // 48 blocks reach seven chunks across, so the first search reads 49 chunk bands.
        expect(interest.nearest('meeting', AT, 48)).toEqual({ x: 0.5, y: 65, z: 0.5 });
        const firstSearch = reads();

        interest.invalidateBlockCache(2, 2);
        expect(interest.nearest('meeting', { ...AT, x: 4.5 }, 48)).toEqual({ x: 0.5, y: 65, z: 0.5 });

        // One band of 16 by 16 columns, nine blocks high.
        expect(reads() - firstSearch).toBe(16 * 16 * 9);
        expect(firstSearch).toBe(49 * 16 * 16 * 9);
    });

    it('finds a marker placed in the chunk that changed', () => {
        const { interest, blocks } = bellWorld();
        expect(interest.nearest('home', AT, 48)).toBeUndefined();

        blocks.set('20,64,20', 'minecraft:bed');
        interest.invalidateBlockCache(1, 1);

        expect(interest.nearest('home', AT, 48)).toEqual({ x: 20.5, y: 65, z: 20.5 });
    });

    it('reads every chunk again when no chunk is named', () => {
        const { interest, reads } = bellWorld();
        interest.nearest('meeting', AT, 48);
        const firstSearch = reads();

        interest.invalidateBlockCache();
        interest.nearest('meeting', { ...AT, x: 4.5 }, 48);

        expect(reads() - firstSearch).toBe(firstSearch);
    });
});
