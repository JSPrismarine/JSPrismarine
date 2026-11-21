import { JAVA_GAME_RULES } from '@jsprismarine/commands/gamerules';
import type { Difficulty } from '@jsprismarine/engine-systems';
import { pointsForNextLevel } from '@jsprismarine/prismarine/entity/Experience';
import { effectHealthChange } from '@jsprismarine/prismarine/entity/StatusEffectTick';
import { PlayerComponents } from '@jsprismarine/prismarine/entity/playerComponents';
import { hungerOutcome } from '@jsprismarine/prismarine/entity/playerHunger';
import type { SurvivalPlayer } from '@jsprismarine/prismarine/entity/survivalPlayer';
import { GameRules } from '@jsprismarine/prismarine/world/GameRuleManager';
import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { gameplayAspects, gameplayId, javaGameplayUniverse } from './javaGameplay.ts';
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
    covers: (rule) => gameplayId('game_rule', rule.id),
    aspects: () => ['registered'],
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

/** One gameplay identifier a scenario compares, such as `mechanic/hunger`. */
interface GameplaySubject {
    readonly id: string;
}

const subject = (kind: Parameters<typeof gameplayId>[0], id: string): GameplaySubject => ({ id: gameplayId(kind, id) });

/** A player double over real components, at a health and a food bar a scenario sets. */
const playerAt = (health: number, food: number, saturation: number): SurvivalPlayer => {
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    components.set('vitals.food', food);
    components.set('vitals.saturation', saturation);
    return { components, vulnerable: () => true, alive: () => true, health: () => health, maxHealth: () => 20 };
};

/** Java's `Player.getXpNeededForNextLevel`. */
const javaPointsForNextLevel = (level: number): number =>
    level >= 30 ? 112 + (level - 30) * 9 : level >= 15 ? 37 + (level - 15) * 5 : 7 + level * 2;

/** Java's health-changing effects and what their `applyEffectTick` does at an amplifier on a tick it applies. */
const JAVA_HEALTH_EFFECTS: Readonly<
    Record<string, { readonly interval?: number; readonly change: (amplifier: number, health: number) => number }>
> = {
    // InstantenousMobEffect: heal(max(4 << amplifier, 0)) and hurt(6 << amplifier).
    'minecraft:instant_health': { change: (amplifier) => Math.max(4 << amplifier, 0) },
    'minecraft:instant_damage': { change: (amplifier) => -(6 << amplifier) },
    // RegenerationMobEffect heals 1 every 50 >> amplifier ticks while hurt.
    'minecraft:regeneration': { interval: 50, change: (_, health) => (health < 20 ? 1 : 0) },
    // PoisonMobEffect hurts 1 every 25 >> amplifier ticks while above 1 health.
    'minecraft:poison': { interval: 25, change: (_, health) => (health > 1 ? -1 : 0) },
    // WitherMobEffect hurts 1 every 40 >> amplifier ticks.
    'minecraft:wither': { interval: 40, change: () => -1 }
};

const javaDifficulties: readonly Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];

