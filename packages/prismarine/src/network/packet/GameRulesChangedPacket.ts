import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

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
    /** Rule Name, lowercase, as in `showcoordinates`. */
    ruleName: string;
    /** Rule Can Be Modified, whether the player may change it from the settings screen. */
    ruleCanBeModified: boolean;
    /** Rule Value, one of the four `oneOf` alternatives. */
    ruleValue: GameRuleValue;
}

/**
 * Reads one `GameRule`'s value alternative.
 * @param stream - The packet being decoded.
 * @returns The value the selector chose.
 * @throws When the selector names no alternative the protocol defines.
 */
const readGameRuleValue = (stream: DataPacket): GameRuleValue => {
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
 * Tells a client that game rules changed.
 *
 * **Bound To:** Client
 *
 * Only the rules that changed need to go out, and only the ones the client acts on matter:
 * rules the server resolves alone, such as `keepinventory`, change nothing client side.
 *
 * Protocol 2193 layout (docs id 72), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Rule Data | GameRulesChangedPacketData | A varuint32 count, then one {@link GameRule} each |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/game-rules-changed-packet/
 */
export default class GameRulesChangedPacket extends DataPacket {
    public static NetID = Identifiers.GameRulesChangedPacket;

    /** Rules List, the rules whose values changed. */
    public rulesList: GameRule[] = [];

    /** Reads the rules list. */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();

        this.rulesList = [];
        for (let i = 0; i < count; i++) {
            this.rulesList.push({
                ruleName: NetworkUtil.readString(this),
                ruleCanBeModified: this.readBoolean(),
                ruleValue: readGameRuleValue(this)
            });
        }
    }

    /** Writes the rules list. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.rulesList.length);
        for (const rule of this.rulesList) {
            NetworkUtil.writeString(this, rule.ruleName);
            this.writeBoolean(rule.ruleCanBeModified);

            const { ruleValue } = rule;
            this.writeUnsignedVarInt(ruleValue.type);
            switch (ruleValue.type) {
                case GameRuleValueType.Boolean:
                    this.writeBoolean(ruleValue.value);
                    break;
                case GameRuleValueType.Integer:
                    this.writeIntLE(ruleValue.value);
                    break;
                case GameRuleValueType.Float:
                    this.writeFloatLE(ruleValue.value);
                    break;
                default:
                    break; // Null carries no value.
            }
        }
    }
}
