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
import ServerboundLoadingScreenPacket, {
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import StopSoundPacket from '@jsprismarine/protocol/packet/StopSoundPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/DimensionType';
import type { DimensionType } from '../world/DimensionType';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import Chunk from '../world/chunk/Chunk';
import Codec2193 from './codec/Codec2193';
import PlayerAuthInputHandler from './handler/PlayerAuthInputHandler';
import ServerboundLoadingScreenHandler from './handler/ServerboundLoadingScreenHandler';
import { playerAuthInputToProtocol } from './PlayerAuthInputAdapter';
import type { Arrival } from './PlayerSession';

/** A destination world of one dimension, whose chunks are empty and carry that dimension. */
const worldOf = (dimension: DimensionType, roster: string[] = []) =>
    stub<World>({
        getName: () => `${dimension.name} world`,
        getDimension: () => dimension,
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
        expect(data?.position).toEqual({ x: 100.5, y: 70, z: -20.5 });
        expect(data?.loadingScreenId).toBe(session.pendingDimensionChange()?.loadingScreenId);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(player.getWorld());
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

    it('passes a respawn through to the client', async () => {
        const { player, sent } = fakePlayer();

        await player.getNetworkSession().changeWorld(arrivalIn(worldOf(Dimensions.Nether), { respawn: true }));

        const change = sent.find((p) => p instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.respawn).toBe(true);
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

    it('finishes the change with a teleport to the arrival, the attributes and the inventory', async () => {
        const { player, sent } = fakePlayer();
        const session = player.getNetworkSession();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
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
        expect(move).toBeGreaterThanOrEqual(0);
        expect(attributes).toBeGreaterThan(move);
        expect(inventory).toBeGreaterThan(attributes);

        // Closed once. The client reporting the same id again is not a second change.
        expect(await session.completeDimensionChange(id)).toBe(false);
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
