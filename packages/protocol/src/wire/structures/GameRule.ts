import type BinaryStream from '@jsprismarine/binaryutils';

import { NetworkUtil } from '../networkUtil';

/**
 * The alternatives of the `Rule Value` `oneOf`, as its varuint32 selector numbers them.
 */
export const GameRuleValueType = {
    Null: 0,
    Boolean: 1,
    Integer: 2,
    Float: 3
} as const;

/** One game rule's value, tagged with the alternative it travels as. */
export type GameRuleValue =
    | { type: typeof GameRuleValueType.Null }
    | { type: typeof GameRuleValueType.Boolean; value: boolean }
    | { type: typeof GameRuleValueType.Integer; value: number }
    | { type: typeof GameRuleValueType.Float; value: number };

/**
 * One entry of a `GameRulesChangedPacketData` rules list.
 *
 * The same structure travels inside `LevelSettings` in `StartGamePacket`, where
 * `GameRuleManager.networkSerialize` writes it.
 */
export interface GameRule {
    /**
     * Rule Name, spelled as the client spells it: camelCase, as in `showCoordinates` or
     * `doDayLightCycle`. A Bedrock Dedicated Server 1.26.51 sends these names, and the client
     * matches them by exact string.
     */
    ruleName: string;
    /** Rule Can Be Modified, whether the player may change it from the settings screen. */
    ruleCanBeModified: boolean;
    /** Rule Value, one of the four `oneOf` alternatives. */
    ruleValue: GameRuleValue;
}

/**
 * Reads one `GameRule`'s value alternative.
 * @param stream - The stream positioned at the value's selector.
 * @returns The value the selector chose.
 * @throws When the selector names no alternative the protocol defines.
 */
const readGameRuleValue = (stream: BinaryStream): GameRuleValue => {
    const selector = stream.readUnsignedVarInt();
    switch (selector) {
        case GameRuleValueType.Null:
            return { type: GameRuleValueType.Null };
        case GameRuleValueType.Boolean:
            return { type: GameRuleValueType.Boolean, value: stream.readBoolean() };
        case GameRuleValueType.Integer:
            return { type: GameRuleValueType.Integer, value: stream.readIntLE() };
        case GameRuleValueType.Float:
            return { type: GameRuleValueType.Float, value: stream.readFloatLE() };
        default:
            throw new Error(`Unknown game rule value alternative ${selector}`);
    }
};

/**
 * Reads one `GameRule`: Rule Name, Rule Can Be Modified, then the Rule Value.
 * @param stream - The stream positioned at the rule's name.
 */
export const readGameRule = (stream: BinaryStream): GameRule => ({
    ruleName: NetworkUtil.readString(stream),
    ruleCanBeModified: stream.readBoolean(),
    ruleValue: readGameRuleValue(stream)
});

/**
 * Writes one `GameRule` as the docs lay it out: Rule Name as a string, Rule Can Be Modified
 * as a boolean, the value's varuint32 selector, then the value itself. A boolean is one byte,
 * an integer is a signed int32 LE (four fixed bytes, not a varint; a BDS 1.26.51 sends
 * `maxCommandChainLength` as `02 ff ff 00 00`), a float is a float LE, and the null
 * alternative has no value bytes.
 * @param stream - The stream to append to.
 * @param rule - The rule to write.
 */
export const writeGameRule = (stream: BinaryStream, rule: GameRule): void => {
    NetworkUtil.writeString(stream, rule.ruleName);
    stream.writeBoolean(rule.ruleCanBeModified);

    const { ruleValue } = rule;
    stream.writeUnsignedVarInt(ruleValue.type);
    switch (ruleValue.type) {
        case GameRuleValueType.Boolean:
            stream.writeBoolean(ruleValue.value);
            break;
        case GameRuleValueType.Integer:
            stream.writeIntLE(ruleValue.value);
            break;
        case GameRuleValueType.Float:
            stream.writeFloatLE(ruleValue.value);
            break;
        default:
            break; // Null carries no value.
    }
};
