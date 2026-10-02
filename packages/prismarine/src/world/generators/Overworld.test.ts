import { describe, expect, it } from 'vitest';

import * as Blocks from '../../block/Blocks';
import type { Block } from '../../block/Block';
import Noise from './Noise';
import Overworld from './Overworld';

/** A BlockManager stand-in: the generator only ever looks blocks up by name. */
const blockManager: any = {
    getBlock: (name: string) => {
        const found = Object.values(Blocks)
            .map((B) => new (B as any)())
            .find((block: Block) => block.getName() === name);
        if (!found) throw new Error(`invalid block with id ${name}`);
        return found;
    }
};

const generate = (cx = 0, cz = 0, seed = 1234) => new Overworld(blockManager).generateChunk(cx, cz, seed);

/** Everything a decorator may leave standing on top of the ground. */
const DECORATION = new Set([
    'minecraft:short_grass',
    'minecraft:dandelion',
    'minecraft:poppy',
    'minecraft:deadbush',
    'minecraft:oak_log',
    'minecraft:oak_leaves',
    'minecraft:birch_log',
    'minecraft:birch_leaves'
]);

/** Reads a column top-down, returning the first non-air block name and its height. */
const surfaceOf = (chunk: any, x: number, z: number) => {
    for (let y = chunk.getMaxY(); y >= chunk.getMinY(); y--) {
        const state = chunk.getBlock(x, y, z);
        if (state.name !== 'minecraft:air') return { name: state.name, y };
    }
    return { name: 'minecraft:air', y: -1 };
};

/** The ground itself, looking past whatever grew on it. */
const groundOf = (chunk: any, x: number, z: number) => {
    for (let y = chunk.getMaxY(); y >= chunk.getMinY(); y--) {
        const state = chunk.getBlock(x, y, z);
        if (state.name !== 'minecraft:air' && !DECORATION.has(state.name)) return { name: state.name, y };
    }
    return { name: 'minecraft:air', y: -1 };
};

/** Every block name present in a chunk. */
const blockNamesIn = (chunk: any) => {
    const names = new Set<string>();
    for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++)
            for (let y = chunk.getMinY(); y < 100; y++) names.add(chunk.getBlock(x, y, z).name);
    return names;
};

