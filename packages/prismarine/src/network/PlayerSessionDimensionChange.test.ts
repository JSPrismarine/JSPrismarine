import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Dimension } from '@jsprismarine/minecraft';
import {
    ClientPlayMode,
    InputMode,
    NewInteractionModel,
    PlayStatus,
    PlayerActionType,
    PositionMode
} from '@jsprismarine/protocol';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import InventoryContentPacket from '@jsprismarine/protocol/packet/InventoryContentPacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import NetworkChunkPublisherUpdatePacket from '@jsprismarine/protocol/packet/NetworkChunkPublisherUpdatePacket';
import PlayerActionPacket from '@jsprismarine/protocol/packet/PlayerActionPacket';
import PlayerAuthInputPacket from '@jsprismarine/protocol/packet/PlayerAuthInputPacket';
import { PlayStatusPacket } from '@jsprismarine/protocol';
import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import SetSpawnPositionPacket, { SpawnPositionType } from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import ServerboundLoadingScreenPacket, {
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import StopSoundPacket from '@jsprismarine/protocol/packet/StopSoundPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { EYE_HEIGHT } from '../entity/Human';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import { Dimensions, dimensionTypeOf, FIRST_CUSTOM_DIMENSION_ID } from '../world/DimensionType';
import type { DimensionType } from '../world/DimensionType';
import { Position } from '../world/Position';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import Chunk from '../world/chunk/Chunk';
import Codec2193 from './codec/Codec2193';
import PlayerAuthInputHandler from './handler/PlayerAuthInputHandler';
import ServerboundLoadingScreenHandler from './handler/ServerboundLoadingScreenHandler';
import { playerAuthInputToProtocol } from './PlayerAuthInputAdapter';
import type { Arrival } from './PlayerSession';

/** A destination world of one dimension, whose chunks are empty and carry that dimension. */
const worldOf = (dimension: DimensionType, roster: string[] = [], level?: Level) =>
    stub<World>({
        getName: () => `${dimension.name} world`,
        getDimension: () => dimension,
        getLevel: () => {
            if (level === undefined) throw new Error('this world was built without a level');
            return level;
        },
        addEntity: async () => void roster.push('add'),
        broadcastMove: async () => {},
        getPlayers: () => [],
        getSpawnPosition: async () => new Vector3(8, 70, 8),
        getChunk: async (x, z) => new Chunk(x, z, new Map(), dimension)
    });

const arrivalIn = (world: World, extra: Partial<Arrival> = {}): Arrival => ({
    world,
    position: new Vector3(100.5, 70, -20.5),
    yaw: 90,
    pitch: 10,
    ...extra
});

const indexOf = (sent: unknown[], matches: (packet: unknown) => boolean) => sent.findIndex(matches);

/** The input a client sends standing at `position`, with the fields `rejectionReason` checks. */
const inputAt = (position: Vector3): PlayerAuthInputPacket =>
    new PlayerAuthInputPacket(
        playerAuthInputToProtocol(
            {
                pitch: 0,
                yaw: 0,
                position,
                moveVector: { x: 0, y: 0 },
                headYaw: 0,
                inputData: new Set(),
                inputMode: InputMode.Undefined,
                playMode: ClientPlayMode.Normal,
                interactionModel: NewInteractionModel.Touch,
                interactRotation: { x: 0, y: 0 },
                tick: 1n,
                delta: Vector3.ZERO,
                itemUseTransaction: null,
                itemStackRequest: null,
                blockActions: null,
                vehicleRotation: null,
                predictedVehicle: null,
                analogMoveVector: { x: 0, y: 0 },
                cameraOrientation: Vector3.ZERO,
                rawMoveVector: { x: 0, y: 0 }
            },
            Codec2193.context
        )
    );

const screenClosed = (id: number) =>
    new ServerboundLoadingScreenPacket({
        loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
        loadingScreenId: id
    });

describe('PlayerSession.changeWorld', () => {
    it('saves the record to the world being left, then moves the roster, before any packet', async () => {
        const { player, roster, sent } = fakePlayer();
        const target = worldOf(Dimensions.Nether, roster);
        sent.length = 0;

        await player.getNetworkSession().changeWorld(arrivalIn(target));

        expect(roster).toEqual(['save', 'remove', 'add']);
        expect(player.getWorld()).toBe(target);
        expect(player.getPosition().getX()).toBe(100.5);
        expect(player.getPosition().getZ()).toBe(-20.5);
        expect(player.yaw).toBe(90);
        expect(player.pitch).toBe(10);
    });

    it('sends the change in the order the client expects, with the arrival chunks queued', async () => {
        const { player, sent } = fakePlayer();
        const session = player.getNetworkSession();
        const mobId = player.getRuntimeId() + 1_000_000n;
        await session.considerEntity(
            stub<Entity>({
                getRuntimeId: () => mobId,
                getPosition: () => new Position(4, 64, 4, player.getWorld()),
                getTrackingRange: () => 8,
                spawnTo: async () => {}
            })
        );
        sent.length = 0;

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));

        const removal = indexOf(sent, (p) => p instanceof RemoveActorPacket && p.uniqueEntityId === mobId);
        const change = indexOf(sent, (p) => p instanceof ChangeDimensionPacket);
        const stopSound = indexOf(sent, (p) => p instanceof StopSoundPacket && p.stopAllSounds);
        const publisher = indexOf(sent, (p) => p instanceof NetworkChunkPublisherUpdatePacket);
        const ack = indexOf(
            sent,
            (p) =>
                p instanceof PlayerActionPacket &&
                p.getPacketData()?.action === PlayerActionType.ChangeDimensionAck &&
                p.getPacketData()?.runtimeEntityId === player.getRuntimeId()
        );
        const spawn = indexOf(
            sent,
            (p) => p instanceof PlayStatusPacket && p.getPacketData()?.status === PlayStatus.PlayerSpawn
        );

        expect(removal).toBeGreaterThanOrEqual(0);
        expect(change).toBeGreaterThan(removal);
        expect(stopSound).toBeGreaterThan(change);
        expect(publisher).toBeGreaterThan(stopSound);
        expect(ack).toBeGreaterThan(publisher);
        expect(spawn).toBeGreaterThan(ack);
        expect(session.sender.size).toBeGreaterThan(0);
        expect(session.tracks(mobId)).toBe(false);
    });

    it('sends one ChangeDimension carrying the target Bedrock id and the pending screen id', async () => {
        const { player, sent } = fakePlayer();
        const session = player.getNetworkSession();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));

        const changes = sent.filter((p) => p instanceof ChangeDimensionPacket);
        expect(changes).toHaveLength(1);
        const data = changes[0]!.getPacketData();
        expect(data?.dimension).toBe(Dimensions.Nether.bedrockId);
        expect(data?.respawn).toBe(false);
        expect(data?.position).toEqual({ x: 100.5, y: 70 + EYE_HEIGHT, z: -20.5 });
        expect(data?.loadingScreenId).toBe(session.pendingDimensionChange()?.loadingScreenId);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(player.getWorld());
    });

    it('stands the player with their feet at the arrival, and sends the eyes above it to the client', async () => {
        // Every producer of an arrival hands over feet: a portal's exit, the End platform, a
        // spawn block. The player's own position is their eyes, as the client reports it, so
        // the arrival is raised once and the packet and the closing teleport carry the same
        // eyes. Written straight in, the feet would sink 1.62 blocks into the arrival floor.
        const { player, sent, level } = fakePlayer();
        const session = player.getNetworkSession();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether, [], level)));

        expect(player.getFeetY()).toBeCloseTo(70);
        expect(player.getPosition().getY()).toBeCloseTo(70 + EYE_HEIGHT);
        const change = sent.find((p) => p instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.position.getY()).toBeCloseTo(70 + EYE_HEIGHT);

        sent.length = 0;
        await session.completeDimensionChange(session.pendingDimensionChange()!.loadingScreenId);
        const move = sent.find((p) => p instanceof MovePlayerPacket);
        expect(move?.getPacketData()?.mode).toBe(PositionMode.Teleport);
        expect(move?.getPacketData()?.position.y).toBe(change?.getPacketData()?.position.getY());
    });

    it('detours through another dimension only when the two worlds share a Bedrock id', async () => {
        const { player, sent } = fakePlayer();
        const session = player.getNetworkSession();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Overworld)));

        const changes = sent.filter((p) => p instanceof ChangeDimensionPacket);
        expect(changes.map((p) => p.getPacketData()?.dimension)).toEqual([
            Dimension.OVERWORLD,
            Dimension.NETHER,
            Dimension.NETHER,
            Dimension.OVERWORLD
        ]);
        const ids = changes.map((p) => p.getPacketData()?.loadingScreenId);
        expect(new Set(ids).size).toBe(4);
        expect(ids.at(-1)).toBe(session.pendingDimensionChange()?.loadingScreenId);
        for (const id of ids) expect(session.endLoadingScreen(id!)).toBe(true);
    });

    it('refuses a second change while the first is still pending, leaving every roster alone', async () => {
        const { player, roster, sent, logged } = fakePlayer();
        const session = player.getNetworkSession();
        const first = worldOf(Dimensions.Nether, roster);
        const second = worldOf(Dimensions.TheEnd, roster);

        await session.changeWorld(arrivalIn(first));
        const pending = session.pendingDimensionChange();
        sent.length = 0;

        // A player who arrived inside the exit portal is ticked while the client still shows
        // the loading screen, and is in the portal again once the cooldown runs out.
        await session.changeWorld(arrivalIn(second));

        expect(roster).toEqual(['save', 'remove', 'add']);
        expect(sent).toHaveLength(0);
        expect(player.getWorld()).toBe(first);
        expect(session.pendingDimensionChange()).toBe(pending);
        expect(logged.at(-1)).toContain('pending');
    });

    it('refuses a target of a custom dimension type, which no client has been seen to accept', async () => {
        const { player, server, roster, sent } = fakePlayer();
        const session = player.getNetworkSession();
        const errors: string[] = [];
        server.getLogger = () =>
            stub<Logger>({ debug: () => {}, verbose: () => {}, error: (message) => void errors.push(String(message)) });
        const sky = dimensionTypeOf(Dimensions.Overworld.java, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID);
        const origin = player.getWorld();
        sent.length = 0;

        await session.changeWorld(arrivalIn(worldOf(sky, roster)));

        expect(roster).toEqual([]);
        expect(sent).toHaveLength(0);
        expect(player.getWorld()).toBe(origin);
        expect(session.pendingDimensionChange()).toBeUndefined();
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('mypack:sky');
    });

    it('passes a respawn through to the client', async () => {
        const { player, sent } = fakePlayer();

        await player.getNetworkSession().changeWorld(arrivalIn(worldOf(Dimensions.Nether), { respawn: true }));

        const change = sent.find((p) => p instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.respawn).toBe(true);
        // `RespawnHandler` passes the spawn block, whose height is the feet's, so the body
        // stands where `Player.respawn` will put the eyes once the client asks to live again.
        expect(player.getPosition().getY()).toBeCloseTo(70 + EYE_HEIGHT);
    });

    it('sends the arrival chunks with the target dimension id', async () => {
        const { player, sent } = fakePlayer();
        const session = player.getNetworkSession();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
        await session.deliver(6, -2);
        await session.flush();

        const chunks = sent.filter((p) => p instanceof LevelChunkPacket);
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.every((p) => p.getPacketData()?.dimension === Dimensions.Nether.bedrockId)).toBe(true);
    });

    it('drops the client input until the screen it was given closes, and ignores another id', async () => {
        const { player, server, sent, logged, level } = fakePlayer();
        const session = player.getNetworkSession();
        const inputs = new PlayerAuthInputHandler();
        const screens = new ServerboundLoadingScreenHandler();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether, [], level)));
        const id = session.pendingDimensionChange()!.loadingScreenId;
        sent.length = 0;

        // The client is still reporting from the old world's coordinates.
        await inputs.handle(inputAt(new Vector3(3, 70, -4)), server, session);
        expect(player.getPosition().getX()).toBe(100.5);

        await screens.handle(screenClosed(id + 7), server, session);
        expect(session.pendingDimensionChange()?.loadingScreenId).toBe(id);
        expect(logged.at(-1)).toContain(`closed loading screen ${id + 7}`);
        expect(sent.filter((p) => p instanceof MovePlayerPacket)).toHaveLength(0);

        await screens.handle(screenClosed(id), server, session);
        expect(session.pendingDimensionChange()).toBeUndefined();

        await inputs.handle(inputAt(new Vector3(3, 70, -4)), server, session);
        expect(player.getPosition().getX()).toBe(3);
    });

    it('finishes the change with a teleport to the arrival, the attributes, the inventory and the spawn', async () => {
        const { player, sent, level } = fakePlayer();
        const session = player.getNetworkSession();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether, [], level)));
        const id = session.pendingDimensionChange()!.loadingScreenId;
        sent.length = 0;

        expect(await session.completeDimensionChange(id)).toBe(true);

        const move = indexOf(
            sent,
            (p) =>
                p instanceof MovePlayerPacket &&
                p.getPacketData()?.mode === PositionMode.Teleport &&
                p.getPacketData()?.position.x === 100.5
        );
        const attributes = indexOf(sent, (p) => p instanceof UpdateAttributesPacket);
        const inventory = indexOf(sent, (p) => p instanceof InventoryContentPacket);
        const spawn = indexOf(sent, (p) => p instanceof SetSpawnPositionPacket);
        expect(move).toBeGreaterThanOrEqual(0);
        expect(attributes).toBeGreaterThan(move);
        expect(inventory).toBeGreaterThan(attributes);
        expect(spawn).toBeGreaterThan(inventory);

        // No spawn point of their own, so the level's Overworld spawn in the Overworld, which
        // is where `Player.getRespawnPoint` sends them. The Nether world's own spawn is not it.
        expect(sent[spawn]?.getPacketData()).toEqual({
            type: SpawnPositionType.PlayerRespawn,
            position: { x: 0, y: 64, z: 0 },
            dimension: Dimensions.Overworld.bedrockId,
            blockPosition: { x: 0, y: 64, z: 0 }
        });

        // Closed once. The client reporting the same id again is not a second change.
        expect(await session.completeDimensionChange(id)).toBe(false);
    });

    it('rolls the credits once and holds the arrival instead of changing world', async () => {
        const { player, sent, logged } = fakePlayer();
        const session = player.getNetworkSession();
        const arrival = arrivalIn(worldOf(Dimensions.Nether));
        sent.length = 0;

        await session.startCredits(arrival);

        const credits = sent.filter((p): p is ShowCreditsPacket => p instanceof ShowCreditsPacket);
        expect(credits).toHaveLength(1);
        expect(credits[0]!.creditsState).toBe(CreditsState.Start);
        expect(credits[0]!.playerRuntimeId).toBe(player.getRuntimeId());
        expect(sent.some((p) => p instanceof ChangeDimensionPacket)).toBe(false);
        expect(session.pendingCreditsArrival()).toBe(arrival);
        expect(session.pendingDimensionChange()).toBeUndefined();

        // A second start while one is pending is refused, like a second `changeWorld`.
        sent.length = 0;
        await session.startCredits(arrival);
        expect(sent).toHaveLength(0);
        expect(logged.at(-1)).toContain('credits');
    });

    it('drops the client input while the credits roll, as a pending change does', async () => {
        const { player, server } = fakePlayer();
        const session = player.getNetworkSession();
        const inputs = new PlayerAuthInputHandler();
        await session.startCredits(arrivalIn(worldOf(Dimensions.Nether)));

        await inputs.handle(inputAt(new Vector3(3, 70, -4)), server, session);

        expect(player.getPosition().getX()).toBe(0);
    });

    it('finishes the held arrival as a respawn change when the credits are over', async () => {
        const { player, sent } = fakePlayer();
        const session = player.getNetworkSession();
        await session.startCredits(arrivalIn(worldOf(Dimensions.Nether)));
        sent.length = 0;

        expect(await session.completeCredits()).toBe(true);

        const change = sent.find((p): p is ChangeDimensionPacket => p instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.dimension).toBe(Dimensions.Nether.bedrockId);
        expect(change?.getPacketData()?.respawn).toBe(true);
        expect(session.pendingCreditsArrival()).toBeUndefined();
        expect(session.pendingDimensionChange()?.arrival.world).toBe(player.getWorld());

        // The client repeating the finish is not a second change.
        expect(await session.completeCredits()).toBe(false);
    });

    it('does not record a batch that was on the wire during the change as loaded', async () => {
        const { player, connection, sent } = fakePlayer();
        const session = player.getNetworkSession();
        let release = () => {};
        connection.sendPacketsAsync = async (packets) => {
            sent.push(...packets);
            await new Promise<void>((resolve) => {
                release = resolve;
            });
        };

        await session.deliver(0, 0);
        const inFlight = session.flush();
        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
        release();
        await inFlight;

        // The batch was the old world's chunk (0, 0). The new world's (0, 0) still has to be sent.
        expect(session['loadedChunks'].has(Chunk.packXZ(0, 0))).toBe(false);
    });
});
