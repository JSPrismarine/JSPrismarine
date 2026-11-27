// @module-tag integration

/**
 * What a joined player sees of the server's entities, deaths and drops: the client e2e scenarios
 * `summon-entity`, `summon-refused`, `mob-leaves-block`, `player-knockback`, `death-inventory`,
 * `death-respawn`, `teleport-while-dead`, `spectator-pickup` and `item-rest-shape`, played over a
 * loopback pipe against a server stepped by hand.
 *
 * Every scenario needs the Bedrock pack's entity types, so each is tagged `real-data`.
 */
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import { PlayerActionPacket, PlayerActionType, RespawnPacket, SetActorMotionPacket } from '@jsprismarine/protocol';
import LegacyTelemetryEventPacket, {
    LegacyTelemetryEventDataOrdinal
} from '@jsprismarine/protocol/bedrock/packet/LegacyTelemetryEventPacket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorldPosition } from '../ClientWorld';
import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { EYE_HEIGHT, leaveAndWait } from './scenarioSupport.test-utils';

/** The block position a `PlayerActionPacket` carries when the action has no block. */
const NO_BLOCK = { x: 0, y: 0, z: 0 };

/** A flat dimension of bedrock and three layers of one block, as the cinnabar suite's Nether and End are. */
const flatGenerator = (block: string) => ({
    type: 'minecraft:flat',
    settings: {
        layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block, height: 3 }
        ],
        biome: 'minecraft:plains',
        lakes: false,
        features: false,
        structure_overrides: []
    }
});

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'entity-scenarios',
        config: {
            // Wide enough that the radius-2 square around the player is all sent.
            'view-distance': 4,
            worlds: {
                world: {
                    preset: 'minecraft:flat',
                    provider: 'LevelDB',
                    seed: '1',
                    dimensions: {
                        'minecraft:the_nether': {
                            type: 'minecraft:the_nether',
                            generator: flatGenerator('minecraft:netherrack')
                        },
                        'minecraft:the_end': {
                            type: 'minecraft:the_end',
                            generator: flatGenerator('minecraft:end_stone')
                        }
                    }
                }
            }
        }
    });
    // Scenarios that count or kill one kind of mob expect only the ones they summoned.
    await jsp.command('gamerule doMobSpawning false');
}, 3_000_000);

afterAll(async () => {
    await jsp?.close();
}, 120_000);

/** The lines a console command answered with, joined into one string. */
const reply = async (line: string): Promise<string> => (await jsp.command(line)).messages.join('\n');

/** Joins a player and waits until the client holds the chunks within two of it. */
const joinWithChunks = async (name: string): Promise<LoopbackPlayer> => {
    const player = await jsp.join(name);
    await jsp.until(() => player.world.chunksLoadedAround(2), `${name} never loaded the chunks around it`);
    return player;
};

/** The server's position for a player's feet. */
const serverFeet = (player: LoopbackPlayer): WorldPosition => {
    const position = player.session()?.getPlayer().getPosition();
    if (position === undefined) throw new Error(`${player.name} has no session`);
    return { x: position.getX(), y: position.getY() - EYE_HEIGHT, z: position.getZ() };
};

/**
 * Teleports a player with a console command and reports the arrival in its next input, as a
 * client that applied the teleport does.
 * @param player - Who moves.
 * @param at - Where the feet go.
 */
const standAt = async (player: LoopbackPlayer, at: WorldPosition): Promise<void> => {
    const before = player.world.getTeleportCount();
    await jsp.command(`teleport ${player.name} ${at.x} ${at.y} ${at.z}`);
    await jsp.until(() => player.world.getTeleportCount() > before, `${player.name} was never sent the teleport`);
    await player.input();
    await jsp.tick();
};

/**
 * Waits for the player's death, then answers the death screen as a client whose respawn button
 * was pressed does: `Respawn` with `ClientReadyToSpawn`, then, once the server says where, the
 * `Respawn` player action. Returns once the client has health again.
 * @param player - The player who died.
 * @returns The health the client is shown after the respawn.
 */
