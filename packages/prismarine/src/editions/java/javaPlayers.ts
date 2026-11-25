/**
 * Java Edition players in the world: each is a player session like a Bedrock player's, over a
 * connection that drops the Bedrock packets the session still sends, with a Java presenter for
 * what the contract covers. What a Java client sends reaches the world through the same paths a
 * Bedrock client's does: intents run by the same handlers, in the same input step, and movement
 * as the `move` intent ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 */
import { ConnectionContexts } from '../../player/context/connectionContexts';
import { replaceOtherLogins } from '../../player/replaceOtherLogins';
import {
    createDefaultSkinImage,
    DEFAULT_SKIN_RESOURCE_PATCH,
    SKIN_HEIGHT,
    SKIN_WIDTH
} from '@jsprismarine/auth/DefaultSkin';
import { DisconnectReason } from '@jsprismarine/minecraft';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import type { InetAddress } from '@jsprismarine/raknet';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';

import type Server from '../../Server';
import type { TranslationKey } from '../../chat/ConsoleText';
import type { PlayerIdentity } from '../../playerIdentity';
import type { LoginRefusal } from '../../player/playerAdmission';
import { loginRefusalOf } from '../../player/playerAdmission';
import { announceArrival, playerArriving } from '../../player/playerArrival';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { Intent, IntentKind } from '../../input/Intent';
import { laneOfIntents } from '../../input/Intent';
import ClientConnection from '../../network/ClientConnection';
import { latestCodec } from '../../network/codec/CodecRegistry';
import { HandlerContexts } from '../../player/context/handlerContexts';
import type { InputQueue } from '../../input/InputQueue';
import type PlayerSession from '../../player/PlayerSession';
import type { ShownDimension } from '../../player/presenter/SessionPresenter';
import type { ConnectionId } from '../../network/transport/ConnectionId';
import { TransportNames } from '../../network/transport/Transport';
import type { TransportConnection } from '../../network/transport/Transport';
import type { JavaProfile } from './javaAuth';
import { javaBlockTranslation, javaItemTranslation } from './editionTranslation';
import type { JavaTexturesProperty } from './javaSkin';
import { fetchJavaSkin, texturesPropertyOf } from './javaSkin';
import type { JavaSend } from './JavaPresenter';
import { JavaPresenter } from './JavaPresenter';
import { JavaChunkTranslator } from './javaChunk';

/**
 * The skin Bedrock clients are shown for a Java player whose own cannot be had: the plain
 * humanoid the auth package generates. An offline-mode player has no signed skin, and the
 * texture server can be down or slow.
 */
export const javaPlayerSkin = (): Skin =>
    Skin.fromJWT({
        SkinId: 'jsprismarine:java_player',
        CapeId: '',
        SkinResourcePatch: Buffer.from(DEFAULT_SKIN_RESOURCE_PATCH).toString('base64'),
        PlayFabId: '',
        SkinImageHeight: SKIN_HEIGHT,
        SkinImageWidth: SKIN_WIDTH,
        SkinGeometryData: '',
        SkinAnimationData: '',
        CapeImageHeight: 0,
        CapeImageWidth: 0,
        CapeOnClassicSkin: false,
        SkinData: createDefaultSkinImage().toString('base64'),
        CapeData: '',
        PremiumSkin: false,
        PersonaSkin: false,
        SkinColor: '#0',
        ArmSize: 'wide',
        AnimatedImageData: [],
        PersonaPieces: [],
        PieceTintColors: []
    });

/** A transport connection no Bedrock packet leaves by: the Java client reads Java packets only. */
const javaSide = (id: ConnectionId, address: InetAddress): TransportConnection => ({
    id,
    address,
    capabilities: { encrypted: false, reliableOrdered: true, maxFrameSize: Number.MAX_SAFE_INTEGER },
    transport: TransportNames.java,
    sendFrame: () => {},
    close: () => {}
});

/**
 * What a Java client is told for a disconnect: vanilla's own message for a login of the same
 * account elsewhere, on either edition, and the reason as written for anything else.
 */
export const javaDisconnectReason = (reason: string, code?: DisconnectReason): JavaText =>
    code === DisconnectReason.LOGGED_IN_OTHER_LOCATION
        ? { translate: 'multiplayer.disconnect.duplicate_login' satisfies TranslationKey }
        : reason;

