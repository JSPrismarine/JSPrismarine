/**
 * The status phase, which answers a server list ping. Its ids and layouts are the same in every
 * release.
 */
import { javaString, long } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Status Request` (serverbound): asks for the server's description. */
export const StatusRequest = defineJavaPacket('Status Request', 0x00, {});

/**
 * `Status Response` (clientbound): the server's description as JSON, with its version, its player
 * count and its MOTD.
 */
export const StatusResponse = defineJavaPacket('Status Response', 0x00, { json: javaString(32_767) });

/** `Ping Request` (serverbound): a number the client times the round trip with. */
export const PingRequest = defineJavaPacket('Ping Request', 0x01, { timestamp: long });

/** `Pong Response` (clientbound): the number the ping carried, sent back. */
export const PongResponse = defineJavaPacket('Pong Response', 0x01, { timestamp: long });