const respawnFromDeathScreen = async (player: LoopbackPlayer): Promise<number> => {
    const { client, world } = player;
    await jsp.until(
        () => world.health() === 0 && world.getRespawnState() === PlayerRespawnState.SEARCHING_FOR_SPAWN,
        `${player.name} was never shown the death screen`
    );
    // The retail death screen ignores clicks for a moment after it opens.
    await jsp.tick(30);

    const runtimeEntityId = client.getStartGame()?.runtimeEntityId ?? 0n;
    await client.getSession().send(
        new RespawnPacket({
            position: { x: 0, y: 0, z: 0 },
            state: PlayerRespawnState.CLIENT_READY_TO_SPAWN,
            runtimeEntityId
        })
    );
    await jsp.until(
        () => world.getRespawnState() === PlayerRespawnState.READY_TO_SPAWN,
        `${player.name} was never told where it respawns`
    );
    await client.getSession().send(
        new PlayerActionPacket({
            runtimeEntityId,
            action: PlayerActionType.Respawn,
            blockPosition: NO_BLOCK,
            resultPosition: NO_BLOCK,
            blockFace: 0
        })
    );
    await jsp.until(() => (world.health() ?? 0) > 0, `${player.name} never regained health after respawning`);
    await player.input();
    await jsp.tick();
    return world.health()!;
};

describe('summon-entity', { tags: ['real-data'] }, () => {
    it('shows a summoned pig to the client and takes it away once it is killed', async () => {
        const player = await joinWithChunks('Summoner');
        const before = player.world.actorsOfType('minecraft:pig').length;

        await jsp.command('summon minecraft:pig 3 64 3');
        await jsp.until(
            () => player.world.actorsOfType('minecraft:pig').length > before,
            'the client never saw the summoned pig'
        );

        await jsp.command('kill @e[type=minecraft:pig]');
        await jsp.until(
            () => player.world.actorsOfType('minecraft:pig').length <= before,
            'the pig stayed visible after it was killed'
        );
        await leaveAndWait(jsp, player);
    });
});

describe('summon-refused', { tags: ['real-data'] }, () => {
    /** The types Bedrock refuses to summon: their definitions say `"is_summonable": false`. */
    const REFUSED = ['minecraft:fishing_hook', 'minecraft:area_effect_cloud', 'jsprismarine:inert_actor'] as const;

    it('sends the client nothing for a type marked not summonable', async () => {
        const player = await joinWithChunks('Refused');
        const before = new Map(REFUSED.map((type) => [type, player.world.actorsOfType(type).length]));
        const pigsBefore = player.world.actorsOfType('minecraft:pig').length;

        for (const type of REFUSED) await jsp.command(`summon ${type} 3 64 3`);
        // Commands run in order, so once the client sees this pig every refused summon above
        // has been answered and anything it spawned has been sent.
        await jsp.command('summon minecraft:pig 3 64 3');
        await jsp.until(
            () => player.world.actorsOfType('minecraft:pig').length > pigsBefore,
            'the client never saw the sentinel pig'
        );

        for (const type of REFUSED) {
            expect(player.world.actorsOfType(type).length, `the client was sent a summoned ${type}`).toBe(
                before.get(type)
            );
        }
        await jsp.command('kill @e[type=minecraft:pig]');
        await leaveAndWait(jsp, player);
    });
});

