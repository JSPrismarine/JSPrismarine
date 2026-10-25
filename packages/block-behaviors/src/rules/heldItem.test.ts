import { describe, expect, it } from 'vitest';

import { heldItem, silkTouchTool } from '../harness';
import {
    bucketContents,
    bucketOf,
    cutsCleanly,
    enchantmentLevel,
    fortuneLevel,
    hasSilkTouch,
    heldName,
    isAxe,
    isEmptyBucket,
    isGlassBottle,
    isHoneycomb,
    isIgniter,
    isShears,
    isWaterBottle
} from './heldItem';

describe('heldName', () => {
    it('strips the namespace and reads an empty hand as an empty name', () => {
        expect(heldName(heldItem('minecraft:honeycomb'))).toBe('honeycomb');
        expect(heldName(heldItem('mypack:brass_axe'))).toBe('brass_axe');
        expect(heldName(undefined)).toBe('');
    });
});

describe('enchantmentLevel', () => {
    it('reads a level out of minecraft:enchantments', () => {
        const tool = heldItem('minecraft:diamond_pickaxe', {
            'minecraft:enchantments': { 'minecraft:fortune': 3, 'minecraft:unbreaking': 2 }
        });

        expect(enchantmentLevel(tool, 'minecraft:fortune')).toBe(3);
        expect(fortuneLevel(tool)).toBe(3);
        expect(hasSilkTouch(tool)).toBe(false);
        expect(hasSilkTouch(silkTouchTool())).toBe(true);
    });

    it('reads a missing, empty or malformed component as not enchanted', () => {
        expect(enchantmentLevel(undefined, 'minecraft:fortune')).toBe(0);
        expect(enchantmentLevel(heldItem('minecraft:stick'), 'minecraft:fortune')).toBe(0);
        expect(enchantmentLevel(heldItem('minecraft:stick', { 'minecraft:enchantments': [] }), 'x')).toBe(0);
        expect(enchantmentLevel(heldItem('minecraft:stick', { 'minecraft:enchantments': { x: 'three' } }), 'x')).toBe(
            0
        );
    });
});

describe('the item questions a family asks', () => {
    it('recognizes an axe of any material and nothing else', () => {
        expect(isAxe(heldItem('minecraft:netherite_axe'))).toBe(true);
        expect(isAxe(heldItem('minecraft:wooden_axe'))).toBe(true);
        expect(isAxe(heldItem('minecraft:wooden_pickaxe'))).toBe(false);
        expect(isAxe(undefined)).toBe(false);
    });

    it('recognizes shears, honeycomb and the two igniters', () => {
        expect(isShears(heldItem('minecraft:shears'))).toBe(true);
        expect(isHoneycomb(heldItem('minecraft:honeycomb'))).toBe(true);
        expect(isHoneycomb(heldItem('minecraft:honeycomb_block'))).toBe(false);
        expect(isIgniter(heldItem('minecraft:flint_and_steel'))).toBe(true);
        expect(isIgniter(heldItem('minecraft:fire_charge'))).toBe(true);
        expect(isIgniter(heldItem('minecraft:flint'))).toBe(false);
    });

    it('counts shears and silk touch as the two ways to take a block away whole', () => {
        expect(cutsCleanly(heldItem('minecraft:shears'))).toBe(true);
        expect(cutsCleanly(silkTouchTool())).toBe(true);
        expect(cutsCleanly(heldItem('minecraft:diamond_axe'))).toBe(false);
    });
});

describe('buckets and bottles', () => {
    it('names what each filled bucket pours and which bucket a liquid fills', () => {
        expect(bucketContents(heldItem('minecraft:water_bucket'))).toBe('water');
        expect(bucketContents(heldItem('minecraft:lava_bucket'))).toBe('lava');
        expect(bucketContents(heldItem('minecraft:powder_snow_bucket'))).toBe('powder_snow');
        expect(bucketContents(heldItem('minecraft:bucket'))).toBeUndefined();
        expect(bucketOf('lava')).toBe('minecraft:lava_bucket');
    });

    it('tells an empty bucket and an empty bottle from their filled forms', () => {
        expect(isEmptyBucket(heldItem('minecraft:bucket'))).toBe(true);
        expect(isEmptyBucket(heldItem('minecraft:water_bucket'))).toBe(false);
        expect(isGlassBottle(heldItem('minecraft:glass_bottle'))).toBe(true);
        expect(isGlassBottle(heldItem('minecraft:potion'))).toBe(false);
    });

    it('counts a potion as water only when its contents say so', () => {
        expect(isWaterBottle(heldItem('minecraft:potion'))).toBe(true);
        expect(
            isWaterBottle(heldItem('minecraft:potion', { 'minecraft:potion_contents': { potion: 'minecraft:water' } }))
        ).toBe(true);
        expect(
            isWaterBottle(
                heldItem('minecraft:potion', { 'minecraft:potion_contents': { potion: 'minecraft:strength' } })
            )
        ).toBe(false);
        expect(isWaterBottle(heldItem('minecraft:glass_bottle'))).toBe(false);
    });
});
