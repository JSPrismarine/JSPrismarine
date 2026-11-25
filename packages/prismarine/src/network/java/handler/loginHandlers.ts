/**
 * The login: the player's name, Mojang's word for it when `online-mode` is on, then encryption,
 * compression and the profile the player joins with.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { javaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import {
    EncryptionRequest,
    EncryptionResponse,
    LoginAcknowledged,
    LoginDisconnect,
    LoginStart,
    LoginSuccess,
    SetCompression
} from '@jsprismarine/protocol/java/packet/login';

import type { JavaProfile } from '../javaAuth';
import { decryptFromClient, offlineUuid, serverHash } from '../javaAuth';
import type { JavaConnection } from '../JavaConnection';
import { translated } from '../JavaConnection';
import { beginConfiguration } from './configurationHandlers';
import type { JavaContext, JavaPacketHandler } from './JavaPacketHandler';
import { javaHandler } from './JavaPacketHandler';

/**
 * The smallest packet a connection compresses, which the vanilla server's
 * `network-compression-threshold` defaults to.
 */
const COMPRESSION_THRESHOLD = 256;

/** A player name the vanilla server accepts: one to sixteen letters, digits and underscores. */
const VALID_NAME = /^[A-Za-z0-9_]{1,16}$/;

/** The shared secret's length: an AES-128 key, which is what a Java client sends. */
const SHARED_SECRET_BYTES = 16;

/**
 * Ends a login with a reason the client shows.
 * @param connection - The connection logging in.
 * @param reason - The reason, as a JSON text component.
 */
export const refuseLogin = async (connection: JavaConnection, reason: string): Promise<void> => {
    connection.send(LoginDisconnect, { reason });
    await connection.close();
};

/**
 * The error for a packet that came at a point of the login it has no place in.
 * @param connection - The connection.
 * @param definition - The packet.
 * @returns The error.
 */
export const outOfTurn = (connection: JavaConnection, definition: JavaPacketDefinition): Error =>
    new PrismarineNetworkErrors.UnexpectedJavaPacket({
        packetId: javaPacketId(connection.protocol, definition),
        phase: connection.phase
    });

/** Sends compression and the profile, which ends the login on the server's side. */
const finishLogin = ({ connection, services }: JavaContext, profile: JavaProfile, verified: boolean): void => {
    connection.verified = verified;
    connection.send(SetCompression, { threshold: COMPRESSION_THRESHOLD });
    connection.compression = COMPRESSION_THRESHOLD;
    connection.profile = profile;
    connection.send(LoginSuccess, {
        uuid: profile.id,
        username: profile.name,
        properties: [...profile.properties],
        sessionId: services.sessionId
    });
    services.options.log.info(`Java Edition player ${profile.name} (${profile.id}) logged in`);
};

/** The login's three serverbound packets, each at its point of the login. */
export const LOGIN_HANDLERS: readonly JavaPacketHandler[] = [
    javaHandler(LoginStart, async ({ name }, context) => {
        const { connection, services } = context;
        if (connection.pending !== undefined || connection.profile !== undefined)
            throw outOfTurn(connection, LoginStart);
        if (!VALID_NAME.test(name)) {
            return refuseLogin(connection, translated('multiplayer.disconnect.invalid_player_data'));
        }
        if (!services.options.onlineMode()) {
            return finishLogin(context, { id: offlineUuid(name), name, properties: [] }, false);
        }
        const verifyToken = randomBytes(4);
        connection.pending = { name, verifyToken };
        connection.send(EncryptionRequest, {
            serverId: '',
            publicKey: services.key.publicDer,
            verifyToken,
            shouldAuthenticate: true
        });
    }),

    javaHandler(EncryptionResponse, async (response, context) => {
        const { connection, services } = context;
        const pending = connection.pending;
        if (pending === undefined) throw outOfTurn(connection, EncryptionResponse);
        connection.pending = undefined;
        const { privateKey, publicDer } = services.key;
        const token = decryptFromClient(privateKey, response.verifyToken, pending.verifyToken.byteLength);
        if (!timingSafeEqual(token, pending.verifyToken)) {
            throw new PrismarineNetworkErrors.JavaVerifyTokenMismatch();
        }
        const secret = decryptFromClient(privateKey, response.sharedSecret, SHARED_SECRET_BYTES);
        connection.transport.encrypt(secret);

        const profile = await services.askSessionServer(pending.name, serverHash('', secret, publicDer));
        if (profile === undefined) {
            return refuseLogin(connection, translated('multiplayer.disconnect.unverified_username'));
        }
        finishLogin(context, profile, true);
    }),

    javaHandler(LoginAcknowledged, (_acknowledged, context) => {
        const { connection } = context;
        if (connection.profile === undefined || connection.pending !== undefined) {
            throw outOfTurn(connection, LoginAcknowledged);
        }
        connection.phase = 'configuration';
        beginConfiguration(context);
    })
];
