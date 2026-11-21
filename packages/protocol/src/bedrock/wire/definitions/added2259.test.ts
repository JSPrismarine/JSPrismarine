import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../../NetworkBinaryStream';
import ClientboundAttributeLayerSyncPacket, {
    AttributeLayerSyncDataType
} from '../../packet/ClientboundAttributeLayerSyncPacket';
import { AttributeDataType, StringAttributeOperation } from '../../structure/EnvironmentAttributeData';
import EnvironmentAttributeData2225, { AttributePayloadType } from '../../structure/EnvironmentAttributeData2225';
import { emptyItemStackDescriptor } from '../structures/ItemStackDescriptor';
import { layoutAt } from '../../../wire/WireLayout';
import {
    chatPacket,
    clientboundMusicPlaybackFailurePacket,
    clientboundOnlineMusicPlaybackResponsePacket,
    MusicPlaybackState,
    playerToggleArmorVisibilityRequestPacket,
    serverboundRequestOnlineMusicPlaybackPacket,
    VirtualContainerCloseCause,
    VirtualContainerCloseKind,
    virtualContainerClosePacket,
    virtualContainerOpenPacket
} from './added2259';
import { clientboundDataStorePacket, DataStoreEntryType } from './clientboundDataStore';
import { serverboundDataStorePacket } from './serverboundDataStore';
import { DataStoreValueType } from '../../structure/DataStoreUpdate';

import type { PacketDefinition, PayloadOf } from '../../../wire/define';
import type { ClientboundDataStore } from './clientboundDataStore';
import type { ServerboundDataStore } from './serverboundDataStore';

/**
 * The packets protocol 2259 added, and the two structures it reshaped. None appears in the
 * BDS 1.26.70.24 join capture, so each is held to what it writes reading back whole, and to the
 * byte the v1.26.70-preview.24 schema puts first.
 */
const PROTOCOL_2259 = 2259;

const encode = <D extends PacketDefinition>(definition: D, payload: PayloadOf<D>, protocol = PROTOCOL_2259): Buffer => {
    const stream = new BinaryStream();
    layoutAt(definition, protocol).encode(stream, payload);
    return stream.getWriteIndex() === 0 ? Buffer.alloc(0) : stream.getWriteBuffer();
};

const roundTrip = <D extends PacketDefinition>(definition: D, payload: PayloadOf<D>): PayloadOf<D> => {
    const read = new BinaryStream(encode(definition, payload));
    const decoded = layoutAt(definition, PROTOCOL_2259).decode(read);
    expect(read.feof(), `${definition.name} left bytes unread`).toBe(true);
    return decoded;
};

const SIGNED = {
    keyId: 'k',
    senderId: 's',
    messageId: 'm',
    scanText: 'hi',
    redactedText: 'hi',
    authorName: 'Steve',
    signature: 'sig'
};