describe('mob-leaves-block', { tags: ['real-data'] }, () => {
    /** The pillar's x; the zombie's box, 0.6 wide around x 7, reaches back into it to 6.7. */
    const PILLAR_X = 6;
    const ZOMBIE_X = 7;

    /** The first zombie's x, from `data get entity`. */
    const zombieX = async (): Promise<number> => {
        const answer = await reply('data get entity @e[type=minecraft:zombie,limit=1] Pos');
        const match = /has the following entity data: \[(-?[\d.]+)d/.exec(answer);
        if (match?.[1] === undefined) throw new Error(`the server did not report the zombie's position: ${answer}`);
        return Number(match[1]);
    };

    it('lets a zombie summoned partly inside a pillar walk out of it toward the player', async () => {
        // A spawner used to place mobs with their box reaching into its own block, and the server
        // refused every step such a mob took. Summoning into the side of a pillar sets up the
        // same overlap.
        const player = await joinWithChunks('Bait');
        await standAt(player, { x: 11.5, y: -60, z: 6.5 });
        await jsp.command(`fill ${PILLAR_X} -60 6 ${PILLAR_X} -58 6 minecraft:stone`);
        await jsp.command(`summon minecraft:zombie ${ZOMBIE_X} -60 6.5`);

        expect(await zombieX(), 'the zombie stands where it was summoned').toBe(ZOMBIE_X);
        // A zombie targets a player within its follow range and walks at it, so it heads east,
        // out of the pillar, as soon as it can move at all.
        await jsp.tick(100);
        const after = await zombieX();

        await jsp.command('kill @e[type=minecraft:zombie]');
        await jsp.command(`fill ${PILLAR_X} -60 6 ${PILLAR_X} -58 6 minecraft:air`);
        expect(after, `the zombie left the pillar: it stands at x ${after}`).toBeGreaterThan(ZOMBIE_X + 0.5);
        await leaveAndWait(jsp, player);
    });
});

describe('player-knockback', { tags: ['real-data'] }, () => {
    /** Where the player stands, on a stone pad; the pig stands two blocks west of it. */
    const STAND = { x: 0.5, y: 64, z: 0.5 };

    /** Ground drag a client applies to its velocity each tick: block friction 0.6 times 0.91. */
    const GROUND_DRAG = 0.6 * 0.91;

    it('shoves the player away from the mob that hit it, and keeps the shove', async () => {
        const player = await joinWithChunks('Shoved');
        const { client } = player;
        if (!client.getRegistry().has(new SetActorMotionPacket().getId()))
            client.getRegistry().register(SetActorMotionPacket);
        const ownId = client.getStartGame()?.runtimeEntityId;
        const motions: WorldPosition[] = [];
        client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof SetActorMotionPacket && packet.runtimeEntityId === ownId)
                motions.push({ x: packet.motion.getX(), y: packet.motion.getY(), z: packet.motion.getZ() });
        });

        await jsp.command('fill -4 63 -4 8 63 4 minecraft:stone');
        await jsp.command(`gamemode survival ${player.name}`);
        await standAt(player, STAND);
        await jsp.command('kill @e[type=minecraft:pig]');
        await jsp.command(`summon minecraft:pig ${STAND.x - 2} ${STAND.y} ${STAND.z}`);
        await jsp.tick(10);
        const before = serverFeet(player);

        await jsp.command(`damage ${player.name} 1 minecraft:mob_attack by @e[type=minecraft:pig,limit=1]`);
        await jsp.until(() => motions.length > 0, 'the server never asked the client to take the shove');
        // Away from the pig, so east.
        const shove = motions[0]!;
        expect(shove.x, `the shove points east: ${JSON.stringify(shove)}`).toBeGreaterThan(0);

        // This client has no physics, so it moves the player as a client on the ground does:
        // the velocity, slowed by ground drag each tick, reported one input a tick.
        const teleportsBefore = player.world.getTeleportCount();
        let velocity = shove.x;
        let eyes = player.world.getPosition()!;
        for (let step = 0; step < 20; step++) {
            eyes = { ...eyes, x: eyes.x + velocity };
            velocity *= GROUND_DRAG;
            await player.input({ position: eyes });
            await jsp.tick();
        }
        const shoved = serverFeet(player);
        expect(shoved.x - before.x, 'the server took the shoved position').toBeGreaterThan(0.25);

        // A server that moved the player itself, or refused the client's reports, would put the
        // player back where the blow found them. Two seconds of standing still.
        for (let step = 0; step < 40; step++) {
            await player.input();
            await jsp.tick();
        }
        const settled = serverFeet(player);
        expect(player.world.getTeleportCount(), 'the server sent the player back').toBe(teleportsBefore);
        expect(
            settled.x - before.x,
            `the shove was undone: x ${before.x} to ${shoved.x} to ${settled.x}`
        ).toBeGreaterThan(0.25);

        await jsp.command('kill @e[type=minecraft:pig]');
        await leaveAndWait(jsp, player);
    });
});

