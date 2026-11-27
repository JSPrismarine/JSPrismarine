/**
 * A Java player's way into the world: the login packet, its position, the chunks around it, which
 * the session sends as it sends a Bedrock player's, and the keep-alives that hold the connection
 * open.
 */
import { brandOf } from '@jsprismarine/protocol/java/packet/configuration';
import {
    ClientboundKeepAlive,
    GameEvent,
    PlayDisconnect,
    PlayLogin,
    ServerData,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from '@jsprismarine/protocol/java/packet/play';

import type { TranslationKey } from '../../chat/ConsoleText';
import { KeepAlive } from '../../player/KeepAlive';
import { javaLocaleOf, javaViewDistanceOf } from './javaClientInformation';
import type { JavaWorldHost } from './JavaConnections';
import { javaSpawnInfoOf } from './JavaPresenter';
import type { JavaContext } from './handler/JavaPacketHandler';

/**
 * Shows a player who reached play the world around spawn, in the order vanilla sends it: the
 * login, the server's description, the position, and the event that tells the client to wait for
 * chunks. The session then sends the chunks within the client's view distance nearest first, as it
 * does a Bedrock player's, and everyone is told the player joined. Keep-alives start, and a client that leaves one unanswered for a whole
 * interval is dropped, as vanilla drops it.
 * @param context - The connection that finished its configuration.
 * @param world - The world it joins.
 */
export const beginPlay = async ({ connection, services }: JavaContext, world: JavaWorldHost): Promise<void> => {
    const joined = await world.players.join(
        connection.profile!,
        connection.verified ?? false,
        connection.transport.id,
        connection.transport.address,
        connection.information === undefined ? undefined : javaLocaleOf(connection.information.language),
        (definition, value) => connection.send(definition, value),
        async (reason) => {
            connection.send(PlayDisconnect, { reason });
            await connection.close();
        }
    );
    // The join ended before the player was in the world, and hung up on the client.
    if (joined === undefined) return;
    // The client hung up meanwhile and its disconnect has run, so nothing may start for it now.
    if (connection.closed) return joined.session.getConnection().closePlayerSession();
    const { session, feet, dimension } = joined;
    connection.session = session;
    const player = session.getPlayer();
    connection.pose = { ...feet, yaw: player.yaw, pitch: player.pitch, onGround: true };
    const radius = world.viewDistance();
    const settings = world.joinSettings(session);
    const velocity = player.getVelocity();
    connection.send(PlayLogin, {
        entityId: Number(session.runtimeId),
        hardcore: settings.hardcore,
        dimensions: [...settings.dimensions],
        maxPlayers: world.maxPlayers(),
        viewDistance: radius,
        simulationDistance: radius,
        reducedDebugInfo: settings.reducedDebugInfo,
        showDeathScreen: settings.showDeathScreen,
        doLimitedCrafting: settings.doLimitedCrafting,
        ...javaSpawnInfoOf(dimension, player.gamemode),
        onlineMode: services.options.onlineMode(),
        enforcesSecureChat: services.options.enforcesSecureChat()
    });
    // The description a client lists the server by once it has played there; the server has no icon.
    connection.send(ServerData, { motd: services.options.status.getMotd(), icon: null });
    connection.send(SynchronizePlayerPosition, {
        teleportId: 1,
        x: feet.x,
        y: feet.y,
        z: feet.z,
        velocityX: velocity.x,
        velocityY: velocity.y,
        velocityZ: velocity.z,
        yaw: player.yaw,
        pitch: player.pitch,
        flags: 0
    });
    connection.send(GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
    const requested = connection.information?.viewDistance;
    connection.viewDistance = requested === undefined ? radius : javaViewDistanceOf(requested, radius);
    connection.queue(world.players.showWorld(session, connection.viewDistance));
    // Once the client has a world to show the message in, as Bedrock's join ends with it.
    connection.queue(world.players.announce(session));

    connection.keepAlive = new KeepAlive({
        intervalMs: services.options.keepAliveIntervalMs(),
        ...(services.options.keepAliveTimer === undefined ? {} : { timer: services.options.keepAliveTimer }),
        ping: (id) => connection.send(ClientboundKeepAlive, { id }),
        timedOut: () => {
            services.options.log.debug(`Java connection ${connection.transport.id} missed a keep-alive; closing it`);
            connection.send(PlayDisconnect, { reason: { translate: 'disconnect.timeout' satisfies TranslationKey } });
            void connection.close();
        }
    });
    connection.keepAlive.start();
};

/**
 * Hears a plugin message in either phase. The client's brand is kept, for the log; no other
 * channel has a reader on this server, and a message on one is read past, as vanilla reads past a
 * channel no mod registered.
 * @param message - The channel and its bytes.
 * @param context - The connection it came by.
 */
export const hearPluginMessage = (
    { channel, data }: { readonly channel: string; readonly data: Buffer },
    { connection, services }: JavaContext
): void => {
    if (channel !== 'minecraft:brand') return;
    connection.brand = brandOf(data);
    services.options.log.debug(`Java connection ${connection.transport.id} runs the ${connection.brand} client`);
};
