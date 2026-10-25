import { createLootContext, lootSequenceRandom, packJson, rollLootTable } from '@jsprismarine/loot';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { chiSquaredTest } from './chiSquared.ts';
import { FAMILIES } from './families.ts';
import { VANILLA_LOOT_SEED, loadVanillaDatapack, vanillaLootContent, vanillaLootRegistry } from './javaDatapack.ts';
import { declaredDistribution } from './lootDistribution.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * The other half of phase 2's loot exit criterion: the distribution a table rolls, against the
 * distribution the table itself declares.
 *
 * What this proves, and what it does not. Each qualifying table is rolled thousands of times
 * from a fixed world seed, the stacks are counted by item identifier, and the counts go through
 * Pearson's chi-squared test against the probabilities the table's own weights and roll counts
 * imply. That catches a weight formula that drops a term, a draw that is uniform where it should
 * be weighted, a pool that rolls the wrong number of times, and an entry that never comes up.
 *
 * It is not a comparison against Java Edition's observed output. That would need sampled rolls
 * captured from a running Java server, and no capture job in this repository produces them, so
 * nothing here claims the server's chests hold what a Java chest holds - only that the roller
 * obeys the numbers Mojang's own table files state. The structural half of the criterion,
 * `loot.tables`, is what checks those files parse as written.
 *
 * The corpus is also narrower than "every table", because the prediction has to be exact.
 * `declaredDistribution` qualifies only the tables whose every draw is a plain weighted choice
 * between named items; a table with a `random_chance` condition or an `alternatives` container
 * has a distribution its weights alone do not determine, and guessing at one would make this
 * row report arithmetic rather than parity.
 *
 * Gap ids: `distribution:<table id>` where the rolled counts do not fit the declared weights,
 * `rolls:<table id>` where a table produced the wrong number of stacks, and
 * `unexpected-item:<table id>` where a roll produced an item the table never declares.
 */

/**
 * How unlikely a fit has to be before the row calls it a gap.
 *
 * Roughly fifty tables take the test, so an alpha of 0.05 would be expected to reject two or
 * three of them with nothing wrong. At 1e-4 the expected number of false rejections across the
 * corpus is under one in two hundred runs, and the seed is fixed, so the verdict is the same
 * every time rather than flickering.
 */
const ALPHA = 1e-4;

/** The expected count the sample size aims for in the rarest cell, before any cells are merged. */
const TARGET_RAREST_CELL = 80;

/** How many times a table with a real choice to make is rolled, between these bounds. */
const MINIMUM_ROLLS = 2500;
const MAXIMUM_ROLLS = 20000;

/** How many times a table with one item is rolled, which only measures its roll count. */
const SINGLE_ITEM_ROLLS = 500;

/** How far the stacks a table produced may sit from the predicted mean, in standard deviations. */
const ROLL_COUNT_SIGMA = 5;

/** What one table's test came out as. */
interface TableResult {
    readonly id: string;
    readonly rolls: number;
    readonly draws: number;
    /** The p-value of the fit, or undefined for a table with only one item to draw. */
    readonly pValue: number | undefined;
    readonly categories: number;
    /** How many draws the rarest item was expected to get, before any cells were merged. */
    readonly rarestExpected: number;
}