describe('kill-telemetry', { tags: ['real-data'] }, () => {
    /**
     * A Bedrock client counts toward some Xbox achievements what only the server knows: that its
     * player's blow killed a mob, what killed its player, and that a command it sent succeeded.
     * BDS tells it each with a `LegacyTelemetryEvent`.
     */
    it('tells the player of a command it ran, a mob it killed and the zombie that killed it', async () => {
        const player = await joinWithChunks('Hunter');
        const { client } = player;
        if (!client.getRegistry().has(new LegacyTelemetryEventPacket().getId()))
            client.getRegistry().register(LegacyTelemetryEventPacket);
        const events: LegacyTelemetryEventPacket[] = [];
        client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof LegacyTelemetryEventPacket) events.push(packet);
        });
        const ownId = client.getStartGame()?.runtimeEntityId;
        const sent = (ordinal: number) => events.filter((event) => event.eventData.ordinal === ordinal);

        await jsp.command('fill -4 63 -4 4 63 4 minecraft:stone');
        await jsp.command(`gamemode survival ${player.name}`);
        await standAt(player, { x: 0.5, y: 64, z: 0.5 });

        await player.runCommand('/me waves');
        await jsp.until(() => sent(LegacyTelemetryEventDataOrdinal.SlashCommand).length > 0, 'no command was reported');
        expect(sent(LegacyTelemetryEventDataOrdinal.SlashCommand)[0]).toMatchObject({
            targetActorId: ownId,
            usePlayerId: true,
            eventData: { commandName: 'me', successCount: 1, errorCount: 0 }
        });

        await jsp.command('kill @e[type=minecraft:pig]');
        await jsp.command('summon minecraft:pig 2.5 64 0.5');
        await jsp.tick(5);
        await jsp.command(`damage @e[type=minecraft:pig] 100 minecraft:player_attack by ${player.name}`);
        await jsp.until(() => sent(LegacyTelemetryEventDataOrdinal.MobKilled).length > 0, 'no kill was reported');
        expect(sent(LegacyTelemetryEventDataOrdinal.MobKilled)[0]).toMatchObject({
            targetActorId: ownId,
            eventData: { instigatorActorId: ownId, instigatorChildActorType: 1, damageSource: 2, tradeTier: -1 }
        });

        await jsp.command('summon minecraft:zombie 2.5 64 0.5');
        await jsp.tick(5);
        await jsp.command(`damage ${player.name} 100 minecraft:mob_attack by @e[type=minecraft:zombie,limit=1]`);
        await jsp.until(() => sent(LegacyTelemetryEventDataOrdinal.PlayerDied).length > 0, 'no death was reported');
        // 199456 is ActorType Zombie, as BDS reports it.
        expect(sent(LegacyTelemetryEventDataOrdinal.PlayerDied)[0]).toMatchObject({
            targetActorId: ownId,
            eventData: { instigatorActorId: 199456, damageSource: 2, diedInRaid: false }
        });

        await respawnFromDeathScreen(player);
        await jsp.command('kill @e[type=minecraft:zombie]');
        await leaveAndWait(jsp, player);
    });
});

describe('death-inventory', { tags: ['real-data'] }, () => {
    /** How many stone the player holds, through `/clear` with a max count of 0, which removes nothing. */
    const stoneHeld = async (name: string): Promise<number> => {
        const answer = await reply(`clear ${name} minecraft:stone 0`);
        const match = /Found (\d+) matching items?/.exec(answer);
        if (match?.[1] === undefined) throw new Error(`clear did not count the stone: ${answer}`);
        return Number(match[1]);
    };

    /** The player's experience level, through `/xp query`. */
    const levelOf = async (name: string): Promise<number> => {
        const answer = await reply(`xp query ${name} levels`);
        const match = /has (\d+) levels/.exec(answer);
        if (match?.[1] === undefined) throw new Error(`xp query did not answer a level: ${answer}`);
        return Number(match[1]);
    };

    it.each([false, true])('drops or keeps the inventory and experience with keepInventory %s', async (keep) => {
        const player = await joinWithChunks(`Mortal${String(keep)}`);
        // A pad at the spawn and one well away from it, so the player dies to `/kill` rather
        // than a fall and respawns out of reach of its drop.
        await jsp.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await jsp.command('fill 22 63 -2 26 63 2 minecraft:stone');
        await jsp.command('setworldspawn 0 63 0');
        await jsp.command('kill @e[type=item]');
        await jsp.tick(5);

        await jsp.command(`gamerule keepInventory ${String(keep)}`);
        await jsp.command(`clear ${player.name}`);
        await jsp.command(`give ${player.name} minecraft:stone 5`);
        await jsp.command(`xp set ${player.name} 12 levels`);
        await jsp.tick(5);
        expect(await stoneHeld(player.name), 'the player was not given the stone').toBe(5);

        await standAt(player, { x: 24.5, y: 64, z: 0.5 });
        await jsp.command(`kill ${player.name}`);
        await respawnFromDeathScreen(player);
        await jsp.tick(10);

        const stone = await stoneHeld(player.name);
        const level = await levelOf(player.name);
        expect({ stone, level }).toStrictEqual(keep ? { stone: 5, level: 12 } : { stone: 0, level: 0 });

        await jsp.command('kill @e[type=item]');
        await jsp.command('kill @e[type=xp_orb]');
        await jsp.command('gamerule keepInventory false');
        await leaveAndWait(jsp, player);
    });
});