describe('the packets protocol 2259 added', () => {
    it('round-trips a chat message with and without its room and formatting', () => {
        const full = {
            signedChat: SIGNED,
            roomId: 'lobby',
            formatting: { namePrefix: '[', namePostfix: ']', messagePrefix: null, messagePostfix: null }
        };
        const bare = { signedChat: SIGNED, roomId: null, formatting: null };

        expect(roundTrip(chatPacket, full)).toEqual(full);
        expect(roundTrip(chatPacket, bare)).toEqual(bare);
        // Two presence bytes, both zero, after the seven signed strings.
        expect(encode(chatPacket, bare).subarray(-2)).toEqual(Buffer.from([0, 0]));
    });

    it('round-trips an online music request and its response, request id first as a uint32', () => {
        const request = { requestId: 0x01020304, soundEventName: 'record.flurry' };
        expect(roundTrip(serverboundRequestOnlineMusicPlaybackPacket, request)).toEqual(request);
        expect(encode(serverboundRequestOnlineMusicPlaybackPacket, request).subarray(0, 4)).toEqual(
            Buffer.from([0x04, 0x03, 0x02, 0x01])
        );

        const response = {
            requestId: 7,
            state: MusicPlaybackState.Pending,
            sharedMetadata: { compactJwt: 'a.b.c' },
            playbackContent: { compactJwt: 'd.e.f' }
        };
        expect(roundTrip(clientboundOnlineMusicPlaybackResponsePacket, response)).toEqual(response);
        // The state travels as its member name, a varint length then the bytes, after the id.
        expect(encode(clientboundOnlineMusicPlaybackResponsePacket, response).subarray(4, 12)).toEqual(
            Buffer.from([7, ...Buffer.from('Pending')])
        );
    });

    it('refuses a music playback state the schema does not list', () => {
        const bytes = Buffer.from([1, 4, ...Buffer.from('Lost'), 0]);
        expect(() =>
            layoutAt(clientboundMusicPlaybackFailurePacket, PROTOCOL_2259).decode(new BinaryStream(bytes))
        ).toThrow('Unknown MusicPlaybackState "Lost"');
    });

    it('round-trips the armor visibility request as one byte', () => {
        expect(encode(playerToggleArmorVisibilityRequestPacket, { hideArmor: true })).toEqual(Buffer.from([1]));
        expect(roundTrip(playerToggleArmorVisibilityRequestPacket, { hideArmor: false })).toEqual({ hideArmor: false });
    });

    it('round-trips the music playback failures, one entry per disc', () => {
        const failures = {
            failures: [
                { state: MusicPlaybackState.NotFound, description: 'Flurry' },
                { state: MusicPlaybackState.Local, description: '' }
            ]
        };
        expect(roundTrip(clientboundMusicPlaybackFailurePacket, failures)).toEqual(failures);
        // A varint count, then each entry's state name before its description.
        expect(encode(clientboundMusicPlaybackFailurePacket, failures).subarray(0, 10)).toEqual(
            Buffer.from([2, 8, ...Buffer.from('NotFound')])
        );
    });

    it('round-trips a virtual container open and its close handshake', () => {
        const open = {
            containerId: 9,
            sessionId: 300n,
            title: 'Chest',
            slots: [emptyItemStackDescriptor(), emptyItemStackDescriptor()]
        };
        expect(roundTrip(virtualContainerOpenPacket, open)).toEqual(open);

        const close = {
            sessionId: 300n,
            kind: VirtualContainerCloseKind.Confirmed,
            cause: VirtualContainerCloseCause.UserClosed
        };
        // Session id 300 as a varuint64 is two bytes, then kind and cause.
        expect(encode(virtualContainerClosePacket, close)).toEqual(Buffer.from([0xac, 0x02, 2, 1]));
        expect(roundTrip(virtualContainerClosePacket, close)).toEqual(close);
    });
});

describe('the structures protocol 2259 reshaped', () => {
    it('keys data store entries by variable name from 2259', () => {
        const payload: ClientboundDataStore = {
            updates: [],
            variableUpdates: [
                {
                    type: DataStoreEntryType.UPDATE,
                    update: {
                        variableName: 'hud.score',
                        data: { type: DataStoreValueType.DOUBLE, value: 2.5 },
                        updateCount: 3
                    }
                },
                {
                    type: DataStoreEntryType.CHANGE,
                    change: {
                        variableName: 'hud.title',
                        updateCount: 1,
                        value: { type: DataStoreValueType.STRING, value: 'Hello' }
                    }
                },
                { type: DataStoreEntryType.REMOVAL, removal: { variableName: 'hud.old' } }
            ]
        };

        expect(roundTrip(clientboundDataStorePacket, payload)).toEqual(payload);
        // The 2225 layout writes the other key, and an empty one is a single zero count.
        expect(encode(clientboundDataStorePacket, payload, 2225)).toEqual(Buffer.from([0]));

        const update: ServerboundDataStore = {
            update: null,
            variableUpdate: {
                variableName: 'x',
                data: { type: DataStoreValueType.BOOLEAN, value: true },
                updateCount: 0
            }
        };
        expect(roundTrip(serverboundDataStorePacket, update)).toEqual(update);
    });

    it('writes a string attribute at 2259 and refuses one to an older session', () => {
        const data = {
            type: AttributeLayerSyncDataType.UpdateEnvironmentAttributes,
            attributeLayerName: 'weather',
            attributeLayerDimension: 0,
            attributes: [
                new EnvironmentAttributeData2225('sky_texture', {
                    type: AttributePayloadType.Constant,
                    attribute: {
                        type: AttributeDataType.String,
                        value: 'textures/sky',
                        operation: StringAttributeOperation.OVERRIDE
                    }
                })
            ]
        } as const;

        const at = (protocol: number): ClientboundAttributeLayerSyncPacket => {
            const packet = new ClientboundAttributeLayerSyncPacket({
                data: { ...data, attributes: [...data.attributes] }
            });
            packet.codecProtocol = protocol;
            return packet;
        };

        const bytes = at(PROTOCOL_2259).serialize(new NetworkBinaryStream());
        const reader = new ClientboundAttributeLayerSyncPacket();
        reader.codecProtocol = PROTOCOL_2259;
        const read = reader.deserialize(new NetworkBinaryStream(bytes));
        expect(
            read.data.type === AttributeLayerSyncDataType.UpdateEnvironmentAttributes && read.data.attributes[0]
        ).toEqual(data.attributes[0]);

        expect(() => at(2225).serialize(new NetworkBinaryStream())).toThrow('A string attribute needs protocol 2259');
    });
});