const compareDistributions = (): {
    gaps: string[];
    detail: string[];
    results: TableResult[];
    qualified: number;
    tables: number;
} => {
    const { definitions } = loadVanillaDatapack();
    const registry = vanillaLootRegistry(definitions);
    const content = vanillaLootContent(definitions);
    const gaps: string[] = [];
    const detail: string[] = [];
    const results: TableResult[] = [];
    let qualified = 0;

    for (const id of registry.ids) {
        const declared = declaredDistribution(packJson(definitions.lootTablesJava.get(id)));
        const table = registry.table(id);
        if (declared === undefined || declared.meanDraws === 0 || table === undefined) continue;
        qualified += 1;

        // Enough rolls that the rarest item is expected often enough for the test to see it,
        // within bounds that keep the whole row inside a minute. A table with one item has no
        // fit to measure, only a roll count, and needs far fewer.
        const rarest = Math.min(...declared.shares.values());
        const wanted = Math.ceil(TARGET_RAREST_CELL / rarest);
        const rolls =
            declared.shares.size < 2 ? SINGLE_ITEM_ROLLS : Math.min(MAXIMUM_ROLLS, Math.max(MINIMUM_ROLLS, wanted));

        // The context is built once and the stream runs on through every roll, the way a world
        // keeps one stream per sequence id, so rolling a table twice never replays its draws.
        const context = createLootContext({
            parameterSet: table.parameterSet,
            parameters: { origin: { x: 0, y: 64, z: 0 } },
            content,
            random: lootSequenceRandom(VANILLA_LOOT_SEED, table.randomSequence)
        });

        const observed = new Map<string, number>();
        let draws = 0;
        for (let roll = 0; roll < rolls; roll += 1) {
            // `split: false` keeps one drawn candidate as one stack, so a stack is a draw.
            for (const stack of rollLootTable(table, context, { split: false })) {
                observed.set(stack.id, (observed.get(stack.id) ?? 0) + 1);
                draws += 1;
            }
        }

        const strangers = [...observed.keys()].filter((item) => !declared.shares.has(item));
        if (strangers.length > 0) {
            gaps.push(`unexpected-item:${id}`);
            detail.push(`${id} rolled ${strangers.join(', ')}, which the table does not declare`);
        }

        const predictedDraws = rolls * declared.meanDraws;
        const deviation = Math.sqrt(rolls * declared.drawsVariance);
        const allowed = deviation === 0 ? 0 : ROLL_COUNT_SIGMA * deviation;
        if (Math.abs(draws - predictedDraws) > allowed) {
            gaps.push(`rolls:${id}`);
            detail.push(
                `${id} produced ${draws} stacks over ${rolls} rolls, where the roll counts predict ${predictedDraws}` +
                    (deviation === 0 ? ' exactly' : ` give or take ${allowed.toFixed(1)}`)
            );
        }

        // The fit is over which item a draw produced, so the cells are scaled to the draws that
        // happened. A table with one item has nothing to choose between and no fit to test.
        const result =
            declared.shares.size < 2
                ? undefined
                : chiSquaredTest(
                      [...declared.shares].map(([item, share]) => ({
                          label: item,
                          observed: observed.get(item) ?? 0,
                          expected: (draws * share) / declared.meanDraws
                      }))
                  );

        if (result !== undefined && result.pValue < ALPHA) {
            gaps.push(`distribution:${id}`);
            const worst = [...result.cells]
                .sort(
                    (left, right) => Math.abs(right.observed - right.expected) - Math.abs(left.observed - left.expected)
                )
                .slice(0, 4)
                .map((cell) => `${cell.label} ${cell.observed} vs ${cell.expected.toFixed(1)}`);
            detail.push(
                `${id}: chi-squared ${result.statistic.toFixed(1)} on ${result.degreesOfFreedom} df, p ${result.pValue.toExponential(2)} over ${draws} draws; worst ${worst.join(', ')}`
            );
        }

        results.push({
            id,
            rolls,
            draws,
            pValue: result?.pValue,
            categories: declared.shares.size,
            rarestExpected: (draws * rarest) / declared.meanDraws
        });
    }

    return { gaps, detail, results, qualified, tables: definitions.lootTablesJava.size };
};

describeFamily(FAMILIES.lootDistribution, [REFERENCES.javaServerJar], () => {
    const { gaps, detail, results, qualified, tables } = compareDistributions();
    const verdict = checkAllowList(FAMILIES.lootDistribution, gaps);
    const tested = results.filter((result) => result.pValue !== undefined);

    it('rolls every predictable table into the distribution its own weights declare', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('takes the test to a real share of the corpus', () => {
        // 182 of the 1447 vanilla tables are a plain weighted choice, and 57 of those draw
        // between two or more items, which is what a chi-squared test has something to say
        // about. The rest are a single item rolled a declared number of times, and their roll
        // counts are still checked. A drop here means the qualifying rule or the corpus moved.
        expect(tables).toBe(1447);
        expect(qualified).toBe(175);
        expect(tested.length).toBe(54);
    });

    it('draws enough samples for the fit to mean something', () => {
        // The sample size is chosen per table so the rarest item is expected often enough to be
        // a cell of its own rather than merged away, and the whole row draws over a million
        // stacks. A fit that stood on a handful of draws could not tell a broken weight from
        // the luck of the draw.
        const capped = tested.filter((result) => result.rolls === MAXIMUM_ROLLS);
        for (const result of tested) {
            if (result.rolls === MAXIMUM_ROLLS) continue;
            expect(result.rarestExpected, result.id).toBeGreaterThanOrEqual(TARGET_RAREST_CELL - 1);
        }

        // Three tables hold an item rare enough that the target would need more rolls than the
        // cap allows; their rarest cells get merged, which is what the merge is there for.
        expect(capped.length).toBeLessThanOrEqual(5);
        expect(results.reduce((total, result) => total + result.draws, 0)).toBeGreaterThan(400_000);
    });

    it('spreads the p-values out instead of clustering them at one, which a stuck test would', () => {
        // A test that always returned 1 would pass the fit row without measuring anything. Over
        // fifty fair fits the p-values should land across the unit interval, so some of them
        // have to be unremarkable rather than perfect.
        const middling = tested.filter((result) => (result.pValue ?? 1) > 0.01 && (result.pValue ?? 1) < 0.99);

        expect(middling.length).toBeGreaterThanOrEqual(tested.length / 3);
    });
});
