import { Vector3 } from '@jsprismarine/math';
import { DisconnectReason, Gametype } from '@jsprismarine/minecraft';
import { PositionMode } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';
import type PlayerSession from './PlayerSession';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { ShownEntity } from '../world/ShownActor';
import { PORTAL_COOLDOWN_TICKS } from '../entity/PortalContact';
import { blockMiningOf, playerMiningOf } from '../world/BlockMining';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { MAX_AIR_TICKS, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { ActorEvent } from '@jsprismarine/minecraft';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import DeathInfoPacket from '@jsprismarine/protocol/packet/DeathInfoPacket';
import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import SetActorDataPacket from '@jsprismarine/protocol/packet/SetActorDataPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { Block } from '../block/Block';
import { Dimensions } from '../world/DimensionType';
import { PORTALS } from '../world/portal/rules';
import type { Level } from '../world/Level';
import { Position } from '../world/Position';
import type { BlockMining } from '../world/BlockMining';
import type { DimensionTravel } from '../world/portal/DimensionTravel';
import type { World } from '../world/World';
import { respawnPointOf } from '../testing/respawnPoint.test.helper';

/**
 * Runs `n` ticks, the way the world does: the input step, the player's actor and its own part,
 * then the store's entity pass, which runs the player systems.
 */
const tick = async (session: PlayerSession, n: number, from = 1) => {
    for (let i = 0; i < n; i++) {
        // The input step first, as a tick runs it, which is where a death's respawn answer lands.
        session.getServer().getRespawnRequests().admit();
        // The level clock the store's void and grace periods read.
        vi.spyOn(session.getWorld(), 'getTicks').mockReturnValue(from + i);
        await session.getActor()?.update(from + i);
        await session
            .getWorld()
            .dataEntities()
            .tick(from + i);
    }
};

/** {@link tick}, each inside a tick of the store's log, whose changes replication then sends. */
const replicatedTicks = async (fake: ReturnType<typeof fakePlayer>, n: number) => {
    for (let i = 0; i < n; i++) await fake.logTick(() => tick(fake.session, 1, 1 + i));
};

/** Walks the player `blocks` meters east, one meter at a time, as movement packets do. */
const move = async (session: PlayerSession, blocks: number, type = PositionMode.Normal) => {
    for (let i = 0; i < blocks; i++) {
        const position = session.getViewPosition();
        await session.setPlayerPosition({ position: new Vector3(position.getX() + 1, 64, 0), type }, false);
    }
};

describe("PlayerSession's player", () => {
    describe('setPosition', () => {
        it('broadcasts the new rotation with the position', async () => {
            const { session, world } = fakePlayer();
            const rotations: Array<[number, number, number]> = [];
            vi.spyOn(world, 'broadcastMove').mockImplementation(async (entity) => {
                rotations.push([entity.pitch, entity.yaw, entity.headYaw]);
            });

            await session.setPlayerPosition(
                { position: new Vector3(1, 64, 0), pitch: 17, yaw: 123, headYaw: 120 },
                false
            );

            expect(rotations).toStrictEqual([[17, 123, 120]]);
        });

        it('tells observers to snap to a teleport or a respawn but not to a step', async () => {
            const { session, world } = fakePlayer();
            const snaps: boolean[] = [];
            vi.spyOn(world, 'broadcastMove').mockImplementation(async (_entity, teleport) => {
                snaps.push(teleport ?? false);
            });

            await session.setPlayerPosition({ position: new Vector3(1, 64, 0) }, false);
            await session.setPlayerPosition({ position: new Vector3(90, 64, 0), type: PositionMode.Teleport }, false);
            await session.setPlayerPosition({ position: new Vector3(0, 64, 0), type: PositionMode.Respawn }, false);

            expect(snaps).toStrictEqual([false, true, true]);
        });

        it('treats the entity teleport option as a teleport', async () => {
            const { session, world } = fakePlayer();
            const snaps: boolean[] = [];
            vi.spyOn(world, 'broadcastMove').mockImplementation(async (_entity, teleport) => {
                snaps.push(teleport ?? false);
            });
            const sendMove = vi.spyOn(session, 'sendMove').mockResolvedValue();

            await session.setPlayerPosition({ position: new Vector3(90, 64, 0), type: PositionMode.Teleport });

            expect(snaps).toStrictEqual([true]);
            expect(sendMove).toHaveBeenCalledWith(session.shown(), PositionMode.Teleport);
        });
    });

    describe('isOp', () => {
        it('checks operator status by UUID', () => {
            const { session, player, isOp } = fakePlayer();

            session.isOp();

            expect(isOp).toHaveBeenCalledWith(player.getUUID().toString());
        });
    });

    describe('enable', () => {
        it('sends nothing', async () => {
            // It runs during login, before the client has `PlayStatus(LoginSuccess)`. The
            // gamemode, settings and abilities it used to send from here now go out from the
            // join burst after StartGame, where a retail client will accept them.
            const { session, sent } = fakePlayer();

            await session.join();

            expect(sent).toEqual([]);
            expect(session.isConnected()).toBe(true);
        });

        it('joins the chat fan-out under its key, which disable leaves', async () => {
            const { session, server } = fakePlayer({ name: 'Chatter' });
            const chat = server.getChatManager();

            await session.join();
            expect(chat.hasJoined('Chatter')).toBe(true);

            await session.leave();
            expect(chat.hasJoined('Chatter')).toBe(false);
        });
    });

    describe('kick', () => {
        it('disconnects with the reason shown and the kicked code', async () => {
            const { session, disconnects } = fakePlayer();

            await session.kick('Cheating');

            expect(disconnects).toEqual([['Cheating', false, DisconnectReason.KICKED]]);
        });

        it('passes another code through, as the shutdown does', async () => {
            const { session, disconnects } = fakePlayer();

            await session.kick('Server closed.', DisconnectReason.SHUTDOWN);

            expect(disconnects).toEqual([['Server closed.', false, DisconnectReason.SHUTDOWN]]);
        });
    });

    describe('attributes at spawn', () => {
        it('spawns fed, not starving', () => {
            const { player } = fakePlayer();

            expect(player.getFood()).toBe(20);
            expect(player.getSaturation()).toBe(20);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('spawns with a full breath, so no bubbles are shown', () => {
            const { player } = fakePlayer();

            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
            expect(player.metadata.getPropertyValue(MetadataFlag.MAX_AIR)).toBe(MAX_AIR_TICKS);
        });
    });

    describe('hunger', () => {
        it('spends four exhaustion per point of saturation', () => {
            const { session, player } = fakePlayer();

            session.inputs().exhaustPlayer(player, 4);
            expect(player.getSaturation()).toBe(19);
            expect(player.getFood()).toBe(20);
        });

        it('eats into food once saturation is gone', () => {
            const { session, player } = fakePlayer();
            player.setSaturation(0);

            session.inputs().exhaustPlayer(player, 4);
            expect(player.getFood()).toBe(19);
        });

        it('keeps the remainder rather than rounding it away', () => {
            const { session, player } = fakePlayer();

            session.inputs().exhaustPlayer(player, 4.5);
            expect(player.getSaturation()).toBe(19);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.5);
        });

        it('spends several points at once for a large amount', () => {
            const { session, player } = fakePlayer();

            session.inputs().exhaustPlayer(player, 12);
            expect(player.getSaturation()).toBe(17);
        });

        it('never drops below an empty bar', () => {
            const { session, player } = fakePlayer();
            player.setSaturation(0);

            session.inputs().exhaustPlayer(player, 4 * 100);
            expect(player.getFood()).toBe(0);
            expect(player.getSaturation()).toBe(0);
        });

        it('caps saturation at the current food level, as vanilla does', () => {
            const { player } = fakePlayer();
            player.setFood(5);

            player.setSaturation(20);
            expect(player.getSaturation()).toBe(5);
        });
    });

    describe('exhaustion from movement', () => {
        it('costs 0.1 per meter sprinted', async () => {
            const { session, player } = fakePlayer();
            await session.setSprinting(true);

            await move(session, 40);

            // 40 m * 0.1 = 4.0, exactly one point of saturation.
            expect(player.getSaturation()).toBe(19);
        });

        it('costs a tenth of that at a walk', async () => {
            const { session, player } = fakePlayer();

            await move(session, 40);

            expect(player.getSaturation()).toBe(20);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.4);
        });

        it('empties the bar over a long enough sprint', async () => {
            const { session, player } = fakePlayer();
            player.setSaturation(0);
            await session.setSprinting(true);

            await move(session, 40 * 20);

            expect(player.getFood()).toBe(0);
        });

        it('charges nothing for a teleport', async () => {
            const { session, player } = fakePlayer();
            await session.setSprinting(true);

            await move(session, 40, PositionMode.Teleport);

            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('charges nothing for standing still', async () => {
            const { session, player } = fakePlayer();
            await session.setSprinting(true);

            const position = player.getPosition();
            await session.setPlayerPosition({ position: new Vector3(position.getX(), 64, 0) }, false);

            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('charges nothing for falling', async () => {
            const { session, player } = fakePlayer();
            await session.setSprinting(true);

            await session.setPlayerPosition({ position: new Vector3(0, 60, 0) }, false);

            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('costs more to jump while sprinting than to jump standing still', async () => {
            const { session: walking, player: walker } = fakePlayer();
            walking.inputs().playerJumped(walker);

            const { session: sprinting, player: sprinter } = fakePlayer();
            await sprinting.setSprinting(true);
            sprinting.inputs().playerJumped(sprinter);

            expect(walker.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.05);
            expect(sprinter.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.2);
        });

        it('leaves creative and spectator players alone', async () => {
            for (const gamemode of [Gametype.CREATIVE, Gametype.SPECTATOR]) {
                const { session, player } = fakePlayer();
                player.gamemode = gamemode;
                await session.setSprinting(true);

                await move(session, 100);

                expect(player.getFood()).toBe(20);
                expect(player.getSaturation()).toBe(20);
            }
        });
    });

    describe('breath', () => {
        it('spends a tick of air per tick underwater, and stops breathing', async () => {
            const { session, player } = fakePlayer({ underwater: true });

            await tick(session, 40);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS - 40);
            expect(player.metadata.breathing).toBe(false);
        });

        it('waits while its head is in a chunk that is not loaded, and loads none', async () => {
            const { session, player } = fakePlayer({ underwater: true });
            await tick(session, 40);
            const world = session.getWorld();
            world.loadedBlockAt = () => undefined;
            world.getBlock = () => {
                throw new Error('the breath check loaded a chunk');
            };

            await tick(session, 40);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS - 40);
            expect(player.metadata.breathing).toBe(false);
        });

        it('drowns once the air is gone, two half-hearts a second', async () => {
            const { session, player } = fakePlayer({ underwater: true });

            await tick(session, MAX_AIR_TICKS);
            expect(player.metadata.air).toBe(0);
            expect(player.getHealth()).toBe(20); // empty lungs, but not yet hurt

            await tick(session, 20);
            expect(player.getHealth()).toBe(18);

            await tick(session, 20);
            expect(player.getHealth()).toBe(16);
        });

        it('is hurt visibly, not just numerically', async () => {
            const { session, actorEvents } = fakePlayer({ underwater: true });

            await tick(session, MAX_AIR_TICKS + 20);

            expect(actorEvents).toContain(ActorEvent.HURT_ANIMATION);
        });

        it('refills, faster than it emptied, back on dry land', async () => {
            const { session, player } = fakePlayer({ underwater: true });
            await tick(session, 100);
            const held = player.metadata.air;

            const { session: surfacing, player: surfaced } = fakePlayer();
            surfaced.metadata.setAir(held);
            await tick(surfacing, 10);

            expect(surfaced.metadata.air).toBeGreaterThan(held + 10);
            expect(surfaced.metadata.breathing).toBe(true);
        });

        it('never fills past a lungful', async () => {
            const { session, player } = fakePlayer();

            await tick(session, 100);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
        });

        it('does not drown a creative player', async () => {
            const { session, player } = fakePlayer({ underwater: true });
            player.gamemode = Gametype.CREATIVE;

            await tick(session, MAX_AIR_TICKS + 60);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
            expect(player.getHealth()).toBe(20);
        });

        it('reports the bubbles without a packet per tick', async () => {
            const fake = fakePlayer({ underwater: true });
            const { sent } = fake;
            sent.length = 0;

            await replicatedTicks(fake, 100);

            const updates = sent.filter((packet) => packet instanceof SetActorDataPacket);
            expect(updates.length).toBeGreaterThan(0);
            expect(updates.length).toBeLessThan(20);
        });
    });

    describe('hunger, over time', () => {
        it('starves a player with an empty bar', async () => {
            const { session, player } = fakePlayer();
            player.setFood(0);

            await tick(session, 80, 1);

            expect(player.getHealth()).toBe(19);
        });

        it('heals a well-fed player, and charges them for it', async () => {
            const { session, player } = fakePlayer();
            await session.getActor()?.setHealth(10);

            await tick(session, 80, 1);

            expect(player.getHealth()).toBe(11);
            // The heal costs 6 exhaustion: one point of saturation, with 2 left over.
            expect(player.getSaturation()).toBe(19);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(2);
        });

        it('leaves the food of a player at full health alone', async () => {
            const { session, player } = fakePlayer();

            await tick(session, 200);

            expect(player.getFood()).toBe(20);
            expect(player.getSaturation()).toBe(20);
        });

        it('does not heal a hungry player', async () => {
            const { session, player } = fakePlayer();
            player.setFood(10);
            await session.getActor()?.setHealth(10);

            await tick(session, 200);

            expect(player.getHealth()).toBe(10);
        });
    });

    describe('status effects', () => {
        const give = (session: PlayerSession, id: string, durationTicks: number, amplifier = 0) =>
            session.getActor()?.addStatusEffect({ id, durationTicks, amplifier }, false);

        it('restores health at once for instant health, scaled by level', async () => {
            const { session, player } = fakePlayer();
            await session.getActor()?.setHealth(4);

            give(session, 'minecraft:instant_health', 1, 1);
            await tick(session, 1);

            expect(player.getHealth()).toBe(12);
            expect(session.getActor()?.getStatusEffect('minecraft:instant_health')).toBeUndefined();
        });

        it('applies an instant effect once however long it was given for', async () => {
            const { session, player } = fakePlayer();
            await session.getActor()?.setHealth(1);

            give(session, 'minecraft:instant_health', 20 * 30, 0);
            await tick(session, 5);

            expect(player.getHealth()).toBe(5);
        });

        it('heals over time with regeneration, then stops when it runs out', async () => {
            const { session, player } = fakePlayer();
            // Not fed enough to heal on its own, so only the effect can.
            player.setFood(10);
            await session.getActor()?.setHealth(10);

            give(session, 'minecraft:regeneration', 100, 0);
            await tick(session, 100);

            expect(player.getHealth()).toBe(12);
            expect(session.getActor()?.getStatusEffect('minecraft:regeneration')).toBeUndefined();
        });

        it('poisons the player down to half a heart and no further', async () => {
            const { session, player } = fakePlayer();
            player.setFood(10);
            await session.getActor()?.setHealth(3);

            give(session, 'minecraft:poison', 20 * 20, 0);
            await tick(session, 20 * 20);

            expect(player.getHealth()).toBe(1);
            expect(player.getHealth() > 0).toBe(true);
        });

        it('kills with wither', async () => {
            const { session, player } = fakePlayer();
            player.setFood(10);
            await session.getActor()?.setHealth(2);

            give(session, 'minecraft:wither', 200, 0);
            await tick(session, 200);

            expect(player.getHealth() > 0).toBe(false);
        });

        it('drains food faster while hunger is on', async () => {
            const { session, player } = fakePlayer();

            // 0.005 a tick for a minute is 6 exhaustion, which costs a point of saturation.
            give(session, 'minecraft:hunger', 1200, 0);
            await tick(session, 1200);

            expect(player.getFood() + player.getSaturation()).toBeLessThan(40);
        });

        it('feeds the player with saturation', async () => {
            const { session, player } = fakePlayer();
            player.setFood(4);
            player.setSaturation(0);

            give(session, 'minecraft:saturation', 1, 1);
            await tick(session, 1);

            expect(player.getFood()).toBe(6);
            expect(player.getSaturation()).toBe(4);
        });

        it('still expires an effect that does nothing on the server', async () => {
            const { session } = fakePlayer();

            give(session, 'minecraft:speed', 5, 0);
            await tick(session, 5);

            expect(session.getActor()?.getStatusEffect('minecraft:speed')).toBeUndefined();
        });
    });

    describe('death', () => {
        it('announces it, and says how', async () => {
            const { session, player, events } = fakePlayer({ underwater: true });
            // Fed enough not to starve, not enough to heal back through the drowning.
            player.setFood(10);
            await session.getActor()?.setHealth(1);

            await tick(session, MAX_AIR_TICKS + 20);

            expect(player.getHealth() > 0).toBe(false);
            const chat = events.find(([name]) => name === 'chat');
            expect(chat?.[1].getChat().getMessage()).toBe('%death.attack.drown');
        });

        it('stops taking damage once dead', async () => {
            const { session, player } = fakePlayer({ underwater: true });
            player.setFood(10);
            await session.getActor()?.setHealth(1);

            await tick(session, MAX_AIR_TICKS + 200);

            expect(player.getHealth()).toBe(0);
        });

        it('comes back whole, at the spawn', async () => {
            const { session, player } = fakePlayer({ underwater: true });
            player.setFood(3);
            await session.getActor()?.setHealth(1);
            await tick(session, MAX_AIR_TICKS + 20);

            session.requestRespawn();

            session.getServer().getRespawnRequests().admit();

            expect(player.getHealth()).toBe(20);
            expect(player.getFood()).toBe(20);
            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
            expect(player.metadata.breathing).toBe(true);
            // Where the `ReadyToSpawn` put the client: the spawn block's corner, the eyes 1.62
            // above it, as a Bedrock Dedicated Server says.
            const position = player.getPosition();
            expect({ x: position.getX(), y: position.getY(), z: position.getZ() }).toEqual({
                x: 0,
                y: 64 + EYE_HEIGHT,
                z: 0
            });
        });

        it('tells the client it is alive again as a Bedrock server does, without moving it', async () => {
            const { session, player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await session.getActor()?.setHealth(1);
            await tick(session, MAX_AIR_TICKS + 20);
            sent.length = 0;

            session.requestRespawn();

            session.getServer().getRespawnRequests().admit();

            expect(sent.map((packet) => packet.constructor.name)).toEqual([
                'ActorEventPacket',
                'SetHealthPacket',
                'UpdateAttributesPacket',
                'SetActorDataPacket'
            ]);
            expect(sent[0]).toMatchObject({ runtimeEntityId: player.getRuntimeId(), event: ActorEvent.SPAWN_ALIVE });
            expect(sent[1]?.getPacketData()).toMatchObject({ health: 20 });
        });

        it('leaves a living player as they are', async () => {
            const { session, player } = fakePlayer();
            await session.getActor()?.setHealth(7);

            session.requestRespawn();

            session.getServer().getRespawnRequests().admit();

            expect(player.getHealth()).toBe(7);
        });

        it('says where the player will come back at the input step after the death, not inside it', async () => {
            const { session, sent } = fakePlayer();

            await session.getActor()?.setHealth(0);
            expect(sent.filter((packet) => packet instanceof RespawnPacket)).toHaveLength(0);
            expect(session.getServer().getRespawnRequests().size).toBe(1);

            session.getServer().getRespawnRequests().admit();
            expect(sent.filter((packet) => packet instanceof RespawnPacket)).toHaveLength(1);
        });

        it('says where the player will come back', async () => {
            // The client will not even offer the respawn button until it knows, which is what
            // left a death screen stuck on "Respawning".
            const { session, player, sent } = fakePlayer({ underwater: true });
            // Fed, and regeneration would heal them faster than drowning kills.
            player.setFood(10);
            await session.getActor()?.setHealth(1);

            await tick(session, MAX_AIR_TICKS + 20);

            const respawns = sent.filter((packet) => packet instanceof RespawnPacket);
            expect(respawns).toHaveLength(1);
            // As a Bedrock Dedicated Server sends it: the eyes over the spawn block's center, at
            // the spawn's own height, and runtime id 0.
            expect(respawns[0]?.getPacketData()).toMatchObject({
                state: PlayerRespawnState.SEARCHING_FOR_SPAWN,
                position: { x: 0.5, y: 64 + EYE_HEIGHT, z: 0.5 },
                runtimeEntityId: 0n
            });
        });

        it('tells the dying client why, for its death screen, after the respawn', async () => {
            // The same key and parameters as the chat line, minus the `%` the chat packet
            // wants: `DeathInfo` takes the bare key, as PocketMine sends it.
            const { session, player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await session.getActor()?.setHealth(1);

            await tick(session, MAX_AIR_TICKS + 20);

            const deaths = sent.filter((packet) => packet instanceof DeathInfoPacket);
            expect(deaths).toHaveLength(1);
            expect(deaths[0]?.getPacketData()?.cause).toBe('death.attack.drown');
            expect(deaths[0]?.getPacketData()?.messages).toEqual(['Tester']);
            expect(sent.indexOf(deaths[0])).toBeGreaterThan(
                sent.findIndex((packet) => packet instanceof RespawnPacket)
            );
        });

        it('sends no respawn packet when the button is pressed', async () => {
            // That packet is the answer to the client's own `ClientReadyToSpawn`, and
            // belongs to `RespawnHandler`. Sent here it arrives a step early, and the client
            // never leaves its screen.
            const { session, player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await session.getActor()?.setHealth(1);
            await tick(session, MAX_AIR_TICKS + 20);
            sent.length = 0;

            session.requestRespawn();

            session.getServer().getRespawnRequests().admit();

            expect(sent.filter((packet) => packet instanceof RespawnPacket)).toHaveLength(0);
        });
    });

    describe('respawn point across dimensions', () => {
        /** A Nether world of named blocks, everything else air, in the same level as the player's. */
        const netherOf = (blocks: Readonly<Record<string, string>>, level: () => Level) => {
            const nameAt = (x: number, y: number, z: number) => blocks[`${x},${y},${z}`] ?? 'minecraft:air';
            return stub<World>({
                getName: () => 'nether',
                getLevel: level,
                getDimension: () => Dimensions.Nether,
                getSpawnPosition: async () => new Vector3(8, 70, -3),
                getKnownSpawnPosition: () => new Vector3(8, 70, -3),
                addPlayer: async () => {},
                broadcastMove: async () => {},
                // Every chunk is in memory.
                loadedBlockAt: (x, y, z) => ({ name: nameAt(x, y, z), states: {} }),
                loadedBlock: (x, y, z) => stub<Block>({ isSolid: () => nameAt(x, y, z) !== 'minecraft:air' })
            });
        };

        it('resolves the point in the world it was set in, through the level, rather than refusing it', async () => {
            // Java's `findRespawnPositionAndUseSpawnBlock` looks the level up by the spawn's
            // dimension and resolves there. The old rule, "only the world the player died in",
            // sent a Nether death with an Overworld bed to the Nether's world spawn.
            let level: Level | undefined;
            const nether = netherOf({ '10,64,10': 'minecraft:respawn_anchor' }, () => level!);
            const fake = fakePlayer({ worlds: [nether] });
            level = fake.level;
            fake.player.setSpawnPoint({ x: 10, y: 64, z: 10, dimension: 'minecraft:nether' });

            const point = await respawnPointOf(fake.session);

            expect(point.world).toBe(nether);
            // Beside the anchor, in the first free column around it, as in one world.
            expect(point.block).toEqual(new Vector3(10, 64, 11));
            expect(point.eyes).toEqual(new Vector3(10, 64 + EYE_HEIGHT, 11));
        });

        it("falls back to the default level's Overworld spawn when the bed in another dimension is gone", async () => {
            let level: Level | undefined;
            const nether = netherOf({}, () => level!);
            const fake = fakePlayer({ worlds: [nether] });
            level = fake.level;
            fake.session.setWorld(nether);
            fake.travel.admit();
            // The fake Overworld is all air, so nothing stands where the bed was.
            fake.player.setSpawnPoint({ x: 10, y: 64, z: 10, dimension: 'minecraft:overworld' });

            const point = await respawnPointOf(fake.session);

            expect(point.world).toBe(fake.world);
            expect(point.block).toEqual(new Vector3(0, 64, 0));
            // Cleared, so the next death goes straight there.
            expect(fake.player.getSpawnPoint()).toBeUndefined();
        });

        it("comes back at the default level's Overworld spawn after a Nether death with no point of its own", async () => {
            let level: Level | undefined;
            const nether = netherOf({}, () => level!);
            const fake = fakePlayer({ worlds: [nether] });
            level = fake.level;
            fake.session.setWorld(nether);
            fake.travel.admit();

            const point = await respawnPointOf(fake.session);

            expect(point.world).toBe(fake.world);
            expect(point.block).toEqual(new Vector3(0, 64, 0));
        });
    });

    describe('mining', () => {
        const mining: BlockMining = {
            position: new Vector3(2, 57, 16),
            face: 5,
            runtimeId: 1,
            progressPerTick: 5461,
            breakTicks: 12,
            startedAt: 0
        };
        const elsewhere = () =>
            stub<World>({
                getName: () => 'other',
                addPlayer: async () => {},
                broadcastMove: async () => {},
                getSpawnPosition: async () => new Vector3(0, 64, 0),
                getKnownSpawnPosition: () => new Vector3(0, 64, 0),
                getDimension: () => Dimensions.Nether
            });

        it.each([
            ['disconnects', (session: PlayerSession) => session.leave()],
            ['changes game mode', (session: PlayerSession) => session.setGamemode(Gametype.CREATIVE)],
            [
                'changes world',
                async (session: PlayerSession, travel: DimensionTravel) => {
                    session.setWorld(elsewhere());
                    travel.admit();
                }
            ]
        ])('stops the cracks when the player %s, rather than sending them every tick for good', async (_, end) => {
            const { session, player, stopped, travel } = fakePlayer();
            player.gamemode = Gametype.SURVIVAL;
            session.inputs().setPlayerMining(player, playerMiningOf(mining));

            await end(session, travel);

            expect(stopped).toEqual([mining.position]);
            expect(blockMiningOf(player.getComponents().get('mining.block'))).toBeNull();
        });

        it('keeps mining through a game mode set to the one the player is in', async () => {
            const { session, player, stopped } = fakePlayer();
            player.gamemode = Gametype.SURVIVAL;
            session.inputs().setPlayerMining(player, playerMiningOf(mining));

            await session.setGamemode(Gametype.SURVIVAL);

            expect(stopped).toEqual([]);
            expect(blockMiningOf(player.getComponents().get('mining.block'))).toEqual(mining);
        });
    });

    describe('portal delays', () => {
        it('holds a survival player in a nether portal for 80 ticks and a creative one for none', () => {
            const { session, player } = fakePlayer();
            const nether = PORTALS['minecraft:portal']!;

            expect(session.getActor()!.getPortalTransitionTicks(nether)).toBe(80);
            expect(session.getActor()!.getPortalTransitionTicks()).toBe(80);

            player.gamemode = Gametype.CREATIVE;
            expect(session.getActor()!.getPortalTransitionTicks(nether)).toBe(0);
            expect(session.getActor()!.getPortalTransitionTicks()).toBe(0);
        });

        it('sends a player through an end portal on the first tick in any game mode', () => {
            const { session, player } = fakePlayer();
            const end = PORTALS['minecraft:end_portal']!;

            expect(session.getActor()!.getPortalTransitionTicks(end)).toBe(0);
            player.gamemode = Gametype.CREATIVE;
            expect(session.getActor()!.getPortalTransitionTicks(end)).toBe(0);
        });

        it('waits 10 ticks after a dimension change, not the 300 a mob does', () => {
            const { player } = fakePlayer();

            player.setPortalCooldown(PORTAL_COOLDOWN_TICKS.player);

            expect(player.getPortalCooldown()).toBe(10);
        });
    });

    describe('setWorld', () => {
        const nether = () =>
            stub<World>({
                getName: () => 'other',
                addPlayer: async () => {},
                broadcastMove: async () => {},
                getSpawnPosition: async () => new Vector3(8.5, 70, -3.5),
                getKnownSpawnPosition: () => new Vector3(8.5, 70, -3.5),
                getDimension: () => Dimensions.Nether
            });

        it('takes the old world entities off the client before the dimension change', async () => {
            // The client keeps rendering what it was never told to remove. Changing dimension
            // does not clear it, so every mob from the old world has to be despawned by hand.
            const { session, player, sent, travel } = fakePlayer();
            session['viewDistance'] = 10;

            // Runtime ids come from one counter for the whole file, so a fixed id would sooner or
            // later be the player's own.
            const mobId = player.getRuntimeId() + 1_000_000n;
            const mob = stub<ShownEntity>({
                getRuntimeId: () => mobId,
                getPosition: () => new Position(4, 64, 4, session.getWorld()),
                getTrackingRange: () => 8,
                spawnTo: async () => {}
            });
            await session.considerEntity(mob);
            expect(session.tracks(mobId)).toBe(true);
            sent.length = 0;

            const target = nether();
            session.setWorld(target);
            // A message: the change runs at the next input step.
            expect(session.getWorld()).not.toBe(target);
            travel.admit();

            const removal = sent.findIndex(
                (packet) => packet instanceof RemoveActorPacket && packet.uniqueEntityId === mobId
            );
            const dimensionChange = sent.findIndex((packet) => packet instanceof ChangeDimensionPacket);
            expect(removal).toBeGreaterThanOrEqual(0);
            expect(dimensionChange).toBeGreaterThan(removal);
            expect(session.tracks(mobId)).toBe(false);
            expect(session.getWorld()).toBe(target);
        });

        it("arrives at the new world's spawn, facing the way the player was", async () => {
            // The session does the change; this only chooses the arrival. A caller with a
            // destination of its own, such as a teleport, moves the player again afterwards.
            const { session, player, sent, travel } = fakePlayer();
            await session.setPlayerPosition(
                { position: player.getPosition(), yaw: 45, pitch: -10, type: PositionMode.Teleport },
                false
            );

            session.setWorld(nether());
            expect(travel.admit()).toBe(1);

            // The stored spawn is the block under a joining player's feet, so the feet go one
            // block up, centered, and the eyes the client is told about are 1.62 above that.
            const change = sent.find((packet) => packet instanceof ChangeDimensionPacket);
            expect(change?.getPacketData()?.position).toEqual({ x: 8.5, y: 71 + EYE_HEIGHT, z: -3.5 });
            expect(change?.getPacketData()?.dimension).toBe(Dimensions.Nether.bedrockId);
            expect(player.getPosition().getX()).toBe(8.5);
            expect(player.getFeetY()).toBeCloseTo(71);
            expect(player.yaw).toBe(45);
            expect(player.pitch).toBe(-10);
            expect(session.pendingDimensionChange()).toBeDefined();
        });
    });

    describe('the void', () => {
        /** Puts the player's eyes at `y`; their feet are `EYE_HEIGHT` lower. */
        const fallTo = async (session: PlayerSession, y: number) =>
            session.setPlayerPosition({ position: new Vector3(0, y, 0), type: PositionMode.Normal }, false);

        it('hurts a player four half-hearts every half second once 64 blocks under the floor', async () => {
            const { session, player } = fakePlayer();
            await fallTo(session, -200);

            await tick(session, 9);
            expect(player.getHealth()).toBe(20);

            await tick(session, 1, 10);
            expect(player.getHealth()).toBe(16);

            await tick(session, 10, 11);
            expect(player.getHealth()).toBe(12);
        });

        it('leaves a player alone just above the depth', async () => {
            const { session, player } = fakePlayer();
            // The Overworld floor is -64, so the void begins at -128; feet at -127.
            await fallTo(session, -127 + EYE_HEIGHT);

            await tick(session, 20);

            expect(player.getHealth()).toBe(20);
        });

        it('reaches a creative player, whom nothing else can hurt', async () => {
            const { session, player } = fakePlayer();
            player.gamemode = Gametype.CREATIVE;
            await fallTo(session, -200);

            await tick(session, 10);

            expect(player.getHealth()).toBe(16);
        });

        it('passes a spectator by', async () => {
            const { session, player } = fakePlayer();
            player.gamemode = Gametype.SPECTATOR;
            await fallTo(session, -200);

            await tick(session, 20);

            expect(player.getHealth()).toBe(20);
        });

        it('kills, and says the player fell out of the world', async () => {
            const { session, player, sent } = fakePlayer();
            await fallTo(session, -200);

            await tick(session, 50);
            // The next input step, which sends the respawn answer and the death screen's cause.
            session.getServer().getRespawnRequests().admit();

            expect(player.getHealth() > 0).toBe(false);
            const death = sent.find((packet) => packet instanceof DeathInfoPacket);
            expect(death?.getPacketData()?.cause).toBe('death.attack.outOfWorld');
        });
    });

    describe('syncing', () => {
        it('sends what changed, and only what changed', async () => {
            const { session, sent } = fakePlayer();
            await session.setSprinting(true);
            await session.sendAttributes();
            sent.length = 0;

            await move(session, 40);
            await session.getActor()?.update(1);

            const packets = sent.filter((packet) => packet instanceof UpdateAttributesPacket);
            expect(packets).toHaveLength(1);
            expect(packets[0]?.attributes.map((attribute) => attribute.getName()).sort()).toEqual(
                [AttributeIds.PlayerExhaustion, AttributeIds.PlayerSaturation].sort()
            );
        });

        it('says nothing when nothing moved', async () => {
            const { session, sent } = fakePlayer();
            await session.sendAttributes();
            sent.length = 0;

            await session.getActor()?.update(1);

            expect(sent.filter((packet) => packet instanceof UpdateAttributesPacket)).toHaveLength(0);
        });
    });
});
