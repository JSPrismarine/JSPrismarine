import { describe, expect, it } from 'vitest';

import Codec2193 from '../network/codec/Codec2193';
import Codec2225 from '../network/codec/Codec2225';
import { itemData2193 } from '../network/codec/itemData';
import { buildNetworkContentPayloads } from '../network/contentPayloads';
import { buildServerContent } from './ServerContent';
import { fixtureContentOptions } from './testing';
import { contentMissingAt, withheldNames } from './withheldContent';

describe('content/withheldContent', () => {
    it('names what 1.26.60 added as missing at 1.26.51', () => {
        const missing = contentMissingAt(Codec2193);

        expect([...missing.blocks]).toEqual(['minecraft:disc_press', 'minecraft:ice_crystal', 'minecraft:icicle']);
        expect([...missing.items]).toEqual([
            'minecraft:disc_press',
            'minecraft:frostbite_spawn_egg',
            'minecraft:ice_crystal',
            'minecraft:icicle'
        ]);
        expect([...missing.entities]).toEqual(['minecraft:ice_ball']);
        expect(withheldNames(missing)).toContain('minecraft:ice_ball');
    });

    it('names nothing at the release the world holds', () => {
        const missing = contentMissingAt(Codec2225);

        expect([...missing.blocks]).toEqual([]);
        expect([...missing.entities]).toEqual([]);
    });
});

describe('a content build that withholds vanilla content', () => {
    it('leaves the withheld blocks, items and entity types out of every registry', () => {
        const full = buildServerContent(fixtureContentOptions());
        const item = [...full.items.types.keys()][0]!;

        const content = buildServerContent(
            fixtureContentOptions({
                withheld: {
                    blocks: new Set(['minecraft:redstone_lamp']),
                    items: new Set([item]),
                    entities: new Set(['minecraft:cow'])
                }
            })
        );

        expect(full.blocks.types.has('minecraft:redstone_lamp')).toBe(true);
        expect(content.blocks.types.has('minecraft:redstone_lamp')).toBe(false);
        expect(content.blocks.palette.entry('minecraft:redstone_lamp')).toBeUndefined();
        expect(content.blocks.types.has('minecraft:stone')).toBe(true);
        expect(content.items.types.has(item)).toBe(false);
        expect(full.entities.registry.has('minecraft:cow')).toBe(true);
        expect(content.entities.registry.has('minecraft:cow')).toBe(false);
    });
});

/** Gated like the other vanilla stack tests: it needs the caches `fetch:sources` fills. */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)(
    'the vanilla stack on 1.26.51 content',
    { tags: ['real-data'] },
    () => {
        it(
            'builds without the 1.26.60 content and still sends a 1.26.51 client its payloads',
            { timeout: 120_000 },
            () => {
                const withheld = contentMissingAt(Codec2193);
                const content = buildServerContent({ withheld });

                expect(content.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
                for (const name of withheld.blocks) expect(content.blocks.types.has(name), name).toBe(false);
                for (const name of withheld.entities) expect(content.entities.registry.has(name), name).toBe(false);

                const payloads = buildNetworkContentPayloads(content, { itemData: itemData2193 });
                const sent = new Set(payloads.items.map(({ name }) => name));
                for (const name of withheld.items) expect(sent.has(name), name).toBe(false);
            }
        );
    }
);
