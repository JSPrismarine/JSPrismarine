import { LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import LevelEventPacket from './LevelEventPacket';

/**
 * These ids used to live in a second, hand-written copy of the list kept in this file, which
 * numbered them from zero while vanilla's are grouped in ranges. Nothing failed loudly: the
 * server simply sent 36 where the client expects 2001 and the client dropped it on the
 * floor, so the break sound and the destroy particles quietly stopped happening.
 *
 * The values below are vanilla's, written out by hand rather than taken from the enum, so
 * that renumbering it fails here rather than in the game.
 */
const ENCODED = Buffer.concat([
    Buffer.from([0x19]), // Header: id 25.
    Buffer.from([0xa2, 0x1f]), // Event Id 2001, PARTICLES_DESTROY_BLOCK, as a ZigZag varint32.
    Buffer.from([0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x80, 0x42, 0x00, 0x00, 0xa4, 0xc1]), // Position 1.5, 64, -20.5 as three little endian floats.
    Buffer.from([0xeb, 0xf3, 0x84, 0xf5, 0x0d]) // Data -1867554038, a hashed runtime id, as a ZigZag varint32.
]);

describe('network', () => {
    describe('packet', () => {
        describe('LevelEventPacket', () => {
            it('encodes the event id, the position and the data in docs order', () => {
                const pk = new LevelEventPacket();
                pk.eventId = LevelEvent.PARTICLES_DESTROY_BLOCK;
                pk.position = new Vector3(1.5, 64, -20.5);
                pk.data = -1867554038;
                pk.encode();

                expect(pk.getBuffer()).toEqual(ENCODED);
            });

            it('decodes every field and consumes the whole buffer', () => {
                const pk = new LevelEventPacket(ENCODED);
                pk.decode();

                expect(pk.eventId).toBe(LevelEvent.PARTICLES_DESTROY_BLOCK);
                expect(pk.position).toEqual(new Vector3(1.5, 64, -20.5));
                expect(pk.data).toBe(-1867554038);
                expect(pk.feof()).toBe(true);
            });

            it.each([
                ['PARTICLES_DESTROY_BLOCK', LevelEvent.PARTICLES_DESTROY_BLOCK, 2001],
                ['PARTICLES_DESTROY_BLOCK_NO_SOUND', LevelEvent.PARTICLES_DESTROY_BLOCK_NO_SOUND, 2021],
                ['START_BLOCK_CRACKING', LevelEvent.START_BLOCK_CRACKING, 3600],
                ['STOP_BLOCK_CRACKING', LevelEvent.STOP_BLOCK_CRACKING, 3601],
                ['UPDATE_BLOCK_CRACKING', LevelEvent.UPDATE_BLOCK_CRACKING, 3602]
            ])('sends %s as the id vanilla uses', (_name, event, expected) => {
                const pk = new LevelEventPacket();
                pk.eventId = event;
                pk.position = new Vector3(1, 2, 3);
                pk.data = 0;
                pk.encode();

                const decoded = new LevelEventPacket();
                decoded.setReadBuffer(pk.getBuffer());
                decoded.decode();

                expect(decoded.eventId).toBe(expected);
            });

            it('carries the position it was given', () => {
                // It used to be left unset, and every event played at the world origin.
                const pk = new LevelEventPacket();
                pk.eventId = LevelEvent.PARTICLES_DESTROY_BLOCK_NO_SOUND;
                pk.position = new Vector3(10.5, 64.5, -20.5);
                pk.data = 0;
                pk.encode();

                const decoded = new LevelEventPacket();
                decoded.setReadBuffer(pk.getBuffer());
                decoded.decode();

                expect(decoded.position!.getX()).toBe(10.5);
                expect(decoded.position!.getY()).toBe(64.5);
                expect(decoded.position!.getZ()).toBe(-20.5);
            });

            it('carries a runtime id that does not fit in a signed varint the short way', () => {
                // Runtime ids are FNV-1a hashes, so roughly half of them are negative. The
                // client resolves the broken block's material from this number, and a
                // mangled one leaves it playing stone.
                const pk = new LevelEventPacket();
                pk.eventId = LevelEvent.PARTICLES_DESTROY_BLOCK_NO_SOUND;
                pk.position = new Vector3(0, 0, 0);
                pk.data = -1867554038;
                pk.encode();

                const decoded = new LevelEventPacket();
                decoded.setReadBuffer(pk.getBuffer());
                decoded.decode();

                expect(decoded.data).toBe(-1867554038);
            });
        });
    });
});
