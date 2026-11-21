import { readFileSync } from 'node:fs';

import {
    COMMAND_NAME_ENUM,
    JAVA_ONLY_COMMAND_NAMES,
    SHARED_COMMAND_NAMES,
    bedrockCommand,
    bedrockCommandTable,
    buildAvailableCommands,
    flattenCommandTree,
    registerVanillaCommands
} from '@jsprismarine/commands';
import type { EntityTypes } from '@jsprismarine/entities';
import { buildVanillaCommands, summonableEntityTypes } from '@jsprismarine/prismarine/command/vanillaCommands';
import AvailableCommandsPacket from '@jsprismarine/protocol/bedrock/packet/AvailableCommandsPacket';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { bedrockCapture, bedrockCaptureProtocol } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';
import { loadOverlayEntityTypes, loadVanillaEntityTypes } from './vanillaEntities.ts';

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
const compareCommandTree = (): {
    gaps: string[];
    commands: number;
    overloads: number;
    detail: string[];
    cases: ReturnType<typeof parityCase>[];
} => {
    const registry = registerVanillaCommands();
    const flattened = flattenCommandTree(registry);
    const javaOnly = new Set<string>(JAVA_ONLY_COMMAND_NAMES);
    const gaps: string[] = [];
    const detail: string[] = [];
    const cases = flattened.commands.flatMap((command) => {
        const hasOverloads = command.overloads.length > 0;
        return [
            ...(javaOnly.has(command.name)
                ? []
                : [
                      parityCase(
                          `command:${command.name}/client-support`,
                          command.name,
                          'Bedrock command metadata',
                          bedrockCommand(command.name) !== undefined
                      )
                  ]),
            parityCase(
                `command:${command.name}/overloads`,
                `${command.name} overloads`,
                'Published command tree',
                hasOverloads
            )
        ];
    });

    for (const command of flattened.commands) {
        if (command.overloads.length === 0) gaps.push(`no-overloads:${command.name}`);
        if (javaOnly.has(command.name)) continue;
        if (bedrockCommand(command.name) === undefined) gaps.push(`unpublished:${command.name}`);
    }

    for (const name of SHARED_COMMAND_NAMES) {
        if (bedrockCommand(name) === undefined) gaps.push(`not-shared:${name}`);
        cases.push(
            parityCase(`shared-command:${name}`, name, 'Shared command metadata', bedrockCommand(name) !== undefined)
        );
    }

    for (const note of flattened.notes) {
        if (note.severity !== 'dropped') continue;
        gaps.push(`dropped:${note.command} ${note.path}`);
        cases.push(
            parityCase(
                `command-path:${note.command}/${note.path}`,
                `${note.command} · ${note.path}`,
                'Flattened command path',
                false
            )
        );
        if (detail.length < 20) detail.push(`${note.command} ${note.path}: ${note.message}`);
    }

    const overloads = flattened.commands.reduce((sum, command) => sum + command.overloads.length, 0);
    return { gaps: [...new Set(gaps)], commands: flattened.commands.length, overloads, detail, cases };
};

describeFamily(FAMILIES.commandsTree, [REFERENCES.bedrockCommandMetadata], () => {
    const { gaps, commands, overloads, detail, cases } = compareCommandTree();
    const verdict = checkAllowList(FAMILIES.commandsTree, gaps);
    reportParityCases(FAMILIES.commandsTree, import.meta.filename, cases);

    it('publishes only commands a Bedrock client is built to parse', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current Bedrock command comparison volume', () => {
        reportParityProgress(FAMILIES.commandsTree, {
            bedrockCommands: bedrockCommandTable.counts.commands,
            bedrockOverloads: bedrockCommandTable.counts.overloads,
            serverCommands: commands,
            serverOverloads: overloads
        });
        expect(commands).toBeGreaterThan(0);
    });
});

/**
 * The `/summon` entity enum the server advertises, against the `is_summonable` flag of every
 * vanilla and overlay entity definition.
 *
 * Mojang's own `EntityType` enum holds exactly the vanilla types the pack marks summonable, so
 * Bedrock Dedicated Server refuses `/summon fishing_hook` or `/summon player` at parse. The
 * server offers Mojang's enum plus the summonable types its own content declares, so a type the
 * client is offered is one it may summon, and a type it is not offered fails at parse.
 *
 * Gap ids: `summon-enum:<id>` where the advertised enum and the definition's flag disagree.
 */