/**
 * A Java player's connection. A disconnect, such as a kick or a login of the same account
 * replacing this one, reaches the Java client through `hangUp`, since the Bedrock goodbye the base
 * class sends goes nowhere.
 */
class JavaClientConnection extends ClientConnection {
    public constructor(
        id: ConnectionId,
        address: InetAddress,
        logger: ConstructorParameters<typeof ClientConnection>[1],
        private readonly hangUp: (reason: JavaText) => Promise<void>
    ) {
        super(javaSide(id, address), logger);
    }

    public override async disconnect(
        reason = 'disconnect.disconnected',
        _hideReason = true,
        code?: DisconnectReason
    ): Promise<void> {
        try {
            this.closePlayerSession();
        } finally {
            await this.hangUp(javaDisconnectReason(reason, code));
        }
    }
}

/** Java players in the world, for the connections that log them in. */
export interface JavaPlayers {
    /**
     * Whether a login is let in, as a Bedrock login is: the ban list, the allow list and the
     * player limit.
     * @returns Why it is refused, or undefined when it is let in.
     */
    refusalOf(profile: JavaProfile, verified: boolean): Promise<LoginRefusal | undefined>;
    /**
     * Logs a Java player into the world, as a Bedrock login does: their saved record, or the
     * spawn the world places a new player at. It replaces any other connection, of either
     * edition, playing as the same account, as a Bedrock login does, and posts `playerSpawn`.
     * @param address - Where the client connected from.
     * @param hangUp - Tells the client why it is disconnected and closes its connection.
     * @returns The session, where the player's feet are, and the dimension they are in; undefined
     *   when the join ended before the player was in the world, because a later login of the same
     *   account replaced it or a `playerSpawn` listener cancelled it.
     */
    join(
        profile: JavaProfile,
        verified: boolean,
        connection: ConnectionId,
        address: InetAddress,
        send: JavaSend,
        hangUp: (reason: JavaText) => Promise<void>
    ): Promise<
        | {
              readonly session: PlayerSession;
              readonly feet: { x: number; y: number; z: number };
              readonly dimension: ShownDimension;
          }
        | undefined
    >;
    /**
     * Shows the player the world around it: the session sends the chunks within `viewDistance`
     * nearest first, paced by the server's scheduler, as it does a Bedrock player's, and keeps
     * the view up as the player moves, respawns or changes world.
     */
    showWorld(session: PlayerSession, viewDistance: number): Promise<void>;
    /** Tells everyone the player joined, once its client has the world to show the message in. */
    announce(session: PlayerSession): Promise<void>;
    /** Runs an intent the client's packet decoded into, by its lane. */
    intent<K extends IntentKind>(session: PlayerSession, intent: Intent<K>): Promise<void>;
    /** Takes the player out of the world when the connection ends, saving their record. */
    leave(connection: ConnectionId): Promise<void>;
}

/**
 * The account a Java login proved, before any link is resolved.
 * @param profile - The profile the login names.
 * @param verified - Whether Mojang vouched for it, which makes the player a `java` subject rather than `offline`.
 */
const accountOf = (profile: JavaProfile, verified: boolean): PlayerIdentity => ({
    name: profile.name,
    xuid: '',
    uuid: profile.id,
    subject: verified ? { kind: 'java', uuid: profile.id } : { kind: 'offline', name: profile.name }
});

/**
 * The server's Java players.
 * @param server - The server whose world, sessions and handlers they use.
 * @param inputs - The input queue the Bedrock dispatcher holds inputs in, so both editions' inputs
 *   apply in one order.
 * @param fetchSkin - Reads a Java player's own skin for Bedrock clients; Mojang's texture server
 *   unless a test gives another.
 */
