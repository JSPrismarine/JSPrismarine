/**
 * The login phase. Each packet takes its id from the release's generated table, where
 * `Disconnect (login)` has the same one in every release.
 */
import { bool, byteArray, list, optional, record } from '../../wire/fieldTypes';
import { javaString, uuid, varInt } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/**
 * `Disconnect (login)` (clientbound): refuses a join, with the reason as a JSON text component.
 * @javaSource ClientboundLoginDisconnectPacket.STREAM_CODEC
 */
export const LoginDisconnect = defineJavaPacket('Disconnect (login)', 'login/clientbound/login_disconnect', {
    reason: javaString(262_144)
});

/**
 * `Login Start` (serverbound): the player's name, and the UUID the client believes is theirs.
 * @javaSource ServerboundHelloPacket.STREAM_CODEC
 */
export const LoginStart = defineJavaPacket('Login Start', 'login/serverbound/hello', {
    name: javaString(16),
    profileId: uuid
});

/**
 * `Encryption Request` (clientbound): the server's RSA public key, as DER, and a token the client
 * encrypts back with it. `shouldAuthenticate` tells the client to tell Mojang's session server it
 * is joining first.
 * @javaSource ClientboundHelloPacket.STREAM_CODEC
 */
export const EncryptionRequest = defineJavaPacket('Encryption Request', 'login/clientbound/hello', {
    serverId: javaString(20),
    publicKey: byteArray,
    verifyToken: byteArray,
    shouldAuthenticate: bool
});

/**
 * `Encryption Response` (serverbound): the shared secret and the token, each encrypted with the server's key.
 * @javaSource ServerboundKeyPacket.STREAM_CODEC
 */
export const EncryptionResponse = defineJavaPacket('Encryption Response', 'login/serverbound/key', {
    sharedSecret: byteArray,
    verifyToken: byteArray
});

/**
 * `Set Compression` (clientbound): the smallest packet compressed from here on, or a negative number for none.
 * @javaSource ClientboundLoginCompressionPacket.STREAM_CODEC
 */
export const SetCompression = defineJavaPacket('Set Compression', 'login/clientbound/login_compression', {
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
 * @javaSource ClientboundLoginFinishedPacket.STREAM_CODEC
 */
export const LoginSuccess = defineJavaPacket('Login Success', 'login/clientbound/login_finished', {
    uuid,
    username: javaString(16),
    properties: list(profileProperty),
    sessionId: uuid
});

/**
 * `Login Acknowledged` (serverbound): the client has switched to the configuration phase.
 * @javaSource ServerboundLoginAcknowledgedPacket.STREAM_CODEC
 */
export const LoginAcknowledged = defineJavaPacket('Login Acknowledged', 'login/serverbound/login_acknowledged', {});
