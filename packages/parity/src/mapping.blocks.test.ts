import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadBlockPaletteCapture, loadJavaBlockProperties } from './goldens.ts';
import { javaStateCounts, loadJavaBlockStates } from './javaBlockStates.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Chunker's totality property for the block domain, run against the Java 26.3 jar dump rather
 * than against the mapping table alone. The dump is the independent count of what Java's block
 * registry holds, so a table that lost a block or an axis shows up here.
 *
 * Gap ids: `missing-java-block:<java id>` for a dumped block the table does not know,
 * `state-count:<java id>` where the two disagree on how many states a block has,
 * `unknown:<java id>` for a state that does not map, `loss:<java id>` for a reviewed loss,
 * `merge:<bedrock id>` for a Bedrock identifier more than one Java block reaches, and
 * `unknown-bedrock:<bedrock id>` for an output the palette capture does not contain.
 */
const compareBlockMapping = (): { gaps: string[]; states: number } => {
    const palette = loadBlockPaletteCapture();
    const dump = loadJavaBlockProperties();
    const counts = javaStateCounts();
    const gaps = new Set<string>();

    for (const [javaId, row] of Object.entries(dump)) {
        const mapped = counts.get(javaId);
        if (mapped === undefined) gaps.add(`missing-java-block:${javaId}`);
        else if (mapped !== row.stateCount) gaps.add(`state-count:${javaId}`);
    }

    const javaByBedrock = new Map<string, Set<string>>();
    let states = 0;
    for (const { javaId, values } of loadJavaBlockStates()) {
        states += 1;
        const result = javaBlockStateToBedrock(javaId, values);
        if (result.kind === 'unknown') {
            gaps.add(`unknown:${javaId}`);
            continue;
        }
        if (result.kind === 'loss') gaps.add(`loss:${javaId}`);

        const bedrockId = result.bedrock.name;
        // A reviewed loss falls back to `minecraft:unknown`, which the palette does carry; the
        // loss row is what records it, so only an unmapped output is a palette gap.
        if (result.kind !== 'loss' && !(bedrockId in palette.states)) gaps.add(`unknown-bedrock:${bedrockId}`);

        const sources = javaByBedrock.get(bedrockId);
        if (sources) sources.add(javaId);
        else javaByBedrock.set(bedrockId, new Set([javaId]));
    }

    for (const [bedrockId, sources] of javaByBedrock) {
        if (sources.size > 1) gaps.add(`merge:${bedrockId}`);
    }

    return { gaps: [...gaps], states };
};

describeFamily(FAMILIES.mappingBlocks, [REFERENCES.javaBlockProperties], () => {
    const { gaps, states } = compareBlockMapping();
    const verdict = checkAllowList(FAMILIES.mappingBlocks, gaps);

    it('maps every Java block state onto a Bedrock palette state the capture contains', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('walks the whole Java block registry, not a subset of it', () => {
        const dumped = Object.values(loadJavaBlockProperties()).reduce((sum, row) => sum + row.stateCount, 0);

        expect(states).toBe(dumped);
    });
});
