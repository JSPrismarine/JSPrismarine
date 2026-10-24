import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import TransferPacket from './TransferPacket';

describe('network', () => {
    describe('packet', () => {
        describe('TransferPacket', () => {
            const ADDRESS = 'play.example.org';
            const EXPERIENCE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
            const TARGET_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

            const string = (value: string) => [value.length, ...Buffer.from(value, 'utf8')];

            const uuid = (value: string) => {
                const stream = new BinaryStream();
                UUID.fromString(value).networkSerialize(stream);
                return [...stream.getBuffer()];
            };

            /** `Server Address`, `Server Port` 19132 LE, `Reload World` true, no `Gatherings Configuration`. */
            const WITHOUT_CONFIG = [Identifiers.TransferPacket, ...string(ADDRESS), 0xbc, 0x4a, 0x01, 0x00];

            /** Same head, then a `gatheringsConfig` with `worldName` and `serverId` absent. */
            const WITH_CONFIG = [
                Identifiers.TransferPacket,
                ...string(ADDRESS),
                0xbc,
                0x4a,
                0x00,
                0x01,
                ...uuid(EXPERIENCE_ID),
                ...string('Lobby'),
                0x00,
                0x00,
                ...string('creator-1'),
                0x01,
                ...uuid(TARGET_ID),
                0x01,
                ...string('scenario-1'),
                0x00
            ];

            const decode = (bytes: number[]) => {
                const pk = new TransferPacket();
                pk.setReadBuffer(Buffer.from(bytes));
                pk.decode();
                return pk;
            };

            it('writes the address, port, reload flag and an absent configuration', () => {
                const pk = new TransferPacket();
                pk.address = ADDRESS;
                pk.port = 19132;
                pk.reloadWorld = true;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(WITHOUT_CONFIG);
            });

            it('writes a present configuration with a presence byte before each optional field', () => {
                const pk = new TransferPacket();
                pk.address = ADDRESS;
                pk.port = 19132;
                pk.gatheringsConfig = {
                    experienceId: UUID.fromString(EXPERIENCE_ID),
                    experienceName: 'Lobby',
                    worldId: null,
                    worldName: null,
                    creatorId: 'creator-1',
                    targetId: UUID.fromString(TARGET_ID),
                    scenarioId: 'scenario-1',
                    serverId: null
                };
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(WITH_CONFIG);
            });

            it('reads a packet without a configuration and stops at its end', () => {
                const pk = decode(WITHOUT_CONFIG);

                expect(pk.address).toBe(ADDRESS);
                expect(pk.port).toBe(19132);
                expect(pk.reloadWorld).toBe(true);
                expect(pk.gatheringsConfig).toBeNull();
                expect(pk.feof()).toBe(true);
            });

            it('reads every configuration field and stops at its end', () => {
                const pk = decode(WITH_CONFIG);

                expect(pk.address).toBe(ADDRESS);
                expect(pk.port).toBe(19132);
                expect(pk.reloadWorld).toBe(false);
                expect(pk.gatheringsConfig).not.toBeNull();
                expect(pk.gatheringsConfig?.experienceId.toString()).toBe(EXPERIENCE_ID);
                expect(pk.gatheringsConfig?.experienceName).toBe('Lobby');
                expect(pk.gatheringsConfig?.worldId).toBeNull();
                expect(pk.gatheringsConfig?.worldName).toBeNull();
                expect(pk.gatheringsConfig?.creatorId).toBe('creator-1');
                expect(pk.gatheringsConfig?.targetId?.toString()).toBe(TARGET_ID);
                expect(pk.gatheringsConfig?.scenarioId).toBe('scenario-1');
                expect(pk.gatheringsConfig?.serverId).toBeNull();
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(TransferPacket.NetID).toBe(Identifiers.TransferPacket);
                expect(TransferPacket.NetID).toBe(85);
            });
        });
    });
});
