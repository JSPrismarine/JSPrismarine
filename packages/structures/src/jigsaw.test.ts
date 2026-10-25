import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type { JigsawSources, TemplatePool } from './jigsaw';
import {
    POOL_ELEMENT_TYPES,
    assembleJigsaw,
    boxesOverlap,
    canAttach,
    jigsawBlocksOf,
    oppositeDirection,
    parseOrientation,
    parsePoolAliases,
    parseTemplatePool,
    rotateDirection
} from './jigsaw';
import { createLegacyRandom } from './random';
import type { BedrockBlockState, BedrockStructureTemplate, BedrockTemplateBlock } from './types';
import { NO_BLOCK, StructureFormatError } from './types';

const bedrockOf = (javaId: string, properties: Record<string, string> = {}): BedrockBlockState => {
    const result = javaBlockStateToBedrock(javaId, properties);
    if (result.kind === 'unknown') throw new Error(`${javaId} is not a Java 26.3 block state`);
    return result.bedrock;
};

const jigsawNbt = (fields: Record<string, string>): NBTTagCompound => {
    const nbt = new NBTTagCompound();
    for (const [key, value] of Object.entries(fields)) nbt.addValue(key, new Types.StringVal(value));
    return nbt;
};

/**
 * A room: a 3 by 1 by 3 block of stone with a jigsaw on one or more of its
 * side faces. The jigsaw at `north` sits on the north edge facing north, and
 * so on, which is how a vanilla village street piece is built.
 */
const room = (
    jigsaws: { facing: 'north' | 'south' | 'east' | 'west'; name: string; target: string; pool: string }[]
): BedrockStructureTemplate => {
    const edge: Record<string, readonly [number, number, number]> = {
        north: [1, 0, 0],
        south: [1, 0, 2],
        west: [0, 0, 1],
        east: [2, 0, 1]
    };

    const palette: BedrockBlockState[] = [bedrockOf('minecraft:stone')];
    const blocks: BedrockTemplateBlock[] = [];
    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) blocks.push({ pos: [x, 0, z] as const, state: 0, extraState: NO_BLOCK });
    }

    for (const jigsaw of jigsaws) {
        palette.push(bedrockOf('minecraft:jigsaw', { orientation: `${jigsaw.facing}_up` }));
        const index = palette.length - 1;
        const pos = edge[jigsaw.facing] ?? ([1, 0, 0] as const);
        const existing = blocks.findIndex((block) => block.pos[0] === pos[0] && block.pos[2] === pos[2]);
        blocks[existing] = {
            pos,
            state: index,
            extraState: NO_BLOCK,
            nbt: jigsawNbt({
                name: jigsaw.name,
                target: jigsaw.target,
                pool: jigsaw.pool,
                joint: 'aligned',
                final_state: 'minecraft:air'
            })
        };
    }

    return { size: [3, 1, 3], palette, blocks, entities: [] };
};

const TEMPLATES: Record<string, BedrockStructureTemplate> = {
    'test:center': room([
        { facing: 'north', name: 'street', target: 'street', pool: 'test:streets' },
        { facing: 'south', name: 'street', target: 'street', pool: 'test:streets' },
        { facing: 'east', name: 'street', target: 'street', pool: 'test:streets' },
        { facing: 'west', name: 'street', target: 'street', pool: 'test:streets' }
    ]),
    'test:street': room([
        { facing: 'north', name: 'street', target: 'house', pool: 'test:houses' },
        { facing: 'south', name: 'street', target: 'house', pool: 'test:houses' }
    ]),
    'test:house_a': room([{ facing: 'north', name: 'house', target: 'empty', pool: 'test:empty' }]),
    'test:house_b': room([{ facing: 'south', name: 'house', target: 'empty', pool: 'test:empty' }])
};

const POOLS: Record<string, TemplatePool> = {
    'test:centers': parseTemplatePool({
        elements: [
            {
                element: {
                    element_type: 'minecraft:single_pool_element',
                    location: 'test:center',
                    projection: 'rigid'
                },
                weight: 1
            }
        ],
        fallback: 'test:empty'
    }),
    'test:streets': parseTemplatePool({
        elements: [
            {
                element: {
                    element_type: 'minecraft:single_pool_element',
                    location: 'test:street',
                    projection: 'rigid'
                },
                weight: 1
            }
        ],
        fallback: 'test:empty'
    }),
    'test:houses': parseTemplatePool({
        elements: [
            {
                element: {
                    element_type: 'minecraft:single_pool_element',
                    location: 'test:house_a',
                    projection: 'rigid'
                },
                weight: 3
            },
            {
                element: {
                    element_type: 'minecraft:single_pool_element',
                    location: 'test:house_b',
                    projection: 'rigid'
                },
                weight: 1
            }
        ],
        fallback: 'test:empty'
    }),
    'test:empty': parseTemplatePool({
        elements: [{ element: { element_type: 'minecraft:empty_pool_element', projection: 'rigid' }, weight: 1 }],
        fallback: 'test:empty'
    })
};

