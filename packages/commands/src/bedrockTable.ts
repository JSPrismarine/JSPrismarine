/**
 * Mojang's published Bedrock command set, loaded once and given the shape the
 * generator guarantees. Everything else in the package reads the table through
 * this module, so the parsed-JSON boundary is cast exactly once.
 *
 * The table is generated from `metadata/command_modules/mojang-commands.json`
 * in `Mojang/bedrock-samples`. See `utils/generate/generate-bedrock-commands.ts`.
 */
import tableJson from './tables/bedrockCommands.json';

/** One parameter of one Bedrock command overload. */
export interface BedrockCommandParameter {
    /** The name the client shows in its autocomplete, Mojang's own spelling. */
    readonly name: string;
    /** The upper-case parameter type name, either a basic type or a command enum. */
    readonly type: string;
    /** Whether the overload parses without this parameter. */
    readonly optional: boolean;
}

/** One overload of one Bedrock command: an ordered parameter list. */
export interface BedrockCommandOverload {
    /** Mojang's name for the overload, usually its index as a string. */
    readonly name: string;
    /** The parameters in the order the client parses them. */
    readonly parameters: readonly BedrockCommandParameter[];
}

/** One Bedrock command as Mojang declares it. */
export interface BedrockCommandDefinition {
    /** The command name without a leading slash. */
    readonly name: string;
    /** The one-line description the client shows. */
    readonly description: string;
    /** Other names the command answers to. */
    readonly aliases: readonly string[];
    /** The `CommandPermissionLevel` the command needs, 0 (`Any`) to 5 (`Internal`). */
    readonly permissionLevel: number;
    /** Whether the world must have cheats on for the command to run. */
    readonly requiresCheats: boolean;
    /** Every spelling of the command, in Mojang's order. */
    readonly overloads: readonly BedrockCommandOverload[];
}

/** One command enum: a fixed value list a parameter can take. */
export interface BedrockCommandEnum {
    /** The name Mojang declares, which is what goes on the wire. */
    readonly name: string;
    /** The values, empty for a soft enum the server fills at runtime. */
    readonly values: readonly string[];
}

/** How many of each thing the pinned metadata declares. */
export interface BedrockCommandCounts {
    readonly commands: number;
    readonly overloads: number;
    readonly parameters: number;
    readonly enums: number;
    readonly enumValues: number;
    readonly basicTypes: number;
    readonly softEnums: number;
}

/** The generated Bedrock command table. */
export interface BedrockCommandTable {
    /** The pinned `Mojang/bedrock-samples` commit the table was read from. */
    readonly source: { readonly repo: string; readonly tag: string; readonly commit: string; readonly path: string };
    /** The measured counts, which the package's tests assert against. */
    readonly counts: BedrockCommandCounts;
    /** Every parameter type name that is not a command enum, with its use count, most used first. */
    readonly basicTypes: readonly { readonly name: string; readonly uses: number }[];
    /** The enums declared with no values, which the server fills over `UpdateSoftEnumPacket`. */
    readonly softEnums: readonly string[];
    /** Every command enum, sorted by name. */
    readonly enums: readonly BedrockCommandEnum[];
    /** Every command, in Mojang's order. */
    readonly commands: readonly BedrockCommandDefinition[];
}

// The generated table is data the compiler cannot type beyond the JSON module's
// inferred shape, so the one cast in the package happens here.
const table = tableJson as unknown as BedrockCommandTable;

/** Mojang's Bedrock command set, as published for the pinned game version. */
export const bedrockCommandTable: BedrockCommandTable = table;

const commandsByName = new Map(table.commands.map((command) => [command.name, command]));
const enumsByKey = new Map(table.enums.map((entry) => [entry.name.toUpperCase(), entry]));
const softEnumKeys = new Set(table.softEnums.map((name) => name.toUpperCase()));
const basicTypeNames = new Set(table.basicTypes.map((entry) => entry.name));

/**
 * Looks a command up by the name a player types, without a leading slash.
 *
 * @returns The command, or undefined when Bedrock has no command by that name.
 */
export const bedrockCommand = (name: string): BedrockCommandDefinition | undefined => commandsByName.get(name);

/**
 * Looks a command enum up by the name a parameter refers to it by.
 *
 * Parameters spell the name in upper case and the declaration does not, so the
 * lookup is case-insensitive.
 *
 * @returns The enum, or undefined when the name is a basic type or unknown.
 */
export const bedrockCommandEnum = (name: string): BedrockCommandEnum | undefined => enumsByKey.get(name.toUpperCase());

/** Whether the named enum is one of the four Mojang declares with no values. */
export const isBedrockSoftEnum = (name: string): boolean => softEnumKeys.has(name.toUpperCase());

/** Whether the name is one of the basic parameter types rather than a command enum. */
export const isBedrockBasicType = (name: string): boolean => basicTypeNames.has(name.toUpperCase());
