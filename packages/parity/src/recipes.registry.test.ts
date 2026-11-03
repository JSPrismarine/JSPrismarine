import { javaItemToBedrock } from '@jsprismarine/mapping';
import { compileRecipeBook, loadRecipes, matchRecipe, recipeIngredients } from '@jsprismarine/recipes';
import type { CraftingGrid, RecipeInput } from '@jsprismarine/recipes';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadVanillaDatapack } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Reads the JSON out of one pack registry entry.
 *
 * The loader wraps each file in a record naming its pack and path, and no Java recipe file has
 * a top-level `data` key of its own, so the two never collide.
 */
const packFileJson = (entry: unknown): unknown =>
    typeof entry === 'object' && entry !== null && 'data' in entry ? (entry as { data: unknown }).data : entry;

/**
 * Phase 2's recipe exit criterion, by recipe id: every one of Java's vanilla recipe files
 * parses, and compiles through the mapping into Bedrock items a client can be shown.
 *
 * Gap ids: `parse:<recipe id>` for a file the parser could not read, `dropped:<recipe id>`
 * for one the compiler could not translate because an ingredient or result has no Bedrock
 * item, and `loss:<recipe id>` for one that compiled with a reviewed item loss in it.
 */
interface RecipeParityCase {
    readonly id: string;
    readonly gaps: string[];
}

const compareRecipes = () => {
    const { definitions } = loadVanillaDatapack();
    const { book, failed } = loadRecipes(
        [...definitions.recipesJava].map(([id, entry]) => [id, packFileJson(entry)] as const)
    );
    const report = compileRecipeBook(book, javaItemToBedrock);

    const gaps = [
        ...failed.map((id) => `parse:${id}`),
        ...report.dropped.map((entry) => `dropped:${entry.recipeId}`),
        ...report.losses.map((loss) => `loss:${loss.recipeId}`)
    ];
    const detail = report.dropped.slice(0, 20).map((entry) => `${entry.recipeId}: no Bedrock item for ${entry.javaId}`);
    const caseMap = new Map<string, RecipeParityCase>(
        [...definitions.recipesJava.keys()].map((id) => [id, { id, gaps: [] }])
    );
    for (const id of failed) caseMap.get(id)?.gaps.push(`parse:${id}`);
    for (const entry of report.dropped) caseMap.get(entry.recipeId)?.gaps.push(`dropped:${entry.recipeId}`);
    for (const loss of report.losses) caseMap.get(loss.recipeId)?.gaps.push(`loss:${loss.recipeId}`);

    return {
        book,
        gaps: [...new Set(gaps)],
        files: definitions.recipesJava.size,
        compiled: report.recipes.length,
        detail,
        cases: [...caseMap.values()]
    };
};

describeFamily(
    FAMILIES.recipesRegistry,
    [REFERENCES.javaServerJar],
    () => {
        const { book, gaps, files, compiled, detail, cases } = compareRecipes();
        const verdict = checkAllowList(FAMILIES.recipesRegistry, gaps);
        const unexpected = new Set(verdict.unexpected);

        reportParityCases(
            FAMILIES.recipesRegistry,
            import.meta.filename,
            cases.map(({ id, gaps: caseGaps }) => ({
                id,
                title: id,
                context: 'Java recipe parse and Bedrock recipe-book compilation',
                status: caseGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
                ...(caseGaps.length === 0 ? {} : { details: caseGaps.join(', ') })
            }))
        );

        it('reads and compiles every vanilla recipe by id', () => {
            expect(verdict.unexpected, detail.join('\n')).toEqual([]);
        });

        it('carries no stale allow-list entry', () => {
            expect(verdict.stale).toEqual([]);
        });

        it('reports the current recipe comparison coverage', () => {
            reportParityProgress(FAMILIES.recipesRegistry, { sourceFiles: files, compiledRecipes: compiled });
            expect(compiled).toBeGreaterThan(0);
        });

        it('keeps first and all matches in registry order for generated vanilla grids', () => {
            const itemIds = [
                ...new Set(
                    book
                        .byStation('crafting')
                        .flatMap((recipe) =>
                            recipeIngredients(recipe).flatMap((ingredient) =>
                                ingredient === null ? [] : ingredient.items
                            )
                        )
                )
            ];
            expect(itemIds.length).toBeGreaterThan(0);

            // A seeded generator varies the crafting grids while keeping failures reproducible.
            let randomState = 0x2812;
            const random = (): number => {
                randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
                return randomState;
            };
            for (let sample = 0; sample < 128; sample++) {
                const width = 1 + (random() % 3);
                const height = 1 + (random() % 3);
                const slots = Array.from({ length: width * height }, () => {
                    if (random() % 4 === 0) return null;
                    return { id: itemIds[random() % itemIds.length] ?? 'minecraft:stone', count: 1 };
                });
                const input: RecipeInput = {
                    station: 'crafting',
                    grid: { width, height, slots } satisfies CraftingGrid
                };
                const expected = book.byStation('crafting').flatMap((recipe) => {
                    const match = matchRecipe(recipe, input);
                    return match === undefined ? [] : [match];
                });

                expect(book.match(input)).toEqual(expected[0]);
                expect(book.matchAll(input)).toEqual(expected);
            }
        });
    },
    { tags: ['real-data'] }
);
