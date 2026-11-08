import { JAVA_GAME_RULES } from '@jsprismarine/commands/gamerules';
import { GameRules } from '@jsprismarine/prismarine/world/GameRuleManager';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';

/** One Java mechanic named by a Java registry entry. */
interface Mechanic {
    readonly id: string;
    /** Bedrock's lowercase name for a game rule, when it has one. */
    readonly bedrockName?: string;
}

const REGISTERED_RULES: ReadonlySet<string> = new Set(Object.values(GameRules).map((name) => name.toLowerCase()));

/** Java's profession ids, which the Bedrock trade table files spell without the underscore Java does. */
const JAVA_PROFESSIONS = [
    'armorer',
    'butcher',
    'cartographer',
    'cleric',
    'farmer',
    'fisherman',
    'fletcher',
    'leatherworker',
    'librarian',
    'mason',
    'shepherd',
    'toolsmith',
    'weaponsmith'
] as const;

const normalized = (name: string): string => name.replaceAll('_', '').toLowerCase();

const gameRuleScenario: BehaviorScenario<Mechanic> = {
    name: 'game-rule',
    java: "Every game rule in Java's registry is a rule the server runs, where Bedrock has one.",
    reference: 'Java 26.3 minecraft:game_rule registry and packages/commands/src/gamerules.ts',
    subjects: () =>
        JAVA_GAME_RULES.map((rule) => ({
            id: rule.name,
            ...(rule.bedrockName === undefined ? {} : { bedrockName: rule.bedrockName })
        })),
    idOf: (rule) => rule.id,
    covers: () => undefined,
    classify: (rule) =>
        rule.bedrockName === undefined
            ? {
                  kind: 'intentional',
                  reason: 'Bedrock has no counterpart for this Java rule, so the client has no setting to show for it.'
              }
            : undefined,
    run: (rule) =>
        rule.bedrockName === undefined
            ? 'Bedrock has no counterpart rule'
            : REGISTERED_RULES.has(rule.bedrockName.toLowerCase())
              ? undefined
              : `Bedrock's ${rule.bedrockName} rule is not one the server registers`
};

const professionScenario: BehaviorScenario<Mechanic> = {
    name: 'villager-profession-trades',
    java: 'Every Java villager profession that trades has a trade table on the server.',
    reference: 'Java 26.3 minecraft:villager_profession registry; Bedrock trading/*_trades.json',
    subjects: () => JAVA_PROFESSIONS.map((id) => ({ id: `minecraft:${id}` })),
    idOf: (profession) => profession.id,
    covers: () => undefined,
    run: (profession) => {
        const wanted = normalized(profession.id.replace('minecraft:', ''));
        const tables = [...serverContent().definitions.tradeTables.keys()].map((path) =>
            normalized(path.replace(/^.*\//, '').replace(/_trades\.json$/, ''))
        );
        return tables.includes(wanted) ? undefined : `no trade table is named for the ${profession.id} profession`;
    }
};

describeFamily(FAMILIES.gameplayMechanics, [REFERENCES.javaWorldgenData, REFERENCES.bedrockBehaviorPack], () => {
    it('runs each Java game rule and villager profession on the server', { timeout: 180_000 }, () => {
        const rows = measureScenarios(
            FAMILIES.gameplayMechanics,
            import.meta.filename,
            scenarioGroup([gameRuleScenario]),
            scenarioGroup([professionScenario])
        );

        expect(
            rows.some((row) => row.id === 'game-rule:minecraft:keep_inventory' && row.difference === undefined)
        ).toBe(true);
    });
});
