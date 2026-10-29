import { Vector3 } from '@jsprismarine/math';
import { netIdFor } from '../codec/v2193';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from './RespawnPacket';

/**
 * Header, Position, State, Player Runtime Id. The floats are little endian: 1.5 is 0x3fc00000,
 * 64.25 is 0x42808000 and -3.75 is 0xc0700000, each written low byte first.
 */
const WIRE = [
    0x2d, // Header: id 45, no subclient ids.
    0x00,
    0x00,
    0xc0,
    0x3f, // Position X: 1.5
    0x00,
    0x80,
    0x80,
    0x42, // Position Y: 64.25
    0x00,
    0x00,
    0x70,
    0xc0, // Position Z: -3.75
    0x01, // State: ReadyToSpawn, a plain uint8
    0x07 // Player Runtime Id: 7 as a varuint64
];

describe('network', () => {
    describe('packet', () => {
        describe('RespawnPacket', () => {
            it('writes Position, State and Player Runtime Id in docs order', () => {
                const pk = new RespawnPacket();
                pk.position = new Vector3(1.5, 64.25, -3.75);
                pk.state = PlayerRespawnState.READY_TO_SPAWN;
                pk.runtimeEntityId = 7n;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(WIRE);
            });

            it('writes the origin when there is no position', () => {
                const pk = new RespawnPacket();
                pk.state = PlayerRespawnState.SEARCHING_FOR_SPAWN;
                pk.runtimeEntityId = 0n;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([0x2d, ...new Array<number>(12).fill(0), 0x00, 0x00]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new RespawnPacket();
                pk.setReadBuffer(Buffer.from(WIRE));
                pk.decode();

                expect(pk.position?.getX()).toBeCloseTo(1.5, 6);
                expect(pk.position?.getY()).toBeCloseTo(64.25, 6);
                expect(pk.position?.getZ()).toBeCloseTo(-3.75, 6);
                expect(pk.state).toBe(PlayerRespawnState.READY_TO_SPAWN);
                expect(pk.runtimeEntityId).toBe(7n);
                expect(pk.feof()).toBe(true);
            });

            it('numbers the states the way the docs do', () => {
                expect(PlayerRespawnState.SEARCHING_FOR_SPAWN).toBe(0);
                expect(PlayerRespawnState.READY_TO_SPAWN).toBe(1);
                expect(PlayerRespawnState.CLIENT_READY_TO_SPAWN).toBe(2);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('RespawnPacket')).toBe(Identifiers.RespawnPacket);
                expect(netIdFor('RespawnPacket')).toBe(0x2d);
            });
        });
    });
});
