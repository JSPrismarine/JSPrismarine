import { expect, it } from 'vitest';

import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import type { ScenarioGroup } from './behaviorScenarios.ts';
import { entityAspects } from './entityScenarios/aspects.ts';
import { coreScenarios } from './entityScenarios/core.ts';
import { interactionScenarios } from './entityScenarios/interaction.ts';
import { spawnScenarios } from './entityScenarios/spawning.ts';
import { javaEntityIds } from './entityScenarios/subjects.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Every entity scenario group. Each theme keeps its scenarios in its own module under
 * `entityScenarios/`; add a theme's group here.
 */
const ENTITY_SCENARIO_GROUPS: readonly ScenarioGroup[] = [
    scenarioGroup(spawnScenarios),
    scenarioGroup(coreScenarios),
    scenarioGroup(interactionScenarios)
];

describeFamily(
    FAMILIES.entitiesBehavior,
    [REFERENCES.javaEntityRegistry, REFERENCES.bedrockBehaviorPack, REFERENCES.javaWorldgenData],
    () => {
        it('exercises each Java entity behavior against the server runtime', { timeout: 180_000 }, () => {
            const rows = [
                ...measureScenarios(FAMILIES.entitiesBehavior, import.meta.filename, ...ENTITY_SCENARIO_GROUPS)
            ];

            reportCoverage(
                FAMILIES.entitiesBehavior,
                import.meta.filename,
                javaEntityIds(),
                rows,
                (identifier) =>
                    identifier === 'minecraft:villager'
                        ? 'Villager profession and job-site behavior, trade restocking, player gossip, farming, and village or raid lifecycle are not compared with Java.'
                        : "No scenario compares this entity's Java AI, movement, combat or lifecycle behavior with the server.",
                entityAspects
            );
            expect(rows.length).toBeGreaterThan(0);
        });
    }
);
