import { describe, expect, it } from 'vitest';
import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '../../wire/WireLayout';
import { legacyTelemetryEventPacket } from '../wire/definitions/legacyTelemetryEvent';
import LegacyTelemetryEventPacket, {
    LegacyTelemetryEventDataOrdinal,
    LegacyTelemetryEventType
} from './LegacyTelemetryEventPacket';
import type { LegacyTelemetryEventData } from './LegacyTelemetryEventPacket';

describe('LegacyTelemetryEventPacket', () => {
    // Header 0x41. Actor 5 zigzags to 10, the event type MobKilled (4) to 8, Use Player ID
    // is clear, and the data ordinal is 4. The payload is the unique ids 7 and 9, the child
    // actor type 1 and damage source 2 zigzagged, the trade tier -1 zigzagged to 1, and an
    // empty trader name.
    const mobKilled = Buffer.from([0x41, 0x0a, 0x08, 0x00, 0x04, 0x0e, 0x12, 0x02, 0x04, 0x01, 0x00]);

    // The same header fields with the event type ItemUsed (31, zigzagged to 62) and the data
    // ordinal 20. The payload is fixed width: item 300 as a little-endian int16, then the
    // aux -1, the use method 2 and the count 3 as little-endian int32.
    const itemUsed = Buffer.from([
        0x41, 0x02, 0x3e, 0x01, 0x14, 0x2c, 0x01, 0xff, 0xff, 0xff, 0xff, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00
    ]);

    // Actor 1, the event type SlashCommand (11, zigzagged to 0x16), Use Player ID set, and the
    // data ordinal 8, which is not the event type: the obsolete types before it have no
    // alternative of their own. The payload is success count 1 zigzagged, error count 0,
    // "say", and an empty error list.
    const slashCommand = Buffer.from([0x41, 0x02, 0x16, 0x01, 0x08, 0x02, 0x00, 0x03, 0x73, 0x61, 0x79, 0x00]);

    it('decodes a MobKilled payload, consuming the whole buffer', () => {
        const packet = new LegacyTelemetryEventPacket(mobKilled);
        packet.decode();

        expect(packet.targetActorId).toBe(5n);
        expect(packet.eventType).toBe(LegacyTelemetryEventType.MobKilled);
        expect(packet.usePlayerId).toBe(false);
        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.MobKilled,
            instigatorActorId: 7n,
            targetActorId: 9n,
            instigatorChildActorType: 1,
            damageSource: 2,
            tradeTier: -1,
            traderName: ''
        });
        expect(packet.feof()).toBe(true);
    });

    it('encodes a MobKilled payload back to the same bytes', () => {
        const packet = new LegacyTelemetryEventPacket();
        packet.targetActorId = 5n;
        packet.eventType = LegacyTelemetryEventType.MobKilled;
        packet.eventData = {
            ordinal: LegacyTelemetryEventDataOrdinal.MobKilled,
            instigatorActorId: 7n,
            targetActorId: 9n,
            instigatorChildActorType: 1,
            damageSource: 2,
            tradeTier: -1,
            traderName: ''
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(mobKilled);
    });

    it('decodes an ItemUsed payload, whose fields are fixed width', () => {
        const packet = new LegacyTelemetryEventPacket(itemUsed);
        packet.decode();

        expect(packet.targetActorId).toBe(1n);
        expect(packet.eventType).toBe(LegacyTelemetryEventType.ItemUsed);
        expect(packet.usePlayerId).toBe(true);
        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.ItemUsed,
            itemId: 300,
            itemAux: -1,
            useMethod: 2,
            count: 3
        });
        expect(packet.feof()).toBe(true);
    });

    it('encodes an ItemUsed payload back to the same bytes', () => {
        const packet = new LegacyTelemetryEventPacket();
        packet.targetActorId = 1n;
        packet.eventType = LegacyTelemetryEventType.ItemUsed;
        packet.usePlayerId = true;
        packet.eventData = {
            ordinal: LegacyTelemetryEventDataOrdinal.ItemUsed,
            itemId: 300,
            itemAux: -1,
            useMethod: 2,
            count: 3
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(itemUsed);
    });

    it('decodes a SlashCommand payload, whose ordinal (8) differs from its event type (11)', () => {
        const packet = new LegacyTelemetryEventPacket(slashCommand);
        packet.decode();

        expect(packet.eventType).toBe(LegacyTelemetryEventType.SlashCommand);
        expect(packet.usePlayerId).toBe(true);
        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.SlashCommand,
            successCount: 1,
            errorCount: 0,
            commandName: 'say',
            errorList: ''
        });
        expect(packet.feof()).toBe(true);
    });

    it('encodes a SlashCommand payload back to the same bytes', () => {
        const packet = new LegacyTelemetryEventPacket();
        packet.targetActorId = 1n;
        packet.eventType = LegacyTelemetryEventType.SlashCommand;
        packet.usePlayerId = true;
        packet.eventData = {
            ordinal: LegacyTelemetryEventDataOrdinal.SlashCommand,
            successCount: 1,
            errorCount: 0,
            commandName: 'say',
            errorList: ''
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(slashCommand);
    });

    it('decodes a CauldronUsed payload with int16 fields left fixed width after the varuint color', () => {
        // Event type 5 zigzags to 0x0a and the ordinal is 5. The color 300 is the varuint
        // 0xac 0x02; the contents type -1 and fill level 6 are little-endian int16, because the
        // docs define Compression as covering 32- and 64-bit integers only.
        const packet = new LegacyTelemetryEventPacket(
            Buffer.from([0x41, 0x02, 0x0a, 0x00, 0x05, 0xac, 0x02, 0xff, 0xff, 0x06, 0x00])
        );
        packet.decode();

        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.CauldronUsed,
            contentsColor: 300,
            contentsType: -1,
            fillLevel: 6
        });
        expect(packet.feof()).toBe(true);
    });

    it('decodes an event type that carries the empty alternative', () => {
        // CarefulRestoration is event type 30, which zigzags to 60, and its data ordinal is 21.
        const packet = new LegacyTelemetryEventPacket(Buffer.from([0x41, 0x02, 0x3c, 0x00, 0x15]));
        packet.decode();

        expect(packet.eventType).toBe(LegacyTelemetryEventType.CarefulRestoration);
        expect(packet.eventData).toEqual({ ordinal: LegacyTelemetryEventDataOrdinal.Empty });
        expect(packet.feof()).toBe(true);
    });

    it('rejects a data alternative the protocol does not define', () => {
        const packet = new LegacyTelemetryEventPacket(Buffer.from([0x41, 0x02, 0x3c, 0x00, 0x16]));

        expect(() => packet.decode()).toThrow(/alternative 22/);
    });
});

