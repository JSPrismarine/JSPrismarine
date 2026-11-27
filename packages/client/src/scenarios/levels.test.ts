/**
 * What joined players see of a server with more than one level: the client e2e scenarios
 * `level-transfer`, `level-isolation` and `second-level-summon`, played over a loopback pipe
 * against a server stepped by hand.
 *
 * The server is the cinnabar suite's `secondLevel` one: a second flat level whose Overworld
 * shares the default level's dimension, with natural spawning off in the default level only.
 * Where cinnabar waits for the server's "closed loading screen" line, these wait for the client
 * to finish its dimension change and the server to hold the player in the new level; where it
 * reads the client's actor list, these read the actors the client was sent.
 *
 * The two scenarios about mobs are tagged `real-data`: they need the Bedrock pack's entity types.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

/** The entry level, which the loopback server's `worlds` key names. */
const ENTRY = 'world';
/** The second level's `worlds` key, as the cinnabar suite's `SECOND_LEVEL`. */
const SECOND_LEVEL = 'e2e_other';

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'level-scenarios',
        config: {
            worlds: {
                [ENTRY]: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '1' },
                [SECOND_LEVEL]: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '2' }
            }
        }
    });
    // In the default level only, as the cinnabar runner does: the second level spawns its own mobs.
    await jsp.command('gamerule doMobSpawning false');
}, 1_200_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** The name of the level the server holds the player in. */
const levelOf = (player: LoopbackPlayer): string | undefined => player.session()?.getWorld().getLevel().name;

/**
 * Ticks until the server holds the player in `level` and the client has closed the loading screen
 * the move opened, then lets 20 ticks pass, as cinnabar does after the screen closes.
 */
const arriveIn = async (player: LoopbackPlayer, level: string, changesBefore: number): Promise<void> => {
    await jsp.until(
        () =>
            levelOf(player) === level &&
            changes(player) > changesBefore &&
            player.client.getDimensionChange().getPending() === null,
        `${player.name} never arrived in ${level}`,
        400
    );
    await jsp.tick(20);
};

/** How many dimension changes each client has finished, which a move between levels is. */
const finishedChanges = new WeakMap<LoopbackPlayer, number>();
const changes = (player: LoopbackPlayer): number => finishedChanges.get(player) ?? 0;
/** Starts counting the dimension changes the player's client finishes. */
const countChanges = (player: LoopbackPlayer): void => {
    player.client.on('dimensionChange', () => finishedChanges.set(player, changes(player) + 1));
};

/** Runs a console command and ticks until it has printed a line matching `answer`. */
const commandAnswering = async (line: string, answer: RegExp): Promise<string> => {
    const { messages } = await jsp.command(line);
    await jsp.until(() => messages.some((message) => answer.test(message)), `"${line}" never answered ${answer}`, 400);
    return messages.find((message) => answer.test(message))!;
};

/** The actors a client is shown other than players, which here are the spawned mobs. */
const mobCount = (player: LoopbackPlayer): number =>
    player.world.actors().filter((actor) => actor.type !== 'minecraft:player').length;

/** Whether a client is shown the player named `name`. */
const shows = (player: LoopbackPlayer, name: string): boolean =>
    player.world.actors().some((actor) => actor.name === name);

describe('level-transfer', () => {
    /** The level the scenario creates. */
    const ARENA = 'e2e_arena';

    /** How many diamonds the player carries, as `/clear <player> minecraft:diamond 0` counts them. */
    const diamonds = async (player: LoopbackPlayer): Promise<number> => {
        const counted = await commandAnswering(`clear ${player.name} minecraft:diamond 0`, /\d+/);
        return Number(/(\d+)/.exec(counted)?.[1]);
    };

    it('creates a level, moves the player into it with a fresh inventory and back, and detaches it', async () => {
        const player = await jsp.join('Transferred');
        countChanges(player);
        await jsp.command(`replaceitem entity ${player.name} slot.hotbar 0 minecraft:diamond 3`);
        await jsp.tick(5);
        expect(await diamonds(player), 'the player holds the diamonds before leaving').toBe(3);

        await commandAnswering(`world create ${ARENA} minecraft:flat 1`, new RegExp(`Created level ${ARENA}`));

        let before = changes(player);
        await jsp.command(`world tp ${ARENA} ${player.name}`);
        await arriveIn(player, ARENA, before);
        expect(await diamonds(player), `the player arrived in ${ARENA} with the inventory of another level`).toBe(0);

        before = changes(player);
        await jsp.command(`world tp ${ENTRY} ${player.name}`);
        await arriveIn(player, ENTRY, before);
        expect(await diamonds(player), `the player came back to ${ENTRY} without their diamonds`).toBe(3);

        await commandAnswering(`world detach ${ARENA}`, new RegExp(`Detached level ${ARENA}`));
        expect(jsp.server.getWorldManager().getLevel(ARENA)).toBeUndefined();
        player.leave();
        await jsp.tick();
    });
});

describe('level-isolation', { tags: ['real-data'] }, () => {
    it('spawns mobs of its own in a second level and shows them only to its own players', async () => {
        const player = await jsp.join('Isolated');
        countChanges(player);
        const observer = await jsp.join('Observer');
        await jsp.until(() => shows(observer, player.name), 'the observer never saw the player');
        // Before anyone is in the second level, so none of its mobs can be in the count yet.
        const observerBefore = mobCount(observer);

        const before = changes(player);
        await jsp.command(`execute as ${player.name} run debug changeWorld ${SECOND_LEVEL}`);
        await arriveIn(player, SECOND_LEVEL, before);
        await jsp.until(
            () => !shows(observer, player.name),
            'the observer still saw the player after it moved to the second level'
        );

        // cinnabar gives this a minute of wall-clock time, about 1200 ticks at 20 a second.
        await jsp.until(
            () => mobCount(player) > 0,
            'the player in the second level was never shown a mob of its natural spawning',
            1200
        );

        // Long enough for the default level's replication to have shown those mobs, had they reached it.
        await jsp.tick(20);
        expect(mobCount(observer), 'the observer in the default level was shown mobs from the second level').toBe(
            observerBefore
        );
        player.leave();
        observer.leave();
        await jsp.tick();
    });
});

describe('second-level-summon', { tags: ['real-data'] }, () => {
    /** Natural spawning never makes one, so the one the client sees is the command's. */
    const SUMMONED = 'minecraft:armor_stand';
    const summonedShown = (player: LoopbackPlayer): number => player.world.actorsOfType(SUMMONED).length;

    it('summons into the second level for a command run at a player there', async () => {
        const player = await jsp.join('Summoner');
        countChanges(player);
        const observer = await jsp.join('Bystander');

        const before = changes(player);
        await jsp.command(`execute as ${player.name} run debug changeWorld ${SECOND_LEVEL}`);
        await arriveIn(player, SECOND_LEVEL, before);
        await jsp.until(() => player.world.chunksLoadedAround(1), 'no chunks around the arrival');

        await jsp.command(`execute as ${player.name} at @s run summon ${SUMMONED} ~2 ~ ~`);
        await jsp.until(
            () => summonedShown(player) > 0,
            'the player in the second level was never shown the summoned armor stand'
        );

        // Long enough for the default level's replication to have shown it, had it gone there.
        await jsp.tick(20);
        expect(summonedShown(observer), 'the observer in the default level was shown the armor stand').toBe(0);
        await jsp.command(`execute as ${player.name} at @s run kill @e[type=${SUMMONED}]`);
        player.leave();
        observer.leave();
        await jsp.tick();
    });
});
