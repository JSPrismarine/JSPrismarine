import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { describe, expect, it } from 'vitest';

import { translateJavaTemplate } from './translate';
import type { JavaStructureTemplate } from './types';
import { NO_BLOCK } from './types';

const template = (overrides: Partial<JavaStructureTemplate> = {}): JavaStructureTemplate => ({
    size: [1, 1, 3],
    palette: [{ name: 'minecraft:stone', properties: {} }],
    blocks: [{ pos: [0, 0, 0], state: 0 }],
    entities: [],
    paletteKeySpelling: 'id',
    ...overrides
});

describe('translateJavaTemplate', () => {
    it('maps the palette into Bedrock states and keeps the block positions', () => {
        const { template: bedrock, losses, mappedBlocks } = translateJavaTemplate(template());

        expect(losses).toEqual([]);
        expect(mappedBlocks).toBe(1);
        expect(bedrock.palette).toEqual([{ name: 'minecraft:stone', states: {} }]);
        expect(bedrock.blocks).toEqual([{ pos: [0, 0, 0], state: 0, extraState: NO_BLOCK }]);
    });

    it('produces the same Bedrock state the mapping does for a directional block', () => {
        const java = {
            name: 'minecraft:oak_stairs',
            properties: { facing: 'east', half: 'bottom', shape: 'straight' }
        };
        const { template: bedrock } = translateJavaTemplate(
            template({ palette: [java], blocks: [{ pos: [0, 0, 0], state: 0 }] })
        );

        const expected = javaBlockStateToBedrock(java.name, java.properties);
        expect(expected.kind).toBe('mapped');
        expect(bedrock.palette[0]).toEqual(expected.kind === 'unknown' ? undefined : expected.bedrock);
    });

    it('collapses Java states that share one Bedrock state into a single palette entry', () => {
        const door = { facing: 'north', half: 'lower', hinge: 'left', open: 'false' };
        const { template: bedrock } = translateJavaTemplate(
            template({
                palette: [
                    { name: 'minecraft:oak_door', properties: { ...door, powered: 'false' } },
                    { name: 'minecraft:oak_door', properties: { ...door, powered: 'true' } }
                ],
                blocks: [
                    { pos: [0, 0, 0], state: 0 },
                    { pos: [0, 0, 1], state: 1 }
                ]
            })
        );

        // No Bedrock door state records `powered`, so both Java states are
        // one Bedrock state and the palette holds it once.
        expect(bedrock.palette).toHaveLength(1);
        expect(bedrock.blocks.map((block) => block.state)).toEqual([0, 0]);
    });

    it('moves waterlogging onto the second block layer', () => {
        const { template: bedrock } = translateJavaTemplate(
            template({
                palette: [
                    { name: 'minecraft:oak_fence', properties: { waterlogged: 'true' } },
                    { name: 'minecraft:oak_fence', properties: { waterlogged: 'false' } }
                ],
                blocks: [
                    { pos: [0, 0, 0], state: 0 },
                    { pos: [0, 0, 1], state: 1 }
                ]
            })
        );

        const [wet, dry] = bedrock.blocks;
        expect(dry?.extraState).toBe(NO_BLOCK);
        expect(wet?.extraState).not.toBe(NO_BLOCK);
        expect(bedrock.palette[wet?.extraState ?? 0]?.name).toBe('minecraft:water');
    });

    it('leaves the second layer empty when waterlogging is turned off', () => {
        const { template: bedrock } = translateJavaTemplate(
            template({ palette: [{ name: 'minecraft:oak_fence', properties: { waterlogged: 'true' } }] }),
            { applyWaterlogging: false }
        );

        expect(bedrock.blocks[0]?.extraState).toBe(NO_BLOCK);
    });

    it('reports an unknown identifier with its block count instead of dropping it', () => {
        const {
            template: bedrock,
            losses,
            mappedBlocks,
            lostBlocks
        } = translateJavaTemplate(
            template({
                palette: [
                    { name: 'minecraft:stone', properties: {} },
                    { name: 'minecraft:stonebrick', properties: { variant: 'stonebrick' } }
                ],
                blocks: [
                    { pos: [0, 0, 0], state: 0 },
                    { pos: [0, 0, 1], state: 1 },
                    { pos: [0, 0, 2], state: 1 }
                ]
            })
        );

        expect(losses).toEqual([
            {
                paletteIndex: 1,
                javaState: { name: 'minecraft:stonebrick', properties: { variant: 'stonebrick' } },
                kind: 'unknown',
                blockCount: 2
            }
        ]);
        expect(mappedBlocks).toBe(1);
        expect(lostBlocks).toBe(2);
        expect(bedrock.blocks).toHaveLength(3);
        expect(bedrock.palette[bedrock.blocks[1]?.state ?? -1]).toEqual({ name: 'minecraft:unknown', states: {} });
    });

    it('reports the mapping reviewed loss list by row', () => {
        const { losses } = translateJavaTemplate(
            template({ palette: [{ name: 'minecraft:test_block', properties: { mode: 'start' } }] })
        );

        expect(losses).toHaveLength(1);
        expect(losses[0]?.kind).toBe('reviewed');
        expect(losses[0]?.loss?.javaId).toBe('minecraft:test_block');
    });

    it('passes a non-minecraft identifier through and says so', () => {
        const { losses, template: bedrock } = translateJavaTemplate(
            template({ palette: [{ name: 'example:custom_block', properties: { tilt: 'none' } }] })
        );

        expect(losses[0]?.kind).toBe('passthrough');
        expect(bedrock.palette[0]).toEqual({ name: 'example:custom_block', states: { tilt: 'none' } });
    });

    it('translates the requested variant of a randomized palette', () => {
        const { template: bedrock } = translateJavaTemplate(
            template({
                palette: [{ name: 'minecraft:mud_bricks', properties: {} }],
                paletteVariants: [
                    [{ name: 'minecraft:mud_bricks', properties: {} }],
                    [{ name: 'minecraft:packed_mud', properties: {} }]
                ]
            }),
            { paletteVariant: 1 }
        );

        expect(bedrock.palette[0]?.name).toBe('minecraft:packed_mud');
    });
});
