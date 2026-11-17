/**
 * The `custom-commands` scenario: commands and enums a pack registers in `startup`, the errors a
 * registration that BDS refuses throws, what a callback receives for each parameter type and
 * each origin, and what a script that runs one gets back. The capture runs some of the commands
 * on the console too, once the pack records `ready for the console`. A console command arrives
 * whenever the capture types it, so what the pack records after that is stamped tick 0.
 * The `custom-command-errors` scenario holds the runs whose arguments do not parse.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, system, world } from '@minecraft/server';

const PACK = 'commands';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
let fromConsole = false;
const record = (event, observed = {}) => {
    seq += 1;
    const tick = fromConsole ? 0 : system.currentTick;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? null : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** What the record keeps of a callback argument: plain values as they are, objects by their parts. */
const describe = (value) => {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(describe);
    if (typeof value.typeId === 'string') return { typeId: value.typeId };
    if (typeof value.id === 'string') return { id: value.id };
    if (typeof value.x === 'number') return { x: value.x, y: value.y, z: value.z };
    return Object.prototype.toString.call(value);
};

/** What the record keeps of an origin: its source type and the type of each entity or block it names. */
const origin = (value) => ({
    sourceType: value.sourceType,
    sourceEntity: value.sourceEntity === undefined ? null : value.sourceEntity.typeId,
    initiator: value.initiator === undefined ? null : value.initiator.typeId,
    sourceBlock: value.sourceBlock === undefined ? null : value.sourceBlock.typeId
});

/** A callback that records its origin and arguments and returns `result`. */
const recording =
    (name, result) =>
    (from, ...args) => {
        record(`${name} callback`, { value: { origin: origin(from), args: args.map(describe) } });
        return result;
    };

let registry;

