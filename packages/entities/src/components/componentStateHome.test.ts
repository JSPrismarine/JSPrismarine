import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Component state belongs in `EntityInstance.componentState`, where a host can save, restore and
 * undo it. A map keyed by the entity hides it from all three, so this test fails on a new one.
 */

/** The per-entity maps that hold no simulation state, and why each may stay. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
    // Caches of the active component's filter parameters, rebuilt by `onInitialize`.
    'combat.ts': ['attackExceptions', 'angryAttackFilters'],
    // Reports unsupported fields once per entity; a diagnostic, not simulation.
    'interactions.ts': ['reported']
};

const PER_ENTITY = /(?:const|let)\s+(\w+)\s*=\s*new\s+(?:Weak)?(?:Map|Set)<EntityInstance\b/g;

const directory = new URL('.', import.meta.url);

describe('component state home', () => {
    it('keeps no per-entity map in a component module beyond the allowed caches', () => {
        const found: Record<string, string[]> = {};
        for (const file of readdirSync(directory)) {
            if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
            const names = [...readFileSync(new URL(file, directory), 'utf8').matchAll(PER_ENTITY)].map(
                (match) => match[1] ?? ''
            );
            if (names.length > 0) found[file] = names;
        }

        expect(found).toEqual(ALLOWED);
    });
});
