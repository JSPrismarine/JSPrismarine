import { testKernel } from '../testing/kernel.test.helper';
import dgram from 'node:dgram';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { startTestModule } from '@jsprismarine/kernel/testing';
import {
    exchangeOffer,
    loadNativeDriver,
    NetherNetClient,
    PUBLIC_IP_SERVICES,
    SignalStructure,
    SignalType,
    verifySelfSignedIdentity
} from '@jsprismarine/nethernet';
import type { Connection } from '@jsprismarine/nethernet';
import { UnconnectedPing, UnconnectedPong } from '@jsprismarine/raknet';
import { about } from '../about';
import type { Config } from '../config/Config';
import SessionManager from '../SessionManager';
import PacketLogFilter from '../network/PacketLogFilter';
import { stub } from '../testing/stub.test.helper';
import { softwareLabel } from '../version';
import type Server from '../Server';
import type { Networking } from './network';
import { ServerNetworking, networkModule } from './network';
import { networkToken } from './tokens';

/** A kernel whose only part is its event bus, which the transports raise the RakNet events on. */
const kernelDouble = () => testKernel();

/** The native WebRTC stack, or undefined on a machine with no build of it. */
const driver = await loadNativeDriver().catch(() => undefined);

describe('modules/network', () => {
    it('provides the networking the server constructed under the network token', async () => {
        const networking = stub<Networking>({});

        const handle = await startTestModule(networkModule(networking));
        try {
            expect(handle.get(networkToken)).toBe(networking);
        } finally {
            await handle.stop();
        }
    });

    it('survives a kernel restart without touching the listener', async () => {
        // A reload stops and restarts the kernel while the listener stays bound,
        // so the module must not start or kill anything in its own lifecycle.
        const networking = stub<Networking>({});

        const handle = await startTestModule(networkModule(networking));
        await handle.stop();
        await handle.start();
        try {
            expect(handle.get(networkToken)).toBe(networking);
        } finally {
            await handle.stop();
        }
    });

    it('has no listener and ignores a kill before start', () => {
        const networking = new ServerNetworking(stub<Server>({}));

        expect(networking.getListener()).toBeUndefined();
        expect(() => networking.kill()).not.toThrow();
    });

    it('refuses to start with every transport turned off', async () => {
        const server = stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getEnableRakNet: () => false,
                    getEnableNetherNet: () => false
                })
        });
        const networking = new ServerNetworking(server);

        await expect(networking.start('127.0.0.1', 0)).rejects.toThrow('No transport is enabled');
        expect(networking.getListener()).toBeUndefined();
    });

    /** A server running NetherNet alone, with LAN visibility off so nothing fixed binds. */
    const netherNetServer = ({
        lookup = false,
        publicIp = '',
        info = () => {},
        warn = () => {}
    }: {
        lookup?: boolean;
        publicIp?: string;
        info?: (message: string) => void;
        warn?: (message: string) => void;
    } = {}) =>
        stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getEnableRakNet: () => false,
                    getEnableNetherNet: () => true,
                    getEnableQuery: () => false,
                    // Off, so the test binds nothing: UDP 7551 is a fixed, shared port.
                    getEnableLanVisibility: () => false,
                    getServerUdpPorts: () => '',
                    getServerPublicIp: () => publicIp,
                    getEnableServerPublicIpLookup: () => lookup,
                    getLevelName: () => 'world'
                }),
            getLogger: () => stub<Logger>({ debug: () => {}, info, warn, error: () => {} }),
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getSessionManager: () => new SessionManager()
        });

    it('starts with NetherNet alone, advertising the same server name RakNet would', async () => {
        const networking = new ServerNetworking(netherNetServer());
        // The server identity key is written to the data directory, so keep it out of the repository.
        const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-network-'));
        vi.stubEnv('JSP_DIR', dataDirectory);

        try {
            // Port 0: HTTP signaling binds an ephemeral TCP port, so nothing fixed is taken.
            await networking.start('127.0.0.1', 0);

            expect(networking.getListener()).toBeUndefined();
            expect(networking.getServerName()?.getMotd()).toBe('test server');
            expect(fs.existsSync(path.join(dataDirectory, 'nethernet-identity.pem'))).toBe(true);
        } finally {
            networking.kill();
            vi.unstubAllEnvs();
            fs.rmSync(dataDirectory, { recursive: true, force: true });
        }
    });

    describe('public address lookup', () => {
        /** Starts NetherNet on `address` with `fetch` answering every request, and stops it again. */
        const startWith = async (
            address: string,
            fetch: (url: string) => Promise<Response>,
            options: Parameters<typeof netherNetServer>[0]
        ): Promise<void> => {
            vi.stubGlobal('fetch', fetch);
            const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-network-'));
            vi.stubEnv('JSP_DIR', dataDirectory);
            const networking = new ServerNetworking(netherNetServer(options));
            try {
                await networking.start(address, 0);
            } finally {
                // Stopped after the test, once it has seen what the lookup logged.
                stopping.push(() => {
                    networking.kill();
                    vi.unstubAllGlobals();
                    vi.unstubAllEnvs();
                    fs.rmSync(dataDirectory, { recursive: true, force: true });
                });
            }
        };
        const stopping: (() => void)[] = [];
        afterEach(() => {
            for (const stop of stopping.splice(0)) stop();
        });

        it('looks the address up from the first service that answers, and logs it', async () => {
            const asked: string[] = [];
            const info = vi.fn();
            await startWith(
                '0.0.0.0',
                async (url) => {
                    asked.push(url);
                    if (asked.length === 1) throw new Error('fetch failed');
                    return new Response('203.0.113.7\n');
                },
                { lookup: true, info }
            );

            await vi.waitFor(() =>
                expect(info).toHaveBeenCalledWith(expect.stringContaining('NetherNet offers 203.0.113.7'))
            );
            expect(asked).toStrictEqual(PUBLIC_IP_SERVICES.slice(0, 2));
        });

        it('warns, naming server-public-ip and the switch, when no service answers', async () => {
            const warn = vi.fn();
            await startWith(
                '0.0.0.0',
                async () => {
                    throw new Error('fetch failed');
                },
                { lookup: true, warn }
            );

            await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
            const [message] = warn.mock.calls[0]!;
            expect(message).toContain("could not look up this server's public address");
            expect(message).toContain(`${PUBLIC_IP_SERVICES[0]} failed: fetch failed`);
            expect(message).toContain('server-public-ip');
            expect(message).toContain('enable-server-public-ip-lookup');
        });

        it.each([
            ['enable-server-public-ip-lookup is off', '0.0.0.0', { lookup: false }],
            ['server-public-ip names an address', '0.0.0.0', { lookup: true, publicIp: '198.51.100.4' }],
            ['the server binds loopback', '127.0.0.1', { lookup: true }],
            ['the server binds IPv6 loopback, spelled out', '0:0:0:0:0:0:0:1', { lookup: true }]
        ])('asks no service when %s', async (_case, address, options) => {
            const fetch = vi.fn(async () => new Response('203.0.113.7'));
            const warn = vi.fn();
            await startWith(address, fetch, { ...options, warn });

            expect(fetch).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
        });
    });

    it('refuses to start NetherNet with a malformed server-udp-ports, before anything binds', async () => {
        const server = stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getEnableRakNet: () => false,
                    getEnableNetherNet: () => true,
                    getServerUdpPorts: () => 'ports',
                    getServerPublicIp: () => ''
                }),
            getLogger: () => stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} })
        });

        await expect(new ServerNetworking(server).start('127.0.0.1', 0)).rejects.toThrow(
            'server-udp-ports: Invalid Port. Port must be in the range [ 1, 65535 ]'
        );
    });

    /** A server running RakNet alone, in socket or worker mode, on the IPv6 port given. */
    const rakNetServer = (portV6: number, warn: (message: string) => void = () => {}, worker = false) =>
        stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getEnableQuery: () => false,
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getOnlineMode: () => false,
                    getEnableRakNet: () => true,
                    getEnableNetherNet: () => false,
                    getUseRakNetWorker: () => worker,
                    getServerPortV6: () => portV6
                }),
            getLogger: () =>
                stub<Logger>({
                    debug: () => {},
                    error: () => {},
                    info: () => {},
                    silly: () => {},
                    verbose: () => {},
                    warn
                }),
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getSessionManager: () => new SessionManager()
        });

    it('listens on IPv6 beside a wildcard IPv4 bind and advertises both ports', async () => {
        const networking = new ServerNetworking(rakNetServer(0));

        try {
            // Port 0 for both: the advertised ports change from their defaults once each socket binds.
            await networking.start('0.0.0.0', 0);
            const name = networking.getServerName()!;

            expect(name.getPort()).not.toBe(19132);
            expect(name.getPortV6()).not.toBe(19133);
            expect(name.getPortV6()).not.toBe(name.getPort());
        } finally {
            networking.kill();
        }
    });

    /** A port free for UDP on both families right now. */
    const portFreeOnBothFamilies = async (): Promise<number> => {
        for (;;) {
            const v4 = dgram.createSocket('udp4');
            v4.bind(0, '0.0.0.0');
            await once(v4, 'listening');
            const { port } = v4.address();
            const v6 = dgram.createSocket({ type: 'udp6', ipv6Only: true });
            const free = await new Promise<boolean>((resolve) => {
                v6.once('error', () => resolve(false));
                v6.bind(port, '::', () => resolve(true));
            });
            v4.close();
            v6.close();
            if (free) return port;
        }
    };

    /** Sends an unconnected ping to an address and resolves with the first datagram back. */
    const pingOnce = async (host: string, port: number): Promise<Buffer> => {
        const socket = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
        try {
            const ping = new UnconnectedPing();
            ping.timestamp = 1n;
            ping.clientGUID = 2n;
            ping.encode();
            const reply = once(socket, 'message') as Promise<[Buffer]>;
            socket.send(ping.getBuffer(), port, host);
            return (await reply)[0];
        } finally {
            socket.close();
        }
    };

    /**
     * The fields of the server name in an unconnected pong. The datagram's own header holds the
     * server GUID, random bytes that can include `;`, so only the decoded server name is split.
     */
    const pongFields = (datagram: Buffer): string[] => {
        const pong = new UnconnectedPong(datagram);
        pong.decode();
        return pong.serverName.split(';');
    };

    it('reads the server name of a pong whose GUID bytes include a semicolon', () => {
        const pong = new UnconnectedPong();
        pong.timestamp = 1n;
        pong.serverGuid = 0x3b3b3b3b3b3b3b3bn;
        pong.serverName = 'MCPE;test server;944;1.26.62;0;1';
        pong.encode();

        // Splitting the whole datagram counts the GUID's semicolons as field separators.
        expect(pong.getBuffer().toString('latin1').split(';')[3]).not.toBe('1.26.62');
        expect(pongFields(pong.getBuffer())[3]).toBe('1.26.62');
    });

    it.each([
        ['socket', false],
        ['worker', true]
    ])('answers a ping on both families with server-portv6 equal to port, in %s mode', async (_mode, worker) => {
        const port = await portFreeOnBothFamilies();
        const networking = new ServerNetworking(rakNetServer(port, () => {}, worker));

        try {
            await networking.start('0.0.0.0', port);

            // 0x1c is an unconnected pong.
            const pong = await pingOnce('127.0.0.1', port);
            expect(pong[0]).toBe(0x1c);
            expect((await pingOnce('::1', port))[0]).toBe(0x1c);
            // The eighth field, after the server id, names the software, as other third-party servers do.
            const fields = pongFields(pong);
            expect(fields[3]).toBe(about().minecraftVersion);
            expect(fields[7]).toBe('JSPrismarine');
            expect([networking.getServerName()!.getPort(), networking.getServerName()!.getPortV6()]).toStrictEqual([
                port,
                port
            ]);
        } finally {
            networking.kill();
        }
    });

    it('stops the start and names the port when the IPv4 RakNet port is taken', async () => {
        const holder = dgram.createSocket('udp4');
        holder.bind(0, '127.0.0.1');
        await once(holder, 'listening');
        const taken = holder.address().port;
        const networking = new ServerNetworking(rakNetServer(0));

        try {
            await expect(networking.start('127.0.0.1', taken)).rejects.toThrow(
                `RakNet cannot listen on UDP port ${taken}: bind EADDRINUSE`
            );
        } finally {
            networking.kill();
            holder.close();
        }
    });

    it('stops the start and closes IPv4 when the IPv6 RakNet port is taken', async () => {
        const holder = dgram.createSocket({ type: 'udp6', ipv6Only: true });
        holder.bind(0, '::');
        await once(holder, 'listening');
        const taken = holder.address().port;
        const networking = new ServerNetworking(rakNetServer(taken));

        try {
            await expect(networking.start('0.0.0.0', 0)).rejects.toThrow(
                `RakNet cannot listen for IPv6 clients on UDP port ${taken}: bind EADDRINUSE`
            );
            // The IPv4 listener bound, and the failed start closed it again, freeing its port.
            const port = networking.getServerName()!.getPort();
            await vi.waitFor(async () => {
                const probe = dgram.createSocket('udp4');
                try {
                    await new Promise<void>((resolve, reject) => {
                        probe.once('error', reject);
                        probe.bind(port, '0.0.0.0', resolve);
                    });
                } finally {
                    probe.close();
                }
            });
        } finally {
            networking.kill();
            holder.close();
        }
    });

    it('stops the start when the IPv6 RakNet port is taken in worker mode', async () => {
        const holder = dgram.createSocket({ type: 'udp6', ipv6Only: true });
        holder.bind(0, '::');
        await once(holder, 'listening');
        const taken = holder.address().port;
        const networking = new ServerNetworking(rakNetServer(taken, () => {}, true));

        try {
            await expect(networking.start('0.0.0.0', 0)).rejects.toThrow(
                `RakNet cannot listen for IPv6 clients on UDP port ${taken}: bind EADDRINUSE`
            );
        } finally {
            networking.kill();
            holder.close();
        }
    });

    it("stops the start when NetherNet's signaling TCP port is taken", async () => {
        const holder = net.createServer();
        holder.listen(0, '127.0.0.1');
        await once(holder, 'listening');
        const address = holder.address();
        if (address === null || typeof address === 'string') throw new Error('The holder has no port');
        const networking = new ServerNetworking(netherNetServer());
        const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-network-'));
        vi.stubEnv('JSP_DIR', dataDirectory);

        try {
            await expect(networking.start('127.0.0.1', address.port)).rejects.toThrow(
                `NetherNet cannot listen for signaling on TCP port ${address.port}: listen EADDRINUSE`
            );
        } finally {
            networking.kill();
            holder.close();
            vi.unstubAllEnvs();
            fs.rmSync(dataDirectory, { recursive: true, force: true });
        }
    });

    /** A server running RakNet alone on 127.0.0.1, in socket mode, answering query on the port given. */
    const queryServer = (serverPort: number, queryPort: number, info: (message: string) => void = () => {}) =>
        stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getEnableQuery: () => true,
                    getServerPort: () => serverPort,
                    getQueryPort: () => queryPort,
                    getLevelName: () => 'world',
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 5,
                    getMotd: () => 'query server',
                    getOnlineMode: () => false,
                    getEnableRakNet: () => true,
                    getEnableNetherNet: () => false,
                    getUseRakNetWorker: () => false
                }),
            getLogger: () =>
                stub<Logger>({
                    debug: () => {},
                    error: () => {},
                    info,
                    silly: () => {},
                    verbose: () => {},
                    warn: () => {}
                }),
            getVersion: () => '0.0.0-test',
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getSessionManager: () => new SessionManager()
        });

    /**
     * Runs a handshake and a stat against a query port, returning the stat's strings.
     * @param full - Pads the token, which asks for the full stat instead of the basic one.
     */
    const queryStat = async (port: number, full = false): Promise<string[]> => {
        const client = dgram.createSocket('udp4');
        const replies: Buffer[] = [];
        client.on('message', (message) => replies.push(message));
        const send = async (type: number, payload: Buffer): Promise<Buffer> => {
            const before = replies.length;
            const header = Buffer.from([0xfe, 0xfd, type, 0, 0, 0, 1]);
            client.send(Buffer.concat([header, payload]), port, '127.0.0.1');
            await vi.waitFor(() => expect(replies.length).toBeGreaterThan(before));
            return replies[before]!;
        };
        try {
            const handshake = await send(0x09, Buffer.alloc(0));
            const token = Buffer.alloc(4);
            token.writeInt32BE(Number(handshake.subarray(5, -1).toString('latin1')));
            const stat = await send(0x00, full ? Buffer.concat([token, Buffer.alloc(4)]) : token);
            return stat.subarray(5).toString('latin1').split('\0');
        } finally {
            client.close();
        }
    };

    it('answers query on the RakNet socket when query-port is the game port', async () => {
        // The config says 19132 for both; the listener binds an ephemeral port, as bootstrap may.
        const networking = new ServerNetworking(queryServer(19_132, 19_132));

        try {
            await networking.start('127.0.0.1', 0);
            const name = networking.getServerName()!;
            expect(name.getPort()).not.toBe(19132);

            const [motd, gameType, map, online, max] = await queryStat(name.getPort());
            expect([motd, gameType, map, online, max]).toStrictEqual(['query server', 'SMP', 'world', '0', '5']);
        } finally {
            networking.kill();
        }
    });

    it('answers a full stat with the version, software and players every other surface reports', async () => {
        const networking = new ServerNetworking(queryServer(19_132, 19_132));

        try {
            await networking.start('127.0.0.1', 0);
            const fields = await queryStat(networking.getServerName()!.getPort(), true);

            // The key-value section opens with `splitnum` and its padding, and ends at an empty key.
            const pairs = fields.slice(2, fields.indexOf('', 2));
            const keys = Object.fromEntries(pairs.flatMap((field, i) => (i % 2 === 0 ? [[field, pairs[i + 1]]] : [])));
            expect(keys).toMatchObject({
                hostname: 'query server',
                version: about().minecraftVersion,
                server_engine: softwareLabel(),
                plugins: softwareLabel(),
                numplayers: '0',
                maxplayers: '5'
            });
            // The player section follows its padding, empty with nobody online.
            expect(fields.slice(fields.indexOf('\x01player_') + 1)).toStrictEqual(['', '', '']);
        } finally {
            networking.kill();
        }
    });

    it('answers query on a socket of its own when query-port differs', async () => {
        const bound: number[] = [];
        const networking = new ServerNetworking(
            queryServer(19_132, 0, (message) => {
                const match = /^Answering query on UDP port (\d+)$/.exec(message);
                if (match) bound.push(Number(match[1]));
            })
        );

        try {
            await networking.start('127.0.0.1', 0);
            await vi.waitFor(() => expect(bound).toHaveLength(1));
            expect(bound[0]).not.toBe(networking.getServerName()!.getPort());

            const [motd] = await queryStat(bound[0]!);
            expect(motd).toBe('query server');
        } finally {
            networking.kill();
        }
    });

    it('rejects replay before the network dispatcher starts', async () => {
        const networking = new ServerNetworking(stub<Server>({}));

        await expect(
            networking.replayInboundRecord({
                connectionId: 1,
                order: 0,
                sequence: 0,
                tick: 0,
                protocolVersion: 2193,
                packetName: 'TextPacket',
                payload: Buffer.alloc(0)
            })
        ).rejects.toThrow('Cannot replay a packet before networking starts');
    });

    it('delegates replay to the started network dispatcher', async () => {
        const server = stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getEnableQuery: () => false,
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getOnlineMode: () => false,
                    getEnableRakNet: () => true,
                    getEnableNetherNet: () => false,
                    getUseRakNetWorker: () => false
                }),
            getLogger: () =>
                stub<Logger>({
                    debug: () => {},
                    error: () => {},
                    info: () => {},
                    silly: () => {},
                    verbose: () => {},
                    warn: () => {}
                }),
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getSessionManager: () => new SessionManager()
        });
        const networking = new ServerNetworking(server);

        try {
            // Port 0 asks the OS for an ephemeral local port; cleanup below leaves no listener behind.
            await networking.start('127.0.0.1', 0);

            await expect(
                networking.replayInboundRecord({
                    connectionId: 1,
                    order: 0,
                    sequence: 0,
                    tick: 0,
                    protocolVersion: 2193,
                    packetName: 'TextPacket',
                    payload: Buffer.alloc(0)
                })
            ).rejects.toThrow('Replay connection 1 is not connected');
        } finally {
            networking.kill();
        }
    });

    /** A server running NetherNet with its UDP on the game port, and RakNet unless told otherwise. */
    const sharedPortServer = (
        worker: boolean,
        udpPorts: string,
        portV6: number,
        { rakNet = true, query = false }: { rakNet?: boolean; query?: boolean } = {}
    ) =>
        stub<Server>({
            getKernel: kernelDouble,
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 2,
                    getMotd: () => 'shared server',
                    getOnlineMode: () => false,
                    getEnableRakNet: () => rakNet,
                    getEnableNetherNet: () => true,
                    getUseRakNetWorker: () => worker,
                    getEnableQuery: () => query,
                    // Unset, query-port follows server-port.
                    getQueryPort: () => 19_132,
                    getServerPort: () => 19_132,
                    getEnableLanVisibility: () => false,
                    getServerPortV6: () => portV6,
                    getServerUdpPorts: () => udpPorts,
                    getServerPublicIp: () => '',
                    getEnableServerPublicIpLookup: () => false,
                    getLevelName: () => 'world'
                }),
            getLogger: () =>
                stub<Logger>({
                    debug: () => {},
                    error: () => {},
                    info: () => {},
                    silly: () => {},
                    verbose: () => {},
                    warn: () => {}
                }),
            getVersion: () => '0.0.0-test',
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getSessionManager: () => new SessionManager()
        });

    /** Joins by address on the signaling port and returns the UDP port NetherNet's media uses. */
    const joinedMediaPort = async (port: number): Promise<number | undefined> => {
        const client: NetherNetClient = new NetherNetClient({
            driver: driver!,
            signal: (signal) => {
                if (signal.type !== SignalType.ConnectRequest) return;
                void exchangeOffer(
                    { host: '127.0.0.1', port },
                    client.networkId,
                    signal.data,
                    AbortSignal.timeout(10_000)
                ).then(async (answer) => {
                    const { description } = await verifySelfSignedIdentity(answer);
                    client.handleSignal(
                        new SignalStructure(SignalType.ConnectResponse, client.connectionId, description)
                    );
                });
            }
        });
        try {
            const connected = once(client, 'connected') as Promise<[Connection]>;
            await client.connect();
            const [connection] = await connected;
            return connection.peer.remoteAddress()?.port;
        } finally {
            client.close();
        }
    };

    it.skipIf(driver === undefined).each([
        // The port table in docs/guide/running.md: what is set, and where each listener goes.
        ['server-portv6 equal to server-port, socket mode', false, false, false],
        ['server-portv6 equal to server-port, worker mode', true, false, false],
        ['server-portv6 equal to server-port, and server-udp-ports', false, true, false],
        ['server-portv6 a port of its own', true, false, true],
        ['server-portv6 a port of its own, and server-udp-ports', false, true, true]
    ])('opens the ports the port table lists: %s', async (_row, worker, withUdpPorts, withPortV6) => {
        const port = await portFreeOnBothFamilies();
        const udpPort = withUdpPorts ? await portFreeOnBothFamilies() : port;
        const portV6 = withPortV6 ? await portFreeOnBothFamilies() : port;
        const networking = new ServerNetworking(sharedPortServer(worker, withUdpPorts ? String(udpPort) : '', portV6));
        const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-network-'));
        vi.stubEnv('JSP_DIR', dataDirectory);
        try {
            await networking.start('0.0.0.0', port);

            // RakNet on server-port for IPv4, and on server-portv6 for IPv6.
            expect((await pingOnce('127.0.0.1', port))[0]).toBe(0x1c);
            expect((await pingOnce('::1', portV6))[0]).toBe(0x1c);

            // And a NetherNet client joining by address, its media on server-udp-ports, or on
            // server-port beside RakNet.
            expect(await joinedMediaPort(port)).toBe(udpPort);
        } finally {
            networking.kill();
            vi.unstubAllEnvs();
            fs.rmSync(dataDirectory, { recursive: true, force: true });
        }
    });

    it.skipIf(driver === undefined)('answers query and NetherNet on the server port with RakNet off', async () => {
        const port = await portFreeOnBothFamilies();
        const networking = new ServerNetworking(sharedPortServer(false, '', port, { rakNet: false, query: true }));
        const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-network-'));
        vi.stubEnv('JSP_DIR', dataDirectory);
        try {
            await networking.start('0.0.0.0', port);

            const [motd] = await queryStat(port);
            expect(motd).toBe('shared server');
            expect(await joinedMediaPort(port)).toBe(port);
        } finally {
            networking.kill();
            vi.unstubAllEnvs();
            fs.rmSync(dataDirectory, { recursive: true, force: true });
        }
    });
});
