/**
 * A Java player's way into the world and the chunks it is shown of it: the login packet, its
 * position, the chunks around it, and the keep-alives that hold the connection open.
 */
import { LevelChunkWithLight } from '@jsprismarine/protocol/java/chunk/levelChunk';
import {
    ChunkBatchFinished,
    ChunkBatchStart,
    ClientboundKeepAlive,
    GameEvent,
    PlayDisconnect,
    PlayLogin,
    SetCenterChunk,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from '@jsprismarine/protocol/java/packet/play';

import type { JavaConnection } from './JavaConnection';
import type { JavaWorldHost } from './JavaConnections';
import { javaSpawnInfoOf } from './JavaPresenter';
import type { JavaContext, JavaServices } from './handler/JavaPacketHandler';

/** How often the server sends a keep-alive, as vanilla does; a client that misses two is dropped. */
const KEEP_ALIVE_INTERVAL_MS = 15_000;

/**
 * Shows a player who reached play the world around spawn, in the order vanilla sends it: the
 * login, the position, the event that tells the client to wait for chunks, the chunk its view
 * centers on, then the chunks around it as one batch. Keep-alives start, and a client that leaves
 * one unanswered for a whole interval is dropped, as vanilla drops it.
 * @param context - The connection that finished its configuration.
 * @param world - The world it joins.
 */
export const beginPlay = async ({ connection, services }: JavaContext, world: JavaWorldHost): Promise<void> => {
    const { session, feet, dimension } = await world.players.join(
        connection.profile!,
        connection.verified ?? false,
        connection.transport.id,
        (definition, value) => connection.send(definition, value),
        async (reason) => {
            connection.send(PlayDisconnect, { reason });
            await connection.close();
        },
        (at) => respawned(connection, services, world, at)
    );
    connection.session = session;
    const player = session.getPlayer();
    connection.pose = { ...feet, yaw: player.yaw, pitch: player.pitch, onGround: true };
    const radius = world.viewDistance();
    connection.send(PlayLogin, {
        entityId: Number(session.runtimeId),
        hardcore: false,
        dimensions: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
        maxPlayers: world.maxPlayers(),
        viewDistance: radius,
        simulationDistance: radius,
        reducedDebugInfo: false,
        showDeathScreen: true,
        doLimitedCrafting: false,
        ...javaSpawnInfoOf(dimension, player.gamemode),
        onlineMode: services.options.onlineMode(),
        enforcesSecureChat: false
    });
    connection.send(SynchronizePlayerPosition, {
        teleportId: 1,
        x: feet.x,
        y: feet.y,
        z: feet.z,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0,
        yaw: player.yaw,
        pitch: player.pitch,
        flags: 0
    });
    connection.send(GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
    connection.view = { x: Math.floor(feet.x) >> 4, z: Math.floor(feet.z) >> 4, sent: new Set() };
    streamChunks(connection, services, world);

    const keepAlive = {
        awaiting: undefined as bigint | undefined,
        timer: setInterval(() => {
            if (keepAlive.awaiting !== undefined) {
                services.options.log.debug(
                    `Java connection ${connection.transport.id} missed a keep-alive; closing it`
                );
                void connection.close();
                return;
            }
            keepAlive.awaiting = BigInt(Date.now());
            connection.send(ClientboundKeepAlive, { id: keepAlive.awaiting });
        }, KEEP_ALIVE_INTERVAL_MS)
    };
    keepAlive.timer.unref();
    connection.keepAlive = keepAlive;
};

/**
 * Starts the client's view again where a respawn put the player: a client spawned again, into the
 * same dimension or another, is sent every chunk around it afresh, as vanilla's new player is.
 */
const respawned = (
    connection: JavaConnection,
    services: JavaServices,
    world: JavaWorldHost,
    feet: { x: number; y: number; z: number }
): void => {
    // Before play begins, the login's own position and first batch come next anyway.
    const pose = connection.pose;
    if (pose === undefined) return;
    pose.x = feet.x;
    pose.y = feet.y;
    pose.z = feet.z;
    connection.view = { x: Math.floor(feet.x) >> 4, z: Math.floor(feet.z) >> 4, sent: new Set() };
    streamChunks(connection, services, world);
};

/**
 * Centers the client's view on its chunk and sends every chunk around it the client has not had,
 * nearest first, as one batch, from the world the player is in. A respawn meanwhile ends the
 * batch, whose chunks may be of the world the player left.
 */
const sendChunksAround = async (
    connection: JavaConnection,
    services: JavaServices,
    world: JavaWorldHost
): Promise<void> => {
    const view = connection.view!;
    const session = connection.session!;
    const radius = world.viewDistance();
    connection.send(SetCenterChunk, { x: view.x, z: view.z });
    const missing: { x: number; z: number }[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const key = `${view.x + dx},${view.z + dz}`;
            if (!view.sent.has(key)) missing.push({ x: view.x + dx, z: view.z + dz });
        }
    }
    if (missing.length === 0) return;
    missing.sort((a, b) => Math.hypot(a.x - view.x, a.z - view.z) - Math.hypot(b.x - view.x, b.z - view.z));
    connection.send(ChunkBatchStart, {});
    let sent = 0;
    for (const { x, z } of missing) {
        const chunk = await world.chunk(session, x, z);
        if (connection.view !== view) break;
        view.sent.add(`${x},${z}`);
        connection.send(LevelChunkWithLight, services.chunks.columnOf(chunk, world.light(session)));
        sent++;
    }
    connection.send(ChunkBatchFinished, { batchSize: sent });
};

/**
 * Sends the chunks the view lacks after any sends already queued, without holding up the
 * connection's packets: a join's first batch takes as long as the world takes to load it, and the
 * client keeps moving, answering keep-alives and loading in meanwhile.
 * @param connection - The connection in play.
 * @param services - What the connections share.
 * @param world - The world the player is in.
 */
export const streamChunks = (connection: JavaConnection, services: JavaServices, world: JavaWorldHost): void => {
    connection.streaming = (connection.streaming ?? Promise.resolve())
        .then(() => sendChunksAround(connection, services, world))
        .catch((error: unknown) => connection.failed(error));
};
