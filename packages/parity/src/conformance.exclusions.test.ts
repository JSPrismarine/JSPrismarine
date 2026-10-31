import { REGISTRY_LOSSES } from '@jsprismarine/mapping/lossList';
import { describe, expect, it } from 'vitest';

import { readRepoFile } from './classification.ts';
import { FAMILIES } from './families.ts';

/**
 * The second of the two tests plan section 8 asks for: one negative check per excluded
 * category, asserting the project does not claim it.
 *
 * A claim lives in prose, so the first check per category is that the exclusion is still
 * written down wherever the claim is published. Deleting an exclusion is how a project starts
 * claiming something, and that is what these catch. Four categories also leave a mark in the
 * code, and those get a second check against the thing itself rather than against the prose.
 */

/** Where the claim is published, and so where every exclusion has to appear. */
const CLAIM_PAGES = ['docs/research/edition-behavior-differences.md', 'docs/data-driven/parity.md'] as const;

/**
 * The eight categories section 14 of the research note excludes by name, each with a phrase
 * that has to survive in the published claim for the exclusion to still be stated.
 */
const EXCLUDED = [
    { category: 'rendered presentation', phrase: 'Rendered presentation' },
    { category: 'input handling and pose selection', phrase: 'Input handling and pose selection' },
    { category: 'client-predicted simulation', phrase: 'Client-predicted simulation' },
    { category: 'fixed client registries', phrase: 'Fixed client registries' },
    { category: 'geometry the client owns', phrase: 'Geometry the client owns' },
    { category: 'world generation past the first random draw', phrase: 'World generation' },
    { category: 'the spawn and cap model', phrase: 'pawn and cap model' },
    { category: 'behavior Mojang closed as working as intended', phrase: 'Mojang closed as' }
] as const;

describe(FAMILIES.conformanceExclusions, () => {
    it.each(EXCLUDED)('the published claim still excludes $category', ({ phrase }) => {
        for (const page of CLAIM_PAGES) {
            expect(readRepoFile(page), `${page} no longer names this exclusion`).toContain(phrase);
        }
    });

    it('the claim page names all eight exclusions, not a shorter list', () => {
        const page = readRepoFile('docs/data-driven/parity.md');

        expect(page).toContain('eight categories');
        for (let position = 1; position <= EXCLUDED.length; position++) {
            expect(page, `the numbered exclusion list should reach ${position}`).toContain(`${position}. **`);
        }
        expect(page, 'the list should stop at eight').not.toContain(`${EXCLUDED.length + 1}. **`);
    });

    it('does not claim fixed client registries: an enchantment with no Bedrock id stays a loss', () => {
        // Sweeping Edge is the one vanilla Java enchantment the Bedrock client has no name for.
        // The mapping records it as a loss with no fallback rather than inventing an id, which
        // is what claiming the category would look like.
        const sweepingEdge = REGISTRY_LOSSES.find((loss) => loss.javaId === 'minecraft:sweeping_edge');

        expect(sweepingEdge).toBeDefined();
        expect(sweepingEdge).not.toHaveProperty('bedrockFallback');
    });

    it('does not claim the spawn and cap model: the table separates the Java radius from project choices', () => {
        // Claiming the category would mean asserting Java's cap and rate values. The table
        // distinguishes the Java minimum distance from the values this project chose.
        const table = readRepoFile('packages/spawning/src/tables/spawnConstants.json');

        expect(table).toContain('Mojang publishes no spawn attempt rate');
        expect(table).toContain('"minimumSpawnDistance": 24');
        expect(table).toContain("The other values are this project's choices");
    });

    it('does not claim bit parity, which world generation past the first draw would need', () => {
        const page = readRepoFile('docs/data-driven/parity.md');

        expect(page).toContain('the project does not claim it');
        expect(page).toContain('Only reachable where no random number is');
    });

    it('does not claim client-predicted simulation: no family measures a client-decided domain', () => {
        // A family group names a domain the suite measures. None of them is a client-decided
        // one, and adding one would be the moment the project started claiming the category.
        const clientOwned = ['render', 'input', 'physics', 'hitbox', 'hud'];
        const groups = Object.values(FAMILIES).map((family) => family.slice(0, family.indexOf('.')));

        expect(groups.filter((group) => clientOwned.includes(group))).toEqual([]);
    });
});
