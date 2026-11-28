/**
 * The `scoreboard_criterion` rows of the `gameplay.mechanics` family: every criterion Java's
 * `/scoreboard objectives add` takes, and whether the server raises a player's score for it as
 * Java does. A statistic type over a registry, such as `minecraft.mined`, is one row, played with
 * one of its entries.
 */
import { CUSTOM_CRITERION_NAMES, statisticCriterionName } from '@jsprismarine/commands/criteria';
import type { StoreActor } from '@jsprismarine/prismarine/entity/data/storeActors';
import { PlayerComponents } from '@jsprismarine/prismarine/entity/playerComponents';
import type PlayerSession from '@jsprismarine/prismarine/player/PlayerSession';
import type SessionManager from '@jsprismarine/prismarine/SessionManager';
import { scoreDeath, tickPlayerScores } from '@jsprismarine/prismarine/player/playerScores';
import type { SessionPlayer } from '@jsprismarine/prismarine/player/sessionPlayers';
import type { Level } from '@jsprismarine/prismarine/world/Level';
import { Scoreboard } from '@jsprismarine/prismarine/world/Scoreboard';
import type { World } from '@jsprismarine/prismarine/world/World';
import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { CUSTOM_STATS, STAT_TYPES } from '@jsprismarine/protocol/java/versions/newest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { gameplayId } from './javaGameplay.ts';

/** The issue that tracks the criteria the server does not raise yet. */
const GAP_ISSUE = 'issue #3866';

/** The entry each registry statistic type is played with, which a player's play here reaches. */
const SAMPLE_ENTRIES: Readonly<Record<string, string>> = {
    'minecraft:mined': 'minecraft:stone',
    'minecraft:crafted': 'minecraft:stick',
    'minecraft:used': 'minecraft:stone',
    'minecraft:broken': 'minecraft:wooden_pickaxe',
    'minecraft:picked_up': 'minecraft:stone',
    'minecraft:dropped': 'minecraft:stone',
    'minecraft:killed': 'minecraft:zombie',
    'minecraft:killed_by': 'minecraft:player'
};

/** A registry statistic type's row name, such as `minecraft.mined:*`. */
const wildcard = (type: string): string => `${type.replace(':', '.')}:*`;

/**
 * Every criterion row: Java's custom criteria, each custom statistic, and each registry
 * statistic type.
 */
export const scoreboardCriterionRows = (): readonly string[] => [
    ...CUSTOM_CRITERION_NAMES,
    ...CUSTOM_STATS.entries.map((stat) => statisticCriterionName('minecraft:custom', stat)),
    ...STAT_TYPES.entries.filter((type) => type !== 'minecraft:custom').map(wildcard)
];

/** The criterion a row plays: its own name, or a registry type's sample entry. */
const criterionOf = (row: string): string => {
    const type = STAT_TYPES.entries.find((each) => wildcard(each) === row);
    if (type === undefined) return row;
    const sample = SAMPLE_ENTRIES[type];
    return sample === undefined ? row : statisticCriterionName(type, sample);
};

/** A double whose members are the given ones, for the few a scoring call reads. */
const double = <T extends object>(members: Partial<T>): T => Object.assign(Object.create(Object.prototype), members);

/** A player named `name` on a level whose scoreboard is `board`, sneaking, awake and hurt. */
const playerOn = (board: Scoreboard, name: string): { session: PlayerSession; actor: StoreActor } => {
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    components.set('vitals.food', 6);
    components.experience().setLevel(3);
    const level = double<Level>({ getScoreboard: () => board });
    let session: PlayerSession | undefined;
    const world = double<World>({ getLevel: () => level, viewerOf: () => session });
    session = double<PlayerSession>({
        runtimeId: 1n,
        getWorld: () => world,
        getServer: () =>
            double<ReturnType<PlayerSession['getServer']>>({
                getSessionManager: () => double<SessionManager>({ getSessions: () => [] })
            }),
        getPlayer: () =>
            double<SessionPlayer>({
                getName: () => name,
                getHealth: () => 13.5,
                getFood: () => components.get('vitals.food'),
                isSneaking: () => true,
                isSleeping: () => false,
                getComponents: () => components,
                getExperience: () => components.experience()
            }),
        released: () => {}
    });
    const actor = double<StoreActor>({
        getType: () => 'minecraft:player',
        getRuntimeId: () => 1n,
        getWorld: () => world
    });
    return { session, actor };
};

/**
 * Plays one criterion: a player ticks, a second player kills a zombie and then the first.
 * Whether either held a score after any step is whether the server raised it, since the death
 * takes the time since death and since rest away again.
 */
const raisedFor = (criterion: string): boolean => {
    const board = new Scoreboard();
    board.add('o', criterion);
    const steve = playerOn(board, 'Steve');
    const alex = playerOn(board, 'Alex');
    for (let tick = 0; tick < 3; tick++) tickPlayerScores(steve.session);
    const ticked = board.holders('o').length > 0;
    const zombie = double<StoreActor>({
        getType: () => 'minecraft:zombie',
        getWorld: () => steve.session.getWorld()
    });
    scoreDeath(zombie, alex.actor);
    scoreDeath(steve.actor, alex.actor);
    return ticked || board.holders('o').length > 0;
};

/** One `scoreboard_criterion` row's subject. */
interface CriterionSubject {
    readonly id: string;
    readonly row: string;
}

/** Whether the server raises each criterion's score as Java's play does. */
export const scoreboardCriterionScenario: BehaviorScenario<CriterionSubject> = {
    name: 'scoreboard-criterion-raised',
    java: 'Every criterion but dummy raises a player’s score through play: a statistic when it is awarded, a vitals criterion when it changes, the kill and death counts on a kill; trigger through /trigger.',
    reference: 'Java ObjectiveCriteria, ServerPlayer.awardStat, ServerPlayer.doTick, ServerPlayer.die',
    subjects: () => scoreboardCriterionRows().map((row) => ({ id: gameplayId('scoreboard_criterion', row), row })),
    idOf: (subject) => subject.id,
    aspects: () => ['raised'],
    run: ({ row }) => {
        const raised = raisedFor(criterionOf(row));
        const java = row !== 'dummy';
        if (raised === java) return undefined;
        return raised ? 'the server raised a dummy score' : 'the server never raises a score for it';
    },
    classify: () => ({
        kind: 'deferred',
        reason: 'The server does not award this statistic or criterion yet.',
        reference: GAP_ISSUE
    })
};
