/**
 * The status phase, which answers a server list ping. Its ids and layouts are the same in every
 * release.
 */
import { javaString, long } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/**
 * `Status Request` (serverbound): asks for the server's description.
 * @javaSource ServerboundStatusRequestPacket.STREAM_CODEC
 */
export const StatusRequest = defineJavaPacket('Status Request', 'status/serverbound/status_request', {});

/**
 * `Status Response` (clientbound): the server's description as JSON, with its version, its player
 * count and its MOTD.
 * @javaSource ClientboundStatusResponsePacket.STREAM_CODEC
 */
export const StatusResponse = defineJavaPacket('Status Response', 'status/clientbound/status_response', {
    json: javaString(32_767)
});

/**
 * `Ping Request` (serverbound): a number the client times the round trip with.
 * @javaSource ServerboundPingRequestPacket.STREAM_CODEC
 */
export const PingRequest = defineJavaPacket('Ping Request', 'status/serverbound/ping_request', { timestamp: long });

/**
 * `Pong Response` (clientbound): the number the ping carried, sent back.
 * @javaSource ClientboundPongResponsePacket.STREAM_CODEC
 */
export const PongResponse = defineJavaPacket('Pong Response', 'status/clientbound/pong_response', { timestamp: long });
