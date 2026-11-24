import { OPCODES } from '@jsprismarine/java-classfile/instructions';

import type { JavaClass } from './javaClassFile.ts';
import { pinnedJavaClassFile } from './javaClassFile.ts';

/**
 * Readers for a Java registry class's static initializer (`Blocks`, `Items`) and for the hooks a
 * registered class overrides, which is where a block's or an item's Java behavior lives.
 */

const splitMember = (member: string): { readonly owner: string; readonly name: string } => {
    const dot = member.lastIndexOf('.');
    return { owner: member.slice(0, dot), name: member.slice(dot + 1) };
};

/** The class a factory method handle or lambda creates, following lambdas a few levels deep. */
const createdClass = (member: string, depth = 0): string | undefined => {
    if (depth > 4) return undefined;
    const { owner, name } = splitMember(member);
    if (name === '<init>') return owner;
    const method = pinnedJavaClassFile(owner)?.methods.find((candidate) => candidate.name === name);
    for (const instruction of method?.instructions ?? []) {
        // A factory lambda builds its properties before its entry, and the properties are not it.
        if (
            instruction.opcode === OPCODES.NEW &&
            instruction.type !== undefined &&
            !instruction.type.endsWith('$Properties')
        ) {
            return instruction.type;
        }
        for (const handle of instruction.handles ?? []) {
            const created = createdClass(handle, depth + 1);
            if (created !== undefined) return created;
        }
    }
    return undefined;
};

/** A Java registry class whose static initializer registers each entry into a field. */
export interface JavaRegistryClass {
    /** The registry class's binary name, such as `net/minecraft/world/level/block/Blocks`. */
    readonly owner: string;
    /** The packages a stored field's type is in, which tell an entry field from any other. */
    readonly entryPackages: readonly string[];
    /** The class each `register*` helper builds when the registration passes no factory, by name. */
    readonly helpers: Readonly<Record<string, string>>;
    /** The class a registration builds when neither a factory nor a known helper names one. */
    readonly fallback: string;
}

const registrations = new Map<string, ReadonlyMap<string, string>>();

/**
 * Every field a registry class's static initializer stores an entry in, by the field's name in
 * lower case, and the class its registration constructs.
 *
 * The initializer registers each entry as a key, an optional factory handle, a `register*` call
 * and a `putstatic`, so the class is the factory's, or else the helper's.
 */
export const javaRegisteredClasses = (registry: JavaRegistryClass): ReadonlyMap<string, string> => {
    const cached = registrations.get(registry.owner);
    if (cached !== undefined) return cached;
    const parsed = pinnedJavaClassFile(registry.owner);
    if (parsed === undefined) throw new Error(`the server jar holds no ${registry.owner}.class`);
    const init = parsed.methods.find((method) => method.name === '<clinit>');
    const classes = new Map<string, string>();
    let created: string | undefined;
    let helper: string | undefined;
    for (const instruction of init?.instructions ?? []) {
        const member = instruction.member === undefined ? undefined : splitMember(instruction.member);
        for (const handle of instruction.handles ?? []) {
            // A collection passes the registry's own `register` as a handle, which builds nothing.
            if (!handle.startsWith(`${registry.owner}.register`)) created ??= createdClass(handle);
        }
        if (
            instruction.opcode === OPCODES.INVOKESTATIC &&
            member?.owner === registry.owner &&
            member.name in registry.helpers
        ) {
            helper = member.name;
        }
        if (
            instruction.opcode === OPCODES.PUTSTATIC &&
            member?.owner === registry.owner &&
            registry.entryPackages.some((entry) => instruction.descriptor?.startsWith(`L${entry}`) === true)
        ) {
            const className =
                created ?? (helper === undefined ? undefined : registry.helpers[helper]) ?? registry.fallback;
            classes.set(member.name.toLowerCase(), className);
            created = undefined;
            helper = undefined;
        }
    }
    registrations.set(registry.owner, classes);
    return classes;
};

/** The sixteen dye colors, longest first so `light_gray_` is stripped before `gray_` could be. */
const DYE_PREFIXES = [
    'light_blue_',
    'light_gray_',
    'magenta_',
    'orange_',
    'yellow_',
    'purple_',
    'white_',
    'black_',
    'brown_',
    'green_',
    'gray_',
    'lime_',
    'pink_',
    'cyan_',
    'blue_',
    'red_'
] as const;

/** The oxidation and wax prefixes a `WeatheringCopperCollection` puts on its base block. */
const COPPER_PREFIXES = ['waxed_', 'exposed_', 'weathered_', 'oxidized_'] as const;

const stripPrefixes = (name: string, prefixes: readonly string[]): string => {
    let bare = name;
    for (let stripped = true; stripped;) {
        stripped = false;
        for (const prefix of prefixes) {
            if (bare.startsWith(prefix)) {
                bare = bare.slice(prefix.length);
                stripped = true;
            }
        }
    }
    return bare;
};

