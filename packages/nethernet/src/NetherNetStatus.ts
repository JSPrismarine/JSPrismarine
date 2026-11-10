import { isRecord } from './isRecord';

/**
 * What a NetherNet client is told about a server before it joins: the LAN advertisement on UDP
 * 7551 and the `GET /v1/join` answer on the game port both carry these.
 */
export interface NetherNetStatus {
    readonly motd: string;
    readonly levelName: string;
    readonly protocol: number;
    /** The game version, such as `1.26.51`. */
    readonly version: string;
    readonly playerCount: number;
    readonly maxPlayers: number;
    /** The `Gametype` id: 0 survival, 1 creative, 2 adventure. */
    readonly gameType: number;
}

/**
 * The `GET /v1/join` body: the status under the field names Bedrock Dedicated Server 1.26.51
 * answers with, in its order.
 */
export const joinStatusJson = (status: NetherNetStatus): string =>
    JSON.stringify({
        name: status.motd,
        protocol: status.protocol,
        version: status.version,
        level: status.levelName,
        players: status.playerCount,
        maxPlayers: status.maxPlayers,
        gameType: status.gameType
    });

/**
 * Reads a `GET /v1/join` body back into the status.
 * @param body - The JSON the server answered with.
 * @throws {Error} When a field is missing or has the wrong type.
 */
export const decodeJoinStatus = (body: string): NetherNetStatus => {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) throw new Error('The join status is not an object');
    const text = (key: string): string => {
        const value = parsed[key];
        if (typeof value !== 'string') throw new Error(`The join status has no string ${key}`);
        return value;
    };
    const number = (key: string): number => {
        const value = parsed[key];
        if (typeof value !== 'number') throw new Error(`The join status has no number ${key}`);
        return value;
    };
    return {
        motd: text('name'),
        protocol: number('protocol'),
        version: text('version'),
        levelName: text('level'),
        playerCount: number('players'),
        maxPlayers: number('maxPlayers'),
        gameType: number('gameType')
    };
};