const sources = (seed: number, overrides: Partial<JigsawSources> = {}): JigsawSources => ({
    pool: (identifier) => POOLS[identifier],
    template: (location) => TEMPLATES[location],
    random: createLegacyRandom(seed),
    ...overrides
});

const layout = (assembly: {
    pieces: readonly { location: string; position: readonly [number, number, number]; rotation: string }[];
}) => assembly.pieces.map((piece) => `${piece.location}@${piece.position.join(',')}/${piece.rotation}`);

describe('rotateDirection and parseOrientation', () => {
    it('turns the horizontal facings and leaves up and down', () => {
        expect(rotateDirection('north', 'clockwise_90')).toBe('east');
        expect(rotateDirection('west', 'clockwise_90')).toBe('north');
        expect(rotateDirection('north', 'clockwise_180')).toBe('south');
        expect(rotateDirection('up', 'clockwise_90')).toBe('up');
    });

    it('splits a FrontAndTop orientation into its two facings', () => {
        expect(parseOrientation('down_east')).toEqual({ front: 'down', top: 'east' });
        expect(parseOrientation('west_up')).toEqual({ front: 'west', top: 'up' });
        expect(parseOrientation('sideways')).toBeUndefined();
    });

    it('names the opposite facing', () => {
        expect(oppositeDirection('north')).toBe('south');
        expect(oppositeDirection('up')).toBe('down');
    });
});

describe('jigsawBlocksOf', () => {
    it('reads the connection a jigsaw block entity declares', () => {
        const [jigsaw] = jigsawBlocksOf(TEMPLATES['test:street'] as BedrockStructureTemplate);

        expect(jigsaw).toMatchObject({
            front: 'north',
            top: 'up',
            name: 'street',
            target: 'house',
            pool: 'test:houses',
            joint: 'aligned'
        });
    });

    it('accepts the Bedrock target_pool spelling', () => {
        const template: BedrockStructureTemplate = {
            size: [1, 1, 1],
            palette: [bedrockOf('minecraft:jigsaw', { orientation: 'north_up' })],
            blocks: [
                {
                    pos: [0, 0, 0],
                    state: 0,
                    extraState: NO_BLOCK,
                    nbt: jigsawNbt({ name: 'a', target: 'b', target_pool: 'test:streets', joint: 'rollable' })
                }
            ],
            entities: []
        };

        expect(jigsawBlocksOf(template)[0]?.pool).toBe('test:streets');
    });

    it('defaults the joint type from the facing, as Java does', () => {
        const upward: BedrockStructureTemplate = {
            size: [1, 1, 1],
            palette: [bedrockOf('minecraft:jigsaw', { orientation: 'up_north' })],
            blocks: [{ pos: [0, 0, 0], state: 0, extraState: NO_BLOCK, nbt: jigsawNbt({ name: 'a' }) }],
            entities: []
        };
        const sideways: BedrockStructureTemplate = {
            size: [1, 1, 1],
            palette: [bedrockOf('minecraft:jigsaw', { orientation: 'north_up' })],
            blocks: [{ pos: [0, 0, 0], state: 0, extraState: NO_BLOCK, nbt: jigsawNbt({ name: 'a' }) }],
            entities: []
        };

        expect(jigsawBlocksOf(upward)[0]?.joint).toBe('rollable');
        expect(jigsawBlocksOf(sideways)[0]?.joint).toBe('aligned');
    });
});