system.beforeEvents.startup.subscribe((event) => {
    registry = event.customCommandRegistry;
    attempt('registerEnum', () => registry.registerEnum('jsp:color', ['red', 'green', 'blue']));
    attempt('registerEnum again', () => registry.registerEnum('jsp:color', ['red']));
    attempt('registerEnum without a namespace', () => registry.registerEnum('shade', ['dark']));
    attempt('registerEnum in the minecraft namespace', () => registry.registerEnum('minecraft:shade', ['dark']));

    attempt('registerCommand hello', () =>
        registry.registerCommand(
            { name: 'jsp:hello', description: 'Says hello', permissionLevel: CommandPermissionLevel.Any },
            recording('jsp:hello', { status: CustomCommandStatus.Success, message: 'hello back' })
        )
    );
    attempt('registerCommand fail', () =>
        registry.registerCommand(
            { name: 'jsp:fail', description: 'Fails', permissionLevel: CommandPermissionLevel.Any },
            recording('jsp:fail', { status: CustomCommandStatus.Failure, message: 'it failed' })
        )
    );
    attempt('registerCommand quiet', () =>
        registry.registerCommand(
            { name: 'jsp:quiet', description: 'Returns nothing', permissionLevel: CommandPermissionLevel.Any },
            recording('jsp:quiet', undefined)
        )
    );
    attempt('registerCommand success without a message', () =>
        registry.registerCommand(
            { name: 'jsp:plain', description: 'Succeeds silently', permissionLevel: CommandPermissionLevel.Any },
            recording('jsp:plain', { status: CustomCommandStatus.Success })
        )
    );
    attempt('registerCommand types', () =>
        registry.registerCommand(
            {
                name: 'jsp:types',
                description: 'Takes one of each plain type',
                permissionLevel: CommandPermissionLevel.Any,
                mandatoryParameters: [
                    { name: 'text', type: CustomCommandParamType.String },
                    { name: 'count', type: CustomCommandParamType.Integer },
                    { name: 'ratio', type: CustomCommandParamType.Float },
                    { name: 'flag', type: CustomCommandParamType.Boolean },
                    { name: 'where', type: CustomCommandParamType.Location }
                ],
                optionalParameters: [{ name: 'jsp:color', type: CustomCommandParamType.Enum }]
            },
            recording('jsp:types', { status: CustomCommandStatus.Success, message: 'types read' })
        )
    );
    attempt('registerCommand kinds', () =>
        registry.registerCommand(
            {
                name: 'jsp:kinds',
                description: 'Takes a type of each registry',
                permissionLevel: CommandPermissionLevel.Any,
                mandatoryParameters: [
                    { name: 'entity', type: CustomCommandParamType.EntityType },
                    { name: 'item', type: CustomCommandParamType.ItemType },
                    { name: 'block', type: CustomCommandParamType.BlockType }
                ]
            },
            recording('jsp:kinds', undefined)
        )
    );
    attempt('registerCommand targets', () =>
        registry.registerCommand(
            {
                name: 'jsp:targets',
                description: 'Takes selectors',
                permissionLevel: CommandPermissionLevel.Any,
                mandatoryParameters: [{ name: 'entities', type: CustomCommandParamType.EntitySelector }],
                optionalParameters: [{ name: 'players', type: CustomCommandParamType.PlayerSelector }]
            },
            recording('jsp:targets', undefined)
        )
    );
    attempt('registerCommand admin', () =>
        registry.registerCommand(
            {
                name: 'jsp:admin',
                description: 'Needs admin and cheats',
                permissionLevel: CommandPermissionLevel.Admin,
                cheatsRequired: true
            },
            recording('jsp:admin', { status: CustomCommandStatus.Success, message: 'admin ran' })
        )
    );
    attempt('registerCommand throws', () =>
        registry.registerCommand(
            { name: 'jsp:throws', description: 'Throws', permissionLevel: CommandPermissionLevel.Any },
            () => {
                record('jsp:throws callback');
                throw new Error('the callback threw');
            }
        )
    );
    attempt('registerCommand restricted', () =>
        registry.registerCommand(
            { name: 'jsp:restricted', description: 'Writes the world', permissionLevel: CommandPermissionLevel.Any },
            () => {
                attempt('jsp:restricted sendMessage', () => world.sendMessage('from a callback'));
                attempt('jsp:restricted setWeather', () => world.getDimension('overworld').setWeather('Clear'));
                system.run(() => record('jsp:restricted system.run'));
                return { status: CustomCommandStatus.Success, message: 'deferred' };
            }
        )
    );
    attempt('registerCommand again', () =>
        registry.registerCommand(
            { name: 'jsp:hello', description: 'Again', permissionLevel: CommandPermissionLevel.Any },
            () => undefined
        )
    );
    attempt('registerCommand without a namespace', () =>
        registry.registerCommand(
            { name: 'bare', description: 'No namespace', permissionLevel: CommandPermissionLevel.Any },
            () => undefined
        )
    );
    attempt('registerCommand in the minecraft namespace', () =>
        registry.registerCommand(
            { name: 'minecraft:mine', description: 'Taken', permissionLevel: CommandPermissionLevel.Any },
            () => undefined
        )
    );
    attempt('registerCommand with a missing enum', () =>
        registry.registerCommand(
            {
                name: 'jsp:missing',
                description: 'Names an enum nobody registered',
                permissionLevel: CommandPermissionLevel.Any,
                mandatoryParameters: [{ name: 'jsp:nothing', type: CustomCommandParamType.Enum }]
            },
            () => undefined
        )
    );
    attempt('registerCommand with an upper-case name', () =>
        registry.registerCommand(
            { name: 'jsp:Shout', description: 'Upper case', permissionLevel: CommandPermissionLevel.Any },
            recording('jsp:Shout', undefined)
        )
    );
    record('startup done');
});

world.afterEvents.worldLoad.subscribe(() => {
    attempt('registerCommand after startup', () =>
        registry.registerCommand(
            { name: 'jsp:late', description: 'Too late', permissionLevel: CommandPermissionLevel.Any },
            () => undefined
        )
    );
    const overworld = world.getDimension('overworld');
    const run = (command) => attempt(`runCommand ${command}`, () => overworld.runCommand(command).successCount);
    run('jsp:hello');
    run('hello');
    run('jsp:fail');
    run('jsp:quiet');
    run('jsp:plain');
    run('jsp:types word 7 2.5 true 1 2 3');
    run('jsp:types "two words" -3 1 false ~1 ~ ~-1 green');
    run('jsp:types word 7 2.5 true 1 2 3 purple');
    run('jsp:kinds pig apple stone');
    run('jsp:kinds minecraft:cow minecraft:stick minecraft:dirt');
    run('jsp:targets @e');
    run('jsp:targets @a @a');
    run('jsp:admin');
    run('jsp:throws');
    run('jsp:restricted');
    record('ready for the console');
    system.run(() => {
        fromConsole = true;
    });
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 40);
});