/** One event per alternative of the Event Data oneOf, with its hand-computed wire bytes. */
const alternatives: ReadonlyArray<{
    name: string;
    eventType: LegacyTelemetryEventType;
    data: LegacyTelemetryEventData;
    hex: string;
}> = [
    {
        name: 'Achievement',
        eventType: LegacyTelemetryEventType.Achievement,
        data: { ordinal: 0, achievementId: 7 },
        hex: '0007'
    },
    {
        name: 'Interaction',
        eventType: LegacyTelemetryEventType.Interaction,
        data: {
            ordinal: 1,
            interactedEntityId: -3n,
            interactionType: 2,
            interactionActorType: 63,
            interactionActorVariant: -1,
            interactionActorColor: 4
        },
        hex: '0105027e0104'
    },
    {
        name: 'PortalCreated',
        eventType: LegacyTelemetryEventType.PortalCreated,
        data: { ordinal: 2, dimensionId: 1 },
        hex: '0202'
    },
    {
        name: 'PortalUsed',
        eventType: LegacyTelemetryEventType.PortalUsed,
        data: { ordinal: 3, sourceDimensionId: 0, targetDimensionId: 2 },
        hex: '030004'
    },
    {
        name: 'MobKilled',
        eventType: LegacyTelemetryEventType.MobKilled,
        data: {
            ordinal: 4,
            instigatorActorId: 7n,
            targetActorId: 9n,
            instigatorChildActorType: 1,
            damageSource: 2,
            tradeTier: -1,
            traderName: 'ab'
        },
        hex: '040e12020401026162'
    },
    {
        name: 'CauldronUsed',
        eventType: LegacyTelemetryEventType.CauldronUsed,
        data: { ordinal: 5, contentsColor: 300, contentsType: -1, fillLevel: 6 },
        hex: '05ac02ffff0600'
    },
    {
        name: 'PlayerDied',
        eventType: LegacyTelemetryEventType.PlayerDied,
        data: { ordinal: 6, instigatorActorId: -1, instigatorMobVariant: 2, damageSource: 3, diedInRaid: true },
        hex: '0601040601'
    },
    {
        name: 'BossKilled',
        eventType: LegacyTelemetryEventType.BossKilled,
        data: { ordinal: 7, bossActorId: 1n, partySize: 4, bossType: 5 },
        hex: '0702080a'
    },
    {
        name: 'SlashCommand',
        eventType: LegacyTelemetryEventType.SlashCommand,
        data: { ordinal: 8, successCount: 1, errorCount: 0, commandName: 'say', errorList: 'x' },
        hex: '080200037361790178'
    },
    {
        name: 'MobBorn',
        eventType: LegacyTelemetryEventType.MobBorn,
        data: { ordinal: 9, bornBabyEntityType: 5, bornBabyEntityVariant: 1, bornBabyColor: 14 },
        hex: '090a020e'
    },
    {
        name: 'POICauldronUsed',
        eventType: LegacyTelemetryEventType.POICauldronUsed,
        data: { ordinal: 10, blockInteractionType: 9, itemId: 300 },
        hex: '0a092c01'
    },
    {
        name: 'ComposterUsed',
        eventType: LegacyTelemetryEventType.ComposterUsed,
        data: { ordinal: 11, blockInteractionType: 19, itemId: -2 },
        hex: '0b13feff'
    },
    { name: 'BellUsed', eventType: LegacyTelemetryEventType.BellUsed, data: { ordinal: 12, itemId: 1 }, hex: '0c0100' },
    {
        name: 'ActorDefinition',
        eventType: LegacyTelemetryEventType.ActorDefinition,
        data: { ordinal: 13, eventName: 'hi' },
        hex: '0d026869'
    },
    {
        name: 'RaidUpdate',
        eventType: LegacyTelemetryEventType.RaidUpdate,
        data: { ordinal: 14, currentWave: 2, totalWaves: 5, success: false },
        hex: '0e040a00'
    },
    {
        name: 'TargetBlockHit',
        eventType: LegacyTelemetryEventType.TargetBlockHit,
        data: { ordinal: 15, redstoneLevel: 15 },
        hex: '0f1e'
    },
    {
        name: 'PiglinBarter',
        eventType: LegacyTelemetryEventType.PiglinBarter,
        data: { ordinal: 16, itemId: 3, wasTargetingBarteringPlayer: true },
        hex: '100601'
    },
    {
        name: 'PlayerWaxedOrUnwaxedCopper',
        eventType: LegacyTelemetryEventType.PlayerWaxedOrUnwaxedCopper,
        data: { ordinal: 17, playerWaxedOrUnwaxedCopperBlockId: 100 },
        hex: '11c801'
    },
    {
        name: 'CodeBuilderRuntimeAction',
        eventType: LegacyTelemetryEventType.CodeBuilderRuntimeAction,
        data: { ordinal: 18, codeBuilderRuntimeAction: 'go' },
        hex: '1202676f'
    },
    {
        name: 'CodeBuilderScoreboard',
        eventType: LegacyTelemetryEventType.CodeBuilderScoreboard,
        data: { ordinal: 19, objectiveName: 'o', score: -2 },
        hex: '13016f03'
    },
    {
        name: 'ItemUsed',
        eventType: LegacyTelemetryEventType.ItemUsed,
        data: { ordinal: 20, itemId: 300, itemAux: -1, useMethod: 2, count: 3 },
        hex: '142c01ffffffff0200000003000000'
    },
    { name: 'Empty', eventType: LegacyTelemetryEventType.HoneyHarvested, data: { ordinal: 21 }, hex: '15' }
];

