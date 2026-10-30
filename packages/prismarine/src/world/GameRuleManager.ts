import type BinaryStream from '@jsprismarine/binaryutils';

import type Server from '../Server';
import type { GameRule } from '@jsprismarine/protocol/wire/structures/GameRule';
import { GameRuleValueType, writeGameRule } from '@jsprismarine/protocol/wire/structures/GameRule';

/**
 * The rules every world registers, spelled the way the client spells them.
 *
 * The client matches a rule by exact string, so these are the camelCase names a Bedrock
 * Dedicated Server 1.26.51 sends in `StartGamePacket` (`doDayLightCycle` with a capital L,
 * `pvp` all lowercase). They used to be all lowercase, and a client given `showcoordinates`
 * had no rule by that name to turn on.
 *
 * Lookups through {@link GameRuleManager} ignore case, so `DoDayLightCycle`,
 * `dodaylightcycle` and the constant here all name the same rule.
 */
export const GameRules = {
    CommandBlockOutput: 'commandBlockOutput',
    DoDayLightCycle: 'doDayLightCycle',
    DoEntityDrops: 'doEntityDrops',
    DoFireTick: 'doFireTick',
    DoMobLoot: 'doMobLoot',
    DoMobSpawning: 'doMobSpawning',
    DoTileDrops: 'doTileDrops',
    DoWeatherCycle: 'doWeatherCycle',
    DrowningDamage: 'drowningDamage',
    FallDamage: 'fallDamage',
    FireDamage: 'fireDamage',
    KeepInventory: 'keepInventory',
    MobGriefing: 'mobGriefing',
    NaturalRegeneration: 'naturalRegeneration',
    PVP: 'pvp',
    ShowCoordinates: 'showCoordinates',
    RandomTickSpeed: 'randomTickSpeed',
    TNTExplodes: 'tntExplodes',
    sendCommandFeedback: 'sendCommandFeedback'
} as const;

/** What a rule holds: its value, and whether a player may change it from the settings screen. */
export type GameRuleEntry = [value: boolean | number, editable: boolean];

/**
 * Called after {@link GameRuleManager.setGameRule} stores a change, with the name spelled as
 * the wire wants it. Not called for the defaults a manager starts with.
 */
export type GameRuleChangeListener = (name: string, value: boolean | number, editable: boolean) => void;

/** The values every world starts with, in the order BDS lists them. */
const DEFAULTS: ReadonlyArray<readonly [name: string, value: boolean | number]> = [
    [GameRules.CommandBlockOutput, true],
    [GameRules.DoDayLightCycle, true],
    [GameRules.DoEntityDrops, true],
    [GameRules.DoFireTick, true],
    [GameRules.DoMobLoot, true],
    [GameRules.DoMobSpawning, true],
    [GameRules.DoTileDrops, true],
    [GameRules.DoWeatherCycle, true],
    [GameRules.DrowningDamage, true],
    [GameRules.FallDamage, true],
    [GameRules.FireDamage, true],
    [GameRules.KeepInventory, false],
    [GameRules.MobGriefing, true],
    [GameRules.NaturalRegeneration, true],
    [GameRules.PVP, true],
    [GameRules.ShowCoordinates, false],
    [GameRules.RandomTickSpeed, 3],
    [GameRules.TNTExplodes, true],
    [GameRules.sendCommandFeedback, true]
];

/**
 * Shapes one stored rule as the protocol's `GameRule`.
 *
 * A boolean travels as the boolean alternative, a whole number as a signed int32 and
 * anything else as a float. The integer used to go out through `writeUnsignedIntLE`, which
 * threw on a negative value; the docs type it `int32`.
 * @param name - The rule's name, spelled as the wire wants it.
 * @param value - The rule's value.
 * @param editable - Whether a player may change it from the settings screen.
 */
export const toNetworkGameRule = (name: string, value: boolean | number, editable: boolean): GameRule => {
    if (typeof value === 'boolean') {
        return { ruleName: name, ruleCanBeModified: editable, ruleValue: { type: GameRuleValueType.Boolean, value } };
    }

    if (Number.isInteger(value)) {
        return { ruleName: name, ruleCanBeModified: editable, ruleValue: { type: GameRuleValueType.Integer, value } };
    }

    return { ruleName: name, ruleCanBeModified: editable, ruleValue: { type: GameRuleValueType.Float, value } };
};

/**
 * The game rules of one world.
 *
 * Rules are stored under the name the wire uses and found by any spelling of it. A rule set
 * here for the first time keeps the spelling it arrived with, so a level file saved by an
 * older server, which wrote lowercase names, loads back onto the camelCase defaults.
 */
export default class GameRuleManager {
    private readonly server: Server;
    private readonly rules: Map<string, GameRuleEntry> = new Map();

    /** Lowercase name to the spelling the wire uses, for every rule known here. */
    private readonly names: Map<string, string> = new Map();
    private readonly onChange: GameRuleChangeListener | undefined;

    /**
     * @param server - Owning server, for its logger.
     * @param onChange - Told about every change made after construction; the world uses it to
     * send `GameRulesChangedPacket` to its players.
     */
    public constructor(server: Server, onChange?: GameRuleChangeListener) {
        this.server = server;
        this.onChange = onChange;

        for (const [name, value] of DEFAULTS) this.store(name, value, true);
    }

    /**
     * Sets a game rule and tells the change listener.
     * @param name - The rule's name, in any casing.
     * @param value - The value, a boolean or a number.
     * @param editable - Whether a player may change it from the settings screen.
     */
    public setGameRule(name: string, value: boolean | number, editable: boolean): void {
        const key = this.store(name, value, editable);
        this.onChange?.(key, value, editable);
    }

    /**
     * Returns a rule's value and editability.
     * @param name - The rule's name, in any casing.
     * @returns The entry, or null for a rule nobody registered. An unknown name is also
     * logged as an error.
     */
    public getGameRule(name: string): GameRuleEntry | null {
        const found = this.findGameRule(name);
        if (found === undefined) {
            this.server.getLogger().error(`Unknown GameRule with name ${name}`);
            return null;
        }

        return found;
    }

    /**
     * Returns a rule's value and editability without logging a miss.
     *
     * {@link GameRuleManager.getGameRule} treats an unknown name as a mistake, because a caller
     * that spells a rule out has one in mind. A caller that is trying several spellings of the
     * same rule, as the content world adapter does, would fill the log with the ones that did
     * not match.
     *
     * @param name - The rule's name, in any casing.
     * @returns The entry, or undefined for a rule nobody registered.
     */
    public findGameRule(name: string): GameRuleEntry | undefined {
        const key = this.names.get(name.toLowerCase());
        return key === undefined ? undefined : this.rules.get(key);
    }

    /** Every rule, keyed by the name the wire uses. */
    public getGameRules(): Map<string, GameRuleEntry> {
        return this.rules;
    }

    /**
     * Writes the rules as `GameRulesChangedPacketData`: a varuint32 count, then each rule as
     * {@link writeGameRule} lays it out. `StartGamePacket` carries this as its Rule Data.
     * @param stream - The stream to append to.
     */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.rules.size);
        for (const [name, [value, editable]] of this.rules) {
            writeGameRule(stream, toNetworkGameRule(name, value, editable));
        }
    }

    /**
     * Stores a rule under the spelling already known for it, or under its own when it is new.
     * @returns The name the rule is stored under.
     */
    private store(name: string, value: boolean | number, editable: boolean): string {
        const lower = name.toLowerCase();
        const key = this.names.get(lower) ?? name;
        this.names.set(lower, key);
        this.rules.set(key, [value, editable]);
        return key;
    }
}
