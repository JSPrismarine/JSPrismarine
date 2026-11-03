import { describe, expect, it } from 'vitest';

import { shareClimateTables } from './sharedClimateTables';

const point = {
    temperature: 0,
    humidity: 0,
    continentalness: 0,
    erosion: 0,
    depth: 0,
    weirdness: 0,
    offset: 0
};

const parameters = {
    biomes: [
        { biome: 'minecraft:plains', parameters: { ...point, temperature: 0.5 } },
        { biome: 'minecraft:desert', parameters: { ...point, temperature: 1 } }
    ]
};

describe('shared climate tables', () => {
    it('packs every valid report and falls back as a whole when one cannot be packed', () => {
        const tables = shareClimateTables(new Map([['minecraft:overworld', parameters]]));
        expect(tables?.get('minecraft:overworld')).toBeInstanceOf(SharedArrayBuffer);
        expect(shareClimateTables(new Map([['minecraft:broken', { biomes: [] }]]))).toBeUndefined();
    });
});
