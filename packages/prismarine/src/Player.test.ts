import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Player from './Player';
import { AttributeIds } from './entity/Attribute';
import { MAX_AIR_TICKS, MetadataFlag } from './entity/Metadata';
import { ActorEvent } from './network/packet/ActorEventPacket';
import RespawnPacket, { RespawnState } from './network/packet/RespawnPacket';
import SetActorDataPacket from './network/packet/SetActorDataPacket';
import UpdateAttributesPacket from './network/packet/UpdateAttributesPacket';
import { createConnectedPlayer } from './network/createConnectedPlayer';
import MovementType from './network/type/MovementType';
import { Position } from './world/Position';

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

    const server = {
        on: () => {},
        post: () => {},
        emit: async (name: string, event: any) => void events.push([name, event]),
        getTick: () => 0,
        getConsole: () => ({ getFormattedUsername: () => 'Console' }),
        getChunkScheduler: () => ({ add: () => {}, remove: () => {} }),
        getConfig: () => ({
            getProximityBroadcast: () => true,
            getEntityTrackingHysteresis: () => 2,
            getEntityTrackingInterval: () => 4
        })
    };

    const world = {
        getName: () => 'test',
        getServer: () => server,
        broadcastMove: async () => {},
        getPlayers: () => [],
        getSpawnPosition: async () => new Vector3(0, 64, 0),
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        getBlock: async () => ({ getName: () => (underwater ? 'minecraft:water' : 'minecraft:air') }),
        sendActorEvent: async (_entity: any, event: number) => void actorEvents.push(event),
        sendActorSound: async (_entity: any, sound: number) => void actorSounds.push(sound)
    };

    const connection = {
        getRakNetSession: () => ({ getAddress: () => ({}) }),
        sendDataPacket: async (packet: any) => void sent.push(packet),
        attachPlayerSession: () => {},
        closePlayerSession: async () => {}
    };

    const player = new Player({
        position: new Position(0, 64, 0, world as any),
        address: {} as any,
        identity: {
            uuid: {} as any,
            name: 'Tester',
            xuid: '',
            randomId: 0,
            locale: 'en_US',
            skin: null,
            device: null
        }
    });

    createConnectedPlayer({ server: server as any, connection: connection as any, player });

    // `update` does nothing for a player who never finished joining.
    (player as any).connected = true;

    return { player, sent, events, actorEvents, actorSounds };
};

/** Runs `n` ticks, the way the world does. */
const tick = async (player: Player, n: number, from = 1) => {
    for (let i = 0; i < n; i++) await player.update(from + i);
};

/** Walks the player `blocks` metres east, one metre at a time, as movement packets do. */
const move = async (player: Player, blocks: number, type = MovementType.Normal) => {
    for (let i = 0; i < blocks; i++) {
        const position = player.getPosition();
        await player.setPosition({ position: new Vector3(position.getX() + 1, 64, 0), type }, false);
    }
};

describe('Player', () => {
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
        it('costs 0.1 per metre sprinted', async () => {
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

            await move(player, 40, MovementType.Teleport);

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
            expect(player.getPosition().getY()).toBe(64);
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
            expect(respawns[0].state).toBe(RespawnState.SERVER_SEARCHING_FOR_SPAWN);
        });

        it('sends no respawn packet when the button is pressed', async () => {
            // That packet is the answer to the client's own `CLIENT_READY_TO_SPAWN`, and
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
            expect(packets[0].attributes.map((attribute: any) => attribute.getName()).sort()).toEqual(
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
