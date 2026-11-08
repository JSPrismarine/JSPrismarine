import { VANILLA_BLOCK_FAMILIES, bindFamily } from '@jsprismarine/block-behaviors';
import type { FamilyHarness } from '@jsprismarine/block-behaviors';
import { behaviorFor } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import type { BehaviorScenario } from './behaviorScenarios.ts';
import { runScenarios, updatingBehaviorGaps, writeBehaviorGaps } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';
import { reportParityCases } from './trackerCases.ts';

/** A Java block with the Bedrock block and default states the server represents it with. */
interface BlockSubject {
    readonly javaId: string;
    readonly bedrock: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

const subjectOf = (javaId: string): BlockSubject | undefined => {
    const mapping = javaBlockStateToBedrock(javaId);
    if (mapping.kind !== 'mapped') return undefined;
    return { javaId, bedrock: mapping.bedrock.name, states: mapping.bedrock.states };
};

const tagMembers = (tag: string): readonly BlockSubject[] =>
    serverContent()
        .tags.members('block', tag)
        .flatMap((javaId) => subjectOf(javaId) ?? []);

const bind = (subject: BlockSubject, harnessWorld?: Parameters<typeof bindFamily>[2]): FamilyHarness => {
    const name = behaviorFor(subject.bedrock);
    const family = VANILLA_BLOCK_FAMILIES.find((candidate) => candidate.name === name);
    if (family === undefined) throw new Error(`no family registered as ${name}`);
    return bindFamily(family, subject.bedrock, harnessWorld);
};

const ORIGIN = { x: 0, y: 5, z: 0 } as const;

const scenarios: readonly BehaviorScenario<BlockSubject>[] = [
    {
        name: 'hand-toggle',
        java: 'A door, trapdoor or fence gate opens and closes when a player uses it with an empty hand; iron doors and trapdoors need redstone.',
        reference: 'Java DoorBlock, TrapDoorBlock and FenceGateBlock useWithoutItem',
        subjects: () => [
            ...tagMembers('minecraft:doors'),
            ...tagMembers('minecraft:trapdoors'),
            ...tagMembers('minecraft:fence_gates')
        ],
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            const handled = harness.interact(ORIGIN);
            const open = harness.dimension.stateAt(ORIGIN, 'open_bit') === true;
            const byHand = subject.javaId !== 'minecraft:iron_door' && subject.javaId !== 'minecraft:iron_trapdoor';
            if (byHand && !open) return `a bare hand did not open it (interact returned ${String(handled)})`;
            if (!byHand && open) return 'a bare hand opened an iron block';
            return undefined;
        }
    },
    {
        name: 'button-pulse',
        java: 'A button powers for 30 ticks (wood) or 20 ticks (stone) after a press, then releases.',
        reference: 'Java ButtonBlock ticksToStayPressed',
        subjects: () => tagMembers('minecraft:buttons'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.interact(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'button_pressed_bit') !== true) return 'pressing it did not power it';
            const wanted = subject.javaId.includes('stone') || subject.javaId.includes('blackstone') ? 20 : 30;
            const tick = harness.dimension.scheduled.at(-1);
            if (tick?.delay !== wanted)
                return `it scheduled its release after ${tick?.delay} ticks, Java uses ${wanted}`;
            harness.tick(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'button_pressed_bit') === true)
                return 'it stayed powered after its release tick';
            return undefined;
        }
    }
];

const REFERENCES_NEEDED = [
    REFERENCES.javaBlockRegistry,
    REFERENCES.bedrockBehaviorPack,
    REFERENCES.javaWorldgenData
] as const;

describeFamily(FAMILIES.blocksBehavior, REFERENCES_NEEDED, () => {
    it('exercises each Java block behavior against the server block families', { timeout: 180_000 }, () => {
        const rows = runScenarios(scenarios);
        const gaps = rows.filter((row) => row.difference !== undefined).map((row) => row.id);

        if (updatingBehaviorGaps()) {
            writeBehaviorGaps(
                FAMILIES.blocksBehavior,
                Object.fromEntries(
                    rows
                        .filter((row) => row.difference !== undefined)
                        .map((row) => {
                            const scenario = scenarios.find((candidate) => row.id.startsWith(`${candidate.name}:`));
                            return [
                                row.id,
                                {
                                    kind: scenario?.gapKind ?? 'defect',
                                    reason: `${scenario?.java ?? ''} Observed: ${row.difference}.`,
                                    reference: scenario?.reference ?? ''
                                }
                            ] as const;
                        })
                )
            );
        }

        reportParityCases(
            FAMILIES.blocksBehavior,
            import.meta.filename,
            rows.map((row) => ({
                id: row.id,
                title: row.title,
                context: row.context,
                status: row.difference === undefined ? 'passed' : 'failed',
                ...(row.difference === undefined ? {} : { details: row.difference })
            }))
        );

        expect(rows.length).toBeGreaterThan(0);
        if (!updatingBehaviorGaps()) {
            const verdict = checkAllowList(FAMILIES.blocksBehavior, gaps);
            expect(verdict.unexpected).toEqual([]);
            expect(verdict.stale).toEqual([]);
        }
    });
});
