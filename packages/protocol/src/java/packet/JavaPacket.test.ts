import { describe, expect, it } from 'vitest';

import { ClientIntent, Intention } from './handshake';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from './JavaPacket';
import { LoginDisconnect } from './login';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from './status';
import { PACKETS } from '../versions/26.3/packets';

describe('Java packets', () => {
    it('reads the handshake a client sends before a server list ping', () => {
        // Protocol 777, "localhost", port 25565, then intent 1, as a vanilla client writes it.
        const frame = Buffer.from([0x00, 0x89, 0x06, 0x09, ...Buffer.from('localhost'), 0x63, 0xdd, 0x01]);

        const { id, body } = readJavaPacketId(frame);

        expect(id).toBe(Intention.id);
        expect(decodeJavaPacket(Intention, body)).toEqual({
            protocolVersion: 777,
            serverAddress: 'localhost',
            serverPort: 25_565,
            intent: ClientIntent.Status
        });
    });

    it.each([
        [StatusRequest.name, StatusRequest, {}],
        [StatusResponse.name, StatusResponse, { json: '{"version":{"name":"26.3","protocol":777}}' }],
        [PingRequest.name, PingRequest, { timestamp: 1_700_000_000_000n }],
        [PongResponse.name, PongResponse, { timestamp: -1n }],
        [LoginDisconnect.name, LoginDisconnect, { reason: '{"text":"Bye"}' }]
    ] as const)('round-trips %s', (_name, definition, value) => {
        const { id, body } = readJavaPacketId(encodeJavaPacket<object>(definition, value));

        expect(id).toBe(definition.id);
        expect(decodeJavaPacket<object>(definition, body)).toEqual(value);
    });

    it('refuses a packet with bytes after its fields', () => {
        const { body } = readJavaPacketId(Buffer.from([0x00, 0x2a]));

        expect(() => decodeJavaPacket(StatusRequest, body)).toThrow(
            'Status Request has 1 unread bytes after its fields'
        );
    });
});

describe('the packets every release shares', () => {
    it.each([
        ['handshake', 'serverbound', 'intention', Intention],
        ['status', 'serverbound', 'status_request', StatusRequest],
        ['status', 'clientbound', 'status_response', StatusResponse],
        ['status', 'serverbound', 'ping_request', PingRequest],
        ['status', 'clientbound', 'pong_response', PongResponse],
        ['login', 'clientbound', 'login_disconnect', LoginDisconnect]
    ] as const)('give %s %s %s the id the data generator reports', (phase, direction, name, definition) => {
        const table: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>> = PACKETS;

        expect(table[phase]?.[direction]?.[name]).toBe(definition.id);
    });
});
