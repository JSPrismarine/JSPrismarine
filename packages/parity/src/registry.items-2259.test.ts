import { item_table as item_table_2259 } from '@jsprismarine/bedrock-data/v2259';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { loadRequiredItemListAt } from './goldens.ts';
import { itemRegistrySentAt } from './itemRegistrySent.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';

/**
 * The Minecraft Preview protocol 2259 item table against the Bedrock Dedicated Server
 * 1.26.70.24 capture it is built from, and what a session speaking 2259 is sent.
 *
 * The family follows the preview: when the next preview or the 1.26.70 release replaces 2259,
 * this file moves to that version.
 */
describe(FAMILIES.registryItems2259, () => {
    const capture = loadRequiredItemListAt(2259);

    it('ships every item of the 1.26.70.24 capture, on the id and flag the capture recorded', () => {
        reportParityCases(
            FAMILIES.registryItems2259,
            import.meta.filename,
            [...new Set([...Object.keys(capture), ...Object.keys(item_table_2259)])].map((name) => {
                const expected = capture[name];
                const actual = item_table_2259[name];
                return parityCase(
                    `capture:${name}`,
                    name,
                    'Bedrock 1.26.70.24 item registry runtime id and component flag',
                    expected !== undefined &&
                        actual !== undefined &&
                        actual.runtime_id === expected.runtime_id &&
                        actual.component_based === expected.component_based &&
                        Number.isInteger(actual.version)
                );
            })
        );

        expect(Object.keys(item_table_2259).sort()).toEqual(Object.keys(capture).sort());
        for (const [name, entry] of Object.entries(capture)) {
            expect(item_table_2259[name]?.runtime_id, name).toBe(entry.runtime_id);
            expect(item_table_2259[name]?.component_based, name).toBe(entry.component_based);
            expect(Number.isInteger(item_table_2259[name]?.version), name).toBe(true);
        }
    });

    it('sends a 2259 session the numbering vanilla 1.26.70.24 sends', () => {
        const sent = itemRegistrySentAt(2259);
        reportParityCases(
            FAMILIES.registryItems2259,
            import.meta.filename,
            [...new Set([...Object.keys(capture), ...sent.keys()])].map((name) =>
                parityCase(
                    `sent:2259:${name}`,
                    name,
                    'ItemRegistryPacket item runtime id · protocol 2259',
                    sent.get(name) === capture[name]?.runtime_id
                )
            )
        );

        expect([...sent.keys()].sort()).toEqual(Object.keys(capture).sort());
        for (const [name, entry] of Object.entries(capture)) expect(sent.get(name), name).toBe(entry.runtime_id);
    });
});
