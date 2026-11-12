import { Vector3 } from '@jsprismarine/math';
import { Dimension, PlayerRespawnState } from '@jsprismarine/minecraft';
import {
    ClientPlayMode,
    InputMode,
    NewInteractionModel,
    PlayStatus,
    PlayerActionType,
    PlayerAuthInputData,
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
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import SetSpawnPositionPacket, { SpawnPositionType } from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import ServerboundLoadingScreenPacket, {
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import StopSoundPacket from '@jsprismarine/protocol/packet/StopSoundPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { describe, expect, it } from 'vitest';

import type { ShownEntity } from '../world/ShownActor';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { inputContext } from '../testing/handlerContext.test.helper';
import { serverInputContext } from '../testing/serverInputContext.test.helper';
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
import type PlayerSession from './PlayerSession';

/** A destination world of one dimension, whose chunks are empty and carry that dimension. */
const worldOf = (dimension: DimensionType, roster: string[] = [], level?: Level) =>
    stub<World>({
        getName: () => `${dimension.name} world`,
        getDimension: () => dimension,
        getLevel: () => {
            if (level === undefined) throw new Error('this world was built without a level');
            return level;
        },
        addPlayer: async () => void roster.push('add'),
        savePlayerData: async () => void roster.push('save'),
        removePlayer: async () => void roster.push('remove'),
        broadcastMove: async () => {},
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

/** Applies one client input as the input step does: the handler, then what it deferred and sent. */
const applyInput = async (
    handler: PlayerAuthInputHandler,
    packet: PlayerAuthInputPacket,
    server: Parameters<typeof serverInputContext>[0],
    session: PlayerSession
): Promise<void> => {
    const { context, settled } = serverInputContext(server, session);
    handler.handle(packet, context);
    await settled();
};

const indexOf = (sent: unknown[], matches: (packet: unknown) => boolean) => sent.findIndex(matches);

/** The input a client sends standing at `position`, with the fields `rejectionReason` checks. */
const inputAt = (position: Vector3, handledTeleport = false): PlayerAuthInputPacket =>
    new PlayerAuthInputPacket(
        playerAuthInputToProtocol(
            {
                pitch: 0,
                yaw: 0,
                position,
                moveVector: { x: 0, y: 0 },
                headYaw: 0,
                inputData: new Set(handledTeleport ? [PlayerAuthInputData.HANDLED_TELEPORT] : []),
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

const screenOpened = (id: number) =>
    new ServerboundLoadingScreenPacket({
        loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
        loadingScreenId: id
    });

const screenClosed = (id: number) =>
    new ServerboundLoadingScreenPacket({
        loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
        loadingScreenId: id
    });

describe('PlayerSession.changeWorld', () => {
    it('saves the record to the world being left, then moves the roster, before any packet', async () => {
        const { session, player, roster, sent } = fakePlayer();
        const target = worldOf(Dimensions.Nether, roster);
        sent.length = 0;

        await session.changeWorld(arrivalIn(target));

        expect(roster).toEqual(['save', 'remove', 'add']);
        expect(session.getWorld()).toBe(target);
        expect(player.getPosition().getX()).toBe(100.5);
        expect(player.getPosition().getZ()).toBe(-20.5);
        expect(player.yaw).toBe(90);
        expect(player.pitch).toBe(10);
    });

    it('sends the change in the order the client expects, with the arrival chunks queued', async () => {
        const { session, player, sent } = fakePlayer();
        const mobId = player.getRuntimeId() + 1_000_000n;
        await session.considerEntity(
            stub<ShownEntity>({
                getRuntimeId: () => mobId,
                getPosition: () => new Position(4, 64, 4, session.getWorld()),
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
        const { session, sent } = fakePlayer();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));

        const changes = sent.filter((p) => p instanceof ChangeDimensionPacket);
        expect(changes).toHaveLength(1);
        const data = changes[0]!.getPacketData();
        expect(data?.dimension).toBe(Dimensions.Nether.bedrockId);
        expect(data?.respawn).toBe(false);
        expect(data?.position).toEqual({ x: 100.5, y: 70 + EYE_HEIGHT, z: -20.5 });
        expect(data?.loadingScreenId).toBe(session.pendingDimensionChange()?.loadingScreenId);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(session.getWorld());
    });

    it('stands the player with their feet at the arrival, and sends the eyes above it to the client', async () => {
        // Every producer of an arrival hands over feet: a portal's exit, the End platform, a
        // spawn block. The player's own position is their eyes, as the client reports it, so
        // the arrival is raised once and the packet and the closing teleport carry the same
        // eyes. Written straight in, the feet would sink 1.62 blocks into the arrival floor.
        const { session, player, sent, level } = fakePlayer();

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
        const { session, sent } = fakePlayer();

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

    it('refuses a portal change while the first is still pending, leaving every roster alone', async () => {
        const { session, roster, sent, logged, level } = fakePlayer();
        const first = worldOf(Dimensions.Nether, roster, level);
        const second = worldOf(Dimensions.TheEnd, roster, level);

        await session.changeWorld(arrivalIn(first));
        const pending = session.pendingDimensionChange();
        sent.length = 0;

        // A player who arrived inside the exit portal is ticked while the client still shows
        // the loading screen, and is in the portal again once the cooldown runs out.
        await session.changeWorld(arrivalIn(second), { whenPending: 'drop' });

        expect(roster).toEqual(['save', 'remove', 'add']);
        expect(sent).toHaveLength(0);
        expect(session.getWorld()).toBe(first);
        expect(session.pendingDimensionChange()).toBe(pending);
        expect(logged.at(-1)).toContain('pending');

        // Nothing was held, so closing the screen leaves the player where the first change put them.
        await session.completeDimensionChange(pending!.loadingScreenId);
        expect(session.getWorld()).toBe(first);
    });

    it('holds a second change made while the first is pending and files it once the first closes', async () => {
        const { session, roster, level, travel } = fakePlayer();
        const first = worldOf(Dimensions.Nether, roster, level);
        const second = worldOf(Dimensions.TheEnd, roster, level);

        await session.changeWorld(arrivalIn(first));
        await session.changeWorld(arrivalIn(second));
        expect(session.getWorld()).toBe(first);

        await session.completeDimensionChange(session.pendingDimensionChange()!.loadingScreenId);

        // Filed as a message: the held change waits for the next input step.
        expect(session.getWorld()).toBe(first);
        expect(travel.pending).toBe(1);
        expect(travel.admit()).toBe(1);
        expect(session.getWorld()).toBe(second);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(second);
    });

    it('finishes a change the client never closes, and carries out the move held behind it', async () => {
        const { session, roster, level, logged, travel } = fakePlayer();
        const first = worldOf(Dimensions.Nether, roster, level);
        const second = worldOf(Dimensions.TheEnd, roster, level);

        await session.changeWorld(arrivalIn(first));
        await session.changeWorld(arrivalIn(second));

        await session.update(1199);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(first);

        await session.update(1200);
        expect(logged.some((line) => line.includes('never closed loading screen'))).toBe(true);
        expect(travel.admit()).toBe(1);
        expect(session.getWorld()).toBe(second);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(second);
    });

    it('sends a change to a custom dimension id announced to the client', async () => {
        const { session, roster, sent } = fakePlayer();
        const sky = dimensionTypeOf(Dimensions.Overworld.java, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID);
        sent.length = 0;

        await session.changeWorld(arrivalIn(worldOf(sky, roster)));

        expect(roster).toEqual(['save', 'remove', 'add']);
        expect(session.getWorld().getDimension()).toMatchObject({
            id: 'mypack:sky',
            bedrockId: FIRST_CUSTOM_DIMENSION_ID
        });
        expect(sent.find((packet) => packet instanceof ChangeDimensionPacket)?.getPacketData()?.dimension).toBe(
            FIRST_CUSTOM_DIMENSION_ID
        );
        expect(session.pendingDimensionChange()?.arrival.world).toBe(session.getWorld());
    });

    it('passes a respawn through to the client', async () => {
        const { session, player, sent } = fakePlayer();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether), { respawn: true }));

        const change = sent.find((p) => p instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.respawn).toBe(true);
        // `RespawnHandler` passes the spawn block, whose height is the feet's, so the body
        // stands where `Player.respawn` will put the eyes once the client asks to live again.
        expect(player.getPosition().getY()).toBeCloseTo(70 + EYE_HEIGHT);
    });

    it('sends the arrival chunks with the target dimension id', async () => {
        const { session, sent } = fakePlayer();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
        await session.deliver(6, -2);
        await session.releaseArrivalChunks(session.pendingDimensionChange()!.loadingScreenId);

        const chunks = sent.filter((p) => p instanceof LevelChunkPacket);
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.every((p) => p.getPacketData()?.dimension === Dimensions.Nether.bedrockId)).toBe(true);
    });

    /** Delivers everything queued, the way the scheduler would, and reports how many columns went. */
    const drain = async (session: ReturnType<typeof fakePlayer>['session']) => {
        let delivered = 0;
        for (let next = session.sender.next(); next !== null; next = session.sender.next()) {
            await session.deliver(next.x, next.z);
            delivered++;
        }
        await session.flush();
        return delivered;
    };

    /** Applies a loading screen report as the input step does: the handler, then what it handed over. */
    const reportScreen = async (
        screens: ServerboundLoadingScreenHandler,
        packet: ServerboundLoadingScreenPacket,
        { session, server }: Pick<ReturnType<typeof fakePlayer>, 'session' | 'server'>
    ) => {
        const { context, settled } = inputContext(session, { log: server.getLogger() });
        screens.handle(packet, context);
        await settled();
    };

    it('holds the arrival columns until the client opens the change screen, then sends each once', async () => {
        const { session, server, sent } = fakePlayer();
        const screens = new ServerboundLoadingScreenHandler();
        const levelChunks = () => sent.filter((p) => p instanceof LevelChunkPacket);

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
        const id = session.pendingDimensionChange()!.loadingScreenId;
        const queued = await drain(session);
        expect(queued).toBeGreaterThan(0);
        // A client still switching would file these under the dimension it is leaving.
        expect(levelChunks()).toHaveLength(0);

        await reportScreen(screens, screenOpened(id), { session, server });
        const columns = levelChunks().map((p) => `${p.getPacketData()?.chunkX},${p.getPacketData()?.chunkZ}`);
        expect(columns).toHaveLength(queued);
        expect(new Set(columns).size).toBe(columns.length);

        // Another id, or the same screen reported again, changes nothing.
        expect(await session.releaseArrivalChunks(id + 1)).toBe(false);
        expect(await session.releaseArrivalChunks(id)).toBe(false);
    });

    it('sends the held columns after forty ticks to a client that never opens the screen', async () => {
        const { session, sent } = fakePlayer();
        const levelChunks = () => sent.filter((p) => p instanceof LevelChunkPacket).length;

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
        const queued = await drain(session);

        // Counted in ticks, not time.
        await session.update(39);
        expect(levelChunks()).toBe(0);
        await session.update(40);
        expect(levelChunks()).toBe(queued);
    });

    it('drops the client input until the screen it was given closes, and ignores another id', async () => {
        const { session, player, server, sent, logged, level } = fakePlayer();
        const inputs = new PlayerAuthInputHandler();
        const screens = new ServerboundLoadingScreenHandler();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether, [], level)));
        const id = session.pendingDimensionChange()!.loadingScreenId;
        sent.length = 0;

        // The client is still reporting from the old world's coordinates.
        await applyInput(inputs, inputAt(new Vector3(3, 70, -4)), server, session);
        expect(player.getPosition().getX()).toBe(100.5);

        await reportScreen(screens, screenClosed(id + 7), { session, server });
        expect(session.pendingDimensionChange()?.loadingScreenId).toBe(id);
        expect(logged.at(-1)).toContain(`closed loading screen ${id + 7}`);
        expect(sent.filter((p) => p instanceof MovePlayerPacket)).toHaveLength(0);

        await reportScreen(screens, screenClosed(id), { session, server });
        expect(session.pendingDimensionChange()).toBeUndefined();

        // The change ends with a teleport to the arrival, and the client's first input from
        // there says it handled it. From then on its positions count again.
        const arrival = player.getPosition();
        await applyInput(
            inputs,
            inputAt(new Vector3(arrival.getX(), arrival.getY(), arrival.getZ()), true),
            server,
            session
        );
        await applyInput(inputs, inputAt(new Vector3(3, 70, -4)), server, session);
        expect(player.getPosition().getX()).toBe(3);
    });

    it('finishes the change with a teleport to the arrival, the attributes, the inventory and the spawn', async () => {
        const { session, sent, level } = fakePlayer();

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
        const { session, player, sent, logged } = fakePlayer();
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
        const { session, player, server } = fakePlayer();
        const inputs = new PlayerAuthInputHandler();
        await session.startCredits(arrivalIn(worldOf(Dimensions.Nether)));

        await applyInput(inputs, inputAt(new Vector3(3, 70, -4)), server, session);

        expect(player.getPosition().getX()).toBe(0);
    });

    it('finishes the held arrival as a respawn change when the credits are over', async () => {
        const { session, sent, travel } = fakePlayer();
        await session.startCredits(arrivalIn(worldOf(Dimensions.Nether)));
        sent.length = 0;

        expect(session.completeCredits()).toBe(true);
        // A message: nothing goes out until the next input step carries the change out.
        expect(sent).toEqual([]);
        expect(travel.admit()).toBe(1);

        const change = sent.find((p): p is ChangeDimensionPacket => p instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.dimension).toBe(Dimensions.Nether.bedrockId);
        expect(change?.getPacketData()?.respawn).toBe(true);
        expect(session.pendingCreditsArrival()).toBeUndefined();
        // Settled by the respawn exchange rather than by a loading screen the client never closes
        // for a respawn change, and told once the terrain is on the wire, not before.
        expect(session.pendingDimensionChange()).toBeUndefined();
        const respawnStates = () =>
            sent.filter((p): p is RespawnPacket => p instanceof RespawnPacket).map((p) => p.getPacketData()?.state);
        expect(respawnStates()).toEqual([]);

        session['chunkSendQueue'].length = 0;
        session['loadingChunks'].clear();
        await session['answerRespawnIfReady']();
        expect(respawnStates()).toEqual([PlayerRespawnState.SEARCHING_FOR_SPAWN, PlayerRespawnState.READY_TO_SPAWN]);

        // The client repeating the finish is not a second change.
        expect(session.completeCredits()).toBe(false);
        expect(travel.pending).toBe(0);
    });

    it('does not hold later moves behind a death respawn, which the client closes no screen for', async () => {
        const { session } = fakePlayer();

        await session.changeWorld({
            ...arrivalIn(worldOf(Dimensions.Nether)),
            respawn: true,
            closesLoadingScreen: false
        });
        expect(session.pendingDimensionChange()).toBeUndefined();

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Overworld)));
        expect(session.pendingDimensionChange()?.arrival.world).toBe(session.getWorld());
    });

    it('holds a change made while the player is dead, sending the client nothing', async () => {
        const { session, sent, roster, level, logged } = fakePlayer();
        const home = session.getWorld();
        await session.getActor()?.setHealth(0);
        sent.length = 0;

        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether, roster, level)));

        expect(session.getWorld()).toBe(home);
        expect(session.pendingDimensionChange()).toBeUndefined();
        expect(sent.some((packet) => packet instanceof ChangeDimensionPacket)).toBe(false);
        expect(logged.some((line) => line.includes('they are dead'))).toBe(true);
    });

    it('carries out the change held over a death once the player respawns', async () => {
        const { session, player, sent, roster, level, travel } = fakePlayer();
        const nether = worldOf(Dimensions.Nether, roster, level);
        await session.getActor()?.setHealth(0);
        await session.changeWorld(arrivalIn(nether));

        session.requestRespawn();

        session.getServer().getRespawnRequests().admit();
        // The respawn files the held change for the next input step.
        expect(sent.filter((packet) => packet instanceof ChangeDimensionPacket)).toHaveLength(0);
        expect(travel.admit()).toBe(1);

        expect(player.getHealth() > 0).toBe(true);
        expect(session.getWorld()).toBe(nether);
        expect(session.pendingDimensionChange()?.arrival.world).toBe(nether);
        expect(sent.filter((packet) => packet instanceof ChangeDimensionPacket)).toHaveLength(1);
    });

    it('still sends the respawn change of a dead player', async () => {
        const { session, sent } = fakePlayer();
        const nether = worldOf(Dimensions.Nether);
        await session.getActor()?.setHealth(0);

        await session.changeWorld({ ...arrivalIn(nether), respawn: true, closesLoadingScreen: false });

        expect(session.getWorld()).toBe(nether);
        expect(sent.some((packet) => packet instanceof ChangeDimensionPacket)).toBe(true);
    });

    it('does not record a batch that was on the wire during the change as loaded', async () => {
        const { session, connection, sent } = fakePlayer();
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

    it("sends none of the old world's chunks still in the batch once the change is under way", async () => {
        const { session, connection, sent } = fakePlayer();
        let release = () => {};
        let held = false;
        connection.sendPacketsAsync = async (packets) => {
            sent.push(...packets);
            if (held) return;
            held = true;
            await new Promise<void>((resolve) => {
                release = resolve;
            });
        };

        await session.deliver(0, 0);
        await session.deliver(1, 0);
        const inFlight = session.flush();
        await session.changeWorld(arrivalIn(worldOf(Dimensions.Nether)));
        release();
        await inFlight;

        const change = sent.findIndex((packet) => packet instanceof ChangeDimensionPacket);
        expect(change).toBeGreaterThan(-1);
        const leaked = sent
            .slice(change)
            .filter(
                (packet) =>
                    packet instanceof LevelChunkPacket &&
                    packet.getPacketData()?.dimension !== Dimensions.Nether.bedrockId
            );
        expect(leaked).toStrictEqual([]);
    });
});
