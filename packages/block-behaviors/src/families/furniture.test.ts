import { describe, expect, it } from 'vitest';

import { facingDirectionOf } from '../geometry';
import { bindFamily } from '../harness';
import { AIR } from '../identifiers';
import {
    bannerFamily,
    bedFamily,
    CAKE_BITES,
    cakeFamily,
    candleFamily,
    headFamily,
    lanternFamily,
    signFamily,
    torchFamily,
    torchSupport
} from './furniture';

const ground = { x: 0, y: 0, z: 0 };
const block = { x: 0, y: 1, z: 0 };

describe('signFamily', () => {
    it('starts with four empty lines and refuses an edit once it is sealed', () => {
        const harness = bindFamily(signFamily, 'minecraft:standing_sign');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(block, 'minecraft:standing_sign', { ground_sign_direction: 0 });

        harness.place(block);

        expect(harness.dimension.getBlockData(block)?.text).toEqual(['', '', '', '']);
        expect(harness.interact(block)).toBe(true);

        harness.dimension.setBlockData(block, { text: ['a', '', '', ''], sealed: true });

        expect(harness.interact(block)).toBeUndefined();
    });

    it('pops a wall sign whose backing block goes', () => {
        const harness = bindFamily(signFamily, 'minecraft:wall_sign');
        harness.dimension.set(block, 'minecraft:wall_sign', { facing_direction: facingDirectionOf('south') });

        harness.neighborChanged(block, 'north');

        expect(harness.dimension.identifierAt(block)).toBe(AIR);
    });
});

describe('bannerFamily and headFamily', () => {
    it('pop when the block under them goes', () => {
        const banner = bindFamily(bannerFamily, 'minecraft:standing_banner');
        banner.dimension.set(block, 'minecraft:standing_banner', { ground_sign_direction: 0 });

        banner.neighborChanged(block, 'down');

        expect(banner.dimension.identifierAt(block)).toBe(AIR);

        const head = bindFamily(headFamily, 'minecraft:skeleton_skull');
        head.dimension.set(block, 'minecraft:skeleton_skull', { facing_direction: facingDirectionOf('up') });

        head.neighborChanged(block, 'down');

        expect(head.dimension.identifierAt(block)).toBe(AIR);
    });
});

describe('bedFamily', () => {
    it('places the head half away from the player', () => {
        const harness = bindFamily(bedFamily, 'minecraft:bed');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(block, 'minecraft:bed', { head_piece_bit: false, occupied_bit: false, direction: 0 });

        harness.place(block, { placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: -4 } } });

        expect(harness.dimension.identifierAt({ x: 0, y: 1, z: 1 })).toBe('minecraft:bed');
        expect(harness.dimension.stateAt({ x: 0, y: 1, z: 1 }, 'head_piece_bit')).toBe(true);
    });

    it('is occupied when a player sleeps in the dark', () => {
        const harness = bindFamily(bedFamily, 'minecraft:bed');
        harness.dimension.set(block, 'minecraft:bed', { head_piece_bit: false, occupied_bit: false, direction: 0 });
        harness.dimension.setLight({ x: 0, y: 2, z: 0 }, 4);

        expect(harness.interact(block)).toBe(true);
        expect(harness.dimension.stateAt(block, 'occupied_bit')).toBe(true);
    });

    it('explodes in the nether', () => {
        const harness = bindFamily(bedFamily, 'minecraft:bed', { dimension: 'minecraft:nether' });
        harness.dimension.set(block, 'minecraft:bed', { head_piece_bit: false, occupied_bit: false, direction: 0 });

        expect(harness.interact(block)).toBe(true);
        expect(harness.dimension.identifierAt(block)).toBe(AIR);
        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:tnt']);
    });
});

