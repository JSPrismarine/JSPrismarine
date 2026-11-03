import type { RemoteInfo } from 'node:dgram';
import { describe, expect, it } from 'vitest';

import { OfflineHandler } from './OfflineHandler';
import type Packet from './Packet';
import { MessageIdentifiers } from './MessageIdentifiers';
import UnconnectedPing from './offline/UnconnectedPing';
import UnconnectedPong from './offline/UnconnectedPong';
import { ServerName } from '../utils/ServerName';

const SERVER_GUID = 0xfedc_ba98_7654_3210n;
const REMOTE: RemoteInfo = { address: '192.0.2.1', port: 19132, family: 'IPv4', size: 0 };

const makeServerName = () =>
    new ServerName(
        {
            getConfig: () => ({ getMotd: () => 'MOTD', getGamemode: () => 'Survival', getMaxPlayers: () => 20 })
        },
        { protocolVersion: 2225, minecraftVersions: ['1.26.60'] }
    );

function makeHandler(serverName: ServerName) {
    const responses: Buffer[] = [];
    const listener = {
        addSession: () => {},
        allowIncomingConnections: () => true,
        emit: () => true,
        getLogger: () => ({
            info: () => {},
            warn: () => {},
            error: () => {},
            verbose: () => {},
            debug: () => {},
            silly: () => {}
        }),
        getServerGuid: () => SERVER_GUID,
        getSessionByAddress: () => null,
        getSessionByGUID: () => null,
        sendBuffer: (buffer: Buffer) => responses.push(buffer),
        sendPacket: (_packet: Packet, _remote: RemoteInfo) => {},
        serverName
    } satisfies ConstructorParameters<typeof OfflineHandler>[0];
    return { handler: new OfflineHandler(listener), responses };
}

function sendPing(handler: OfflineHandler, timestamp: bigint): void {
    const ping = new UnconnectedPing();
    ping.timestamp = timestamp;
    ping.clientGUID = 1n;
    ping.encode();
    handler.process(ping.getWriteBuffer(), REMOTE);
}

function encodeFreshPong(timestamp: bigint, serverName: string): Buffer {
    const pong = new UnconnectedPong();
    pong.timestamp = timestamp;
    pong.serverGuid = SERVER_GUID;
    pong.serverName = serverName;
    pong.encode();
    return pong.getWriteBuffer();
}

const mutations = [
    ['motd', (name: ServerName) => name.setMotd('Changed MOTD')],
    ['name', (name: ServerName) => name.setName('Changed name')],
    ['protocol', (name: ServerName) => name.setProtocol(1)],
    ['version', (name: ServerName) => name.setVersion('1.0')],
    ['online player count', (name: ServerName) => name.setOnlinePlayerCount(1)],
    ['maximum player count', (name: ServerName) => name.setMaxPlayerCount(21)],
    ['gamemode', (name: ServerName) => name.setGamemode('Creative')],
    ['server id', (name: ServerName) => name.setServerId(99n)],
    ['port', (name: ServerName) => name.setPort(19133)]
] as const;

describe('OfflineHandler unconnected pong cache', () => {
    it('matches a fresh packet encoding and keeps each sent buffer stable', () => {
        const serverName = makeServerName();
        const { handler, responses } = makeHandler(serverName);

        sendPing(handler, 1234n);
        const first = responses[0]!;
        const firstExpected = encodeFreshPong(1234n, serverName.toString());
        sendPing(handler, 5678n);
        const second = responses[1]!;

        expect(first).toStrictEqual(firstExpected);
        expect(second).toStrictEqual(encodeFreshPong(5678n, serverName.toString()));
        expect(first).not.toBe(second);

        const decoded = new UnconnectedPong(first);
        decoded.decode();
        expect(first[0]).toBe(MessageIdentifiers.UNCONNECTED_PONG);
        expect(decoded.timestamp).toBe(1234n);
        expect(decoded.serverGuid).toBe(SERVER_GUID);
        expect(decoded.isValid()).toBe(true);
        expect(decoded.serverName).toBe(serverName.toString());
    });

    it.each(mutations)('invalidates the cached response after the %s field changes', (_field, mutate) => {
        const serverName = makeServerName();
        const { handler, responses } = makeHandler(serverName);
        sendPing(handler, 1n);
        mutate(serverName);
        sendPing(handler, 2n);

        expect(responses[1]).toStrictEqual(encodeFreshPong(2n, serverName.toString()));
        const decoded = new UnconnectedPong(responses[1]);
        decoded.decode();
        expect(decoded.serverName).toBe(serverName.toString());
    });
});
