import type { HookBlock } from '@jsprismarine/blocks';
import { beforeAll, describe, expect, it } from 'vitest';

import { stub } from '../../testing/stub.test.helper';
import type { ServerContent } from '../ServerContent';
import { buildServerContent } from '../ServerContent';
import type { ContentTags } from '../tags';
import { isJavaLiquidContainer, liquidReactionOf, WASHED_AWAY_BY_FLUIDS } from './fluidReplacement';

const block = (identifier: string, states: HookBlock['states'] = {}): HookBlock => ({
    identifier,
    position: { x: 0, y: 64, z: 0 },
    dimension: 'minecraft:overworld',
    states
});

/** Content whose only tag is `#minecraft:washed_away_by_fluids`, holding the given Java blocks. */
const contentWashing = (javaBlocks: readonly string[] | undefined): ServerContent =>
    stub<ServerContent>({
        tags: stub<ContentTags>({
            has: (registry, tag) => javaBlocks !== undefined && registry === 'block' && tag === WASHED_AWAY_BY_FLUIDS,
            includes: (registry, tag, identifier) =>
                javaBlocks !== undefined &&
                registry === 'block' &&
                tag === WASHED_AWAY_BY_FLUIDS &&
                javaBlocks.includes(identifier)
        })
    });

describe("Java's LiquidBlockContainer, read from the mapped Java state", () => {
    it('counts a block with a waterlogged property and one that always holds water', () => {
        expect(isJavaLiquidContainer(block('minecraft:big_dripleaf'))).toBe(true);
        expect(isJavaLiquidContainer(block('minecraft:oak_fence'))).toBe(true);
        expect(isJavaLiquidContainer(block('minecraft:kelp'))).toBe(true);
        expect(isJavaLiquidContainer(block('minecraft:torch'))).toBe(false);
        expect(isJavaLiquidContainer(block('minecraft:moss_carpet'))).toBe(false);
    });
});

describe('what a flowing fluid does to a block', () => {
    it("washes away what Java's tag lists and leaves what is not in it", () => {
        const content = contentWashing(['minecraft:torch']);

        expect(liquidReactionOf(content, block('minecraft:torch'), 'java')).toBe('popped');
        expect(liquidReactionOf(content, block('minecraft:wooden_door'), 'java')).toBe('blocking');
    });

    it('keeps out of a waterloggable block even where the tag lists it, as canPlaceLiquid refuses it', () => {
        const content = contentWashing(['minecraft:big_dripleaf']);

        expect(liquidReactionOf(content, block('minecraft:big_dripleaf'), 'java')).toBe('blocking');
    });

    it('shares a cell with air and the fluids under either rule', () => {
        const content = contentWashing([]);

        for (const rule of ['java', 'bedrock'] as const) {
            expect(liquidReactionOf(content, block('minecraft:air'), rule)).toBe('none');
            expect(liquidReactionOf(content, block('minecraft:flowing_water'), rule)).toBe('none');
        }
    });

    it("falls back to Bedrock's reaction where the content declares no tag to read", () => {
        const content = contentWashing(undefined);

        expect(liquidReactionOf(content, block('minecraft:big_dripleaf'), 'java')).toBe('none');
        expect(liquidReactionOf(content, block('minecraft:reeds'), 'java')).toBe('popped');
    });
});

/**
 * Over the vanilla tags, which need Mojang's fetched data. Off unless `JSP_CONTENT_VANILLA` is set;
 * see `packStack.test.ts`.
 */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)(
    'what a flowing fluid does over the vanilla stack',
    { tags: ['real-data'] },
    () => {
        let content: ServerContent;
        beforeAll(() => {
            content = buildServerContent();
        }, 180_000);

        const cases = [
            // Bedrock identifier, Java 26.3, Bedrock's liquidReactionOnTouch
            ['minecraft:white_carpet', 'popped', 'popped'],
            ['minecraft:moss_carpet', 'popped', 'popped'],
            ['minecraft:big_dripleaf', 'blocking', 'none'],
            ['minecraft:azalea', 'popped', 'popped'],
            ['minecraft:short_grass', 'popped', 'popped'],
            ['minecraft:wooden_door', 'blocking', 'blocking'],
            ['minecraft:reeds', 'blocking', 'popped'],
            ['minecraft:torch', 'popped', 'popped']
        ] as const;

        it.each(cases)('answers for %s as each edition does', (identifier, java, bedrock) => {
            expect(liquidReactionOf(content, block(identifier), 'java')).toBe(java);
            expect(liquidReactionOf(content, block(identifier), 'bedrock')).toBe(bedrock);
        });
    }
);
