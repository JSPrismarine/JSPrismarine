import { describe, expect, it } from 'vitest';

import type { ConfiguredFeature } from '../features/Feature';
import { feature } from '../features/Feature';
import { constantInt } from '../providers/valueProviders';
import { blockState } from '../world/BlockState';
import type { BlockPos } from '../world/FeatureWorld';
import { posKey } from '../world/FeatureWorld';
import { TestFeatureWorld } from '../world/TestFeatureWorld';
import type { PlacementContext, PlacementModifier } from './modifiers';
import { countPlacement, inSquare, offsetPlacement, rarityFilter } from './modifiers';
import type { PlacedFeature, ScheduledFeature } from './pipeline';
import { DECORATION_STEPS, decorateChunk, decorationStepIndex, orderDecoration, placeFeature } from './pipeline';

const STONE = blockState('minecraft:stone');

/** A feature that records where it was asked to build and writes one block there. */
const recorder = (log: BlockPos[]): ConfiguredFeature =>
    feature('simple_block', (world, _random, origin) => {
        log.push(origin);
        return world.setBlock(origin, STONE);
    });

const context = (): PlacementContext => ({ world: new TestFeatureWorld() });

describe('the decoration steps', () => {
    it('lists Java’s eleven steps in Java’s order', () => {
        expect(DECORATION_STEPS).toEqual([
            'raw_generation',
            'lakes',
            'local_modifications',
            'underground_structures',
            'surface_structures',
            'strongholds',
            'underground_ores',
            'underground_decoration',
            'fluid_springs',
            'vegetal_decoration',
            'top_layer_modification'
        ]);
        expect(decorationStepIndex('raw_generation')).toBe(0);
        expect(decorationStepIndex('underground_ores')).toBe(6);
        expect(decorationStepIndex('top_layer_modification')).toBe(10);
    });

    it('orders a plan by step first and by index within a step', () => {
        const placed: PlacedFeature = { feature: recorder([]), placement: [] };
        const plan: ScheduledFeature[] = [
            { feature: placed, step: 'vegetal_decoration', index: 1 },
            { feature: placed, step: 'lakes', index: 4 },
            { feature: placed, step: 'vegetal_decoration', index: 0 },
            { feature: placed, step: 'raw_generation', index: 9 }
        ];
        expect(orderDecoration(plan).map((entry) => `${entry.step}:${entry.index}`)).toEqual([
            'raw_generation:9',
            'lakes:4',
            'vegetal_decoration:0',
            'vegetal_decoration:1'
        ]);
    });

    it('leaves the caller’s plan untouched', () => {
        const placed: PlacedFeature = { feature: recorder([]), placement: [] };
        const plan: ScheduledFeature[] = [
            { feature: placed, step: 'vegetal_decoration', index: 0 },
            { feature: placed, step: 'lakes', index: 0 }
        ];
        orderDecoration(plan);
        expect(plan[0]?.step).toBe('vegetal_decoration');
    });
});

describe('placeFeature', () => {
    it('places once at the origin when there are no modifiers', () => {
        const log: BlockPos[] = [];
        const origin = { x: 4, y: 8, z: 12 };
        expect(
            placeFeature({ feature: recorder(log), placement: [] }, context(), new WorldgenRandomStub(), origin)
        ).toBe(true);
        expect(log).toEqual([origin]);
    });

    it('runs the chain in order, so a count ahead of a spread produces scattered positions', () => {
        const log: BlockPos[] = [];
        const placed: PlacedFeature = {
            feature: recorder(log),
            placement: [countPlacement(constantInt(8)), inSquare()]
        };
        placeFeature(placed, context(), new WorldgenRandomStub(), { x: 0, y: 0, z: 0 });
        expect(log).toHaveLength(8);
        expect(new Set(log.map(posKey)).size).toBeGreaterThan(1);
    });

    it('walks the chain depth first, finishing one position before starting the next', () => {
        // A modifier that emits two positions, followed by one that records what it receives.
        const seen: number[] = [];
        const fanOut: PlacementModifier = {
            type: 'count',
            modify: (_ctx, _random, origin, output) => {
                output({ ...origin, x: origin.x + 1 });
                output({ ...origin, x: origin.x + 2 });
            }
        };
        const record: PlacementModifier = {
            type: 'offset',
            modify: (_ctx, _random, origin, output) => {
                seen.push(origin.x);
                output(origin);
                output(origin);
            }
        };
        placeFeature({ feature: recorder([]), placement: [fanOut, record] }, context(), new WorldgenRandomStub(), {
            x: 0,
            y: 0,
            z: 0
        });
        // Depth first means 1 is fully processed before 2 is reached at all.
        expect(seen).toEqual([1, 2]);
    });

    it('reports failure when every placement failed', () => {
        const nothing = feature('no_op', () => false);
        expect(
            placeFeature(
                { feature: nothing, placement: [countPlacement(constantInt(3))] },
                context(),
                new WorldgenRandomStub(),
                {
                    x: 0,
                    y: 0,
                    z: 0
                }
            )
        ).toBe(false);
    });

    it('drops every position when a filter rejects them all', () => {
        const log: BlockPos[] = [];
        const placed: PlacedFeature = {
            feature: recorder(log),
            placement: [countPlacement(constantInt(4)), rarityFilter(1000000)]
        };
        placeFeature(placed, context(), new WorldgenRandomStub(), { x: 0, y: 0, z: 0 });
        expect(log).toEqual([]);
    });
});