/**
 * The binary name of the class a registry entry runs, or undefined when the registrations name no
 * class for it.
 *
 * A colored or weathering family is one `ColorCollection` or `WeatheringCopperCollection` field,
 * so its members are found by their base name: `minecraft:red_wool` by `WOOL`,
 * `minecraft:waxed_exposed_cut_copper` by `CUT_COPPER`, `minecraft:black_dye` by `DYE`.
 */
export const javaRegisteredClassOf = (registry: JavaRegistryClass, javaId: string): string | undefined => {
    const classes = javaRegisteredClasses(registry);
    const name = javaId.replace(/^minecraft:/, '');
    const direct = classes.get(name);
    if (direct !== undefined) return direct;
    const colorBase = stripPrefixes(name, DYE_PREFIXES);
    const copperBase = stripPrefixes(name, COPPER_PREFIXES);
    // A potted plant Java registers in a loop over the plants, rather than as a field of its own,
    // is still a flower pot.
    const pot = name.startsWith('potted_') ? 'flower_pot' : name;
    for (const base of [colorBase, `dyed_${colorBase}`, copperBase, `${copperBase}_block`, pot]) {
        const found = classes.get(base);
        if (found !== undefined && base !== name) return found;
    }
    return undefined;
};

/** A class's simple name, such as `CraftingTableBlock`. */
export const javaSimpleName = (binary: string): string => binary.slice(binary.lastIndexOf('/') + 1);

/** A class and its superclasses below `base`, nearest first. */
const chainBelow = (className: string, base: readonly string[]): readonly JavaClass[] => {
    const chain: JavaClass[] = [];
    for (let next: string | undefined = className; next !== undefined && !base.includes(next);) {
        const parsed = pinnedJavaClassFile(next);
        if (parsed === undefined) break;
        chain.push(parsed);
        next = parsed.superName;
    }
    return chain;
};

/** Every interface a class or one of its superclasses implements, with their parents. */
export const javaInterfacesOf = (className: string): ReadonlySet<string> => {
    const found = new Set<string>();
    const visit = (name: string): void => {
        if (found.has(name)) return;
        found.add(name);
        for (const parent of pinnedJavaClassFile(name)?.interfaces ?? []) visit(parent);
    };
    for (let next: string | undefined = className; next?.startsWith('net/minecraft/') === true;) {
        const parsed = pinnedJavaClassFile(next);
        if (parsed === undefined) break;
        for (const parent of parsed.interfaces) visit(parent);
        next = parsed.superName;
    }
    return found;
};

/** Whether a class is, or extends, the class with this simple name. */
export const javaClassIsA = (className: string | undefined, simple: string): boolean => {
    for (let next = className; next?.startsWith('net/minecraft/') === true;) {
        if (javaSimpleName(next) === simple) return true;
        next = pinnedJavaClassFile(next)?.superName;
    }
    return false;
};

/** One kind of Java behavior, and the hooks or interfaces that give a class it. */
export interface JavaBehaviorKind {
    /** The aspect id the tracker files the behavior under. */
    readonly aspect: string;
    /** What comparing the behavior with Java means, for the tracker row. */
    readonly description: string;
    /** The hooks a class overrides to have this behavior. */
    readonly hooks?: readonly string[];
    /** The interfaces a class implements to have this behavior, by binary name. */
    readonly interfaces?: readonly string[];
}

/** One behavior kind a Java class has, with the class members that give it, for the tracker row. */
export interface JavaBehavior {
    readonly kind: JavaBehaviorKind;
    /** The overriding `Class.hook` names or the interface's simple name. */
    readonly evidence: readonly string[];
}

/**
 * The behavior kinds a class adds to its plain base: each hook it or a superclass below `base`
 * overrides with code, and each marker interface it implements.
 * @param className - The registered class.
 * @param base - The classes whose hooks are the defaults, where the walk up the hierarchy stops.
 * @param kinds - The behavior kinds to look for.
 */
export const javaBehaviorsOf = (
    className: string,
    base: readonly string[],
    kinds: readonly JavaBehaviorKind[]
): readonly JavaBehavior[] => {
    const overrides = new Map<string, string>();
    for (const entry of chainBelow(className, base)) {
        for (const method of entry.methods) {
            if (method.instructions.length === 0 || overrides.has(method.name)) continue;
            overrides.set(method.name, `${javaSimpleName(entry.name)}.${method.name}`);
        }
    }
    const interfaces = javaInterfacesOf(className);
    return kinds.flatMap((kind) => {
        const evidence = [
            ...(kind.hooks ?? []).flatMap((hook) => overrides.get(hook) ?? []),
            ...(kind.interfaces ?? []).filter((name) => interfaces.has(name)).map(javaSimpleName)
        ];
        return evidence.length === 0 ? [] : [{ kind, evidence }];
    });
};
