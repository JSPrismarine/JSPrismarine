/**
 * `SettingsCommandPacket`: Requests a setting change through commands. The client sends it when the
 * player changes a world setting such as the day and night cycle or weather from the world settings
 * menu.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/settings-command-packet/}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `SettingsCommandPacket` field list. */
export const settingsCommandPacket = definePacket('SettingsCommandPacket', {
    /** Full command line the server should run, including its leading slash. */
    command: t.string,
    /** Whether the client asks the server to suppress command output. */
    suppressOutput: t.bool
});

/** Requests a setting change through commands. */
export type SettingsCommandPayload = PayloadOf<typeof settingsCommandPacket>;
