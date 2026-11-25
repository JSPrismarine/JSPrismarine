import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { varInt } from '../wire/javaTypes';

import { ClientIntent, Intention } from './handshake';
import { RegistryData } from './configuration';
import type { JavaPacketDefinition } from './JavaPacket';
import { defineJavaPacket, decodeJavaPacket, encodeJavaPacket, readJavaPacketId, javaPacketId } from './JavaPacket';
import { NEWEST_JAVA_RELEASE } from '../versions/javaReleases';
import {
    EncryptionRequest,
    EncryptionResponse,
    LoginAcknowledged,
    LoginDisconnect,
    LoginStart,
    LoginSuccess,
    SetCompression
} from './login';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from './status';
import * as levelChunk from '../chunk/levelChunk';
import * as configuration from './configuration';
import * as handshake from './handshake';
import * as login from './login';
import * as play from './play';
import * as status from './status';

describe('Java packets', () => {
    it('reads the handshake a client sends before a server list ping', () => {
        // The newest release's protocol, "localhost", port 25565, then intent 1, as a vanilla client
        // writes it.
        const protocol = new BinaryStream();
        varInt.write(protocol, NEWEST_JAVA_RELEASE.protocolVersion);
        const frame = Buffer.from([0x00, ...protocol.getBuffer(), 0x09, ...Buffer.from('localhost'), 0x63, 0xdd, 0x01]);

        const { id, body } = readJavaPacketId(frame);

        expect(id).toBe(javaPacketId(NEWEST_JAVA_RELEASE, Intention));
        expect(decodeJavaPacket(NEWEST_JAVA_RELEASE, Intention, body)).toEqual({
            protocolVersion: NEWEST_JAVA_RELEASE.protocolVersion,
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
        [LoginDisconnect.name, LoginDisconnect, { reason: '{"text":"Bye"}' }],
        [LoginStart.name, LoginStart, { name: 'Steve', profileId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' }],
        [
            EncryptionRequest.name,
            EncryptionRequest,
            {
                serverId: '',
                publicKey: Buffer.from([1, 2, 3]),
                verifyToken: Buffer.from([4, 5, 6, 7]),
                shouldAuthenticate: true
            }
        ],
        [
            EncryptionResponse.name,
            EncryptionResponse,
            { sharedSecret: Buffer.alloc(128, 1), verifyToken: Buffer.alloc(128, 2) }
        ],
        [SetCompression.name, SetCompression, { threshold: 256 }],
        [
            LoginSuccess.name,
            LoginSuccess,
            {
                uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
                username: 'Steve',
                properties: [{ name: 'textures', value: 'e30=', signature: null }],
                sessionId: '83b77f6c-6c4b-4976-b32e-1c63c8d95583'
            }
        ],
        [LoginAcknowledged.name, LoginAcknowledged, {}]
    ] as const)('round-trips %s', (_name, definition, value) => {
        const { id, body } = readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value));

        expect(id).toBe(javaPacketId(NEWEST_JAVA_RELEASE, definition));
        expect(decodeJavaPacket(NEWEST_JAVA_RELEASE, definition, body)).toEqual(value);
    });

    it('refuses a packet with bytes after its fields', () => {
        const { body } = readJavaPacketId(Buffer.from([0x00, 0x2a]));

        expect(() => decodeJavaPacket(NEWEST_JAVA_RELEASE, StatusRequest, body)).toThrow(
            'Status Request has 1 unread bytes after its fields'
        );
    });
});

describe('packet ids', () => {
    it('come from the release the connection speaks', () => {
        const release = { ...NEWEST_JAVA_RELEASE, packets: { status: { clientbound: { pong_response: 9 } } } };

        expect(readJavaPacketId(encodeJavaPacket(release, PongResponse, { timestamp: 1n })).id).toBe(9);
    });

    it('keep a slash in Mojang names, as in debug/block_value', () => {
        const blockValue = defineJavaPacket('Debug Block Value', 'play/clientbound/debug/block_value', {});

        expect(blockValue.key).toBe('debug/block_value');
        expect(javaPacketId(NEWEST_JAVA_RELEASE, blockValue)).toBe(
            NEWEST_JAVA_RELEASE.packets.play?.clientbound?.['debug/block_value']
        );
    });

    it('refuse a packet the release lacks', () => {
        const release = { ...NEWEST_JAVA_RELEASE, packets: {} };

        expect(() => javaPacketId(release, PongResponse)).toThrow('Java Edition 26.3 has no Pong Response packet');
    });

    it.each(
        [handshake, status, login, configuration, play, levelChunk].flatMap((module) =>
            Object.values(module).filter(
                (value): value is JavaPacketDefinition => typeof value === 'object' && value !== null && 'key' in value
            )
        )
    )('name a packet of the newest release: $name', (definition) => {
        expect(() => javaPacketId(NEWEST_JAVA_RELEASE, definition)).not.toThrow();
    });
});

describe('Registry Data', () => {
    it('lists entries without their data, and refuses an entry that carries some', () => {
        const frame = encodeJavaPacket(NEWEST_JAVA_RELEASE, RegistryData, {
            registry: 'minecraft:dimension_type',
            entries: [{ id: 'minecraft:overworld', data: null }]
        });
        const { body } = readJavaPacketId(frame);
        expect(decodeJavaPacket(NEWEST_JAVA_RELEASE, RegistryData, body)).toEqual({
            registry: 'minecraft:dimension_type',
            entries: [{ id: 'minecraft:overworld', data: null }]
        });

        // The same entry with its presence flag set.
        const withData = Buffer.from(frame);
        withData[withData.byteLength - 1] = 1;
        expect(() => decodeJavaPacket(NEWEST_JAVA_RELEASE, RegistryData, readJavaPacketId(withData).body)).toThrow(
            'A registry entry carries data, which this server does not read'
        );
    });
});
