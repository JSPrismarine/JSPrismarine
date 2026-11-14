/**
 * `AvailableCommandsPacket`: the command catalog a client builds its command suggestions from.
 *
 * The payload is eight lists in the order on Mojang's packet page. The first three are shared
 * string tables; the next tables and the commands refer to them by index. The field list holds
 * the wire form, indices and all. The packet class builds those indices from its enums and
 * commands and resolves them back on decode.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/available-commands-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** `Enum Data`: the enum's name, then each value as a `uint32` index into `Enum Values`. */
const enumData = t.record({
    /** `Name`: the table's name, as a parameter's enum refers to it. */
    name: t.string,
    /** `Values`: indices into `Enum Values`, four bytes each at every version. */
    values: t.list(t.lu32)
});

/** `Chained Subcommand Data`: the table's name, then a `{first, second}` varuint pair per keyword. */
const chainedSubcommandData = t.record({
    /** `Name`: the table's name, `ExecuteChainedOption_0` in a real server's capture. */
    name: t.string,
    /** `Values`: each keyword's index in `Chained Subcommand Values` and the `Enum Data` index of its enum. */
    values: t.list(
        t.record({
            /** `SubCommand First Value`: an index into `Chained Subcommand Values`. */
            first: t.varuint32,
            /** `SubCommand Second Value`: the index into `Enum Data` of the enum that holds the keyword. */
            second: t.varuint32
        })
    )
});

/** `Parameter Data`: one parameter of an overload. */
const parameterData = t.record({
    /** `Name`: the parameter's name. */
    name: t.string,
    /** `Parse Symbol`: a type word, or an enum, soft enum or postfix flag with its table index. */
    parseSymbol: t.lu32,
    /** `Is Optional?`: whether the parameter may be left out. */
    isOptional: t.bool,
    /** `Options`: the parameter's option bits. */
    options: t.uint8
});

/** `Overloads`: whether the overload chains, then its parameters. */
const overloadData = t.record({
    /** `isChaining`: whether the overload ends in a chained subcommand. */
    isChaining: t.bool,
    /** `Parameter Data`: the parameters in order. */
    parameters: t.list(parameterData)
});

/** `Commands`: one command with its flags, permission, alias enum, and overloads. */
const commandData = t.record({
    /** `Name`: the command's spelling. */
    name: t.string,
    /** `Description`: the text shown in command suggestions. */
    description: t.string,
    /** `Flags`: the command's protocol flags. */
    flags: t.lu16,
    /** `Permission Level`: the level's name as a lower case string, not its number. */
    permissionLevel: t.string,
    /** `Alias Enum`: an index into `Enum Data`, or -1 when the command has no aliases. */
    aliasEnum: t.li32,
    /** `CommandData Chained Subcommand Indexes`: indices into `Chained Subcommand Data`. */
    chainedSubcommandIndexes: t.list(t.lu32),
    /** `Overloads`: each valid parameter sequence. */
    overloads: t.list(overloadData)
});

/** `Soft Enums`: a name and its option strings, written in full rather than by index. */
const softEnumData = t.record({
    /** `Enum Name`: the soft enum's name. */
    name: t.string,
    /** `Enum Options`: the enum's current values. */
    options: t.list(t.string)
});

/** `Constraints`: restrictions on one value of one hard enum. */
const constraintData = t.record({
    /** `Enum Value Symbol`: an index into `Enum Values`. */
    enumValueSymbol: t.lu32,
    /** `Enum Symbol`: an index into `Enum Data`. */
    enumSymbol: t.lu32,
    /** `Constraint Indices`: the constraint ids, one byte each. */
    constraintIndices: t.list(t.uint8)
});

/** The `AvailableCommandsPacket` field list, with every table reference as a raw index. */
export const availableCommandsPacket = definePacket('AvailableCommandsPacket', {
    /** `Enum Values`: the one string table every hard enum indexes into. */
    enumValues: t.list(t.string),
    /** `Chained Subcommand Values`: the string table every chained subcommand table indexes into. */
    chainedSubcommandValues: t.list(t.string),
    /** `Post Fixes`: the suffixes a `Postfix` parameter points at. */
    postfixes: t.list(t.string),
    /** `Enum Data`: the hard enums, in the order their indices number them. */
    enums: t.list(enumData),
    /** `Chained Subcommand Data`: the chained subcommand tables, `/execute`'s only. */
    chainedSubcommands: t.list(chainedSubcommandData),
    /** `Commands`: every command the client may run. */
    commands: t.list(commandData),
    /** `Soft Enums`: the enums `UpdateSoftEnumPacket` may change later. */
    softEnums: t.list(softEnumData),
    /** `Constraints`: the enum value constraints. */
    constraints: t.list(constraintData)
});

/** Payload carried by `AvailableCommandsPacket`: the eight tables as they travel. */
export type AvailableCommandsPayload = PayloadOf<typeof availableCommandsPacket>;
