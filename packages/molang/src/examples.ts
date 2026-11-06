import type { MolangScope, MolangValue } from './scope';

/** One evaluation of an example: what the scope answers and the value that comes out. */
export interface MolangExampleCase {
    /** What is different about this scope, in a few words. */
    readonly label: string;
    readonly scope: MolangScope;
    readonly expected: MolangValue;
}

/** A Molang expression a pack author could write, with the scopes it is shown to work under. */
export interface MolangExample {
    /** A short name, used as the heading in the README. */
    readonly title: string;
    /** Where an author would put it and what it does. */
    readonly description: string;
    readonly source: string;
    /** The pack's `min_engine_version` when the expression depends on one. */
    readonly minEngineVersion?: readonly [number, number, number];
    readonly cases: readonly MolangExampleCase[];
}

const entity = (members: NonNullable<MolangScope['entity']>): MolangScope => ({ entity: members });

/**
 * Expressions that compile and evaluate on this engine, each with the values it produces.
 *
 * The README shows exactly these sources, and `examples.test.ts` fails when the two differ or when
 * an example stops producing its values, so none of them can quietly rot. A tool that wants real
 * Molang to try - an editor, a playground, a documentation page - can take them from here.
 */
export const MOLANG_EXAMPLES: readonly MolangExample[] = [
    {
        title: 'A chance that depends on age',
        description: 'A ternary picks between two numbers, as an ambient sound probability does.',
        source: 'query.is_baby ? 0.02 : 0.001',
        minEngineVersion: [1, 21, 0],
        cases: [
            { label: 'a baby', scope: entity({ isBaby: () => true }), expected: 0.02 },
            { label: 'an adult', scope: entity({ isBaby: () => false }), expected: 0.001 }
        ]
    },
    {
        title: 'A value kept in range',
        description: 'The `math` functions take and return numbers; `clamp(value, min, max)` bounds a variant index.',
        source: 'math.clamp(query.variant, 0, 3)',
        cases: [
            { label: 'variant 2', scope: entity({ variant: () => 2 }), expected: 2 },
            { label: 'variant 9', scope: entity({ variant: () => 9 }), expected: 3 }
        ]
    },
    {
        title: 'A spawn condition',
        description: 'Booleans are 1 and 0, so conditions combine with `&&`, `||` and `!`.',
        source: 'query.head_is_in_water && !query.is_on_ground',
        cases: [
            {
                label: 'swimming',
                scope: entity({ headIsInWater: () => true, isOnGround: () => false }),
                expected: 1
            },
            {
                label: 'standing in the shallows',
                scope: entity({ headIsInWater: () => true, isOnGround: () => true }),
                expected: 0
            }
        ]
    },
    {
        title: 'A string property',
        description: 'Strings compare with `==` and `!=`, and `query.property` reads an entity property.',
        source: "query.property('example:color') == 'red'",
        cases: [
            { label: 'red', scope: entity({ property: () => 'red' }), expected: 1 },
            { label: 'blue', scope: entity({ property: () => 'blue' }), expected: 0 }
        ]
    },
    {
        title: 'Worn-out tools',
        description: 'An item expression reads durability; the result is 1 once less than a tenth is left.',
        source: 'query.remaining_durability / query.max_durability < 0.1',
        cases: [
            {
                label: 'almost broken',
                scope: { item: { remainingDurability: () => 20, maxDurability: () => 250 } },
                expected: 1
            },
            {
                label: 'nearly new',
                scope: { item: { remainingDurability: () => 240, maxDurability: () => 250 } },
                expected: 0
            }
        ]
    },
    {
        title: 'Interpolating between two numbers',
        description: '`math.lerp(start, end, t)` blends linearly.',
        source: 'math.lerp(10, 20, 0.25)',
        cases: [{ label: 'no scope needed', scope: {}, expected: 12.5 }]
    },
    {
        title: 'A reward that grows with level',
        description: 'Arithmetic follows the usual precedence, so the multiplication happens before the cap.',
        source: 'math.min(10 + query.player_level * 5, 100)',
        cases: [
            { label: 'level 4', scope: entity({ playerLevel: () => 4 }), expected: 30 },
            { label: 'level 40', scope: entity({ playerLevel: () => 40 }), expected: 100 }
        ]
    },
    {
        title: 'A terrain condition',
        description: 'Worldgen queries take coordinates and read the placement context.',
        source: 'query.heightmap(0, 0) > 62',
        cases: [
            { label: 'above sea level', scope: { placement: { heightmap: () => 70 } }, expected: 1 },
            { label: 'under water', scope: { placement: { heightmap: () => 55 } }, expected: 0 }
        ]
    },
    {
        title: 'A complex expression with a loop',
        description:
            'Statements end in `;`, `v.` is `variable.`, and a complex expression yields what `return` gives it.',
        source: 'v.total = 0; loop(5, { v.total = v.total + 2; }); return v.total;',
        cases: [{ label: 'five rounds of two', scope: {}, expected: 10 }]
    },
    {
        title: 'Stopping a loop early',
        description: '`break` leaves the loop; the loop is capped at 1024 rounds either way.',
        source: 'v.n = 0; loop(100, { v.n = v.n + 1; (v.n >= 7) ? break; }); return v.n;',
        cases: [{ label: 'stops at seven', scope: {}, expected: 7 }]
    }
];