describe.each([2193, 2225])('the declarative LegacyTelemetryEvent layout at protocol %i', (protocol) => {
    const layout = layoutAt(legacyTelemetryEventPacket, protocol);

    it.each(alternatives)('round-trips the $name alternative as the spec lays it out', ({ eventType, data, hex }) => {
        // Target Actor ID 5 zigzags to 0x0a, Use Player ID is set, and the Event Type zigzags.
        const expected = Buffer.concat([
            Buffer.from([0x0a]),
            Buffer.from([eventType * 2]),
            Buffer.from([0x01]),
            Buffer.from(hex, 'hex')
        ]);
        const payload = { targetActorId: 5n, eventType, usePlayerId: true, eventData: data };

        const stream = new BinaryStream();
        layout.encode(stream, payload);
        expect(stream.getBuffer()).toEqual(expected);
        expect(layout.decode(new BinaryStream(expected))).toEqual(payload);
    });
});

// Captured from the pinned Bedrock Dedicated Server 1.26.60 (protocol 2225), with cheats off, as
// its player ran `/me`, punched a pig to death and was killed by a zombie. BDS gives the player
// the unique id -4294967295 and the pig -4294967287.
const capturedAtBds = [
    {
        name: 'a command the player ran',
        hex: '41fdffffff1f1601080200026d6500',
        eventType: LegacyTelemetryEventType.SlashCommand,
        eventData: {
            ordinal: LegacyTelemetryEventDataOrdinal.SlashCommand,
            successCount: 1,
            errorCount: 0,
            commandName: 'me',
            errorList: ''
        }
    },
    {
        name: 'a pig the player punched to death',
        hex: '41fdffffff1f080104fdffffff1fedffffff1f02040100',
        eventType: LegacyTelemetryEventType.MobKilled,
        eventData: {
            ordinal: LegacyTelemetryEventDataOrdinal.MobKilled,
            instigatorActorId: -4294967295n,
            targetActorId: -4294967287n,
            // ActorType Undefined: no projectile.
            instigatorChildActorType: 1,
            // ActorDamageCause EntityAttack.
            damageSource: 2,
            tradeTier: -1,
            traderName: ''
        }
    },
    {
        name: 'the player killed by a zombie',
        hex: '41fdffffff1f0c0106c0ac18000400',
        eventType: LegacyTelemetryEventType.PlayerDied,
        eventData: {
            ordinal: LegacyTelemetryEventDataOrdinal.PlayerDied,
            // Not an id: ActorType Zombie.
            instigatorActorId: 199456,
            instigatorMobVariant: 0,
            damageSource: 2,
            diedInRaid: false
        }
    }
];

describe('LegacyTelemetryEventPacket as a Bedrock Dedicated Server sends it', () => {
    it.each(capturedAtBds)('decodes and re-encodes $name', ({ hex, eventType, eventData }) => {
        const bytes = Buffer.from(hex, 'hex');
        const decoded = new LegacyTelemetryEventPacket(bytes);
        decoded.decode();
        expect(decoded.targetActorId).toBe(-4294967295n);
        expect(decoded.eventType).toBe(eventType);
        expect(decoded.usePlayerId).toBe(true);
        expect(decoded.eventData).toEqual(eventData);
        expect(decoded.feof()).toBe(true);

        const encoded = new LegacyTelemetryEventPacket();
        encoded.targetActorId = -4294967295n;
        encoded.eventType = eventType;
        encoded.usePlayerId = true;
        encoded.eventData = eventData;
        encoded.encode();
        expect(encoded.getBuffer()).toEqual(bytes);
    });
});
