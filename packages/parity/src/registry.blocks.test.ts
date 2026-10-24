import { blockSchemas } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { loadBlockPaletteCapture } from './goldens.ts';

/**
 * Compares the block catalog the server ships (`blockSchemas`, generated from the capture by
 * `packages/minecraft/datagen/generate-blocks.js`) against the capture golden itself. The
 * generator deduces each schema from observed states, so this catches a generator that drops a
 * block, a property or a value, and a golden refresh the generator was not rerun for.
 *
 * Gap ids: `missing-block:<name>`, `extra-block:<name>`, `states:<name>` for a property-set
 * mismatch, `domain:<name>#<property>` for a value-set mismatch.
 */
const compareBlocks = (): string[] => {
    const capture = loadBlockPaletteCapture();
    const gaps: string[] = [];

    const captureNames = new Set(Object.keys(capture.states));
    const ourNames = new Set(Object.keys(blockSchemas.blocks));

    for (const name of captureNames) if (!ourNames.has(name)) gaps.push(`missing-block:${name}`);
    for (const name of ourNames) if (!captureNames.has(name)) gaps.push(`extra-block:${name}`);

    for (const name of captureNames) {
        const schema = blockSchemas.blocks[name];
        if (!schema) continue;

        const captureProperties = Object.keys(capture.states[name]!).sort();
        const ourProperties = Object.keys(schema.properties).sort();
        if (captureProperties.join() !== ourProperties.join()) {
            gaps.push(`states:${name}`);
            continue;
        }

        for (const property of captureProperties) {
            // The capture records byte properties as booleans; the schema writes them as 0/1.
            const asWire = (value: string | number | boolean) => (typeof value === 'boolean' ? Number(value) : value);

            const domain = (capture.domains[name]?.[property]?.values ?? []).map(asWire).sort();
            const values = [...schema.properties[property]!.values].map(asWire).sort();
            if (JSON.stringify(domain) !== JSON.stringify(values)) gaps.push(`domain:${name}#${property}`);
        }
    }

    return gaps;
};

describe(FAMILIES.registryBlocks, () => {
    const verdict = checkAllowList(FAMILIES.registryBlocks, compareBlocks());

    it('ships every block, property and value the palette capture contains', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });
});