const compareSummonEnum = (): { gaps: string[]; detail: string[]; cases: ReturnType<typeof parityCase>[] } => {
    // The overlay loads over the vanilla pack, so its definition wins where both declare a type.
    const loaded: EntityTypes[] = [loadVanillaEntityTypes(), loadOverlayEntityTypes()];
    const types = new Map(loaded.flatMap((entityTypes) => [...entityTypes.registry.entries()]));
    const registry = buildVanillaCommands({
        entityTypes: [...new Set(loaded.flatMap((entityTypes) => summonableEntityTypes(entityTypes.registry)))]
    });

    const summon = flattenCommandTree(registry).commands.find((command) => command.name === 'summon');
    const shape = summon?.overloads[0]?.parameters.find((parameter) => parameter.name === 'entity')?.shape;
    const advertised = new Set(shape?.kind === 'enum' ? shape.values : []);
    const offered = (identifier: string) =>
        advertised.has(identifier) ||
        (identifier.startsWith('minecraft:') && advertised.has(identifier.slice('minecraft:'.length)));

    const gaps: string[] = [];
    const detail: string[] = [];
    const cases = [...types].map(([identifier, type]) => {
        const matched = offered(identifier) === type.flags.summonable;
        if (!matched) {
            gaps.push(`summon-enum:${identifier}`);
            detail.push(`${identifier}: offered ${offered(identifier)}, is_summonable ${type.flags.summonable}`);
        }
        return parityCase(`summon:${identifier}`, `/summon ${identifier}`, 'Summon entity enum', matched);
    });
    return { gaps, detail, cases };
};

describeFamily(FAMILIES.commandsTree, [REFERENCES.bedrockCommandMetadata, REFERENCES.bedrockBehaviorPack], () => {
    const { gaps, detail, cases } = compareSummonEnum();
    const verdict = checkAllowList(FAMILIES.commandsTree, gaps);
    reportParityCases(FAMILIES.commandsTree, import.meta.filename, cases);

    it('offers /summon exactly the entity types their definitions mark summonable', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });
});

/**
 * How the published `AvailableCommandsPacket` names its commands for the client, against the one
 * a Bedrock Dedicated Server sent a joining client.
 *
 * The server lists every command name and alias in the `CommandName` enum, and the client offers
 * a namespaced command, such as a script's `jsp:tpsbar`, only when that enum lists it. Each
 * alias enum is named after its command, as `teleportCommandAliases`.
 *
 * Gap ids: `command-name-enum:<name>` for a name or alias the published `CommandName` enum
 * leaves out, and `alias-enum:<command>` for an alias enum named otherwise than the server's.
 */
const compareCommandNames = (): { gaps: string[]; detail: string[]; cases: ReturnType<typeof parityCase>[] } => {
    const captured = new AvailableCommandsPacket(
        Buffer.concat([Buffer.from([0x4c]), readFileSync(bedrockCapture('wire/0x4c.bin'))])
    );
    captured.decode({ protocolVersion: bedrockCaptureProtocol() });
    const capturedAliasEnums = new Map(
        captured.commandData.flatMap(({ commandName, aliases }) =>
            aliases === null ? [] : [[commandName, aliases.name] as const]
        )
    );

    const { payload } = buildAvailableCommands(registerVanillaCommands());
    const enumNamed = (name: string) =>
        payload.enums.find((entry) => entry.name === name)?.valueIndexes.map((index) => payload.enumValues[index]);
    const listed = new Set(enumNamed(COMMAND_NAME_ENUM));

    const gaps: string[] = [];
    const detail: string[] = [];
    const cases = payload.commands.flatMap((command) => {
        const aliases = command.aliasEnum === -1 ? [] : (payload.enums[command.aliasEnum]?.valueIndexes ?? []);
        const names = [command.name, ...aliases.map((index) => payload.enumValues[index] ?? '')];
        const nameListed = names.every((name) => listed.has(name));
        if (!nameListed) gaps.push(`command-name-enum:${command.name}`);
        const own = command.aliasEnum === -1 ? undefined : payload.enums[command.aliasEnum]?.name;
        const expected = capturedAliasEnums.get(command.name);
        const aliasMatched = own === undefined || expected === undefined || own === expected;
        if (!aliasMatched) {
            gaps.push(`alias-enum:${command.name}`);
            detail.push(`${command.name}: alias enum ${own}, the server's ${expected}`);
        }
        return [
            parityCase(`command-name:${command.name}`, command.name, 'Command name enum', nameListed),
            ...(own === undefined || expected === undefined
                ? []
                : [
                      parityCase(
                          `alias-enum:${command.name}`,
                          `${command.name} aliases`,
                          'Alias enum name',
                          aliasMatched
                      )
                  ])
        ];
    });
    return { gaps, detail, cases };
};

describeFamily(FAMILIES.commandsTree, [REFERENCES.bedrockAvailableCommands], () => {
    const { gaps, detail, cases } = compareCommandNames();
    const verdict = checkAllowList(FAMILIES.commandsTree, gaps);
    reportParityCases(FAMILIES.commandsTree, import.meta.filename, cases);

    it('names each command and alias for the client as a Bedrock Dedicated Server does', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });
});