export const javaPlayersOf = (
    server: Server,
    inputs: InputQueue,
    fetchSkin: (textures: JavaTexturesProperty) => Promise<Skin | undefined> = (textures) => fetchJavaSkin(textures)
): JavaPlayers => {
    const contexts = HandlerContexts.of(server);
    const report = (error: unknown) => server.getLogger().error(error);
    // Read when an intent arrives, as the dispatcher reads its handlers, not when the listener starts.
    const intents = () => server.getPacketHandlerRegistry().getIntentHandlers();
    // One cache of Java block states, items and chunk columns for every Java session, rather than one each.
    const blocks = javaBlockTranslation();
    const items = javaItemTranslation();
    const columns = new JavaChunkTranslator(blocks);

    return {
        refusalOf: (profile, verified) =>
            loginRefusalOf(
                ConnectionContexts.of(server).loginServices(inputs),
                accountOf(profile, verified),
                server.getConfig().getMaxPlayers()
            ),

        join: async (profile, verified, id, address, send, hangUp) => {
            const connection = new JavaClientConnection(id, address, server.getLogger(), hangUp);
            connection.codec = latestCodec;
            connection.phase = 'play';
            const login = ConnectionContexts.of(server).loginServices(inputs);
            // A linked account plays as the account it is linked to: the primary's record, key and name.
            const account = login.links.resolve(accountOf(profile, verified));
            const sessions = server.getSessionManager();
            sessions.add(id, connection);
            let settle!: () => void;
            const joined = new Promise<void>((resolve) => {
                settle = resolve;
            });
            try {
                // Before the record is read, so the replaced session has saved it.
                await replaceOtherLogins(login, connection, account, joined);
                const textures = texturesPropertyOf(profile);
                let presenter!: JavaPresenter;
                const session = await login.players.prepare(connection, account, {
                    // Read before the player is listed, so every client is shown the player's own
                    // skin from the start; a texture the server cannot read in time leaves the
                    // default one.
                    dress: async (player) => {
                        player.javaTextures = textures;
                        player.skin =
                            (textures === undefined ? undefined : await fetchSkin(textures)) ?? javaPlayerSkin();
                    },
                    presenterOf: (player) =>
                        (presenter = new JavaPresenter(send, player.getRuntimeId(), blocks, items, columns))
                });
                if (session === null) return undefined;
                // The client hung up while its player was built, and `leave` found no player to
                // take out: this one is taken out instead of being let into the world.
                if (!sessions.has(id)) {
                    await connection.closePlayerSession();
                    return undefined;
                }
                const arrival = playerArriving({ log: server.getLogger(), events: server.getKernel().events }, session);
                if (!arrival.joins) {
                    await arrival.leaving;
                    return undefined;
                }
                session.released(session.addToPlayerList());
                // The client draws its own player's skin from its own tab list entry.
                presenter.listProfile({
                    uuid: profile.id,
                    name: account.name,
                    ...(textures === undefined ? {} : { textures })
                });
                // The position a player holds is their eyes.
                const eyes = session.getPlayer().getPosition();
                // The world the record put the player in, which is not always the level's Overworld.
                return {
                    session,
                    feet: { x: eyes.getX(), y: eyes.getY() - EYE_HEIGHT, z: eyes.getZ() },
                    dimension: session.shownDimension()
                };
            } catch (error) {
                // `leave` runs only for a connection that got a session, so a failed join lets go
                // of the account here, or a later login would try to replace a closed connection.
                sessions.remove(id);
                throw error;
            } finally {
                settle();
            }
        },

        // As a Bedrock client's `RequestChunkRadius` is, in the input step.
        showWorld: (session, viewDistance) =>
            inputs.hold(session.getConnection(), () => session.released(session.setViewDistance(viewDistance))),

        announce: (session) =>
            announceArrival({ chat: server.getChatManager(), console: server.getConsoleSender() }, session),

        // Held under the connection, as a Bedrock client's inputs are and as a replacing login holds
        // the player's removal, so the removal applies behind every input the client sent first.
        intent: (session, intent) => {
            if (laneOfIntents([intent.kind]) === 'input') {
                return inputs.hold(
                    session.getConnection(),
                    () =>
                        void contexts.runInput(
                            {
                                lane: 'input',
                                phases: ['play'],
                                handle: (value: typeof intent, context) => {
                                    const result = intents().handle(value, context);
                                    if (result instanceof Promise) context.step.output(result);
                                }
                            },
                            intent,
                            session,
                            report
                        )
                );
            }
            return contexts.run(
                {
                    lane: 'read',
                    phases: ['play'],
                    handle: async (value: typeof intent, context) => void (await intents().handle(value, context))
                },
                intent,
                session
            );
        },

        leave: async (id) => {
            const connection = server.getSessionManager().get(id);
            if (connection === null) return;
            await connection.closePlayerSession();
            server.getSessionManager().remove(id);
        }
    };
};