describe('death-respawn', { tags: ['real-data'] }, () => {
    it('respawns a player who died in the Nether on top of the spawn block, free to change dimension', async () => {
        const player = await joinWithChunks('Phoenix');
        // The world spawn names the stone pad's own block, as a world whose spawn was written as
        // its top block does, so the respawn has to lift the player out of it.
        await jsp.command('setworldspawn 0 63 0');
        await jsp.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await jsp.tick(5);

        // Die in the Nether, so the respawn is a change of world. The flat Nether's floor tops
        // out at y 3, so the player stands at y 4.
        await jsp.command(`execute in minecraft:the_nether run teleport ${player.name} 0 4 0`);
        await jsp.until(() => player.world.getDimension() === 1, 'the client never reached the Nether');
        await jsp.tick(40);
        await jsp.command(`kill ${player.name}`);
        await respawnFromDeathScreen(player);

        expect(player.world.getDimension(), 'the respawn brought the player back to the Overworld').toBe(0);
        const shown = player.world.getPosition()!;
        expect(shown.y - EYE_HEIGHT, 'the client was put inside the stone spawn block').toBeGreaterThanOrEqual(
            64 - 0.01
        );
        expect(serverFeet(player).y, 'the server holds the player inside the stone spawn block').toBeGreaterThanOrEqual(
            64 - 0.01
        );

        // Back in the Overworld, the player has to be able to run a command that sends them
        // into the Nether again: `@s` names them, and the change of world must not still be pending.
        await jsp.command(`op ${player.name}`);
        await jsp.tick(10);
        await player.runCommand('/execute in minecraft:the_nether run tp @s 0 4 0');
        await jsp.until(
            () => player.world.getDimension() === 1,
            '/execute in the_nether run tp @s did not move the respawned player'
        );
        await leaveAndWait(jsp, player);
    });
});

describe('teleport-while-dead', { tags: ['real-data'] }, () => {
    it('holds a teleport into the Nether sent to a dead player until it respawns', async () => {
        const player = await joinWithChunks('Revenant');
        await jsp.command(`kill ${player.name}`);
        await jsp.until(
            () =>
                player.world.health() === 0 &&
                player.world.getRespawnState() === PlayerRespawnState.SEARCHING_FOR_SPAWN,
            'the client was never shown the death screen'
        );

        // The change used to go out under the death screen at once, and a client that left its
        // loading screen unopened held every later change of world behind it.
        await jsp.command(`execute in minecraft:the_nether run teleport ${player.name} 0 4 0`);
        await jsp.tick(30);
        expect(player.world.getDimension(), 'the dead player changed dimension before respawning').not.toBe(1);

        await respawnFromDeathScreen(player);
        await jsp.until(() => player.world.getDimension() === 1, 'the respawned player never reached the Nether');
        await jsp.until(() => player.world.chunksLoadedAround(2), 'the client never loaded the Nether around it');
        expect(player.client.getDimensionChange().getPending(), 'the loading screen never closed').toBeNull();
        await leaveAndWait(jsp, player);
    });
});