describe('canAttach', () => {
    const base = {
        pos: [0, 0, 0] as const,
        name: 'street',
        target: 'house',
        pool: 'test:houses',
        finalState: 'minecraft:air',
        selectionPriority: 0,
        placementPriority: 0
    };

    it('needs the two jigsaws to face each other', () => {
        const parent = { ...base, front: 'north' as const, top: 'up' as const, joint: 'aligned' as const };
        const facing = {
            ...base,
            name: 'house',
            target: 'empty',
            front: 'south' as const,
            top: 'up' as const,
            joint: 'aligned' as const
        };
        const away = { ...facing, front: 'north' as const };

        expect(canAttach(parent, facing)).toBe(true);
        expect(canAttach(parent, away)).toBe(false);
    });

    it('needs the target name to be the child name', () => {
        const parent = { ...base, front: 'north' as const, top: 'up' as const, joint: 'aligned' as const };
        const wrongName = {
            ...base,
            name: 'tower',
            front: 'south' as const,
            top: 'up' as const,
            joint: 'aligned' as const
        };

        expect(canAttach(parent, wrongName)).toBe(false);
    });

    it('needs a matching top facing only for an aligned joint', () => {
        const aligned = { ...base, front: 'up' as const, top: 'north' as const, joint: 'aligned' as const };
        const rollable = { ...aligned, joint: 'rollable' as const };
        const child = {
            ...base,
            name: 'house',
            front: 'down' as const,
            top: 'east' as const,
            joint: 'aligned' as const
        };

        expect(canAttach(aligned, child)).toBe(false);
        expect(canAttach(rollable, child)).toBe(true);
    });
});

describe('boxesOverlap', () => {
    it('reports blocks shared, not edges touched', () => {
        const left = { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 0, maxZ: 2 };

        expect(boxesOverlap(left, { minX: 3, minY: 0, minZ: 0, maxX: 5, maxY: 0, maxZ: 2 })).toBe(false);
        expect(boxesOverlap(left, { minX: 2, minY: 0, minZ: 0, maxX: 4, maxY: 0, maxZ: 2 })).toBe(true);
    });
});

describe('parseTemplatePool', () => {
    it('names the five element types Java registers', () => {
        expect(POOL_ELEMENT_TYPES).toHaveLength(5);
    });

    it('reads a list element and a feature element', () => {
        const pool = parseTemplatePool({
            elements: [
                {
                    element: {
                        element_type: 'minecraft:list_pool_element',
                        projection: 'terrain_matching',
                        elements: [
                            {
                                element_type: 'minecraft:feature_pool_element',
                                feature: 'minecraft:oak',
                                projection: 'rigid'
                            }
                        ]
                    },
                    weight: 2
                }
            ],
            fallback: 'minecraft:empty'
        });

        expect(pool.elements[0]?.weight).toBe(2);
        expect(pool.elements[0]?.element.projection).toBe('terrain_matching');
        expect(pool.elements[0]?.element.elements?.[0]?.feature).toBe('minecraft:oak');
    });

    it('rejects a pool with no elements and an unknown element type', () => {
        expect(() => parseTemplatePool({})).toThrow(StructureFormatError);
        expect(() =>
            parseTemplatePool({ elements: [{ element: { element_type: 'minecraft:spiral_pool_element' } }] })
        ).toThrow(/unknown element_type/);
    });
});

describe('parsePoolAliases', () => {
    it('maps an alias pool to the pool it stands for', () => {
        expect(parsePoolAliases([{ type: 'minecraft:direct', alias: 'test:a', target: 'test:b' }])).toEqual(
            new Map([['test:a', 'test:b']])
        );
    });

    it('draws one target of a random binding', () => {
        const binding = [
            {
                type: 'minecraft:random',
                alias: 'test:a',
                targets: [
                    { data: 'test:b', weight: 1 },
                    { data: 'test:c', weight: 1 }
                ]
            }
        ];
        const drawn = [1, 7919, 104_729, 1_299_709].map((seed) =>
            parsePoolAliases(binding, createLegacyRandom(seed)).get('test:a')
        );

        for (const target of drawn) expect(['test:b', 'test:c']).toContain(target);
        expect(new Set(drawn).size).toBeGreaterThan(1);
    });

    it('draws a whole group of bindings together', () => {
        const binding = [
            {
                type: 'minecraft:random_group',
                groups: [
                    {
                        weight: 1,
                        data: [
                            { type: 'minecraft:direct', alias: 'test:a', target: 'test:b' },
                            { type: 'minecraft:direct', alias: 'test:c', target: 'test:d' }
                        ]
                    }
                ]
            }
        ];

        expect(parsePoolAliases(binding, createLegacyRandom(1))).toEqual(
            new Map([
                ['test:a', 'test:b'],
                ['test:c', 'test:d']
            ])
        );
    });

    it('reads only the direct bindings when there is no random source', () => {
        const binding = [
            { type: 'minecraft:direct', alias: 'test:a', target: 'test:b' },
            { type: 'minecraft:random', alias: 'test:c', targets: [{ data: 'test:d', weight: 1 }] }
        ];

        expect(parsePoolAliases(binding)).toEqual(new Map([['test:a', 'test:b']]));
    });
});

