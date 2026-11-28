/**
 * The scores a player's play raises on their level's scoreboard: the objectives counting one of
 * the statistics Java awards each tick, such as `minecraft.custom:minecraft.play_time`, the
 * vitals criteria such as `health`, and the deaths and kills.
 *
 * A player scores under their name, the fake player a command's `@s` names on this server (see
 * `command/host/scoreboard.ts`). As in Java, a statistic adds to the score rather than setting it
 * to the statistic's total, so an objective added today counts from today, and a score a command
 * set goes on counting from what it set.
 */
import { statisticCriterionName } from '@jsprismarine/commands/criteria';

import { showScoreChange } from '../command/host/scoreboard';
import type { StoreActor } from '../entity/data/storeActors';
import type PlayerSession from './PlayerSession';

/** A `minecraft:custom` statistic's criterion. */
const custom = (stat: string): string => statisticCriterionName('minecraft:custom', `minecraft:${stat}`);

/** @javaSee Stats.PLAY_TIME */
const PLAY_TIME = custom('play_time');
/** @javaSee Stats.TOTAL_WORLD_TIME */
const TOTAL_WORLD_TIME = custom('total_world_time');
/** @javaSee Stats.TIME_SINCE_DEATH */
const TIME_SINCE_DEATH = custom('time_since_death');
/** @javaSee Stats.CROUCH_TIME */
const SNEAK_TIME = custom('sneak_time');
/** @javaSee Stats.TIME_SINCE_REST */
const TIME_SINCE_REST = custom('time_since_rest');
/** @javaSee Stats.DEATHS */
const DEATHS = custom('deaths');
/** @javaSee Stats.PLAYER_KILLS */
const PLAYER_KILLS = custom('player_kills');
/** @javaSee Stats.MOB_KILLS */
const MOB_KILLS = custom('mob_kills');

/** The vitals criteria this server reads, each a reading of the player Java sets the score to. */
const VITALS: Readonly<Record<string, (session: PlayerSession) => number>> = {
    // Java adds the absorption hearts, which a player's store entity keeps out of this reading.
    health: (session) => Math.ceil(session.getPlayer().getHealth()),
    food: (session) => session.getPlayer().getFood(),
    air: (session) => session.getPlayer().getComponents().get('vitals.air'),
    level: (session) => session.getPlayer().getExperience().getLevel()
};

/** A player's level's scoreboard, and a writer that shows the level's players each change. */
const boardOf = (session: PlayerSession) => {
    const level = session.getWorld().getLevel();
    const board = level.getScoreboard();
    const holder = session.getPlayer().getName();
    /** Sets the player's score in one objective, or resets it for undefined; no change sends nothing. */
    const write = (objective: string, value: number | undefined): void => {
        if (board.score(holder, objective) === value) return;
        if (value === undefined) board.reset(holder, objective);
        const stored = value === undefined ? undefined : board.setScore(holder, objective, value);
        for (const sent of showScoreChange(session.getServer(), level, board, holder, objective, stored))
            session.released(sent);
    };
    return { board, holder, write };
};

/**
 * Adds to the player's score in every objective that counts a criterion: a player with no score
 * starts from 0.
 *
 * @javaSee ScoreAccess.add
 */
const add = (session: PlayerSession, criterion: string, amount = 1): void => {
    const { board, holder, write } = boardOf(session);
    for (const objective of board.objectivesCounting(criterion))
        write(objective, (board.score(holder, objective) ?? 0) + amount);
};

/** Takes the player's score off every objective that counts a criterion, as Java's `resetStat` does. */
const reset = (session: PlayerSession, criterion: string): void => {
    const { board, write } = boardOf(session);
    for (const objective of board.objectivesCounting(criterion)) write(objective, undefined);
};

/**
 * One tick of the player's scores: the statistics Java's player tick awards, and each vitals
 * objective set to the player's reading.
 *
 * Java sets a vitals score when the reading differs from the one it last recorded, which it
 * records whether or not anything counts it, so an objective added later waits for the next
 * change. Here each objective is compared with its own score, so a new `health` objective shows
 * the player's health on the next tick, and an unchanged one sends nothing.
 *
 * @param session - The player.
 * @javaSee ServerPlayer.doTick
 */
export const tickPlayerScores = (session: PlayerSession): void => {
    const { board, holder, write } = boardOf(session);
    const objectives = board.objectives();
    if (objectives.length === 0) return;

    const player = session.getPlayer();
    const alive = player.getHealth() > 0;
    const sneaking = player.isSneaking();
    const sleeping = player.isSleeping();
    const readings = new Map<string, number>();

    for (const { name, criterion } of objectives) {
        const reading = VITALS[criterion];
        if (reading !== undefined) {
            const now = readings.get(criterion) ?? reading(session);
            readings.set(criterion, now);
            write(name, now);
            continue;
        }

        const ticked =
            criterion === PLAY_TIME ||
            criterion === TOTAL_WORLD_TIME ||
            (criterion === TIME_SINCE_DEATH && alive) ||
            (criterion === SNEAK_TIME && sneaking) ||
            (criterion === TIME_SINCE_REST && !sleeping);
        if (ticked) write(name, (board.score(holder, name) ?? 0) + 1);
        // A player asleep has just rested, which Java's `startSleeping` resets the count for.
        else if (criterion === TIME_SINCE_REST) write(name, undefined);
    }
};

/**
 * The scores a death raises: the victim's deaths and their time since death and rest, and for a
 * player who killed, their kills.
 *
 * @param victim - Who died.
 * @param killer - Who is answerable for it, if anybody.
 * @javaSee ServerPlayer.die
 * @javaSee ServerPlayer.awardKillScore
 */
export const scoreDeath = (victim: StoreActor, killer: StoreActor | null): void => {
    const world = victim.getWorld();
    const dead = victim.getType() === 'minecraft:player' ? world.viewerOf(victim.getRuntimeId()) : undefined;
    const credited =
        killer?.getType() === 'minecraft:player' ? killer.getWorld().viewerOf(killer.getRuntimeId()) : undefined;

    if (dead !== undefined) {
        add(dead, 'deathCount');
        add(dead, DEATHS);
        reset(dead, TIME_SINCE_DEATH);
        reset(dead, TIME_SINCE_REST);
        if (killer !== null) add(dead, statisticCriterionName('minecraft:killed_by', killer.getType()));
    }

    if (credited !== undefined && credited !== dead) {
        add(credited, 'totalKillCount');
        add(credited, statisticCriterionName('minecraft:killed', victim.getType()));
        if (dead === undefined) add(credited, MOB_KILLS);
        else {
            add(credited, 'playerKillCount');
            add(credited, PLAYER_KILLS);
        }
    }
};
