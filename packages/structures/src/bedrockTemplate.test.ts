import { describe, expect, it } from 'vitest';

import { byte, compound, encodeLittleEndian, int, intTriple, list, str } from '../test/nbtFixtures';
import { mcStructureIndex, mcStructurePosition, readMcStructure } from './bedrockTemplate';
import { NO_BLOCK, StructureFormatError } from './types';

/**
 * A 2 by 2 by 2 template: tuff at the bottom corner, a waterlogged sulfur
 * spike above it on both layers, and one entity. The index order is the one
 * the real sulfur spring files pin, x slowest and z fastest.
 */
const sulfurSpringLike = () =>
    compound({
        format_version: int(1),
        size: intTriple(2, 2, 2),
        structure: compound({
            block_indices: list(
                list(int(0), int(-1), int(-1), int(-1), int(1), int(-1), int(-1), int(-1)),
                list(int(-1), int(-1), int(-1), int(-1), int(2), int(-1), int(-1), int(-1))
            ),
            entities: list(compound({ identifier: str('minecraft:hoglin'), Pos: list(int(21), int(-59), int(10)) })),
            palette: compound({
                default: compound({
                    block_palette: list(
                        compound({ name: str('minecraft:tuff'), states: compound({}), version: int(18168865) }),
                        compound({
                            name: str('minecraft:sulfur_spike'),
                            states: compound({ dripstone_thickness: str('tip'), hanging: byte(0) }),
                            version: int(18168865)
                        }),
                        compound({ name: str('minecraft:water'), states: compound({ liquid_depth: int(0) }) })
                    ),
                    block_position_data: compound({
                        4: compound({
                            block_entity_data: compound({ id: str('PotentSulfurBlock'), isMovable: byte(1) }),
                            tick_queue_data: list(compound({ tick_delay: int(75) }), compound({ tick_delay: int(273) }))
                        })
                    })
                })
            })
        }),
        structure_world_origin: intTriple(19, -60, 9)
    });

describe('readMcStructure', () => {
    it('reads the palette, both block layers and the saved world origin', () => {
        const template = readMcStructure(encodeLittleEndian(sulfurSpringLike()));

        expect(template.size).toEqual([2, 2, 2]);
        expect(template.worldOrigin).toEqual([19, -60, 9]);
        expect(template.palette).toEqual([
            { name: 'minecraft:tuff', states: {} },
            { name: 'minecraft:sulfur_spike', states: { dripstone_thickness: 'tip', hanging: 0 } },
            { name: 'minecraft:water', states: { liquid_depth: 0 } }
        ]);
        expect(template.paletteVersions).toEqual([18168865, 18168865, 0]);
    });

    it('skips positions where both layers hold no block', () => {
        const template = readMcStructure(encodeLittleEndian(sulfurSpringLike()));

        expect(template.blocks).toHaveLength(2);
        expect(template.blocks[0]).toMatchObject({ pos: [0, 0, 0], state: 0, extraState: NO_BLOCK });
    });

    it('puts the second layer entry on the same block as the first', () => {
        const waterlogged = readMcStructure(encodeLittleEndian(sulfurSpringLike())).blocks[1];

        expect(waterlogged?.pos).toEqual([1, 0, 0]);
        expect(waterlogged?.state).toBe(1);
        expect(waterlogged?.extraState).toBe(2);
    });

    it('attaches block entity data and the tick queue by block index', () => {
        const waterlogged = readMcStructure(encodeLittleEndian(sulfurSpringLike())).blocks[1];

        expect(waterlogged?.nbt?.getString('id', '')).toBe('PotentSulfurBlock');
        expect(waterlogged?.tickDelays).toEqual([75, 273]);
    });

    it('makes entity positions relative to the saved origin', () => {
        const [entity] = readMcStructure(encodeLittleEndian(sulfurSpringLike())).entities;

        expect(entity?.pos).toEqual([2, 1, 1]);
        expect(entity?.nbt?.getString('identifier', '')).toBe('minecraft:hoglin');
    });

    it('reports a block index list that does not match the size', () => {
        const bytes = encodeLittleEndian(
            compound({
                format_version: int(1),
                size: intTriple(2, 2, 2),
                structure: compound({
                    block_indices: list(list(int(0))),
                    entities: list(),
                    palette: compound({
                        default: compound({
                            block_palette: list(compound({ name: str('minecraft:tuff'), states: compound({}) }))
                        })
                    })
                })
            })
        );

        expect(() => readMcStructure(bytes)).toThrow(/1 entries for a 2x2x2 template/);
    });

    it('reports an unsupported format version and bytes that are not NBT', () => {
        const bytes = encodeLittleEndian(compound({ format_version: int(2), size: intTriple(1, 1, 1) }));

        expect(() => readMcStructure(bytes)).toThrow(/unsupported format_version 2/);
        expect(() => readMcStructure(Uint8Array.from([9, 9, 9]))).toThrow(StructureFormatError);
    });
});

describe('mcStructureIndex', () => {
    it('round-trips every position of a template', () => {
        const size = [3, 4, 5] as const;

        for (let x = 0; x < size[0]; x++) {
            for (let y = 0; y < size[1]; y++) {
                for (let z = 0; z < size[2]; z++) {
                    expect(mcStructurePosition(size, mcStructureIndex(size, x, y, z))).toEqual([x, y, z]);
                }
            }
        }
    });

    it('uses the order the real sulfur spring block entity pins', () => {
        // sulfur_spring_small_1 is 8 by 11 by 9 and records a block entity at
        // index 355 for world position (22, -54, 13) against origin (19, -60, 9).
        expect(mcStructureIndex([8, 11, 9], 3, 6, 4)).toBe(355);
    });
});
