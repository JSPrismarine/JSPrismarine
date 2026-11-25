import type { ProtocolCodec } from '@jsprismarine/protocol';
import type ClientConnection from '../network/ClientConnection';
import type PlayerSession from '../player/PlayerSession';
import type { SessionPlayer } from '../player/sessionPlayers';
import type { TransportName } from '../network/transport/Transport';
import { TransportNames } from '../network/transport/Transport';
import SessionManager from '../SessionManager';
import { stub } from '../testing/stub.test.helper';
import Device from '../utils/Device';
import type { ServerMetricSources } from './serverMetrics';
import { serverMetrics } from './serverMetrics';
import type { StatsPlatform } from './StatsPlatform';
import { StatsRegistry } from './StatsRegistry';

/** A fixed Linux host with 8 GB of memory. */
export const testPlatform: StatsPlatform = {
    type: 'Linux',
    release: '6.1.0',
    version: '#1 SMP PREEMPT_DYNAMIC',
    arch: 'x64',
    coreCount: 8,
    memoryGb: 8
};

/**
 * A player a test server holds: its device OS, codec and transport, and whether it is online.
 * The device OS is whatever the client's login carried, so a test can hand it any value.
 */
export interface JoinedPlayer {
    readonly os: unknown;
    readonly codec: ProtocolCodec;
    readonly transport: TransportName;
    readonly online?: boolean;
}

/** A device whose OS is the raw login value, as `LoginIdentity` builds one from client data. */
const deviceWith = (os: unknown): Device => {
    const device = new Device({ id: 'device', model: 'model', os: 0, inputMode: 1, guiScale: 0 });
    // The login's `DeviceOS` is client JSON, typed `number` but not checked, so any value can arrive.
    Object.assign(device, { os });
    return device;
};

/** A connection whose session speaks for a player with the given device, codec and transport. */
const connectionFor = ({ os, codec, transport, online = true }: JoinedPlayer): ClientConnection => {
    const player = stub<SessionPlayer>({ device: os === null ? null : deviceWith(os) });
    const connection: ClientConnection = stub<ClientConnection>({
        getPlayerSession: () => session,
        codec,
        getTransport: () => transport
    });
    const session = stub<PlayerSession>({
        isConnected: () => online,
        getPlayer: () => player,
        getConnection: () => connection
    });
    return connection;
};

/** A session manager holding the given players. */
export const sessionsWith = (players: readonly JoinedPlayer[]): SessionManager => {
    const sessions = new SessionManager();
    players.forEach((player, id) => sessions.add(id, connectionFor(player)));
    return sessions;
};

/**
 * The sources the server metrics read besides the sessions: the online mode, and RakNet and
 * NetherNet as started transports when on.
 */
export const metricsSettings = (
    onlineMode: boolean,
    rakNet: boolean,
    netherNet: boolean
): Omit<ServerMetricSources, 'sessions'> => ({
    config: { getOnlineMode: () => onlineMode },
    networking: {
        getStartedTransports: () => [
            ...(rakNet ? [TransportNames.raknet] : []),
            ...(netherNet ? [TransportNames.nethernet] : [])
        ]
    }
});

/**
 * A registry holding {@link serverMetrics}, the metrics `Server.buildKernel` registers, for these
 * players and settings.
 * @param players - The players the session manager holds.
 * @param sources - The settings and started transports the metrics read.
 * @param platform - The host the registry reads.
 */
export const serverRegistry = (
    players: readonly JoinedPlayer[],
    sources: Omit<ServerMetricSources, 'sessions'>,
    platform: StatsPlatform = testPlatform
): StatsRegistry => {
    const registry = new StatsRegistry({ logger: { warn: () => {} }, platform: () => platform });
    for (const metric of serverMetrics({ ...sources, sessions: sessionsWith(players) })) registry.register(metric);
    return registry;
};
