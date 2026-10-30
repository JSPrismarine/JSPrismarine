import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { layoutAt } from '../WireLayout';
import {
    AudioContentPlaybackType,
    clientboundMatchmakingStatePacket,
    clientboundPlayAudioContentPacket,
    clientboundStonecutterSetRecipePacket,
    CursorItemDragState,
    MatchmakingState,
    serverboundCursorItemDragPacket,
    serverboundMatchmakingCancelPacket,
    serverboundRegisterAudioContentPacket,
    serverboundStonecutterSetRecipePacket,
    setPassengerOfBlockPacket
} from './added2225';

import type { PacketDefinition } from '../define';

/**
 * No captured login carries these packets, so their layouts cannot be held to real server bytes
 * the way the rest are. What is checked here instead is that each reads back what it wrote,
 * consumes its whole payload, and spells the fields the v1.26.60 schemas declare - including the
 * two the schemas make varints rather than fixed-width, which is the detail a careless reading
 * gets wrong.
 */
const PROTOCOL_2225 = 2225;

const roundTrip = <D extends PacketDefinition>(definition: D, payload: unknown): unknown => {
    const layout = layoutAt(definition, PROTOCOL_2225);
    const stream = new BinaryStream();
    layout.encode(stream, payload as never);

    const read = new BinaryStream(stream.getBuffer());
    const decoded = layout.decode(read);
    expect(read.feof(), `${layout.name} left bytes unread`).toBe(true);
    return decoded;
};

describe('the packets protocol 2225 added', () => {
    it('round-trips the matchmaking state, with and without its optional options', () => {
        const withOptions = {
            state: MatchmakingState.MatchFound,
            destinationName: 'a-destination',
            options: { triggeringPlayerName: 'steve', triggeredByLocalPlayer: true }
        };
        expect(roundTrip(clientboundMatchmakingStatePacket, withOptions)).toEqual(withOptions);

        const without = { state: MatchmakingState.TimedOut, destinationName: '', options: null };
        expect(roundTrip(clientboundMatchmakingStatePacket, without)).toEqual(without);
    });

    it('writes an empty payload for the matchmaking cancel', () => {
        const layout = layoutAt(serverboundMatchmakingCancelPacket, PROTOCOL_2225);
        expect(layout.fields).toHaveLength(0);

        // Encoding writes nothing at all, and decoding an empty payload yields an empty object.
        const stream = new BinaryStream(Buffer.alloc(0));
        layout.encode(stream, {} as never);
        expect(layout.decode(new BinaryStream(Buffer.alloc(0)))).toEqual({});
    });

    it('carries the stonecutter recipe index as a varint, not a fixed-width int32', () => {
        const payload = { containerId: 3, recipeIndex: 1 };
        expect(roundTrip(serverboundStonecutterSetRecipePacket, payload)).toEqual(payload);

        // A ZigZag varint spends two bytes on the whole packet for a small index; a little-endian
        // int32 would spend four on the index alone. The schema marks the field `Compression`.
        const stream = new BinaryStream();
        layoutAt(serverboundStonecutterSetRecipePacket, PROTOCOL_2225).encode(stream, payload);
        expect(stream.getBuffer().byteLength).toBe(2);
    });

    it('round-trips the clientbound stonecutter recipe with its actor id', () => {
        const payload = { playerId: -42n, containerId: 1, recipeIndex: 7 };
        expect(roundTrip(clientboundStonecutterSetRecipePacket, payload)).toEqual(payload);
    });

    it('round-trips a block passenger, seated and unseated', () => {
        const seated = {
            passenger: 99n,
            passengerOfBlockData: {
                blockPosition: new Vector3(1, 2, 3),
                offset: new Vector3(0.5, 0.25, -0.5),
                rotation: 90,
                rotationLimit: 45,
                emoteType: 1
            }
        };
        expect(roundTrip(setPassengerOfBlockPacket, seated)).toEqual(seated);

        const unseated = { passenger: 7n, passengerOfBlockData: null };
        expect(roundTrip(setPassengerOfBlockPacket, unseated)).toEqual(unseated);
    });

    it('round-trips a cursor item drag state', () => {
        const payload = { state: CursorItemDragState.Stop };
        expect(roundTrip(serverboundCursorItemDragPacket, payload)).toEqual(payload);
    });

    it('round-trips audio content with its whole PlaySound payload', () => {
        const payload = {
            sharedMetadata: { compactJwt: 'header.shared.sig' },
            playbackContent: { compactJwt: 'header.playback.sig' },
            playbackType: AudioContentPlaybackType.Music,
            playSound: {
                name: 'note.harp',
                position: { x: 10, y: 64, z: -10 },
                volume: 0.75,
                pitch: 1.5,
                loopCount: 3,
                bypassListenerRangeCheck: true,
                serverSoundHandle: 1234n,
                playbackPositionSeconds: 2.5
            }
        };
        expect(roundTrip(clientboundPlayAudioContentPacket, payload)).toEqual(payload);
    });

    it('leaves the PlaySound trailers off the wire when they are absent', () => {
        const payload = {
            sharedMetadata: { compactJwt: '' },
            playbackContent: { compactJwt: '' },
            playbackType: AudioContentPlaybackType.Sound,
            playSound: {
                name: '',
                position: { x: 0, y: 0, z: 0 },
                volume: 1,
                pitch: 1,
                loopCount: 0,
                bypassListenerRangeCheck: false,
                serverSoundHandle: null,
                playbackPositionSeconds: null
            }
        };
        expect(roundTrip(clientboundPlayAudioContentPacket, payload)).toEqual(payload);
    });

    it('round-trips an audio content registration list', () => {
        const entry = (id: string) => ({
            audioContentId: id,
            sharedMetadata: { compactJwt: `${id}.shared` },
            serverContent: { compactJwt: `${id}.server` },
            playbackContent: { compactJwt: `${id}.playback` }
        });
        const payload = { registrations: [entry('first'), entry('second')] };
        expect(roundTrip(serverboundRegisterAudioContentPacket, payload)).toEqual(payload);

        expect(roundTrip(serverboundRegisterAudioContentPacket, { registrations: [] })).toEqual({
            registrations: []
        });
    });
});
