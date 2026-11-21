/**
 * Java Edition players in the world: each is a player session like a Bedrock player's, over a
 * connection that drops the Bedrock packets the session still sends, with a Java presenter for
 * what the contract covers. What a Java client sends reaches the world through the same paths a
 * Bedrock client's does: intents run by the same handlers, in the same input step, and movement
 * through `applyClientMovement` ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 */
import {
    createDefaultSkinImage,
    DEFAULT_SKIN_RESOURCE_PATCH,
    SKIN_HEIGHT,
    SKIN_WIDTH
} from '@jsprismarine/auth/DefaultSkin';
import { InetAddress } from '@jsprismarine/raknet';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';

import type Server from '../../Server';
import { entityIds } from '../../entity/entityIds';
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
import type { ConnectionId } from '../transport/ConnectionId';
import { TransportNames } from '../transport/Transport';
import { accountLinksToken } from '../../modules/tokens';
import type { TransportConnection } from '../transport/Transport';
import type { JavaProfile } from './javaAuth';
import { javaBlockTranslation } from './editionTranslation';
import type { JavaSend } from './JavaPresenter';
import { JavaPresenter } from './JavaPresenter';

/**
 * The skin Bedrock clients are shown for a Java player: the plain humanoid the auth package
 * generates, since Mojang's textures cannot be redistributed. A Java player's own skin comes with
 * other players in PR 10.
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
    transport: TransportNames.tcp,
    sendFrame: () => {},
    close: () => {}
});

/** Java players in the world, for the connections that log them in. */
export interface JavaPlayers {
    /**
     * Logs a Java player into the default world, as a Bedrock login does: their saved record, or
     * the spawn the world places a new player at.
     * @returns The session, and where the player's feet are.
     */
    join(
        profile: JavaProfile,
        verified: boolean,
        connection: ConnectionId,
        send: JavaSend
    ): Promise<{ readonly session: PlayerSession; readonly feet: { x: number; y: number; z: number } }>;
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
 */
export const javaPlayersOf = (server: Server, inputs: InputQueue): JavaPlayers => {
    const contexts = HandlerContexts.of(server);
    const report = (error: unknown) => server.getLogger().error(error);
    // Read when an intent arrives, as the dispatcher reads its handlers, not when the listener starts.
    const intents = () => server.getPacketHandlerRegistry().getIntentHandlers();
    // One cache of Java block states for every Java session, rather than one each.
    const blocks = javaBlockTranslation();

    return {
        join: async (profile, verified, id, send) => {
            const world = server.getWorldManager().getDefaultWorld();
            const connection = new ClientConnection(javaSide(id), server.getLogger());
            connection.codec = latestCodec;
            connection.phase = 'play';
            const subject: Subject = verified
                ? { kind: 'java', uuid: profile.id }
                : { kind: 'offline', name: profile.name };
            // A linked account plays as the account it is linked to: the primary's record, key and name.
            const links = server.getKernel().get(accountLinksToken);
            const identity = links.resolve({ name: profile.name, xuid: '', uuid: profile.id, subject });
            if (identity.linkedFrom === undefined) await links.noteLogin(identity);
            const player = new StorePlayer(entityIds.next(), {
                uuid: UUID.fromString(profile.id),
                name: identity.name,
                xuid: identity.xuid,
                subject: identity.subject
            });
            player.skin = javaPlayerSkin();
            const spawn = await world.getSpawnPosition();
            player.standAt({ x: Math.floor(spawn.getX()) + 0.5, y: spawn.getY(), z: Math.floor(spawn.getZ()) + 0.5 });
            server.getSessionManager().add(id, connection);
            const session = createConnectedPlayer({
                server,
                connection,
                player,
                identity,
                world,
                presenter: new JavaPresenter(send, player.getRuntimeId(), blocks)
            });
            try {
                await session.join();
            } catch (error) {
                await connection.closePlayerSession();
                throw error;
            }
            session.released(session.addToPlayerList());
            const feet = session.getPlayer().getPosition();
            return { session, feet: { x: feet.getX(), y: feet.getY(), z: feet.getZ() } };
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
