// @module-tag integration

/**
 * Where the natural spawn cycle puts cows, and that a joined player is shown them: the client
 * e2e scenarios `natural-spawn-placement` and `natural-spawn-under-canopy`, played over a
 * loopback pipe against a server stepped by hand.
 *
 * The server carries the cinnabar suite's cow fixture, a world pack that pins the cow to one
 * definition and one spawn rule, single cows on grass, over the vanilla pack's. The scenarios
 * count ticks, so each run makes the same spawn attempts at the same fixed seed.
 */
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { EYE_HEIGHT, leaveAndWait, shownText, wasShown } from './scenarioSupport.test-utils';

/** The folder the cow fixture's world pack is written to, relative to the state directory. */
const COW_PACK = 'cow-pack';

/** The y a mob stands at in the flat world: bedrock at -64, two of dirt, then the grass block. */
const SURFACE_Y = -60;

/** Ticks between two spawn cycles of an animal pool, from `spawnConstants.json`. */
const ANIMAL_CYCLE_TICKS = 400;

/** A JSON file's text, as the cinnabar harness writes it. */
const json = (value: unknown): string => `${JSON.stringify(value, null, 4)}\n`;

/** The cinnabar suite's `naturalCowSpawning` fixture: one cow definition and its spawn rule. */
const COW_FIXTURE: Readonly<Record<string, string>> = {
    [`${COW_PACK}/manifest.json`]: json({
        format_version: 2,
        header: {
            name: 'Loopback cows',
            description: 'The cow the natural spawn scenarios count',
            uuid: '5b0c2f6e-8d1a-4b52-9a3e-6f1d2c3b4a51',
            version: [1, 0, 0],
            min_engine_version: [1, 21, 0]
        },
        modules: [{ type: 'data', uuid: '5b0c2f6e-8d1a-4b52-9a3e-6f1d2c3b4a52', version: [1, 0, 0] }]
    }),
    [`${COW_PACK}/entities/cow.json`]: json({
        format_version: '1.21.0',
        'minecraft:entity': {
            description: { identifier: 'minecraft:cow', is_spawnable: true, is_summonable: true },
            components: {
                'minecraft:health': { value: 10, max: 10 },
                'minecraft:collision_box': { width: 0.9, height: 1.3 },
                'minecraft:physics': { has_gravity: true, has_collision: true },
                'minecraft:type_family': { family: ['cow', 'mob'] }
            }
        }
    }),
    [`${COW_PACK}/spawn_rules/cow.json`]: json({
        format_version: '1.8.0',
        'minecraft:spawn_rules': {
            description: { identifier: 'minecraft:cow', population_control: 'animal' },
            conditions: [
                {
                    'minecraft:spawns_on_surface': {},
                    'minecraft:spawns_on_block_filter': ['minecraft:grass_block'],
                    'minecraft:weight': { default: 100 },
                    'minecraft:herd': { min_size: 1, max_size: 1 }
                }
            ]
        }
    })
};

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'natural-spawning',
        files: COW_FIXTURE,
        config: (stateRoot) => ({
            'content-world-packs': [path.join(stateRoot, COW_PACK)],
            // The flat surface sits below y 40, where a slime chunk spawns slimes in daylight, and
            // every monster's spawn rule needs a difficulty above peaceful. The cow's has none.
            difficulty: 'peaceful'
        })
    });
}, 3_000_000);

afterAll(async () => {
    await jsp?.close();
}, 120_000);

/** The lines a console command answered with, joined into one string. */
const reply = async (line: string): Promise<string> => (await jsp.command(line)).messages.join('\n');

/**
 * Puts the player on the flat surface at the origin. The cinnabar client fell there from the
 * teleport's height; this one has no physics, so it reports standing on the grass.
 */
const standOnSurface = async (player: LoopbackPlayer, fromY: number): Promise<void> => {
    const before = player.world.getTeleportCount();
    await jsp.command(`teleport ${player.name} 0.5 ${fromY} 0.5`);
    await jsp.until(() => player.world.getTeleportCount() > before, `${player.name} was never sent the teleport`);
    await player.input({ position: { x: 0.5, y: SURFACE_Y + EYE_HEIGHT, z: 0.5 } });
    await jsp.tick();
    await jsp.until(() => player.world.chunksLoadedAround(2), `${player.name} never loaded the chunks around it`);
};

/**
 * Lets the world run `ticks` ticks with the player standing still, one input a tick as a client
 * sends them.
 */
const standFor = async (player: LoopbackPlayer, ticks: number): Promise<void> => {
    for (let tick = 0; tick < ticks; tick++) {
        await player.input();
        await jsp.tick();
    }
};

