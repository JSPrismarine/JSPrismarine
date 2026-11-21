import BinaryStream from '@jsprismarine/binaryutils';
import { gameRulesChangedPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import type { GameRule } from '@jsprismarine/protocol/bedrock/wire/structures/GameRule';
import GameRulesChangedPacket from './GameRulesChangedPacket';
import { GameRuleValueType } from '@jsprismarine/protocol/bedrock/wire/structures/GameRule';
import { capture } from '../../testing/evidence.test.helper';

describe('GameRulesChangedPacket', () => {
    // Header 0x48 and a count of three. Then, per rule, the name after its varuint length,
    // the editable flag, the value's varuint selector, and the value itself: a boolean byte
    // for `showcoordinates`, a little-endian int32 for `randomtickspeed`, and nothing at all
    // for the null variant.
    const encoded = Buffer.concat([
        Buffer.from([0x48, 0x03, 0x0f]),
        Buffer.from('showcoordinates', 'utf8'),
        Buffer.from([0x01, 0x01, 0x01, 0x0f]),
        Buffer.from('randomtickspeed', 'utf8'),
        Buffer.from([0x00, 0x02, 0x03, 0x00, 0x00, 0x00, 0x03]),
        Buffer.from('tnt', 'utf8'),
        Buffer.from([0x01, 0x00])
    ]);

    const rulesList: GameRule[] = [
        {
            ruleName: 'showcoordinates',
            ruleCanBeModified: true,
            ruleValue: { type: GameRuleValueType.Boolean, value: true }
        },
        {
            ruleName: 'randomtickspeed',
            ruleCanBeModified: false,
            ruleValue: { type: GameRuleValueType.Integer, value: 3 }
        },
        { ruleName: 'tnt', ruleCanBeModified: true, ruleValue: { type: GameRuleValueType.Null } }
    ];

    it('decodes all three value alternatives, consuming the whole buffer', () => {
        const packet = new GameRulesChangedPacket(encoded);
        packet.decode();

        expect(packet.rulesList).toEqual(rulesList);
        expect(packet.feof()).toBe(true);
    });

    it('decodes a float value', () => {
        // One rule, "x", editable, with selector 3 and 0.5 as a little-endian float.
        const packet = new GameRulesChangedPacket(
            Buffer.from([0x48, 0x01, 0x01, 0x78, 0x01, 0x03, 0x00, 0x00, 0x00, 0x3f])
        );
        packet.decode();

        expect(packet.rulesList).toEqual([
            { ruleName: 'x', ruleCanBeModified: true, ruleValue: { type: GameRuleValueType.Float, value: 0.5 } }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('rejects a value alternative the protocol does not define', () => {
        const packet = new GameRulesChangedPacket(Buffer.from([0x48, 0x01, 0x01, 0x78, 0x01, 0x04]));

        expect(() => packet.decode()).toThrow(/alternative 4/);
    });

    it('encodes the rules back to the same bytes', () => {
        const packet = new GameRulesChangedPacket();
        packet.rulesList = rulesList;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    for (const protocol of [2193, 2225]) {
        it(`re-encodes the real server capture to the same bytes at protocol ${protocol}`, () => {
            // A raw payload (no header) a real Bedrock Dedicated Server sent, captured into bedrock-data.
            const real = capture(protocol, 0x48);
            const layout = layoutAt(gameRulesChangedPacket, protocol);
            const stream = new BinaryStream(real);
            const payload = layout.decode(stream);
            expect(stream.feof()).toBe(true);
            expect(payload.rulesList.length).toBeGreaterThan(0);

            const out = new BinaryStream();
            layout.encode(out, payload);
            expect(out.getBuffer()).toEqual(real);
        });
    }
});