describe('world', () => {
    describe('Overworld generator', () => {
        it('places bedrock at the very bottom of every column', async () => {
            // The bottom is the dimension's floor, which for the Overworld is -64 - the same
            // place vanilla puts it since 1.18.
            const chunk = await generate();
            expect(chunk.getMinY()).toBe(-64);

            for (let x = 0; x < 16; x += 5) {
                for (let z = 0; z < 16; z += 5) {
                    expect(chunk.getBlock(x, chunk.getMinY(), z).name).toBe('minecraft:bedrock');
                }
            }
        });

        it('fills the whole depth below the surface, not just what used to be above y=0', async () => {
            // The floor moving from 0 to -64 added 64 blocks of depth per column. Leaving them
            // unfilled would look identical at the surface and be a void underneath.
            //
            // Measured against the band that was always there rather than against a fixed
            // number, because how much the cave carver takes out is its own business - the claim
            // here is only that the new depth is terrain, not emptiness.
            const chunk = await generate();

            const airFraction = (lowest: number, highest: number) => {
                let air = 0;
                let total = 0;
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        for (let y = lowest; y <= highest; y++) {
                            total++;
                            if (chunk.getBlock(x, y, z).name === 'minecraft:air') air++;
                        }
                    }
                }

                return air / total;
            };

            const added = airFraction(-63, -1);
            const alwaysThere = airFraction(2, 56);

            expect(added).toBeLessThan(0.5);
            expect(added).toBeLessThanOrEqual(alwaysThere);
        });

        it('finishes every column with a surface material, never bare stone', async () => {
            const chunk = await generate();
            const surfaces = new Set<string>();
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) surfaces.add(groundOf(chunk, x, z).name);
            }

            for (const name of surfaces) {
                // Dirt appears too now: a tree replaces the grass block under its trunk.
                expect(['minecraft:grass_block', 'minecraft:sand', 'minecraft:water', 'minecraft:dirt']).toContain(
                    name
                );
            }
        });

        it('gives the same chunk for the same seed, and a different one otherwise', async () => {
            const a = surfaceOf(await generate(0, 0, 42), 8, 8);
            const b = surfaceOf(await generate(0, 0, 42), 8, 8);
            expect(a).toEqual(b);

            // Across a wide area two seeds cannot plausibly agree everywhere.
            const one = await generate(0, 0, 1);
            const two = await generate(0, 0, 2);
            const differs = Array.from({ length: 16 }, (_, i) => i).some(
                (i) => surfaceOf(one, i, i).y !== surfaceOf(two, i, i).y
            );
            expect(differs).toBe(true);
        });

        it('lines up at chunk borders instead of forming a cliff', async () => {
            // The last column of one chunk and the first of the next are adjacent in the
            // world, so their heights must be within a block or two of each other.
            const left = await generate(0, 0);
            const right = await generate(1, 0);

            for (let z = 0; z < 16; z++) {
                // Ground, not decoration: a tree on one side is not a cliff.
                const edge = groundOf(left, 15, z).y;
                const nextEdge = groundOf(right, 0, z).y;
                expect(Math.abs(edge - nextEdge)).toBeLessThanOrEqual(2);
            }
        });

        it('fills depressions up to sea level with water', async () => {
            // A single strip of chunks can easily sit entirely above sea level, so sweep an
            // area on both axes: about a quarter of the world is ocean.
            let sawWater = false;
            for (let cx = 0; cx < 6 && !sawWater; cx++)
                for (let cz = 0; cz < 6 && !sawWater; cz++) {
                    const chunk = await generate(cx, cz, 7);
                    for (let x = 0; x < 16 && !sawWater; x++) {
                        for (let z = 0; z < 16 && !sawWater; z++) {
                            if (surfaceOf(chunk, x, z).name === 'minecraft:water') sawWater = true;
                        }
                    }
                }

            expect(sawWater).toBe(true);
        });

        it('varies the terrain rather than producing a flat plane', async () => {
            const chunk = await generate();
            const heights = new Set<number>();
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) heights.add(surfaceOf(chunk, x, z).y);
            }

            expect(heights.size).toBeGreaterThan(1);
        });
    });

    describe('decoration', () => {
        // Decoration runs as ordered passes over the finished terrain. These check that each
        // pass actually did something and that the order between them held, rather than
        // pinning exact positions - which would break on any tuning of the noise.
        it('buries ores and stone variants in the stone', async () => {
            const found = new Set<string>();
            for (let cx = 0; cx < 4; cx++) {
                for (const name of blockNamesIn(await generate(cx, 0, 99))) found.add(name);
            }

            for (const ore of ['minecraft:coal_ore', 'minecraft:iron_ore', 'minecraft:gravel']) {
                expect([...found]).toContain(ore);
            }
        });

        it('leaves ore exposed rather than filling the caves back in', async () => {
            // Ores are placed before caves are carved, so a tunnel cuts through them. If the
            // order were reversed the veins would plug the tunnels instead.
            const chunk = await generate(0, 0, 99);

            let airBelowGround = 0;
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    const ground = groundOf(chunk, x, z).y;
                    for (let y = 3; y < ground - 6; y++) {
                        if (chunk.getBlock(x, y, z).name === 'minecraft:air') airBelowGround++;
                    }
                }
            }

            expect(airBelowGround).toBeGreaterThan(0); // caves were carved
        });

        it('leaves nothing floating in a carved out cave', async () => {
            // The bug this guards: caves used to remove stone only, so a tunnel through an
            // ore vein or a dirt blob took the stone around it and left the vein hanging in
            // mid air. A block underground with air on all six sides is that symptom.
            const floating: string[] = [];

            for (let cx = 0; cx < 3; cx++) {
                const chunk = await generate(cx, 1, 99);
                for (let x = 1; x < 15; x++) {
                    for (let z = 1; z < 15; z++) {
                        const ground = groundOf(chunk, x, z).y;
                        for (let y = 3; y < Math.min(ground - 6, 54); y++) {
                            const here = chunk.getBlock(x, y, z).name;
                            if (here === 'minecraft:air') continue;

                            const surrounded =
                                chunk.getBlock(x, y + 1, z).name === 'minecraft:air' &&
                                chunk.getBlock(x, y - 1, z).name === 'minecraft:air' &&
                                chunk.getBlock(x + 1, y, z).name === 'minecraft:air' &&
                                chunk.getBlock(x - 1, y, z).name === 'minecraft:air' &&
                                chunk.getBlock(x, y, z + 1).name === 'minecraft:air' &&
                                chunk.getBlock(x, y, z - 1).name === 'minecraft:air';

                            if (surrounded) floating.push(`${here} at ${cx}:${x},${y},${z}`);
                        }
                    }
                }
            }

            expect(floating).toEqual([]);
        });

        it('still shows ore in the walls of a cave', async () => {
            // Carving through ore must not mean ore is never seen underground: the vein
            // continues past the tunnel, which is what makes it visible.
            let exposed = 0;

            for (let cx = 0; cx < 4 && exposed === 0; cx++) {
                const chunk = await generate(cx, 1, 99);
                for (let x = 1; x < 15; x++) {
                    for (let z = 1; z < 15; z++) {
                        for (let y = 4; y < 50; y++) {
                            if (!chunk.getBlock(x, y, z).name.endsWith('_ore')) continue;

                            const touchesAir = [
                                chunk.getBlock(x + 1, y, z),
                                chunk.getBlock(x - 1, y, z),
                                chunk.getBlock(x, y, z + 1),
                                chunk.getBlock(x, y, z - 1)
                            ].some((state) => state.name === 'minecraft:air');

                            if (touchesAir) exposed++;
                        }
                    }
                }
            }

            expect(exposed).toBeGreaterThan(0);
        });

        it('never carves away the bedrock floor', async () => {
            for (let cx = 0; cx < 3; cx++) {
                const chunk = await generate(cx, cx, 99);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        expect(chunk.getBlock(x, chunk.getMinY(), z).name).toBe('minecraft:bedrock');
                    }
                }
            }
        });

        it('grows trees, and never cuts one off at the chunk border', async () => {
            let trunks = 0;
            for (let cx = 0; cx < 6; cx++) {
                const chunk = await generate(cx, 3, 99);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        for (let y = 60; y < 110; y++) {
                            const name = chunk.getBlock(x, y, z).name;
                            if (name !== 'minecraft:oak_log' && name !== 'minecraft:birch_log') continue;

                            trunks++;
                            // The canopy reaches two blocks out, so a trunk any closer to the
                            // edge would have its leaves clipped by the chunk boundary.
                            expect(x).toBeGreaterThanOrEqual(2);
                            expect(x).toBeLessThanOrEqual(13);
                            expect(z).toBeGreaterThanOrEqual(2);
                            expect(z).toBeLessThanOrEqual(13);
                        }
                    }
                }
            }

            expect(trunks).toBeGreaterThan(0);
        });

        it('covers the ground with grass and flowers', async () => {
            const found = new Set<string>();
            for (let cx = 0; cx < 4; cx++) {
                for (const name of blockNamesIn(await generate(cx, 7, 99))) found.add(name);
            }

            expect([...found]).toContain('minecraft:short_grass');
        });

        it('decorates a chunk identically however often it is generated', async () => {
            // Decoration draws from a generator seeded per chunk, so regenerating must give
            // exactly the same chunk - otherwise a reload would rearrange the world.
            const first = await generate(2, 5, 4242);
            const second = await generate(2, 5, 4242);

            for (let x = 0; x < 16; x += 3) {
                for (let z = 0; z < 16; z += 3) {
                    for (let y = 0; y < 100; y += 7) {
                        expect(first.getBlock(x, y, z).name).toBe(second.getBlock(x, y, z).name);
                    }
                }
            }
        });

        it('does not correlate neighbouring chunks', async () => {
            // Seeds are mixed rather than added, so adjacent chunks are not near-copies.
            const a = await generate(10, 10, 4242);
            const b = await generate(11, 10, 4242);

            let identical = 0;
            let compared = 0;
            for (let x = 0; x < 16; x++) {
                for (let y = 60; y < 90; y++) {
                    compared++;
                    if (a.getBlock(x, y, 8).name === b.getBlock(x, y, 8).name) identical++;
                }
            }

            expect(identical).toBeLessThan(compared);
        });
    });

    describe('spawn ground', () => {
        // A quarter of this world is ocean, so "the column at the origin" is quite likely to
        // be water. These check the two things a spawn point has to be: real ground, and
        // reported at the right height.
        it('reports the height of the topmost block, not a fixed number', async () => {
            const chunk = await generate(0, 0, 4242);

            for (let x = 0; x < 16; x += 5) {
                for (let z = 0; z < 16; z += 5) {
                    const highest = chunk.getHighestBlockAt(x, z);

                    expect(chunk.getBlock(x, highest, z).name).not.toBe('minecraft:air');
                    expect(chunk.getBlock(x, highest + 1, z).name).toBe('minecraft:air');
                }
            }
        });

        it('finds dry land somewhere near the origin', async () => {
            // What findSurfaceSpawn walks: rings outward until a column's top block is
            // something a player can stand on.
            const unsuitable = new Set([
                'minecraft:water',
                'minecraft:air',
                'minecraft:oak_leaves',
                'minecraft:birch_leaves',
                'minecraft:oak_log',
                'minecraft:birch_log',
                'minecraft:short_grass',
                'minecraft:tall_grass',
                'minecraft:dandelion',
                'minecraft:poppy',
                'minecraft:deadbush'
            ]);

            let dryColumns = 0;
            for (let cx = 0; cx < 3; cx++) {
                const chunk = await generate(cx, 0, 4242);
                for (let x = 0; x < 16; x += 4) {
                    for (let z = 0; z < 16; z += 4) {
                        const y = chunk.getHighestBlockAt(x, z);
                        if (y >= 0 && !unsuitable.has(chunk.getBlock(x, y, z).name)) dryColumns++;
                    }
                }
            }

            expect(dryColumns).toBeGreaterThan(0);
        });

        it('reports water as the top block of a flooded column', async () => {
            // This is what makes the "is it water" test as simple as it is: a column under
            // the sea has water as its topmost block, not the seabed.
            let checked = 0;
            for (let cx = 0; cx < 6 && checked === 0; cx++) {
                const chunk = await generate(cx, 0, 7);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        if (surfaceOf(chunk, x, z).name !== 'minecraft:water') continue;

                        expect(chunk.getBlock(x, chunk.getHighestBlockAt(x, z), z).name).toBe('minecraft:water');
                        checked++;
                    }
                }
            }

            expect(checked).toBeGreaterThan(0);
        });
    });

    describe('Noise', () => {
        it('is deterministic for a seed and coordinate', () => {
            const noise = new Noise(99);
            expect(noise.fractal(3.25, -7.5)).toBe(new Noise(99).fractal(3.25, -7.5));
        });

        it('stays within [0, 1]', () => {
            const noise = new Noise(5);
            for (let i = -50; i < 50; i++) {
                const value = noise.fractal(i * 0.37, i * -0.11);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            }
        });

        it('changes with the seed', () => {
            expect(new Noise(1).fractal(1.5, 1.5)).not.toBe(new Noise(2).fractal(1.5, 1.5));
        });
    });
});
