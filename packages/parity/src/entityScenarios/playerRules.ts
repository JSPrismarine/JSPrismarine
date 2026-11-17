import { addExperiencePoints, pointsForNextLevel } from '@jsprismarine/prismarine/entity/Experience';
import type { ExperienceHolder } from '@jsprismarine/prismarine/entity/Experience';
import { PlayerComponents } from '@jsprismarine/prismarine/entity/playerComponents';
import { addExhaustion } from '@jsprismarine/prismarine/entity/playerHunger';
import type { SurvivalPlayer } from '@jsprismarine/prismarine/entity/survivalPlayer';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring } from './subjects.ts';

/**
 * The player's own numbers: its experience curve, its hunger and the phantoms its sleeplessness
 * calls. Each scenario runs the server's shared survival rules over a fresh survival player and
 * reads Java's side from the pinned jar.
 */

const PLAYER = 'net/minecraft/world/entity/player/Player';
const FOOD_DATA = 'net/minecraft/world/food/FoodData';

/** A fresh survival player as the shared survival rules read one, with 20 of 20 health. */
const survivalPlayer = (): SurvivalPlayer => ({
    components: new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => undefined),
    vulnerable: () => true,
    alive: () => true,
    health: () => 20,
    maxHealth: () => 20
});

/** One Java method's pushed numbers, or a throw naming it. */
const javaNumbers = (className: string, method: string): readonly number[] => {
    const found = javaMethodOf(className, method);
    if (found === undefined) throw new Error(`${className} has no ${method}`);
    return pushedNumbers(found.method);
};

/**
 * Java's `Player.getXpNeededForNextLevel`: `level >= 30 ? 112 + (level - 30) * 9 : level >= 15 ?
 * 37 + (level - 15) * 5 : 7 + level * 2`, with its numbers read from the jar in that order.
 */
const javaPointsForNextLevel = (): ((level: number) => number) => {
    const [high, highBase, , highStep, middle, middleBase, , middleStep, lowBase, lowStep] = javaNumbers(
        PLAYER,
        'getXpNeededForNextLevel'
    );
    if (
        [high, highBase, highStep, middle, middleBase, middleStep, lowBase, lowStep].some(
            (value) => value === undefined
        )
    )
        throw new Error('Player.getXpNeededForNextLevel pushes fewer numbers than its three segments');
    return (level) =>
        level >= (high ?? 0)
            ? (highBase ?? 0) + (level - (high ?? 0)) * (highStep ?? 0)
            : level >= (middle ?? 0)
              ? (middleBase ?? 0) + (level - (middle ?? 0)) * (middleStep ?? 0)
              : (lowBase ?? 0) + level * (lowStep ?? 0);
};

/** A plain experience holder, which the shared rule writes a level and a bar into. */
const holder = (): ExperienceHolder & { level: number; progress: number } => {
    const state = {
        level: 0,
        progress: 0,
        getLevel: () => state.level,
        getProgress: () => state.progress,
        setLevel: (level: number) => {
            state.level = level;
        },
        setProgress: (progress: number) => {
            state.progress = progress;
        }
    };
    return state;
};

/** The highest level the curve rows walk, past all three of Java's segments. */
const CURVE_LEVELS = 64;

/** The player as a subject, which every row here covers. */
const playerSubjects = (component: string): readonly EntitySubject[] =>
    entitiesDeclaring(component).filter((subject) => subject.javaId === 'minecraft:player');

/** The scenarios of the player's own numbers. */
export const playerRuleScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'player-experience-curve',
        java: "A player's next level costs Java's getXpNeededForNextLevel points, and points carry over into the levels they buy.",
        reference:
            'Java Player.getXpNeededForNextLevel (7 + 2 level, 37 + 5 (level - 15), 112 + 9 (level - 30)) and Player.giveExperiencePoints, read from the pinned jar',
        subjects: () => playerSubjects('minecraft:player.experience'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:player.experience', 'minecraft:player.level'],
        run: () => {
            const java = javaPointsForNextLevel();
            const differences: string[] = [];
            for (let level = 0; level <= CURVE_LEVELS; level += 1)
                if (pointsForNextLevel(level) !== java(level))
                    differences.push(
                        `level ${level} costs ${pointsForNextLevel(level)}, where Java's costs ${java(level)}`
                    );
            // Every point Java needs up to a level, then half of the next level's cost.
            const target = 40;
            let total = 0;
            for (let level = 0; level < target; level += 1) total += java(level);
            const half = Math.floor(java(target) / 2);
            const player = holder();
            addExperiencePoints(player, total + half);
            if (player.level !== target || Math.abs(player.progress - half / java(target)) > 1e-6)
                differences.push(
                    `${total + half} points leave it level ${player.level} at ${player.progress.toFixed(3)}, where Java's leave it level ${target} at ${(half / java(target)).toFixed(3)}`
                );
            return differences.length === 0 ? undefined : differences.slice(0, 4).join('; ');
        }
    },
    {
        name: 'player-hunger',
        java: "A fresh player has Java's 5 saturation; exhaustion is capped at 40 and spends 4 into saturation or food only once it is above 4, one step a tick.",
        reference:
            'Java FoodData.<init> (foodLevel 20, saturationLevel 5), FoodData.addExhaustion (min(exhaustion + amount, 40)) and FoodData.tick (exhaustionLevel > 4: take 4, then one saturation or one food), read from the pinned jar; issue #3190',
        subjects: () => playerSubjects('minecraft:player.exhaustion'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:player.exhaustion', 'minecraft:player.saturation'],
        run: () => {
            const cap = javaNumbers(FOOD_DATA, 'addExhaustion')[0];
            const threshold = javaNumbers(FOOD_DATA, 'tick')[0];
            const saturation = javaNumbers(FOOD_DATA, '<init>').find((value) => value > 0 && value < 20);
            if (cap === undefined || threshold === undefined || saturation === undefined)
                return "Java's FoodData no longer pushes its cap, its threshold and its starting saturation";
            const differences: string[] = [];
            const fresh = survivalPlayer();
            if (fresh.components.get('vitals.saturation') !== saturation)
                differences.push(
                    `a fresh player has ${fresh.components.get('vitals.saturation')} saturation, where Java's has ${saturation}`
                );
            const atThreshold = survivalPlayer();
            atThreshold.components.set('vitals.saturation', saturation);
            addExhaustion(atThreshold, threshold);
            if (atThreshold.components.get('vitals.saturation') !== saturation)
                differences.push(
                    `exhaustion of exactly ${threshold} spends saturation, where Java spends it only above ${threshold}`
                );
            const flooded = survivalPlayer();
            flooded.components.set('vitals.saturation', saturation);
            addExhaustion(flooded, 100);
            const food = flooded.components.get('vitals.food');
            const left = flooded.components.get('vitals.saturation');
            if (food !== 20 || left < saturation - 1)
                differences.push(
                    `100 exhaustion at once leaves ${left} saturation and ${food} food, where Java caps it at ${cap} and spends one step a tick`
                );
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
