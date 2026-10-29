import { javaItemToBedrock } from '@jsprismarine/mapping';
import { compileRecipeBook, loadRecipes } from '@jsprismarine/recipes';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadVanillaDatapack } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

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
const compareRecipes = (): { gaps: string[]; files: number; compiled: number; detail: string[] } => {
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

    return { gaps: [...new Set(gaps)], files: definitions.recipesJava.size, compiled: report.recipes.length, detail };
};

describeFamily(
    FAMILIES.recipesRegistry,
    [REFERENCES.javaServerJar],
    () => {
        const { gaps, files, compiled, detail } = compareRecipes();
        const verdict = checkAllowList(FAMILIES.recipesRegistry, gaps);

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
    },
    { tags: ['real-data'] }
);
