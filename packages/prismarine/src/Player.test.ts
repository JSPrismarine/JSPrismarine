import { Vector3 } from '@jsprismarine/math';
import { DisconnectReason, Gametype } from '@jsprismarine/minecraft';
import { PositionMode } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import type Player from './Player';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Entity } from './entity/Entity';
import { EYE_HEIGHT } from './entity/Human';
import { MAX_AIR_TICKS, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { ActorEvent } from '@jsprismarine/minecraft';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import DeathInfoPacket from '@jsprismarine/protocol/packet/DeathInfoPacket';
import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import SetActorDataPacket from '@jsprismarine/protocol/packet/SetActorDataPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { fakePlayer } from './testing/fakePlayer.test.helper';
import { stub } from './testing/stub.test.helper';
import type { Block } from './block/Block';
import { BlockState } from './block/state/BlockState';
import { Dimensions } from './world/DimensionType';
import { PORTALS } from './world/portal/rules';
import type { Level } from './world/Level';
import { Position } from './world/Position';
import type { BlockMining } from './world/BlockMining';
import type { World } from './world/World';

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
            const position = player.getPosition();
            expect({ x: position.getX(), y: position.getY(), z: position.getZ() }).toEqual({
                x: 0,
                y: 64 + EYE_HEIGHT,
                z: 0
            });
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
            expect(sent[1]?.getPacketData()).toMatchObject({ health: 20 });
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
            expect(respawns[0]?.getPacketData()).toMatchObject({
                state: PlayerRespawnState.SEARCHING_FOR_SPAWN,
                position: { x: 0.5, y: 64 + EYE_HEIGHT, z: 0.5 },
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
            const { player, sent } = fakePlayer({ underwater: true });
            player.setFood(10);
            await player.setHealth(1);
            await tick(player, MAX_AIR_TICKS + 20);
            sent.length = 0;

            await player.respawn();

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
                addEntity: async () => {},
                broadcastMove: async () => {},
                getBlock: async (x, y, z) => stub<Block>({ isSolid: () => nameAt(x, y, z) !== 'minecraft:air' }),
                getBlockState: async (x, y, z) => new BlockState(nameAt(x, y, z))
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

            const point = await fake.player.getRespawnPoint();

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
            await fake.player.setWorld(nether);
            // The fake Overworld is all air, so nothing stands where the bed was.
            fake.player.setSpawnPoint({ x: 10, y: 64, z: 10, dimension: 'minecraft:overworld' });

            const point = await fake.player.getRespawnPoint();

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
            await fake.player.setWorld(nether);

            const point = await fake.player.getRespawnPoint();

            expect(point.world).toBe(fake.world);
            expect(point.block).toEqual(new Vector3(0, 64, 0));
        });
    });

    describe('mining', () => {
        const mining: BlockMining = { position: new Vector3(2, 57, 16), face: 5, runtimeId: 1, progressPerTick: 5461 };
        const elsewhere = () =>
            stub<World>({
                getName: () => 'other',
                addEntity: async () => {},
                broadcastMove: async () => {},
                getSpawnPosition: async () => new Vector3(0, 64, 0),
                getDimension: () => Dimensions.Nether
            });

        it('animates the cracks every tick while a block is being mined, and stops after', async () => {
            const { player, cracked } = fakePlayer();

            player.setMining(mining);
            await tick(player, 3);
            player.setMining(null);
            await tick(player, 2, 4);

            expect(cracked).toEqual([mining, mining, mining]);
        });

        it('forgets the block once the world says it is not the one being mined any more', async () => {
            // Somebody else broke it. The world stopped its cracks; the player stops asking.
            const { player, cracked, mined } = fakePlayer();
            mined.stays = false;

            player.setMining(mining);
            await tick(player, 3);

            expect(cracked).toEqual([mining]);
            expect(player.getMining()).toBeNull();
        });

        it.each([
            ['disconnects', (player: Player) => player.disable()],
            ['dies', (player: Player) => player.setHealth(0)],
            ['changes game mode', (player: Player) => player.setGamemode(Gametype.CREATIVE)],
            ['changes world', (player: Player) => player.setWorld(elsewhere())]
        ])('stops the cracks when the player %s, rather than sending them every tick for good', async (_, end) => {
            const { player, stopped } = fakePlayer();
            player.gamemode = Gametype.SURVIVAL;
            player.setMining(mining);

            await end(player);

            expect(stopped).toEqual([mining.position]);
            expect(player.getMining()).toBeNull();
        });

        it('keeps mining through a game mode set to the one the player is in', async () => {
            const { player, stopped } = fakePlayer();
            player.gamemode = Gametype.SURVIVAL;
            player.setMining(mining);

            await player.setGamemode(Gametype.SURVIVAL);

            expect(stopped).toEqual([]);
            expect(player.getMining()).toBe(mining);
        });
    });

    describe('portal delays', () => {
        it('holds a survival player in a nether portal for 80 ticks and a creative one for none', () => {
            const { player } = fakePlayer();
            const nether = PORTALS['minecraft:portal']!;

            expect(player.getPortalTransitionTicks(nether)).toBe(80);
            expect(player.getPortalTransitionTicks()).toBe(80);

            player.gamemode = Gametype.CREATIVE;
            expect(player.getPortalTransitionTicks(nether)).toBe(0);
            expect(player.getPortalTransitionTicks()).toBe(0);
        });

        it('sends a player through an end portal on the first tick in any game mode', () => {
            const { player } = fakePlayer();
            const end = PORTALS['minecraft:end_portal']!;

            expect(player.getPortalTransitionTicks(end)).toBe(0);
            player.gamemode = Gametype.CREATIVE;
            expect(player.getPortalTransitionTicks(end)).toBe(0);
        });

        it('waits 10 ticks after a dimension change, not the 300 a mob does', () => {
            const { player } = fakePlayer();

            player.setPortalCooldown();

            expect(player.getPortalCooldown()).toBe(10);
        });
    });

    describe('setWorld', () => {
        const nether = () =>
            stub<World>({
                getName: () => 'other',
                addEntity: async () => {},
                broadcastMove: async () => {},
                getSpawnPosition: async () => new Vector3(8.5, 70, -3.5),
                getDimension: () => Dimensions.Nether
            });

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

            const target = nether();
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

        it("arrives at the new world's spawn, facing the way the player was", async () => {
            // The session does the change; this only chooses the arrival. A caller with a
            // destination of its own, such as a teleport, moves the player again afterwards.
            const { player, sent } = fakePlayer();
            player.yaw = 45;
            player.pitch = -10;

            await player.setWorld(nether());

            const change = sent.find((packet) => packet instanceof ChangeDimensionPacket);
            expect(change?.getPacketData()?.position).toEqual({ x: 8.5, y: 70, z: -3.5 });
            expect(change?.getPacketData()?.dimension).toBe(Dimensions.Nether.bedrockId);
            expect(player.getPosition().getX()).toBe(8.5);
            expect(player.yaw).toBe(45);
            expect(player.pitch).toBe(-10);
            expect(player.getNetworkSession().pendingDimensionChange()).toBeDefined();
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