describe('spectator-pickup', { tags: ['real-data'] }, () => {
    /** The dropped items the client is shown. */
    const drops = (player: LoopbackPlayer) => player.world.actorsOfType('minecraft:item');

    it('leaves a drop beside a spectator for a survival player to collect', async () => {
        const player = await joinWithChunks('Ghost');
        await jsp.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await jsp.command('kill @e[type=item]');
        await jsp.command(`clear ${player.name}`);
        await standAt(player, { x: 0.5, y: 64, z: 0.5 });
        await jsp.command(`gamemode spectator ${player.name}`);
        await jsp.tick(10);
        await jsp.command('setblock 0 64 0 minecraft:dirt');
        await jsp.command('setblock 0 64 0 minecraft:air destroy');
        await jsp.tick(40);

        // On the drop wherever it came to rest, so it stays because the player is a spectator
        // and not because the drop slid out of reach: a block's drop pops out with a random push.
        expect(drops(player), 'the client was shown the drop').toHaveLength(1);
        const drop = drops(player)[0]!.position;
        await standAt(player, { x: drop.x, y: 64, z: drop.z });
        await jsp.tick(20);
        expect(drops(player), 'the spectator leaves the drop visible').toHaveLength(1);
        expect(await reply(`clear ${player.name} minecraft:dirt 64`), 'the spectator received dirt').toMatch(
            /Removed 0 items/
        );

        await jsp.command(`gamemode survival ${player.name}`);
        await standAt(player, { x: drop.x, y: 64, z: drop.z });
        await jsp.until(() => drops(player).length === 0, 'the drop was not collected in survival', 300);
        expect(await reply(`clear ${player.name} minecraft:dirt 64`), 'survival collected the drop').toMatch(
            /Removed 1 items/
        );
        await leaveAndWait(jsp, player);
    });
});

describe('item-rest-shape', { tags: ['real-data'] }, () => {
    /** The heights of the item actors the client is shown within a block of a column, lowest first. */
    const itemHeightsAt = (player: LoopbackPlayer, x: number, z: number): number[] =>
        player.world
            .actorsOfType('minecraft:item')
            .filter(({ position }) => Math.hypot(position.x - x, position.z - z) < 1)
            .map(({ position }) => position.y)
            .sort((left, right) => left - right);

    it('rests a stack dropped on a bottom slab half a block lower than one on a full block (#3097)', async () => {
        const player = await joinWithChunks('Dropper');
        await jsp.command('kill @e[type=item]');

        // A full block and a bottom slab side by side, three blocks ahead of the player, on the
        // flat floor, whose top is at y -61.
        const feet = serverFeet(player);
        const [x, y, z] = [Math.floor(feet.x), -60, Math.floor(feet.z) + 3];
        await jsp.command(`fill ${x} ${y + 1} ${z} ${x + 2} ${y + 4} ${z} minecraft:air`);
        await jsp.command(`setblock ${x} ${y} ${z} minecraft:stone`);
        await jsp.command(`setblock ${x + 2} ${y} ${z} minecraft:oak_slab`);
        // What mining this block would drop is what falls on each.
        await jsp.command(`setblock ${x + 4} ${y} ${z} minecraft:dirt`);
        await jsp.tick(2);

        // One dirt stack falls onto each from two blocks up.
        await jsp.command(`loot spawn ${x + 0.5} ${y + 3} ${z + 0.5} mine ${x + 4} ${y} ${z}`);
        await jsp.command(`loot spawn ${x + 2.5} ${y + 3} ${z + 0.5} mine ${x + 4} ${y} ${z}`);

        // Settled once each column holds one stack and both read the same ten ticks apart.
        let onStone: number[] = [];
        let onSlab: number[] = [];
        let previous: string | undefined;
        for (let round = 0; ; round++) {
            onStone = itemHeightsAt(player, x + 0.5, z + 0.5);
            onSlab = itemHeightsAt(player, x + 2.5, z + 0.5);
            const now = JSON.stringify([onStone, onSlab]);
            if (onStone.length === 1 && onSlab.length === 1 && now === previous) break;
            if (round >= 20) throw new Error(`the two stacks never settled: stone ${onStone}, slab ${onSlab}`);
            previous = now;
            await jsp.tick(10);
        }
        // Whatever offset the server puts an item's position at, it is the same on both blocks.
        const drop = onStone[0]! - onSlab[0]!;
        expect(Math.abs(drop - 0.5), `the stack on the slab sat ${drop} below the one on stone`).toBeLessThan(0.02);

        await jsp.command('kill @e[type=item]');
        await jsp.command(`fill ${x} ${y} ${z} ${x + 4} ${y} ${z} minecraft:air`);
        await leaveAndWait(jsp, player);
    });
});
