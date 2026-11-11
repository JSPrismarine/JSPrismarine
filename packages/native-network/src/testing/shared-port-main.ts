/**
 * Runs RakNet on a port shared with NetherNet and pings it, printing what came back as JSON, so
 * a test can run it under another runtime, such as Bun.
 */
import dgram from 'node:dgram';
import { once } from 'node:events';

import {
    allocateDatagramRings,
    RingDatagramSource,
    ServerName,
    ServerSocket,
    UnconnectedPing
} from '@jsprismarine/raknet';

import { NativeNetwork } from '../NativeNetwork';
import { SharedPort } from '../SharedPort';

const port = Number(process.argv[2]);
const network = await NativeNetwork.load();
const shared = SharedPort.open(network, port);
const rings = allocateDatagramRings(1 << 16);
const source = new RingDatagramSource(rings, 4, port, (wakePort) => shared.attach(4, rings, wakePort));
const logger = { info: () => {}, warn: () => {}, error: () => {}, verbose: () => {}, debug: () => {}, silly: () => {} };
const serverName = new ServerName(
    { getConfig: () => ({ getMotd: () => 'bun', getGamemode: () => 'survival', getMaxPlayers: () => 1 }) },
    { protocolVersion: 0, minecraftVersions: ['0.0.0'] }
);
const server = new ServerSocket(1, false, serverName, logger, {}, 'copy', undefined, source);
const listening = once(server, 'listening');
server.start('0.0.0.0', port);
await listening;

const client = dgram.createSocket('udp4');
const ping = new UnconnectedPing();
ping.timestamp = 1n;
ping.clientGUID = 2n;
ping.encode();
const reply = once(client, 'message') as Promise<[Buffer, dgram.RemoteInfo]>;
client.send(ping.getBuffer(), port, '127.0.0.1');
const [pong, from] = await reply;
process.stdout.write(
    `${JSON.stringify({ runtime: process.versions.bun === undefined ? 'node' : 'bun', id: pong[0], from: from.port, port })}\n`
);
client.close();
server.kill();
shared.close();
network.close();