describe('decorateChunk', () => {
    const plan = (log: BlockPos[]): ScheduledFeature[] => [
        {
            feature: { feature: recorder(log), placement: [countPlacement(constantInt(4)), inSquare()] },
            step: 'vegetal_decoration',
            index: 3
        },
        {
            feature: {
                feature: recorder(log),
                placement: [
                    countPlacement(constantInt(2)),
                    offsetPlacement(constantInt(1), constantInt(0), constantInt(1))
                ]
            },
            step: 'underground_ores',
            index: 0
        }
    ];

    it('places the same blocks for the same seed and chunk', () => {
        const first: BlockPos[] = [];
        const second: BlockPos[] = [];
        decorateChunk(plan(first), context(), 4242n, 3, -5);
        decorateChunk(plan(second), context(), 4242n, 3, -5);
        expect(second.map(posKey)).toEqual(first.map(posKey));
    });

    it('places different blocks in a different chunk', () => {
        const here: BlockPos[] = [];
        const there: BlockPos[] = [];
        decorateChunk(plan(here), context(), 4242n, 3, -5);
        decorateChunk(plan(there), context(), 4242n, 4, -5);
        expect(there.map(posKey)).not.toEqual(here.map(posKey));
    });

    it('places different blocks for a different world seed', () => {
        const here: BlockPos[] = [];
        const there: BlockPos[] = [];
        decorateChunk(plan(here), context(), 4242n, 3, -5);
        decorateChunk(plan(there), context(), 4243n, 3, -5);
        expect(there.map(posKey)).not.toEqual(here.map(posKey));
    });

    it('runs the steps in Java’s order whatever order the plan arrives in', () => {
        const order: string[] = [];
        const marker = (name: string): ConfiguredFeature =>
            feature('no_op', () => {
                order.push(name);
                return false;
            });
        const scrambled: ScheduledFeature[] = [
            { feature: { feature: marker('top'), placement: [] }, step: 'top_layer_modification', index: 0 },
            { feature: { feature: marker('ores'), placement: [] }, step: 'underground_ores', index: 0 },
            { feature: { feature: marker('lakes'), placement: [] }, step: 'lakes', index: 0 }
        ];
        decorateChunk(scrambled, context(), 1n, 0, 0);
        expect(order).toEqual(['lakes', 'ores', 'top']);
    });

    it('does not let one feature move the next, whatever it draws', () => {
        const greedy = (draws: number): ConfiguredFeature =>
            feature('no_op', (_world, random) => {
                for (let draw = 0; draw < draws; draw++) random.nextInt();
                return false;
            });
        const positions: BlockPos[] = [];
        const withGreedy: ScheduledFeature[] = [
            { feature: { feature: greedy(50), placement: [] }, step: 'lakes', index: 0 },
            { feature: { feature: recorder(positions), placement: [inSquare()] }, step: 'vegetal_decoration', index: 0 }
        ];
        const withoutGreedy: ScheduledFeature[] = [
            { feature: { feature: greedy(0), placement: [] }, step: 'lakes', index: 0 },
            { feature: { feature: recorder(positions), placement: [inSquare()] }, step: 'vegetal_decoration', index: 0 }
        ];
        decorateChunk(withGreedy, context(), 77n, 2, 2);
        decorateChunk(withoutGreedy, context(), 77n, 2, 2);
        expect(posKey(positions[1] ?? { x: 0, y: 0, z: 0 })).toBe(posKey(positions[0] ?? { x: 1, y: 1, z: 1 }));
    });

    it('reports the population seed and how many features placed anything', () => {
        const log: BlockPos[] = [];
        const result = decorateChunk(plan(log), context(), 4242n, 3, -5);
        expect(result.run).toBe(2);
        expect(result.placed).toBe(2);
        expect(typeof result.populationSeed).toBe('bigint');
    });
});

/** A stub stream for the cases where the draws do not matter, kept typed rather than cast. */
class WorldgenRandomStub {
    private state = 1;

    public next(bits: number): number {
        this.state = (this.state * 1103515245 + 12345) | 0;
        return this.state >>> (32 - bits);
    }

    public nextInt(): number {
        return this.next(32);
    }

    public nextIntBounded(bound: number): number {
        return Math.abs(this.next(31)) % bound;
    }

    public nextLong(): bigint {
        return BigInt(this.nextInt());
    }

    public nextBoolean(): boolean {
        return this.next(1) === 1;
    }

    public nextFloat(): number {
        return this.next(24) / (1 << 24);
    }

    public nextDouble(): number {
        return this.nextFloat();
    }

    public nextGaussian(): number {
        return this.nextDouble() * 2 - 1;
    }

    public consumeCount(rounds: number): void {
        for (let round = 0; round < rounds; round++) this.nextInt();
    }

    public fork(): WorldgenRandomStub {
        return new WorldgenRandomStub();
    }

    public forkPositional(): {
        at: () => WorldgenRandomStub;
        fromHashOf: () => WorldgenRandomStub;
        fromSeed: () => WorldgenRandomStub;
    } {
        return {
            at: () => new WorldgenRandomStub(),
            fromHashOf: () => new WorldgenRandomStub(),
            fromSeed: () => new WorldgenRandomStub()
        };
    }
}
