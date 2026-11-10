import { describe, expect, it } from 'vitest';

import { QueryResponder } from './QueryResponder';
import type { QueryStatus } from './QueryResponder';

const STATUS: QueryStatus = {
    motd: 'A JSPrismarine server',
    version: '1.26.51',
    software: 'JSPrismarine 0.19.2',
    map: 'world',
    onlinePlayers: 2,
    maxPlayers: 20,
    hostPort: 19_132,
    hostIp: '0.0.0.0',
    players: ['Alex', 'Steve']
};

/** A request: the magic, the type, the session id and whatever payload the type carries. */
const request = (type: number, sessionId: number, ...payload: Buffer[]): Buffer => {
    const header = Buffer.alloc(7);
    header.writeUInt16BE(0xfe_fd, 0);
    header[2] = type;
    header.writeInt32BE(sessionId, 3);
    return Buffer.concat([header, ...payload]);
};

const int32 = (value: number): Buffer => {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value);
    return buffer;
};

/** Runs the handshake and reads back the token the reply carries. */
const handshake = (responder: QueryResponder, address = '192.0.2.1', port = 50_000): number => {
    const reply = responder.respond(request(0x09, 1, Buffer.alloc(0)), address, port)!;
    return Number(reply.subarray(5, -1).toString('latin1'));
};

/** Splits a reply body on its null terminators. */
const strings = (body: Buffer): string[] => body.toString('latin1').split('\0');

describe('network/query/QueryResponder', () => {
    const responder = new QueryResponder(() => STATUS, Buffer.alloc(32, 7));

    it('answers a handshake with the masked session id and a decimal token', () => {
        const reply = responder.respond(request(0x09, 0x7f_ff_ff_ff), '192.0.2.1', 50_000)!;

        expect(reply[0]).toBe(0x09);
        expect(reply.readInt32BE(1)).toBe(0x0f_0f_0f_0f);
        expect(reply.at(-1)).toBe(0);
        expect(reply.subarray(5, -1).toString('latin1')).toMatch(/^-?\d+$/);
    });

    it('binds the token to the sender, so another address cannot reuse it', () => {
        expect(handshake(responder, '192.0.2.1', 50_000)).toBe(handshake(responder, '192.0.2.1', 50_000));
        expect(handshake(responder, '192.0.2.1', 50_000)).not.toBe(handshake(responder, '192.0.2.2', 50_000));
        expect(handshake(responder, '192.0.2.1', 50_000)).not.toBe(handshake(responder, '192.0.2.1', 50_001));
    });

    it('answers a basic stat with what a server list shows', () => {
        const token = handshake(responder);
        const reply = responder.respond(request(0x00, 5, int32(token)), '192.0.2.1', 50_000)!;

        expect(reply[0]).toBe(0x00);
        expect(reply.readInt32BE(1)).toBe(5);
        const body = reply.subarray(5);
        const [motd, gameType, map, online, max] = strings(body);
        expect([motd, gameType, map, online, max]).toStrictEqual(['A JSPrismarine server', 'SMP', 'world', '2', '20']);
        // The host port is a little-endian short between the counts and the address.
        const portOffset = Buffer.byteLength(`${motd}\0${gameType}\0${map}\0${online}\0${max}\0`, 'latin1');
        expect(body.readUInt16LE(portOffset)).toBe(19_132);
        expect(body.subarray(portOffset + 2).toString('latin1')).toBe('0.0.0.0\0');
    });

    it('answers a full stat with every key and the player names', () => {
        const token = handshake(responder);
        const reply = responder.respond(request(0x00, 5, int32(token), Buffer.alloc(4)), '192.0.2.1', 50_000)!;

        const body = reply.subarray(5);
        expect(body.subarray(0, 11).toString('latin1')).toBe('splitnum\0\x80\0');
        const [pairs, players] = body.subarray(11).toString('latin1').split('\0\0\x01player_\0\0');
        const fields = pairs!.split('\0');
        const keys = Object.fromEntries(fields.flatMap((field, i) => (i % 2 === 0 ? [[field, fields[i + 1]]] : [])));
        expect(keys).toStrictEqual({
            hostname: 'A JSPrismarine server',
            gametype: 'SMP',
            game_id: 'MINECRAFTPE',
            version: '1.26.51',
            plugins: 'JSPrismarine 0.19.2',
            map: 'world',
            numplayers: '2',
            maxplayers: '20',
            hostport: '19132',
            hostip: '0.0.0.0'
        });
        expect(players).toBe('Alex\0Steve\0\0');
    });

    it('ignores a stat request without the sender token', () => {
        const token = handshake(responder, '192.0.2.1');

        expect(responder.respond(request(0x00, 5, int32(token)), '198.51.100.7', 50_000)).toBeUndefined();
        expect(responder.respond(request(0x00, 5, int32(token + 1)), '192.0.2.1', 50_000)).toBeUndefined();
        expect(responder.respond(request(0x00, 5), '192.0.2.1', 50_000)).toBeUndefined();
    });

    it('ignores what is not a query request', () => {
        expect(responder.respond(Buffer.from([0x01, 0x00, 0x00]), '192.0.2.1', 50_000)).toBeUndefined();
        expect(responder.respond(Buffer.from([0xfe, 0xfd, 0x09]), '192.0.2.1', 50_000)).toBeUndefined();
        expect(responder.respond(request(0x42, 1), '192.0.2.1', 50_000)).toBeUndefined();
    });

    it('draws a fresh secret per responder, so tokens do not outlive a restart', () => {
        const a = new QueryResponder(() => STATUS);
        const b = new QueryResponder(() => STATUS);

        expect(handshake(a)).not.toBe(handshake(b));
    });
});
