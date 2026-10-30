/**
 * The command packets: a slash command on its way to the server, and its output coming back.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { commandOriginData } from '../structureTypes';

import type { PayloadOf } from '../define';

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

/** What `CommandRequestPacket` carries. */
export type CommandRequestPayload = PayloadOf<typeof commandRequestPacket>;