describe('assembleJigsaw', () => {
    const config = { startPool: 'test:centers', maxDepth: 2, startPosition: [0, 64, 0] as const };

    it('produces the same layout for the same seed', () => {
        expect(layout(assembleJigsaw(config, sources(2024)))).toEqual(layout(assembleJigsaw(config, sources(2024))));
    });

    it('produces a different layout for a different seed', () => {
        expect(layout(assembleJigsaw(config, sources(2024)))).not.toEqual(layout(assembleJigsaw(config, sources(7))));
    });

    it('places the pieces this seed places, which is a fixed layout', () => {
        // A regression lock on the draw order. The layout itself is checked
        // by the tests around this one: four streets leave the center, each
        // reaches one house, and nothing overlaps.
        expect(layout(assembleJigsaw(config, sources(2024)))).toEqual([
            'test:center@0,63,0/clockwise_180',
            'test:street@-3,63,0/clockwise_90',
            'test:street@0,63,-3/clockwise_180',
            'test:street@0,63,3/clockwise_180',
            'test:street@3,63,0/clockwise_90',
            'test:house_a@-6,63,0/clockwise_90',
            'test:house_b@0,63,-6/none',
            'test:house_a@0,63,6/none',
            'test:house_a@6,63,0/counterclockwise_90'
        ]);
    });

    it('grows outward from the center, one street per side', () => {
        const { pieces } = assembleJigsaw(config, sources(2024));
        const streets = pieces.filter((piece) => piece.location === 'test:street');

        expect(pieces[0]?.location).toBe('test:center');
        expect(streets).toHaveLength(4);
        expect(new Set(streets.map((piece) => `${piece.position[0]},${piece.position[2]}`))).toEqual(
            new Set(['-3,0', '3,0', '0,-3', '0,3'])
        );
        for (const piece of pieces.slice(1)) expect(piece.depth).toBeGreaterThan(0);
    });

    it('never overlaps two pieces', () => {
        for (const seed of [1, 2, 3, 2024, 99999]) {
            const { pieces } = assembleJigsaw(config, sources(seed));
            for (const [index, piece] of pieces.entries()) {
                for (const other of pieces.slice(index + 1)) {
                    expect(boxesOverlap(piece.boundingBox, other.boundingBox)).toBe(false);
                }
            }
        }
    });

    it('stops at the depth limit', () => {
        const deepest = (maxDepth: number) =>
            Math.max(...assembleJigsaw({ ...config, maxDepth }, sources(2024)).pieces.map((piece) => piece.depth));

        expect(deepest(0)).toBe(0);
        expect(deepest(1)).toBe(1);
        expect(deepest(2)).toBe(2);
    });

    it('keeps every piece inside the distance limit', () => {
        const { pieces } = assembleJigsaw({ ...config, maxDistanceFromCenter: 4 }, sources(2024));

        for (const piece of pieces) {
            expect(Math.abs(piece.boundingBox.maxX)).toBeLessThanOrEqual(4);
            expect(Math.abs(piece.boundingBox.maxZ)).toBeLessThanOrEqual(4);
        }
    });

    it('counts the connections a collision or an empty pool closed', () => {
        const assembly = assembleJigsaw(config, sources(2024));

        expect(assembly.rejectedForCollision).toBeGreaterThan(0);
        expect(assembly.unresolvedConnections).toBeGreaterThan(0);
    });

    it('follows a pool alias', () => {
        const aliased = assembleJigsaw(
            { ...config, startPool: 'test:alias' },
            sources(2024, { poolAliases: new Map([['test:alias', 'test:centers']]) })
        );

        expect(aliased.pieces[0]?.location).toBe('test:center');
    });

    it('reports a start pool it cannot resolve instead of throwing', () => {
        const assembly = assembleJigsaw({ ...config, startPool: 'test:missing' }, sources(1));

        expect(assembly.pieces).toEqual([]);
        expect(assembly.unresolvedConnections).toBe(1);
    });

    it('anchors the start piece on the named jigsaw', () => {
        const anchored = assembleJigsaw({ ...config, startJigsawName: 'street' }, sources(2024));
        const plain = assembleJigsaw(config, sources(2024));

        expect(anchored.pieces[0]?.position).not.toEqual(plain.pieces[0]?.position);
    });

    it('places nothing when the start piece carries no jigsaw of the named kind', () => {
        const assembly = assembleJigsaw({ ...config, startJigsawName: 'nowhere' }, sources(2024));

        expect(assembly.pieces).toEqual([]);
        expect(assembly.unresolvedConnections).toBe(1);
    });

    it('settles a projected start onto the terrain, with the start height added', () => {
        const assembly = assembleJigsaw(
            { ...config, startPosition: [0, -7, 0], projectStartToHeightmap: 'WORLD_SURFACE_WG' },
            sources(2024, { terrainHeight: () => 71 })
        );

        // Java moves the piece so its ground layer, one above its floor, lands on the terrain.
        expect(assembly.pieces[0]?.position[1]).toBe(63);
        expect(assembly.origin).toEqual([1, 64, 1]);
    });

    it('reports the generation point the biome check is made at', () => {
        const assembly = assembleJigsaw(config, sources(2024));

        expect(assembly.origin).toEqual([1, 64, 1]);
    });

    it('sits a terrain-matching element on the terrain rather than on its parent', () => {
        const terrainPools: Record<string, TemplatePool> = {
            ...POOLS,
            'test:streets': parseTemplatePool({
                elements: [
                    {
                        element: {
                            element_type: 'minecraft:single_pool_element',
                            location: 'test:street',
                            projection: 'terrain_matching'
                        },
                        weight: 1
                    }
                ],
                fallback: 'test:empty'
            })
        };

        const { pieces } = assembleJigsaw(
            config,
            sources(2024, { pool: (identifier) => terrainPools[identifier], terrainHeight: () => 40 })
        );
        const streets = pieces.filter((piece) => piece.location === 'test:street');

        expect(streets).not.toHaveLength(0);
        for (const street of streets) expect(street.position[1]).toBe(40);
    });

    it('reserves vertical room for a piece whose jigsaw points back into itself', () => {
        // One jigsaw on the south edge faces out, which is how this piece attaches to the
        // center; the other sits on the north edge facing south, so its connection point is a
        // block of its own box and whatever grows there has nowhere reserved for it yet.
        const inward: BedrockStructureTemplate = {
            size: [3, 1, 3],
            palette: [bedrockOf('minecraft:stone'), bedrockOf('minecraft:jigsaw', { orientation: 'south_up' })],
            blocks: [
                {
                    pos: [1, 0, 2],
                    state: 1,
                    extraState: NO_BLOCK,
                    nbt: jigsawNbt({
                        name: 'street',
                        target: 'house',
                        pool: 'test:houses',
                        joint: 'aligned',
                        final_state: 'minecraft:air'
                    })
                },
                {
                    pos: [1, 0, 0],
                    state: 1,
                    extraState: NO_BLOCK,
                    nbt: jigsawNbt({
                        name: 'street',
                        target: 'house',
                        pool: 'test:houses',
                        joint: 'aligned',
                        final_state: 'minecraft:air'
                    })
                }
            ],
            entities: []
        };

        const inwardPools: Record<string, TemplatePool> = {
            ...POOLS,
            'test:streets': parseTemplatePool({
                elements: [
                    {
                        element: {
                            element_type: 'minecraft:single_pool_element',
                            location: 'test:inward',
                            projection: 'rigid'
                        },
                        weight: 1
                    }
                ],
                fallback: 'test:empty'
            })
        };

        const inwardSources = (seed: number) =>
            sources(seed, {
                pool: (identifier: string) => inwardPools[identifier],
                template: (location: string) => (location === 'test:inward' ? inward : TEMPLATES[location])
            });

        const heightOf = (assembly: { pieces: readonly { boundingBox: { minY: number; maxY: number } }[] }) =>
            assembly.pieces.map((piece) => piece.boundingBox.maxY - piece.boundingBox.minY);

        const reserved = assembleJigsaw({ ...config, useExpansionHack: true }, inwardSources(2024));
        const plain = assembleJigsaw(config, inwardSources(2024));

        expect(Math.max(...heightOf(plain))).toBe(0);
        expect(Math.max(...heightOf(reserved))).toBe(2);
    });

    describe('a jigsaw pointing back into its own piece', () => {
        /**
         * A 3 by 3 by 3 room with a jigsaw on its south face for the street to attach to, and
         * one in the middle of its own floor facing up, which is how a trial chamber hangs a
         * spawner, a vault and a dispenser inside the room it just placed.
         */
        const hall: BedrockStructureTemplate = {
            size: [3, 3, 3],
            palette: [
                bedrockOf('minecraft:stone'),
                bedrockOf('minecraft:jigsaw', { orientation: 'south_up' }),
                bedrockOf('minecraft:jigsaw', { orientation: 'up_north' })
            ],
            blocks: [
                {
                    pos: [1, 0, 2],
                    state: 1,
                    extraState: NO_BLOCK,
                    nbt: jigsawNbt({
                        name: 'street',
                        target: 'fitting',
                        pool: 'test:fittings',
                        joint: 'aligned',
                        final_state: 'minecraft:air'
                    })
                },
                {
                    pos: [1, 0, 1],
                    state: 2,
                    extraState: NO_BLOCK,
                    nbt: jigsawNbt({
                        name: 'floor',
                        target: 'fitting',
                        pool: 'test:fittings',
                        joint: 'rollable',
                        final_state: 'minecraft:air'
                    })
                }
            ],
            entities: []
        };

        /** A single block with a jigsaw facing down, which is what hangs under the hall's. */
        const fitting: BedrockStructureTemplate = {
            size: [1, 1, 1],
            palette: [bedrockOf('minecraft:jigsaw', { orientation: 'down_north' })],
            blocks: [
                {
                    pos: [0, 0, 0],
                    state: 0,
                    extraState: NO_BLOCK,
                    nbt: jigsawNbt({
                        name: 'fitting',
                        target: 'nothing',
                        pool: 'test:empty',
                        joint: 'rollable',
                        final_state: 'minecraft:air'
                    })
                }
            ],
            entities: []
        };

        const pools: Record<string, TemplatePool> = {
            ...POOLS,
            'test:streets': parseTemplatePool({
                elements: [
                    {
                        element: {
                            element_type: 'minecraft:single_pool_element',
                            location: 'test:hall',
                            projection: 'rigid'
                        },
                        weight: 1
                    }
                ],
                fallback: 'test:empty'
            }),
            'test:fittings': parseTemplatePool({
                elements: [
                    {
                        element: {
                            element_type: 'minecraft:single_pool_element',
                            location: 'test:fitting',
                            projection: 'rigid'
                        },
                        weight: 1
                    }
                ],
                fallback: 'test:empty'
            })
        };

        const innerSources = (seed: number) =>
            sources(seed, {
                pool: (identifier: string) => pools[identifier],
                template: (location: string) =>
                    location === 'test:hall' ? hall : location === 'test:fitting' ? fitting : TEMPLATES[location]
            });

        it('places inside the piece rather than rejecting it for collision', () => {
            const { pieces } = assembleJigsaw({ ...config, maxDepth: 3 }, innerSources(2024));
            const halls = pieces.filter((piece) => piece.location === 'test:hall');
            const fittings = pieces.filter((piece) => piece.location === 'test:fitting');

            expect(halls).not.toHaveLength(0);
            expect(fittings).toHaveLength(halls.length);
            for (const placed of fittings) {
                const host = halls.find((candidate) => boxesOverlap(candidate.boundingBox, placed.boundingBox));
                expect(host, 'a fitting was placed outside every hall').toBeDefined();
            }
        });

        it('keeps the inside placements inside the piece that holds them', () => {
            const { pieces } = assembleJigsaw({ ...config, maxDepth: 3 }, innerSources(2024));
            const halls = pieces.filter((piece) => piece.location === 'test:hall');
            const fittings = pieces.filter((piece) => piece.location === 'test:fitting');

            expect(fittings).not.toHaveLength(0);
            for (const placed of fittings) {
                const host = halls.find((candidate) => boxesOverlap(candidate.boundingBox, placed.boundingBox))!;
                expect(placed.boundingBox.minY).toBeGreaterThanOrEqual(host.boundingBox.minY);
                expect(placed.boundingBox.maxY).toBeLessThanOrEqual(host.boundingBox.maxY);
                expect(placed.boundingBox.minX).toBeGreaterThanOrEqual(host.boundingBox.minX);
                expect(placed.boundingBox.maxX).toBeLessThanOrEqual(host.boundingBox.maxX);
            }
        });
    });
});
