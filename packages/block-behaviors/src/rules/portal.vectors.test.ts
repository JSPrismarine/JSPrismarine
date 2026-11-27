import { describe, expect, it } from 'vitest';

import vectors from '../../vectors/26.3/portal-creation.json' with { type: 'json' };
import { portalBlockRuleDifferences, replayPortalVector } from './portalVectors';

/**
 * `portalCreationSite` and `writeNetherPortal` against Java's `PortalForcer.createPortal`, run by
 * `utils/oracle/DumpPortalVectors.java` in the layouts `vectors/26.3/portal-creation.json`
 * records.
 */

/**
 * The layouts the port still gets wrong, each with its issue. A fix makes the layout match and
 * fails this test until its entry goes.
 */
const KNOWN_GAPS: Readonly<Record<string, string>> = {
    // The port's floor test is `isSolidSupport`, which says no to a cobweb where Java's
    // `BlockState.isSolid` says yes.
    'cobweb-cave': '#3784'
};

/** The block rules the port answers differently from Java, each with its issue. */
const KNOWN_RULE_GAPS: Readonly<Record<string, string>> = {
    'minecraft:cobweb#isSolid': '#3784',
    'minecraft:nether_portal#isSolid': '#3784'
};

/** Java clears room above a forced portal's platform, and writes no air anywhere else. */
const isForced = (vector: (typeof vectors.cases)[number]): boolean =>
    vector.writes.some((write) => write.block === 'minecraft:air');

describe('portal creation against Java vectors', () => {
    it('covers found and forced portals, both axes, a border and a dimension too short to force one', () => {
        expect(vectors.javaVersion).toBe('26.3');
        expect(vectors.cases.some(isForced)).toBe(true);
        expect(vectors.cases.some((vector) => vector.origin !== null && !isForced(vector))).toBe(true);
        expect(vectors.cases.some((vector) => vector.origin === null)).toBe(true);
        expect(vectors.cases.some((vector) => 'border' in vector)).toBe(true);
        expect(new Set(vectors.cases.map((vector) => vector.axis))).toEqual(new Set(['x', 'z']));
    });

    it.each(vectors.cases.map((vector) => [vector.name, vector] as const))(
        'builds where Java builds, and writes what Java writes, in %s',
        (name, vector) => {
            const replay = replayPortalVector(vector, vectors.blockRules);
            if (KNOWN_GAPS[name] === undefined) expect(replay.differences).toEqual([]);
            else expect(replay.differences, `${name} matches Java; remove it from KNOWN_GAPS`).not.toEqual([]);
            // Bedrock puts four netherrack on each side of a forced portal's platform.
            expect(replay.netherrackFlanks).toHaveLength(isForced(vector) ? 8 : 0);
        }
    );

    it('classifies every block the layouts use as Java does', () => {
        expect(portalBlockRuleDifferences(vectors)).toEqual(Object.keys(KNOWN_RULE_GAPS));
    });
});
