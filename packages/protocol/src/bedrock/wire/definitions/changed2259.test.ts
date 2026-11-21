import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import UUID from '../structures/UUID';
import { layoutAt } from '../../../wire/WireLayout';
import { setPassengerOfBlockPacket } from './added2225';
import { TextPacketType, textPacket } from './chat';
import { commandBlockUpdatePacket } from './commandBlockUpdate';
import { playSoundPacket } from './levelSoundEvent';
import { transferPacket } from './transfer';
import { networkSettingsPacket, SctpRecoveryProfile } from './worldStatus';

import type { PayloadOf, PacketDefinition } from '../../../wire/define';

/**
 * The layouts protocol 2259 (Minecraft Preview 1.26.70.24) changed, read off its
 * v1.26.70-preview.24 `metadata.zip` and Mojang's changelog, which agree. Each is checked to read
 * back what it wrote at 2259 and to be the 2225 bytes plus exactly what 2259 added, so a 2259
 * reader cannot mistake 2225 bytes for its own.
 */
const encode = <D extends PacketDefinition>(definition: D, protocol: number, payload: PayloadOf<D>): Buffer => {
    const stream = new BinaryStream();
    layoutAt(definition, protocol).encode(stream, payload);
    return stream.getWriteIndex() === 0 ? Buffer.alloc(0) : stream.getWriteBuffer();
};

const decode = <D extends PacketDefinition>(definition: D, protocol: number, bytes: Buffer): PayloadOf<D> => {
    const stream = new BinaryStream(bytes);
    const payload = layoutAt(definition, protocol).decode(stream);
    expect(stream.feof(), `${definition.name} at ${protocol} left bytes unread`).toBe(true);
    return payload;
};

describe('the layouts protocol 2259 changed', () => {
    it('ends NetworkSettings with the SCTP recovery profile byte', () => {
        const settings = {
            compressionThreshold: 1,
            compressionAlgorithm: 0,
            clientThrottlingEnabled: false,
            clientThrottleThreshold: 0,
            clientThrottleScalar: 0,
            sctpRecoveryProfile: SctpRecoveryProfile.Balanced
        };
        const at2225 = encode(networkSettingsPacket, 2225, settings);
        const at2259 = encode(networkSettingsPacket, 2259, settings);

        expect(at2259).toEqual(Buffer.concat([at2225, Buffer.from([SctpRecoveryProfile.Balanced])]));
        expect(decode(networkSettingsPacket, 2259, at2259)).toEqual(settings);
        // A client rejects a NetworkSettings without the byte; a 2259 reader runs off the end.
        expect(() => layoutAt(networkSettingsPacket, 2259).decode(new BinaryStream(at2225))).toThrow();
    });

    it('ends a translated text body with the queue flag', () => {
        const text = {
            needsTranslation: true,
            body: { type: TextPacketType.Popup, sourceName: '', message: 'a.b', parameters: ['x'], queue: true },
            xuid: '',
            platformChatId: '',
            filtered: null
        };
        const at2225 = encode(textPacket, 2225, text);
        const at2259 = encode(textPacket, 2259, text);

        expect(at2259.byteLength).toBe(at2225.byteLength + 1);
        expect(decode(textPacket, 2259, at2259)).toEqual(text);
        expect(decode(textPacket, 2225, at2225).body).not.toHaveProperty('queue');
    });

    it('leaves a chat text body alone, as the flag belongs to the translated variants only', () => {
        const chat = {
            needsTranslation: false,
            body: { type: TextPacketType.Chat, sourceName: 'Steve', message: 'hi', parameters: [] },
            xuid: '',
            platformChatId: '',
            filtered: null
        };

        expect(encode(textPacket, 2259, chat)).toEqual(encode(textPacket, 2225, chat));
    });

    it('ends PlaySound with the start delay and the attached actor, each optional', () => {
        const sound = {
            name: 'random.click',
            position: { x: 8, y: 16, z: 24 },
            volume: 1,
            pitch: 1,
            loopCount: -1,
            bypassListenerRangeCheck: false,
            soundHandle: null,
            playbackPositionSeconds: null,
            startDelaySeconds: 0.5,
            attachToActorRuntimeId: 7n
        };
        const at2259 = encode(playSoundPacket, 2259, sound);

        expect(decode(playSoundPacket, 2259, at2259)).toEqual(sound);
        const absent = encode(playSoundPacket, 2259, {
            ...sound,
            startDelaySeconds: null,
            attachToActorRuntimeId: null
        });
        // Two presence bytes, both zero, after the 2225 layout.
        expect(absent).toEqual(Buffer.concat([encode(playSoundPacket, 2225, sound), Buffer.from([0, 0])]));
    });

    it('carries the transfer screen settings behind a presence byte, each member optional', () => {
        const transfer = {
            address: 'play.example.org',
            port: 19132,
            reloadWorld: false,
            gatheringsConfig: null,
            transferSettings: {
                titleText: 'Moving',
                bodyText: null,
                titleVisible: true,
                bodyVisible: null,
                cancelButtonText: null,
                cancelButtonVisible: false,
                cancelButtonDelaySeconds: 3
            }
        };

        expect(decode(transferPacket, 2259, encode(transferPacket, 2259, transfer))).toEqual(transfer);
        expect(encode(transferPacket, 2259, { ...transfer, transferSettings: null })).toEqual(
            Buffer.concat([encode(transferPacket, 2225, transfer), Buffer.from([0])])
        );
    });

    it('ends CommandBlockUpdate with whether the last output is raw text', () => {
        const update = {
            target: { isBlock: false, targetRuntimeId: 3n } as const,
            command: 'say hi',
            lastOutput: 'hi',
            name: '',
            filteredName: '',
            trackOutput: true,
            tickDelay: 0,
            executeOnFirstTick: false,
            lastOutputIsRawMessage: true
        };
        const at2259 = encode(commandBlockUpdatePacket, 2259, update);

        expect(at2259).toEqual(Buffer.concat([encode(commandBlockUpdatePacket, 2225, update), Buffer.from([1])]));
        expect(decode(commandBlockUpdatePacket, 2259, at2259)).toEqual(update);
    });

    it('appends the block type and pack to a ridden block, and keeps "not riding" one byte', () => {
        const riding = {
            passenger: -5n,
            passengerOfBlockData: {
                blockPosition: new Vector3(1, 64, -2),
                offset: new Vector3(0, 0.5, 0),
                rotation: 90,
                rotationLimit: 45,
                emoteType: 1,
                blockType: 42n,
                packUuid: UUID.fromString('0f1e2d3c-4b5a-4968-8776-655443322110')
            }
        };
        const at2225 = encode(setPassengerOfBlockPacket, 2225, riding);
        const at2259 = encode(setPassengerOfBlockPacket, 2259, riding);

        // BlockType is a little-endian uint64, PackUUID two more.
        expect(at2259.byteLength).toBe(at2225.byteLength + 8 + 16);
        const read = decode(setPassengerOfBlockPacket, 2259, at2259);
        expect(read.passengerOfBlockData?.blockType).toBe(42n);
        expect(read.passengerOfBlockData?.packUuid?.toString()).toBe(riding.passengerOfBlockData.packUuid.toString());

        const notRiding = { passenger: -5n, passengerOfBlockData: null };
        expect(encode(setPassengerOfBlockPacket, 2259, notRiding)).toEqual(
            encode(setPassengerOfBlockPacket, 2225, notRiding)
        );
    });
});
