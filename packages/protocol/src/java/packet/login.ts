/**
 * The login phase. `Disconnect (login)` has one id in every release; the rest take theirs from the
 * release's generated table.
 */
import { bool, byteArray, list, optional, record } from '../../wire/fieldTypes';
import { PACKETS } from '../versions/26.3/packets';
import { javaString, uuid, varInt } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Disconnect (login)` (clientbound): refuses a join, with the reason as a JSON text component. */
export const LoginDisconnect = defineJavaPacket('Disconnect (login)', 0x00, { reason: javaString(262_144) });

/** `Login Start` (serverbound): the player's name, and the UUID the client believes is theirs. */
export const LoginStart = defineJavaPacket('Login Start', PACKETS.login.serverbound.hello, {
    name: javaString(16),
    profileId: uuid
});

/**
 * `Encryption Request` (clientbound): the server's RSA public key, as DER, and a token the client
 * encrypts back with it. `shouldAuthenticate` tells the client to tell Mojang's session server it
 * is joining first.
 */
export const EncryptionRequest = defineJavaPacket('Encryption Request', PACKETS.login.clientbound.hello, {
    serverId: javaString(20),
    publicKey: byteArray,
    verifyToken: byteArray,
    shouldAuthenticate: bool
});

/** `Encryption Response` (serverbound): the shared secret and the token, each encrypted with the server's key. */
export const EncryptionResponse = defineJavaPacket('Encryption Response', PACKETS.login.serverbound.key, {
    sharedSecret: byteArray,
    verifyToken: byteArray
});

/** `Set Compression` (clientbound): the smallest packet compressed from here on, or a negative number for none. */
export const SetCompression = defineJavaPacket('Set Compression', PACKETS.login.clientbound.login_compression, {
    threshold: varInt
});

/** One property of a game profile, such as its skin textures, with Mojang's signature when it has one. */
export const profileProperty = record({
    name: javaString(64),
    value: javaString(32_767),
    signature: optional(javaString(1024))
});

/**
 * `Login Success` (clientbound): the profile the player joins with, then the server's session id,
 * one UUID for as long as the server runs, which 26.3 added.
 */
export const LoginSuccess = defineJavaPacket('Login Success', PACKETS.login.clientbound.login_finished, {
    uuid,
    username: javaString(16),
    properties: list(profileProperty),
    sessionId: uuid
});

/** `Login Acknowledged` (serverbound): the client has switched to the configuration phase. */
export const LoginAcknowledged = defineJavaPacket(
    'Login Acknowledged',
    PACKETS.login.serverbound.login_acknowledged,
    {}
);
