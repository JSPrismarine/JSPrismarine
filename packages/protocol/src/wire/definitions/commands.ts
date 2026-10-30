/**
 * The command packets: a slash command on its way to the server, and its output coming back.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { commandOriginData } from '../structureTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/**
 * The `CommandRequestPacket` field list.
 *
 * `Version` refers to the `CurrentCmdVersion` enum, which the schema gives no `Enum-as-Value`
 * option, so the member name travels rather than its number.
 */
export const commandRequestPacket = definePacket('CommandRequestPacket', {
    /** `Command`: what was typed, with its leading slash still on. */
    commandName: t.string,
    /** `Origin`: who or what ran it. A client's own commands carry the `Player` origin. */
    commandOriginData,
    /** `IsInternal`: whether the client raised it itself rather than the player typing it. */
    internal: t.bool,
    /** `Version`: a `CurrentCmdVersion` member name. */
    version: t.string
});

/** Sends a command string with its origin, internal flag, and command protocol version. */
export type CommandRequestPayload = PayloadOf<typeof commandRequestPacket>;

/**
 * How the client should treat the output, as `CommandOutputType` orders its members.
 *
 * The wire carries the member name as a string, not the number: the 1.26.51 docs give the
 * enum one wire format, "serialized as string", and its schema no `Enum-as-Value` option.
 */
export enum CommandOutputType {
    None = 0,
    LastOutput = 1,
    Silent = 2,
    AllOutput = 3,
    DataSet = 4
}

/** The name to write for each output type, in the lower case form real senders use. */
const OUTPUT_TYPE_NAMES: Readonly<Record<CommandOutputType, string>> = {
    [CommandOutputType.None]: 'none',
    [CommandOutputType.LastOutput]: 'lastoutput',
    [CommandOutputType.Silent]: 'silent',
    [CommandOutputType.AllOutput]: 'alloutput',
    [CommandOutputType.DataSet]: 'dataset'
};

/** The output type each name stands for, keyed in lower case so the casing does not matter. */
const OUTPUT_TYPES_BY_NAME = new Map(
    Object.entries(OUTPUT_TYPE_NAMES).map(([type, name]) => [name, Number(type)] as const)
);

/**
 * `Output Type`: the enum's member name as a string, not its number.
 *
 * A name this server does not know reads as `None`, which is what the hand-written decoder
 * did: an unknown output type is not worth dropping a connection over.
 */
export const commandOutputType: WireType<CommandOutputType> = t.custom(
    'CommandOutputType',
    (stream, value) => t.string.write(stream, OUTPUT_TYPE_NAMES[value]),
    (stream) => OUTPUT_TYPES_BY_NAME.get(t.string.read(stream).toLowerCase()) ?? CommandOutputType.None
);

/** One line of command output, Mojang's `CommandOutputMessage`. */
export interface CommandOutputMessage {
    /**
     * The message itself, either plain text or the id of a translation such as
     * `commands.tp.success.coordinates`.
     */
    messageId: string;

    /** True when the command succeeded. The client colors a failed message red. */
    successful: boolean;

    /** The values filled into the translation's placeholders. */
    parameters: string[];
}

const parameterList = t.list(t.string);

/** `CommandOutputMessage`: the message id, whether it succeeded, and its placeholder values. */
export const commandOutputMessage: WireType<CommandOutputMessage> = t.custom(
    'CommandOutputMessage',
    (stream, value) => {
        t.string.write(stream, value.messageId);
        t.bool.write(stream, value.successful);
        parameterList.write(stream, value.parameters);
    },
    (stream) => ({
        messageId: t.string.read(stream),
        successful: t.bool.read(stream),
        parameters: parameterList.read(stream)
    })
);

/**
 * The `CommandOutputPacket` field list.
 *
 * A command may come from a websocket server or a command block rather than from the player,
 * so the reply repeats the `CommandOriginData` of the request instead of assuming the chat
 * window.
 */
export const commandOutputPacket = definePacket('CommandOutputPacket', {
    /** `Origin Data`: the origin of the request this answers. */
    originData: commandOriginData,
    /** `Output Type`: how the client should treat the messages. */
    outputType: commandOutputType,
    /** `Success Count`: a function may run one command many times. */
    successCount: t.lu32,
    /** `Output Messages`: the lines to show, in order. */
    outputMessages: t.list(commandOutputMessage),
    /** `Data Set`: absent on all but a `DataSet` output. */
    dataSet: t.optional(t.string)
});

/** Returns command output messages, success count, origin, and optional structured data. */
export type CommandOutputPayload = PayloadOf<typeof commandOutputPacket>;