describe('natural-spawn-placement', { tags: ['real-data'] }, () => {
    /** Cycles to let through; each tries 24 positions around the player at a fixed world seed. */
    const SPAWN_CYCLES = 5;

    let player: LoopbackPlayer;

    // Five animal cycles, the slow part, run once ahead of the checks. Counting ticks rather
    // than waiting for a cow makes the number of spawn attempts the same on every run.
    beforeAll(async () => {
        player = await jsp.join('Herder');
        await standOnSurface(player, -56);
        await standFor(player, ANIMAL_CYCLE_TICKS * SPAWN_CYCLES);
    }, 3_000_000);

    afterAll(async () => {
        await jsp.command('kill @e[type=cow]');
        if (player !== undefined) await leaveAndWait(jsp, player);
    }, 120_000);

    it('spawns cows on grass and shows one to the client', async () => {
        expect(await reply('testfor @e[type=cow]'), 'the server found no natural cow').toMatch(
            /Found [1-9]\d* entities/
        );

        await jsp.command(
            'execute as @e[type=cow] at @s unless block ~ ~-1 ~ minecraft:grass_block run say natural-spawn-placement-unsupported'
        );
        await jsp.command('say natural-spawn-placement-checked');
        await jsp.until(
            () => wasShown(player, 'natural-spawn-placement-checked'),
            'the check never reached the player'
        );
        expect(
            shownText(player).filter((line) => line.includes('natural-spawn-placement-unsupported')),
            'a natural cow stands on something other than grass'
        ).toStrictEqual([]);

        // The herd spawns up to 64 blocks out, further than the server tells a client about, so
        // bring one to the player: the client is still shown a naturally spawned cow.
        await jsp.command('teleport @e[type=cow,limit=1] 0.5 -60 4.5');
        await jsp.until(
            () => player.world.actorsOfType('minecraft:cow').length > 0,
            'the client was never shown a cow'
        );
    });
});

describe('natural-spawn-under-canopy', { tags: ['real-data'] }, () => {
    /** The canopy, high enough over the grass to leave a cow its two blocks of headroom. */
    const CANOPY_Y = SURFACE_Y + 6;

    /**
     * The columns the spawn pass samples around a player standing in chunk 0, 0: four chunks
     * each way, the radius the spawner uses. All of it is roofed over, so every cow it places
     * comes out from under the canopy.
     */
    const REGION = { from: -64, to: 79 };

    /** Ticks one round lets through: a bit more than one animal cycle. */
    const ROUND_TICKS = 500;

    /** Rounds to try before giving up; each is a fresh herd at the same fixed world seed. */
    const MAX_ROUNDS = 20;

    /** How far apart the logs holding the canopy up stand, twice a leaf's decay distance. */
    const LOG_SPACING = 12;

    let player: LoopbackPlayer;
    /** What each canopy row's `fill` answered, by z. */
    const rows = new Map<number, string>();
    /** How many cows the last round found on the grass under the canopy. */
    let found = 0;

    // The canopy and the spawn rounds, the slow part, run once ahead of the checks.
    beforeAll(async () => {
        player = await jsp.join('Forester');
        await standOnSurface(player, SURFACE_Y + 4);

        const { from, to } = REGION;
        for (let z = from; z <= to; z += 1) {
            rows.set(z, await reply(`fill ${from} ${CANOPY_Y} ${z} ${to} ${CANOPY_Y} ${z} minecraft:oak_leaves`));
        }
        // Leaves with no log within six blocks decay on a random tick, and a canopy that came
        // down while the spawn pass ran would prove nothing either way.
        for (let x = from; x <= to; x += LOG_SPACING) {
            await jsp.command(`fill ${x} ${CANOPY_Y} ${from} ${x} ${CANOPY_Y} ${to} minecraft:oak_log`);
        }

        // Each round clears the herd the last one left, the cows that spawned under open sky
        // before the roof went up among them, and runs a cycle's worth of ticks.
        for (let round = 0; round < MAX_ROUNDS && found === 0; round += 1) {
            await jsp.command('kill @e[type=cow]');
            await standFor(player, ROUND_TICKS);

            const marker = `natural-spawn-canopy-checked-${round}`;
            await jsp.command(
                'execute as @e[type=cow] at @s if block ~ ~-1 ~ minecraft:grass_block ' +
                    `if block ~ ${CANOPY_Y} ~ minecraft:oak_leaves run say natural-spawn-canopy-found`
            );
            await jsp.command(`say ${marker}`);
            await jsp.until(() => wasShown(player, marker), 'the check never reached the player');
            found = shownText(player).filter((line) => line.includes('natural-spawn-canopy-found')).length;
        }
    }, 3_000_000);

    afterAll(async () => {
        await jsp.command('kill @e[type=cow]');
        if (player !== undefined) await leaveAndWait(jsp, player);
    }, 120_000);

    it('roofs the whole spawn region over', () => {
        for (const [z, filled] of rows) expect(filled, `the canopy row at z ${z} was not filled`).toMatch(/filled/i);
    });

    it('spawns a cow on the grass beneath a leaf canopy', async () => {
        expect(found, `no natural cow stood on the grass under the canopy in ${MAX_ROUNDS} rounds`).toBeGreaterThan(0);

        // The cow may have spawned 64 blocks out, beyond what the client has been sent, so bring
        // one over to where the player can see it.
        await jsp.command(`teleport @e[type=cow,limit=1] 0.5 ${SURFACE_Y + 1} 4.5`);
        await jsp.until(
            () => player.world.actorsOfType('minecraft:cow').length > 0,
            'the client was never shown a cow'
        );
    });
});
