import { vanillaBlockPalette } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { parseCopperName, scrapedIdentifier, waxedIdentifier, weatheredIdentifier } from './weathering';

describe('parseCopperName', () => {
    it('reads the wax prefix, the oxidation prefix and the shape', () => {
        expect(parseCopperName('minecraft:waxed_oxidized_cut_copper_stairs')).toEqual({
            waxed: true,
            stage: 3,
            shape: 'cut_copper_stairs'
        });
        expect(parseCopperName('minecraft:copper_block')).toEqual({ waxed: false, stage: 0, shape: 'copper' });
        expect(parseCopperName('minecraft:exposed_copper')).toEqual({ waxed: false, stage: 1, shape: 'copper' });
    });

    it('declines the copper blocks that do not oxidize', () => {
        expect(parseCopperName('minecraft:copper_ore')).toBeUndefined();
        expect(parseCopperName('minecraft:deepslate_copper_ore')).toBeUndefined();
        expect(parseCopperName('minecraft:raw_copper_block')).toBeUndefined();
        expect(parseCopperName('minecraft:stone')).toBeUndefined();
    });
});

describe('weatheredIdentifier', () => {
    it('walks the four stages and then stops', () => {
        expect(weatheredIdentifier('minecraft:copper_block')).toBe('minecraft:exposed_copper');
        expect(weatheredIdentifier('minecraft:exposed_copper')).toBe('minecraft:weathered_copper');
        expect(weatheredIdentifier('minecraft:weathered_copper')).toBe('minecraft:oxidized_copper');
        expect(weatheredIdentifier('minecraft:oxidized_copper')).toBeUndefined();
    });

    it('refuses a waxed block', () => {
        expect(weatheredIdentifier('minecraft:waxed_copper')).toBeUndefined();
        expect(weatheredIdentifier('minecraft:waxed_exposed_copper')).toBeUndefined();
    });

    it('keeps the shape through a stage change', () => {
        expect(weatheredIdentifier('minecraft:cut_copper_stairs')).toBe('minecraft:exposed_cut_copper_stairs');
        expect(weatheredIdentifier('minecraft:copper_door')).toBe('minecraft:exposed_copper_door');
    });
});

describe('waxedIdentifier and scrapedIdentifier', () => {
    it('undo each other for the plain block', () => {
        expect(waxedIdentifier('minecraft:copper_block')).toBe('minecraft:waxed_copper');
        expect(scrapedIdentifier('minecraft:waxed_copper')).toBe('minecraft:copper_block');
    });

    it('takes the wax off before the oxidation', () => {
        expect(scrapedIdentifier('minecraft:waxed_weathered_copper')).toBe('minecraft:weathered_copper');
        expect(scrapedIdentifier('minecraft:weathered_copper')).toBe('minecraft:exposed_copper');
        expect(scrapedIdentifier('minecraft:copper_block')).toBeUndefined();
    });
});

describe('the transitions over the whole palette', () => {
    it('only ever names a block the palette has', () => {
        const palette = vanillaBlockPalette();
        const known = new Set(palette.entries.map((entry) => entry.identifier));
        const copper = [...known].filter((identifier) => parseCopperName(identifier) !== undefined);
        const unknown: string[] = [];

        for (const identifier of copper) {
            for (const produced of [
                weatheredIdentifier(identifier),
                waxedIdentifier(identifier),
                scrapedIdentifier(identifier)
            ]) {
                if (produced !== undefined && !known.has(produced)) unknown.push(`${identifier} -> ${produced}`);
            }
        }

        expect(copper.length).toBeGreaterThan(60);
        expect(unknown).toEqual([]);
    });
});
