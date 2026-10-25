import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { DisconnectReason, Gametype } from '@jsprismarine/minecraft';
import { InetAddress } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import { describe, expect, it, vi } from 'vitest';

import type { ConsoleSender } from './command/ConsoleSender';
import Player from './Player';
import type Server from './Server';
import type { Block } from './block/Block';
import type { Config } from './config/Config';
import { AttributeIds } from './entity/Attribute';
import type { Entity } from './entity/Entity';
import { EYE_HEIGHT } from './entity/Human';
import type { PermissionManager } from './permission/PermissionManager';
import { MAX_AIR_TICKS, MetadataFlag } from './entity/Metadata';
import type ClientConnection from './network/ClientConnection';
import { ActorEvent } from './network/packet/ActorEventPacket';
import ChangeDimensionPacket from './network/packet/ChangeDimensionPacket';
import DeathInfoPacket from './network/packet/DeathInfoPacket';
import RemoveActorPacket from './network/packet/RemoveActorPacket';
import RespawnPacket, { PlayerRespawnState } from './network/packet/RespawnPacket';
import SetActorDataPacket from './network/packet/SetActorDataPacket';
import UpdateAttributesPacket from './network/packet/UpdateAttributesPacket';
import { createConnectedPlayer } from './network/createConnectedPlayer';
import PositionMode from './network/type/PositionMode';
import { stub } from './testing/stub.test.helper';
import UUID from './utils/UUID';
import type { ChunkScheduler } from './world/ChunkScheduler';
import type GameRuleManager from './world/GameRuleManager';
import { Position } from './world/Position';
import type { World } from './world/World';

/**
 * A player with just enough of a server, world and connection around it to move and tick.
 *
 * The world is either dry or entirely water, which is all the block detail breath needs.
 */
const fakePlayer = ({ underwater = false }: { underwater?: boolean } = {}) => {
    const sent: any[] = [];
    const events: any[] = [];
    const actorEvents: number[] = [];
    const actorSounds: number[] = [];
    const disconnects: Parameters<ClientConnection['disconnect']>[] = [];
    const isOp = vi.fn(() => false);

    const server: Server = stub<Server>({
        on: () => server,
        post: () => 0,
        emit: async (name: string, event: unknown) => void events.push([name, event]),
        getTick: () => 0,
        getConsoleSender: () => stub<ConsoleSender>({ getFormattedUsername: () => 'Console' }),
        getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} }),
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [], isOp }),
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getProximityBroadcast: () => true,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4
            })
    });

    const world = stub<World>({
        getName: () => 'test',
        getServer: () => server,
        getPlayerData: async () => ({}),
        broadcastMove: async () => {},
        removeEntity: async () => {},
        getPlayers: () => [],
        getSpawnPosition: async () => new Vector3(0, 64, 0),
        // Feet one block above the stored spawn, centered, as a Bedrock server places them.
        placePlayerSpawn: async () => ({
            requested: new Vector3(0.5, 65, 0.5),
            position: new Vector3(0.5, 65, 0.5),
            relocated: false
        }),
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
        getBlock: async () => stub<Block>({ getName: () => (underwater ? 'minecraft:water' : 'minecraft:air') }),
        sendActorEvent: async (_entity, event) => void actorEvents.push(event),
        sendActorSound: async (_entity, sound) => void actorSounds.push(sound)
    });

    const connection = stub<ClientConnection>({
        getRakNetSession: () => stub<RakNetSession>({ getAddress: () => new InetAddress('127.0.0.1', 19132) }),
        sendDataPacket: async (packet) => void sent.push(packet),
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async (...args) => void disconnects.push(args)
    });

    const player = new Player({
        position: new Position(0, 64, 0, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid: UUID.fromRandom(),
            name: 'Tester',
            xuid: '',
            randomId: 0,
            locale: 'en_US',
            skin: null,
            device: null
        }
    });

    createConnectedPlayer({ server, connection, player });

    // `update` does nothing for a player who never finished joining.
    player['connected'] = true;

    return { player, sent, events, actorEvents, actorSounds, disconnects, isOp };
};

