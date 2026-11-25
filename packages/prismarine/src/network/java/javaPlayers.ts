/**
 * Java Edition players in the world: each is a player session like a Bedrock player's, over a
 * connection that drops the Bedrock packets the session still sends, with a Java presenter for
 * what the contract covers. What a Java client sends reaches the world through the same paths a
 * Bedrock client's does: intents run by the same handlers, in the same input step, and movement
 * through `applyClientMovement` ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 */
import { ConnectionContexts, returningWorldOf } from '../connectionContexts';
import { replaceOtherLogins } from '../handler/LoginHandler';
import { playerKeyOf } from '../../playerIdentity';
import {
    createDefaultSkinImage,
    DEFAULT_SKIN_RESOURCE_PATCH,
    SKIN_HEIGHT,
    SKIN_WIDTH
} from '@jsprismarine/auth/DefaultSkin';
import { DisconnectReason } from '@jsprismarine/minecraft';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import { InetAddress } from '@jsprismarine/raknet';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';

import type Server from '../../Server';
import { entityIds } from '../../entity/entityIds';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { Subject } from '../../identity/Subject';
import type { Intent, IntentKind } from '../../input/Intent';
import { laneOfIntents } from '../../input/Intent';
import { StorePlayer } from '../../entity/storePlayer';
import ClientConnection from '../ClientConnection';
import { latestCodec } from '../codec/CodecRegistry';
import { createConnectedPlayer } from '../createConnectedPlayer';
import type { ClientMovement } from '../handler/PlayerAuthInputHandler';
import { applyClientMovement } from '../handler/PlayerAuthInputHandler';
import { HandlerContexts } from '../handlerContexts';
import type { InputQueue } from '../InputQueue';
import type PlayerSession from '../PlayerSession';
import type { ShownDimension, ShownRespawn } from '../presenter/SessionPresenter';
import type { ConnectionId } from '../transport/ConnectionId';
import { TransportNames } from '../transport/Transport';
import { accountLinksToken } from '../../modules/tokens';
import type { TransportConnection } from '../transport/Transport';
import type { JavaProfile } from './javaAuth';
import { javaBlockTranslation, javaItemTranslation } from './editionTranslation';
import type { JavaTexturesProperty } from './javaSkin';
import { fetchJavaSkin, texturesPropertyOf } from './javaSkin';
import type { JavaSend } from './JavaPresenter';
import { JavaPresenter } from './JavaPresenter';

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
const javaSide = (id: ConnectionId): TransportConnection => ({
    id,
    address: new InetAddress('0.0.0.0', 0),
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
        ? { translate: 'multiplayer.disconnect.duplicate_login' }
        : reason;

/**
 * A Java player's connection. A disconnect, such as a kick or a login of the same account
 * replacing this one, reaches the Java client through `hangUp`, since the Bedrock goodbye the base
 * class sends goes nowhere.
 */
class JavaClientConnection extends ClientConnection {
    public constructor(
        id: ConnectionId,
        logger: ConstructorParameters<typeof ClientConnection>[1],
        private readonly hangUp: (reason: JavaText) => Promise<void>
    ) {
        super(javaSide(id), logger);
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
     * Logs a Java player into the default world, as a Bedrock login does: their saved record, or
     * the spawn the world places a new player at. It replaces any other connection, of either
     * edition, playing as the same account, as a Bedrock login does.
     * @param hangUp - Tells the client why it is disconnected and closes its connection.
     * @param respawned - Told where the player stands each time its client is spawned again, after
     *   a death or into another world.
     * @returns The session, where the player's feet are, and the dimension they are in.
     */
    join(
        profile: JavaProfile,
        verified: boolean,
        connection: ConnectionId,
        send: JavaSend,
        hangUp: (reason: JavaText) => Promise<void>,
        respawned: (feet: ShownRespawn['feet']) => void
    ): Promise<{
        readonly session: PlayerSession;
        readonly feet: { x: number; y: number; z: number };
        readonly dimension: ShownDimension;
    }>;
    /** Applies a position the client reported, in the input step. */
    move(session: PlayerSession, movement: ClientMovement): Promise<void>;
    /** Runs an intent the client's packet decoded into, by its lane. */
    intent<K extends IntentKind>(session: PlayerSession, intent: Intent<K>): Promise<void>;
    /** Takes the player out of the world when the connection ends, saving their record. */
    leave(connection: ConnectionId): Promise<void>;
}

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
    // One cache of Java block states and items for every Java session, rather than one each.
    const blocks = javaBlockTranslation();
    const items = javaItemTranslation();

    return {
        join: async (profile, verified, id, send, hangUp, respawned) => {
            const connection = new JavaClientConnection(id, server.getLogger(), hangUp);
            connection.codec = latestCodec;
            connection.phase = 'play';
            const subject: Subject = verified
                ? { kind: 'java', uuid: profile.id }
                : { kind: 'offline', name: profile.name };
            // A linked account plays as the account it is linked to: the primary's record, key and name.
            const links = server.getKernel().get(accountLinksToken);
            const identity = links.resolve({ name: profile.name, xuid: '', uuid: profile.id, subject });
            if (identity.linkedFrom === undefined) await links.noteLogin(identity);
            const sessions = server.getSessionManager();
            sessions.add(id, connection);
            let settle!: () => void;
            const joined = new Promise<void>((resolve) => {
                settle = resolve;
            });
            try {
                // Before the record is read, so the replaced session has saved it.
                await replaceOtherLogins(
                    ConnectionContexts.of(server).contextOf(connection, inputs).login,
                    connection,
                    identity,
                    joined
                );
                // In the level they last left from, as a Bedrock login is.
                const world = returningWorldOf(server, playerKeyOf(identity));
                const player = new StorePlayer(entityIds.next(), {
                    uuid: UUID.fromString(profile.id),
                    name: identity.name,
                    xuid: identity.xuid,
                    subject: identity.subject
                });
                // Read before the player is listed, so every client is shown the player's own skin from
                // the start; a texture the server cannot read in time leaves the default one.
                const textures = texturesPropertyOf(profile);
                player.javaTextures = textures;
                player.skin = (textures === undefined ? undefined : await fetchSkin(textures)) ?? javaPlayerSkin();
                const spawn = await world.getSpawnPosition();
                player.standAt({
                    x: Math.floor(spawn.getX()) + 0.5,
                    y: spawn.getY(),
                    z: Math.floor(spawn.getZ()) + 0.5
                });
                const presenter = new JavaPresenter(send, player.getRuntimeId(), blocks, items, respawned);
                const session = createConnectedPlayer({ server, connection, player, identity, world, presenter });
                try {
                    await session.join();
                } catch (error) {
                    await connection.closePlayerSession();
                    throw error;
                }
                session.released(session.addToPlayerList());
                // The client draws its own player's skin from its own tab list entry.
                presenter.listProfile({
                    uuid: profile.id,
                    name: identity.name,
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

        move: (session, movement) =>
            inputs.hold(
                session,
                () =>
                    void contexts.runInput(
                        {
                            lane: 'input',
                            phases: ['play'],
                            handle: (move: ClientMovement, context) => applyClientMovement(context, move)
                        },
                        movement,
                        session,
                        report
                    )
            ),

        intent: (session, intent) => {
            if (laneOfIntents([intent.kind]) === 'input') {
                return inputs.hold(
                    session,
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