describe('cakeFamily', () => {
    it('takes a bite per use and disappears after the last one', () => {
        const harness = bindFamily(cakeFamily, 'minecraft:cake');
        harness.dimension.set(block, 'minecraft:cake', { bite_counter: 0 });

        for (let bite = 0; bite < CAKE_BITES; bite += 1) harness.interact(block);

        expect(harness.dimension.stateAt(block, 'bite_counter')).toBe(CAKE_BITES);

        harness.interact(block);

        expect(harness.dimension.identifierAt(block)).toBe(AIR);
    });
});

describe('candleFamily', () => {
    it('stacks onto the candle it replaced and stops at four', () => {
        const harness = bindFamily(candleFamily, 'minecraft:candle');
        harness.dimension.set(block, 'minecraft:candle', { candles: 0, lit: false });

        harness.place(block, { previous: { identifier: 'minecraft:candle', states: { candles: 0, lit: true } } });

        expect(harness.dimension.stateAt(block, 'candles')).toBe(1);
        expect(harness.dimension.stateAt(block, 'lit')).toBe(true);

        harness.place(block, { previous: { identifier: 'minecraft:candle', states: { candles: 3, lit: false } } });

        expect(harness.dimension.stateAt(block, 'candles')).toBe(1);
    });

    it('lights and snuffs on use, and goes out in water', () => {
        const harness = bindFamily(candleFamily, 'minecraft:candle');
        harness.dimension.set(block, 'minecraft:candle', { candles: 0, lit: false });

        harness.interact(block);

        expect(harness.dimension.stateAt(block, 'lit')).toBe(true);

        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:water');
        harness.neighborChanged(block, 'up');

        expect(harness.dimension.stateAt(block, 'lit')).toBe(false);
    });

    it('drops one candle per candle in the block', () => {
        const harness = bindFamily(candleFamily, 'minecraft:candle');
        harness.dimension.set(block, 'minecraft:candle', { candles: 2, lit: false });

        harness.breakBlock(block);

        expect(harness.dimension.drops.map((entry) => entry.drop.count)).toEqual([3]);
    });
});

describe('torchFamily', () => {
    it('names the face its support is on', () => {
        expect(torchSupport('top')).toBe('down');
        expect(torchSupport('west')).toBe('east');
        expect(torchSupport('unknown')).toBe('down');
    });

    it('pops when the block it stands on goes', () => {
        const harness = bindFamily(torchFamily, 'minecraft:torch');
        harness.dimension.set(block, 'minecraft:torch', { torch_facing_direction: 'top' });

        harness.neighborChanged(block, 'down');

        expect(harness.dimension.identifierAt(block)).toBe(AIR);
    });

    it('stays on a wall it is stuck to', () => {
        const harness = bindFamily(torchFamily, 'minecraft:torch');
        harness.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:stone');
        harness.dimension.set(block, 'minecraft:torch', { torch_facing_direction: 'west' });

        harness.neighborChanged(block, 'down');

        expect(harness.dimension.identifierAt(block)).toBe('minecraft:torch');
    });
});

describe('lanternFamily', () => {
    it('checks above when it hangs and below when it stands', () => {
        const hanging = bindFamily(lanternFamily, 'minecraft:lantern');
        hanging.dimension.set(block, 'minecraft:lantern', { hanging: true });
        hanging.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:stone');

        hanging.neighborChanged(block, 'down');

        expect(hanging.dimension.identifierAt(block)).toBe('minecraft:lantern');

        const standing = bindFamily(lanternFamily, 'minecraft:lantern');
        standing.dimension.set(block, 'minecraft:lantern', { hanging: false });

        standing.neighborChanged(block, 'down');

        expect(standing.dimension.identifierAt(block)).toBe(AIR);
    });

    it('oxidizes a copper lantern', () => {
        const harness = bindFamily(lanternFamily, 'minecraft:copper_lantern');
        harness.dimension.set(block, 'minecraft:copper_lantern', { hanging: false });
        harness.dimension.queueRandom(0);

        harness.randomTick(block);

        expect(harness.dimension.identifierAt(block)).toBe('minecraft:exposed_copper_lantern');
    });
});
