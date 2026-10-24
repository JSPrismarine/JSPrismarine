import { entity_identifiers, item_table } from '@jsprismarine/bedrock-data';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { loadActorIdentifiers } from './goldens.ts';

const require = createRequire(import.meta.url);

/**
 * Checks the actor list the server advertises in `AvailableActorIdentifiersPacket`: the payload
 * on the wire is the golden byte for byte, every advertised type is well formed and distinct,
 * and every type the client gets a spawn egg for has that egg in the item registry - the one
 * cross-registry fact the current goldens can verify.
 *
 * Gap ids: `payload` when the shipped buffer differs from the golden, `duplicate-id:<name>`,
 * `namespace:<name>`, `spawn-egg:<name>` when the egg item is missing.
 */
const compareEntities = (): string[] => {
    const gaps: string[] = [];

    const bedrockDataRoot = dirname(require.resolve('@jsprismarine/bedrock-data/package.json'));
    const golden = readFileSync(join(bedrockDataRoot, 'src/resources/entity_identifiers.dat'));
    if (!entity_identifiers.equals(golden)) gaps.push('payload');

    const identifiers = loadActorIdentifiers();
    const seen = new Set<string>();
    for (const { id } of identifiers) {
        if (seen.has(id)) gaps.push(`duplicate-id:${id}`);
        seen.add(id);
        if (!id.startsWith('minecraft:')) gaps.push(`namespace:${id}`);
    }

    for (const { id, hasSpawnEgg } of identifiers) {
        if (hasSpawnEgg && !(`${id}_spawn_egg` in item_table)) gaps.push(`spawn-egg:${id}`);
    }

    return gaps;
};

describe(FAMILIES.registryEntities, () => {
    const verdict = checkAllowList(FAMILIES.registryEntities, compareEntities());

    it('advertises the golden actor list, well formed, with an egg item per egg-spawnable type', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('advertises a plausible vanilla actor count', () => {
        // 1.26.50 advertises 136 actor types. A shrunk list is a capture or generation defect,
        // not a smaller game.
        expect(loadActorIdentifiers().length).toBeGreaterThanOrEqual(130);
    });
});