const playerScenarios: readonly BehaviorScenario<GameplaySubject>[] = [
    {
        name: 'experience-curve',
        java: 'A level costs 2L + 7 points up to level 15, 5L - 38 up to 30 and 9L - 158 after.',
        reference: 'Java Player.getXpNeededForNextLevel',
        subjects: () => [subject('mechanic', 'experience-levels')],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            for (let level = 0; level <= 1000; level++) {
                const server = pointsForNextLevel(level);
                const java = javaPointsForNextLevel(level);
                if (server !== java) return `level ${level} costs ${server} points, Java ${java}`;
            }
            return undefined;
        }
    },
    {
        name: 'effect-health-tick',
        java: 'Instant health heals 4 << level, instant damage hurts 6 << level, and regeneration, poison and wither change health by 1 every 50, 25 and 40 ticks shifted right by the level.',
        reference:
            'Java InstantenousMobEffect, RegenerationMobEffect, PoisonMobEffect and WitherMobEffect applyEffectTick',
        subjects: () => Object.keys(JAVA_HEALTH_EFFECTS).map((id) => subject('mob_effect', id)),
        idOf: (entry) => entry.id,
        aspects: () => ['effect'],
        run: (entry) => {
            const id = entry.id.slice('mob_effect/'.length);
            const java = JAVA_HEALTH_EFFECTS[id];
            if (java === undefined) return 'no Java rule is recorded for this effect';
            for (let amplifier = 0; amplifier <= 4; amplifier++) {
                for (const health of [1, 10, 20]) {
                    for (let clock = 1; clock <= 100; clock++) {
                        const interval = java.interval === undefined ? 1 : java.interval >> amplifier;
                        const applies = interval <= 0 || clock % interval === 0;
                        const wanted = applies ? java.change(amplifier, health) : 0;
                        const change = effectHealthChange(id, amplifier, clock, health, 20);
                        const got = change === undefined ? 0 : change.kind === 'heal' ? change.amount : -change.amount;
                        if (got !== wanted) {
                            return `at level ${amplifier + 1}, health ${health} and tick ${clock} it changes health by ${got}, Java ${wanted}`;
                        }
                    }
                }
            }
            return undefined;
        }
    },
    {
        name: 'starvation-damage',
        java: 'An empty food bar hurts a player 1 every 80 ticks while above 10 health, or above 1 on Normal, or always on Hard.',
        reference: 'Java FoodData.tick',
        subjects: () => [subject('mechanic', 'starvation')],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            for (const difficulty of javaDifficulties) {
                for (let health = 1; health <= 20; health++) {
                    const java = health > 10 || difficulty === 'hard' || (health > 1 && difficulty === 'normal');
                    const outcome = hungerOutcome(playerAt(health, 0, 0), 80, true, difficulty);
                    const server = outcome?.kind === 'starve';
                    if (server !== java) {
                        return `at ${health} health on ${difficulty} it ${server ? 'starves' : 'spares'} the player, Java ${java ? 'starves' : 'spares'}`;
                    }
                }
            }
            return undefined;
        }
    },
    {
        name: 'saturated-regeneration',
        java: 'A hurt player with a full food bar and saturation left heals min(saturation, 6) / 6 every 10 ticks, and otherwise 1 every 80 ticks at 18 food or more.',
        reference: 'Java FoodData.tick',
        subjects: () => [subject('mechanic', 'natural-regeneration')],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        classify: () => ({
            kind: 'defect',
            reason: 'The server heals a well-fed player only on its 80-tick clock, so a full, saturated food bar heals eight times slower than in Java.',
            reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3512'
        }),
        run: () => {
            let healed = 0;
            for (let tick = 1; tick <= 80; tick++) {
                const outcome = hungerOutcome(playerAt(10, 20, 5), tick, true, 'normal');
                if (outcome?.kind === 'regenerate') healed += outcome.amount;
            }
            // Eight heals of 5 / 6 in Java's 80 ticks.
            const java = 8 * (5 / 6);
            return Math.abs(healed - java) < 1e-6
                ? undefined
                : `it heals ${healed} in 80 ticks, Java ${java.toFixed(2)}`;
        }
    }
];

describeFamily(
    FAMILIES.gameplayMechanics,
    [REFERENCES.javaWorldgenData, REFERENCES.bedrockBehaviorPack, REFERENCES.javaServerJar],
    () => {
        it('runs each Java game rule and villager profession on the server', { timeout: 180_000 }, () => {
            const rows = measureScenarios(
                FAMILIES.gameplayMechanics,
                import.meta.filename,
                scenarioGroup([gameRuleScenario]),
                scenarioGroup([professionScenario]),
                scenarioGroup(playerScenarios)
            );

            reportCoverage(
                FAMILIES.gameplayMechanics,
                import.meta.filename,
                javaGameplayUniverse(),
                rows,
                'No scenario compares this Java gameplay with the server.',
                gameplayAspects
            );

            expect(
                rows.some((row) => row.id === 'game-rule:minecraft:keep_inventory' && row.difference === undefined)
            ).toBe(true);
        });
    }
);
