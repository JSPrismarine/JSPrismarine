import { expect, it } from 'vitest';

import { measureScenarioScope, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import type { BehaviorScenario, ScenarioGroup } from './behaviorScenarios.ts';
import { entityAspects } from './entityScenarios/aspects.ts';
import { coreScenarios } from './entityScenarios/core.ts';
import { interactionScenarios } from './entityScenarios/interaction.ts';
import { mobGoalScenarios } from './entityScenarios/mobGoals.ts';
import { engineScenarios } from './entityScenarios/engine.ts';
import { finishingScenarios } from './entityScenarios/finishing.ts';
import { physicsScenarios } from './entityScenarios/physics.ts';
import { damageScenarios } from './entityScenarios/damage.ts';
import { sensesScenarios } from './entityScenarios/senses.ts';
import { goalScenarios } from './entityScenarios/goals.ts';
import { lifecycleScenarios } from './entityScenarios/lifecycle.ts';
import { lootScenarios } from './entityScenarios/loot.ts';
import { spawnAgeScenarios, spawnScenarios } from './entityScenarios/spawning.ts';
import { statsScenarios } from './entityScenarios/stats.ts';
import { javaEntityIds } from './entityScenarios/subjects.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/** One theme's scenarios: its name, the names of its scenarios and the group that runs them. */
interface EntityTheme {
    readonly name: string;
    readonly scenarios: ReadonlySet<string>;
    readonly group: ScenarioGroup;
}

const theme = <Subject>(name: string, scenarios: readonly BehaviorScenario<Subject>[]): EntityTheme => ({
    name,
    scenarios: new Set(scenarios.map((scenario) => scenario.name)),
    group: scenarioGroup(scenarios)
});

/**
 * Every entity scenario theme. Each theme keeps its scenarios in its own module under
 * `entityScenarios/`; add a theme here.
 */
const ENTITY_THEMES: readonly EntityTheme[] = [
    theme('spawning', spawnScenarios),
    theme('spawnAge', spawnAgeScenarios),
    theme('core', coreScenarios),
    theme('interaction', interactionScenarios),
    theme('mobGoals', mobGoalScenarios),
    theme('engine', engineScenarios),
    theme('physics', physicsScenarios),
    theme('damage', damageScenarios),
    theme('senses', sensesScenarios),
    theme('goals', goalScenarios),
    theme('stats', statsScenarios),
    theme('lifecycle', lifecycleScenarios),
    theme('loot', lootScenarios),
    theme('finishing', finishingScenarios)
];

/**
 * The themes `PARITY_ENTITY_THEMES` names, comma-separated, or undefined to run them all. A run
 * of some themes checks and rewrites only their rows of the gap baseline, so one theme can be
 * iterated on without running the whole family; its coverage rows count the other themes' aspects
 * as not measured, so only a run of every theme measures the family.
 */
const selectedThemes = (): readonly EntityTheme[] | undefined => {
    const names = process.env.PARITY_ENTITY_THEMES?.split(',').map((name) => name.trim());
    if (names === undefined || names.every((name) => name === '')) return undefined;
    const unknown = names.filter((name) => !ENTITY_THEMES.some((entry) => entry.name === name));
    if (unknown.length > 0)
        throw new Error(
            `PARITY_ENTITY_THEMES names ${unknown.join(', ')}; the themes are ${ENTITY_THEMES.map((entry) => entry.name).join(', ')}`
        );
    return ENTITY_THEMES.filter((entry) => names.includes(entry.name));
};

describeFamily(
    FAMILIES.entitiesBehavior,
    [
        REFERENCES.javaEntityRegistry,
        REFERENCES.bedrockBehaviorPack,
        REFERENCES.javaWorldgenData,
        REFERENCES.javaServerJar
    ],
    () => {
        // Every theme's scenarios run in this one test, and the loot theme builds a second content
        // stack for a random source that varies, so the budget covers several stack builds.
        it('exercises each Java entity behavior against the server runtime', { timeout: 900_000 }, () => {
            const selected = selectedThemes();
            const themes = selected ?? ENTITY_THEMES;
            const rows = measureScenarioScope(
                FAMILIES.entitiesBehavior,
                import.meta.filename,
                selected === undefined ? undefined : new Set(selected.flatMap((entry) => [...entry.scenarios])),
                themes.map((entry) => entry.group)
            );

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
