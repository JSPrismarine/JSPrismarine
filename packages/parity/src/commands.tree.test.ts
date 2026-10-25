import {
    JAVA_ONLY_COMMAND_NAMES,
    SHARED_COMMAND_NAMES,
    bedrockCommand,
    bedrockCommandTable,
    flattenCommandTree,
    registerVanillaCommands
} from '@jsprismarine/commands';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 5's command row: the tree the server publishes against Mojang's own Bedrock command
 * metadata.
 *
 * A Bedrock client parses a command from the `AvailableCommandsPacket`, so a command the
 * server registers under a name Mojang's table does not have reaches the client as something
 * it was not built to parse. The row checks three things against the metadata: every command
 * the server registers is one Mojang publishes or one of the four Java-only commands the
 * datapack runtime needs, every name the project claims the two editions share really is in
 * Mojang's table, and the flattener drops nothing outright.
 *
 * Gap ids: `unpublished:<name>` for a registered command Mojang's table does not carry,
 * `not-shared:<name>` for a name the shared list claims and the table lacks, and
 * `dropped:<command> <path>` for a branch the flattener cannot show the client at all.
 */
const compareCommandTree = (): { gaps: string[]; commands: number; overloads: number; detail: string[] } => {
    const registry = registerVanillaCommands();
    const flattened = flattenCommandTree(registry);
    const javaOnly = new Set<string>(JAVA_ONLY_COMMAND_NAMES);
    const gaps: string[] = [];
    const detail: string[] = [];

    for (const command of flattened.commands) {
        if (javaOnly.has(command.name)) continue;
        if (bedrockCommand(command.name) === undefined) gaps.push(`unpublished:${command.name}`);
    }

    for (const name of SHARED_COMMAND_NAMES) {
        if (bedrockCommand(name) === undefined) gaps.push(`not-shared:${name}`);
    }

    for (const note of flattened.notes) {
        if (note.severity !== 'dropped') continue;
        gaps.push(`dropped:${note.command} ${note.path}`);
        if (detail.length < 20) detail.push(`${note.command} ${note.path}: ${note.message}`);
    }

    const overloads = flattened.commands.reduce((sum, command) => sum + command.overloads.length, 0);
    return { gaps: [...new Set(gaps)], commands: flattened.commands.length, overloads, detail };
};

describeFamily(FAMILIES.commandsTree, [REFERENCES.bedrockCommandMetadata], () => {
    const { gaps, commands, overloads, detail } = compareCommandTree();
    const verdict = checkAllowList(FAMILIES.commandsTree, gaps);

    it('publishes only commands a Bedrock client is built to parse', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it("measures itself against Mojang's whole published command set", () => {
        // docs/research/commands-functions-and-datapack-execution.md section 6 counted 84
        // commands and 279 overloads in Mojang's 1.26.50 metadata.
        expect(bedrockCommandTable.counts.commands).toBe(84);
        expect(bedrockCommandTable.counts.overloads).toBe(279);
        expect(commands).toBeGreaterThan(0);
        expect(overloads).toBeGreaterThan(commands);
    });
});