/** Runs `n` ticks, the way the world does. */
const tick = async (player: Player, n: number, from = 1) => {
    for (let i = 0; i < n; i++) await player.update(from + i);
};

/** Walks the player `blocks` meters east, one meter at a time, as movement packets do. */
const move = async (player: Player, blocks: number, type = PositionMode.Normal) => {
    for (let i = 0; i < blocks; i++) {
        const position = player.getPosition();
        await player.setPosition({ position: new Vector3(position.getX() + 1, 64, 0), type }, false);
    }
};

describe('Player', () => {
    describe('isOp', () => {
        it('checks operator status by UUID', () => {
            const { player, isOp } = fakePlayer();

            player.isOp();

            expect(isOp).toHaveBeenCalledWith(player.getUUID().toString());
        });
    });

    describe('enable', () => {
        it('sends nothing', async () => {
            // It runs during login, before the client has `PlayStatus(LoginSuccess)`. The
            // gamemode, settings and abilities it used to send from here now go out from the
            // join burst after StartGame, where a retail client will accept them.
            const { player, sent } = fakePlayer();

            await player.enable();

            expect(sent).toEqual([]);
            expect(player.isOnline()).toBe(true);
        });
    });

    describe('kick', () => {
        it('disconnects with the reason shown and the kicked code', async () => {
            const { player, disconnects } = fakePlayer();

            await player.kick('Cheating');

            expect(disconnects).toEqual([['Cheating', false, DisconnectReason.KICKED]]);
        });

        it('passes another code through, as the shutdown does', async () => {
            const { player, disconnects } = fakePlayer();

            await player.kick('Server closed.', DisconnectReason.SHUTDOWN);

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
            const { player } = fakePlayer();

            player.addExhaustion(4);
            expect(player.getSaturation()).toBe(19);
            expect(player.getFood()).toBe(20);
        });

        it('eats into food once saturation is gone', () => {
            const { player } = fakePlayer();
            player.setSaturation(0);

            player.addExhaustion(4);
            expect(player.getFood()).toBe(19);
        });

        it('keeps the remainder rather than rounding it away', () => {
            const { player } = fakePlayer();

            player.addExhaustion(4.5);
            expect(player.getSaturation()).toBe(19);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.5);
        });

        it('spends several points at once for a large amount', () => {
            const { player } = fakePlayer();

            player.addExhaustion(12);
            expect(player.getSaturation()).toBe(17);
        });

        it('never drops below an empty bar', () => {
            const { player } = fakePlayer();
            player.setSaturation(0);

            player.addExhaustion(4 * 100);
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
            const { player } = fakePlayer();
            player.metadata.setSprinting(true);

            await move(player, 40);

            // 40 m * 0.1 = 4.0, exactly one point of saturation.
            expect(player.getSaturation()).toBe(19);
        });

        it('costs a tenth of that at a walk', async () => {
            const { player } = fakePlayer();

            await move(player, 40);

            expect(player.getSaturation()).toBe(20);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.4);
        });

        it('empties the bar over a long enough sprint', async () => {
            const { player } = fakePlayer();
            player.setSaturation(0);
            player.metadata.setSprinting(true);

            await move(player, 40 * 20);

            expect(player.getFood()).toBe(0);
        });

        it('charges nothing for a teleport', async () => {
            const { player } = fakePlayer();
            player.metadata.setSprinting(true);

            await move(player, 40, PositionMode.Teleport);

            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('charges nothing for standing still', async () => {
            const { player } = fakePlayer();
            player.metadata.setSprinting(true);

            const position = player.getPosition();
            await player.setPosition({ position: new Vector3(position.getX(), 64, 0) }, false);

            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('charges nothing for falling', async () => {
            const { player } = fakePlayer();
            player.metadata.setSprinting(true);

            await player.setPosition({ position: new Vector3(0, 60, 0) }, false);

            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
        });

        it('costs more to jump while sprinting than to jump standing still', () => {
            const { player: walker } = fakePlayer();
            walker.addJumpExhaustion();

            const { player: sprinter } = fakePlayer();
            sprinter.metadata.setSprinting(true);
            sprinter.addJumpExhaustion();

            expect(walker.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.05);
            expect(sprinter.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(0.2);
        });

        it('leaves creative and spectator players alone', async () => {
            for (const gamemode of [Gametype.CREATIVE, Gametype.SPECTATOR]) {
                const { player } = fakePlayer();
                player.gamemode = gamemode;
                player.metadata.setSprinting(true);

                await move(player, 100);

                expect(player.getFood()).toBe(20);
                expect(player.getSaturation()).toBe(20);
            }
        });
    });

    describe('breath', () => {
        it('spends a tick of air per tick underwater, and stops breathing', async () => {
            const { player } = fakePlayer({ underwater: true });

            await tick(player, 40);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS - 40);
            expect(player.metadata.breathing).toBe(false);
        });

        it('drowns once the air is gone, two half-hearts a second', async () => {
            const { player } = fakePlayer({ underwater: true });

            await tick(player, MAX_AIR_TICKS);
            expect(player.metadata.air).toBe(0);
            expect(player.getHealth()).toBe(20); // empty lungs, but not yet hurt

            await tick(player, 20);
            expect(player.getHealth()).toBe(18);

            await tick(player, 20);
            expect(player.getHealth()).toBe(16);
        });

        it('is hurt visibly, not just numerically', async () => {
            const { player, actorEvents } = fakePlayer({ underwater: true });

            await tick(player, MAX_AIR_TICKS + 20);

            expect(actorEvents).toContain(ActorEvent.HURT_ANIMATION);
        });

        it('refills, faster than it emptied, back on dry land', async () => {
            const { player } = fakePlayer({ underwater: true });
            await tick(player, 100);
            const held = player.metadata.air;

            const { player: surfaced } = fakePlayer();
            surfaced.metadata.setAir(held);
            await tick(surfaced, 10);

            expect(surfaced.metadata.air).toBeGreaterThan(held + 10);
            expect(surfaced.metadata.breathing).toBe(true);
        });

        it('never fills past a lungful', async () => {
            const { player } = fakePlayer();

            await tick(player, 100);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
        });

        it('does not drown a creative player', async () => {
            const { player } = fakePlayer({ underwater: true });
            player.gamemode = Gametype.CREATIVE;

            await tick(player, MAX_AIR_TICKS + 60);

            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
            expect(player.getHealth()).toBe(20);
        });

        it('reports the bubbles without a packet per tick', async () => {
            const { player, sent } = fakePlayer({ underwater: true });
            sent.length = 0;

            await tick(player, 100);

            const updates = sent.filter((packet) => packet instanceof SetActorDataPacket);
            expect(updates.length).toBeGreaterThan(0);
            expect(updates.length).toBeLessThan(20);
        });
    });

    describe('hunger, over time', () => {
        it('starves a player with an empty bar', async () => {
            const { player } = fakePlayer();
            player.setFood(0);

            await tick(player, 80, 1);

            expect(player.getHealth()).toBe(19);
        });

        it('heals a well-fed player, and charges them for it', async () => {
            const { player } = fakePlayer();
            await player.setHealth(10);

            await tick(player, 80, 1);

            expect(player.getHealth()).toBe(11);
            // The heal costs 6 exhaustion: one point of saturation, with 2 left over.
            expect(player.getSaturation()).toBe(19);
            expect(player.attributes.getValue(AttributeIds.PlayerExhaustion)).toBeCloseTo(2);
        });

        it('leaves the food of a player at full health alone', async () => {
            const { player } = fakePlayer();

            await tick(player, 200);

            expect(player.getFood()).toBe(20);
            expect(player.getSaturation()).toBe(20);
        });

        it('does not heal a hungry player', async () => {
            const { player } = fakePlayer();
            player.setFood(10);
            await player.setHealth(10);

            await tick(player, 200);

            expect(player.getHealth()).toBe(10);
        });
    });

    describe('death', () => {
        it('announces it, and says how', async () => {
            const { player, events } = fakePlayer({ underwater: true });
            // Fed enough not to starve, not enough to heal back through the drowning.
            player.setFood(10);
            await player.setHealth(1);

            await tick(player, MAX_AIR_TICKS + 20);

            expect(player.isAlive()).toBe(false);
            const chat = events.find(([name]) => name === 'chat');
            expect(chat?.[1].getChat().getMessage()).toBe('%death.attack.drown');
        });

        it('stops taking damage once dead', async () => {
            const { player } = fakePlayer({ underwater: true });
            player.setFood(10);
            await player.setHealth(1);

            await tick(player, MAX_AIR_TICKS + 200);

            expect(player.getHealth()).toBe(0);
        });

        it('comes back whole, at the spawn', async () => {
            const { player } = fakePlayer({ underwater: true });
            player.setFood(3);
            await player.setHealth(1);
            await tick(player, MAX_AIR_TICKS + 20);

            await player.respawn();

            expect(player.getHealth()).toBe(20);
            expect(player.getFood()).toBe(20);
            expect(player.metadata.air).toBe(MAX_AIR_TICKS);
            expect(player.metadata.breathing).toBe(true);
            // Where the `ReadyToSpawn` put the client: the spawn block's corner, the eyes 1.62
            // above it, as a Bedrock Dedicated Server says.
            const { x, y, z } = player.getPosition();
            expect({ x, y, z }).toEqual({ x: 0, y: 64 + EYE_HEIGHT, z: 0 });
        });

        it('tells the client it is alive again as a Bedrock server does, without moving it', async () => {
            const { player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await player.setHealth(1);
            await tick(player, MAX_AIR_TICKS + 20);
            sent.length = 0;

            await player.respawn();

            expect(sent.map((packet) => packet.constructor.name)).toEqual([
                'ActorEventPacket',
                'SetHealthPacket',
                'UpdateAttributesPacket',
                'SetActorDataPacket'
            ]);
            expect(sent[0]).toMatchObject({ runtimeEntityId: player.getRuntimeId(), event: ActorEvent.SPAWN_ALIVE });
            expect(sent[1]).toMatchObject({ health: 20 });
        });

        it('leaves a living player as they are', async () => {
            const { player } = fakePlayer();
            await player.setHealth(7);

            await player.respawn();

            expect(player.getHealth()).toBe(7);
        });

        it('says where the player will come back the moment they die', async () => {
            // The client will not even offer the respawn button until it knows, which is what
            // left a death screen stuck on "Respawning".
            const { player, sent } = fakePlayer({ underwater: true });
            // Fed, and regeneration would heal them faster than drowning kills.
            player.setFood(10);
            await player.setHealth(1);

            await tick(player, MAX_AIR_TICKS + 20);

            const respawns = sent.filter((packet) => packet instanceof RespawnPacket);
            expect(respawns).toHaveLength(1);
            // As a Bedrock Dedicated Server sends it: the eyes over the spawn block's center, at
            // the spawn's own height, and runtime id 0.
            expect(respawns[0]).toMatchObject({
                state: PlayerRespawnState.SearchingForSpawn,
                position: new Vector3(0.5, 64 + EYE_HEIGHT, 0.5),
                runtimeEntityId: 0n
            });
        });

        it('tells the dying client why, for its death screen, after the respawn', async () => {
            // The same key and parameters as the chat line, minus the `%` the chat packet
            // wants: `DeathInfo` takes the bare key, as PocketMine sends it.
            const { player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await player.setHealth(1);

            await tick(player, MAX_AIR_TICKS + 20);

            const deaths = sent.filter((packet) => packet instanceof DeathInfoPacket);
            expect(deaths).toHaveLength(1);
            expect(deaths[0]?.cause).toBe('death.attack.drown');
            expect(deaths[0]?.messages).toEqual(['Tester']);
            expect(sent.indexOf(deaths[0])).toBeGreaterThan(
                sent.findIndex((packet) => packet instanceof RespawnPacket)
            );
        });

        it('sends no respawn packet when the button is pressed', async () => {
            // That packet is the answer to the client's own `ClientReadyToSpawn`, and
            // belongs to `RespawnHandler`. Sent here it arrives a step early, and the client
            // never leaves its screen.
            const { player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await player.setHealth(1);
            await tick(player, MAX_AIR_TICKS + 20);
            sent.length = 0;

            await player.respawn();

            expect(sent.filter((packet) => packet instanceof RespawnPacket)).toHaveLength(0);
        });
    });

    describe('setWorld', () => {
        it('takes the old world entities off the client before the dimension change', async () => {
            // The client keeps rendering what it was never told to remove. Changing dimension
            // does not clear it, so every mob from the old world has to be despawned by hand.
            const { player, sent } = fakePlayer();
            player.viewDistance = 10;

            // Runtime ids come from one counter for the whole file, so a fixed id would sooner or
            // later be the player's own.
            const mobId = player.getRuntimeId() + 1_000_000n;
            const mob = stub<Entity>({
                getRuntimeId: () => mobId,
                getPosition: () => new Position(4, 64, 4, player.getWorld()),
                getTrackingRange: () => 8,
                spawnTo: async () => {}
            });
            await player.getNetworkSession().considerEntity(mob);
            expect(player.getNetworkSession().tracks(mobId)).toBe(true);
            sent.length = 0;

            const target = stub<World>({
                getName: () => 'other',
                addEntity: async () => {}
            });
            await player.setWorld(target);

            const removal = sent.findIndex(
                (packet) => packet instanceof RemoveActorPacket && packet.uniqueEntityId === mobId
            );
            const dimensionChange = sent.findIndex((packet) => packet instanceof ChangeDimensionPacket);
            expect(removal).toBeGreaterThanOrEqual(0);
            expect(dimensionChange).toBeGreaterThan(removal);
            expect(player.getNetworkSession().tracks(mobId)).toBe(false);
            expect(player.getWorld()).toBe(target);
        });

        it('gives every dimension change its own loading screen id, which the session then matches', async () => {
            // The client reports each screen back by the id its ChangeDimensionPacket carried,
            // and the docs want that id unique among the screens still open.
            const { player, sent } = fakePlayer();
            const target = stub<World>({ getName: () => 'other', addEntity: async () => {} });

            await player.setWorld(target);

            const changes = sent.filter((packet) => packet instanceof ChangeDimensionPacket);
            const ids = changes.flatMap((packet) => (packet.loadingScreenId === null ? [] : [packet.loadingScreenId]));
            expect(changes.length).toBeGreaterThan(1);
            expect(ids).toHaveLength(changes.length);
            expect(new Set(ids).size).toBe(ids.length);

            const session = player.getNetworkSession();
            for (const id of ids) expect(session.endLoadingScreen(id)).toBe(true);
            for (const id of ids) expect(session.endLoadingScreen(id)).toBe(false);
        });
    });

    describe('syncing', () => {
        it('sends what changed, and only what changed', async () => {
            const { player, sent } = fakePlayer();
            player.metadata.setSprinting(true);
            await player.getNetworkSession().sendAttributes();
            sent.length = 0;

            await move(player, 40);
            await player.update(1);

            const packets = sent.filter((packet) => packet instanceof UpdateAttributesPacket);
            expect(packets).toHaveLength(1);
            expect(packets[0]?.attributes.map((attribute) => attribute.getName()).sort()).toEqual(
                [AttributeIds.PlayerExhaustion, AttributeIds.PlayerSaturation].sort()
            );
        });

        it('says nothing when nothing moved', async () => {
            const { player, sent } = fakePlayer();
            await player.getNetworkSession().sendAttributes();
            sent.length = 0;

            await player.update(1);

            expect(sent.filter((packet) => packet instanceof UpdateAttributesPacket)).toHaveLength(0);
        });
    });
});
