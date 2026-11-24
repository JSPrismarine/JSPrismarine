import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { threadId } from 'node:worker_threads';

import type { JavaClass as ClassFile } from '@jsprismarine/java-classfile/classFile';
import { parseJavaClass } from '@jsprismarine/java-classfile/classFile';
import type { JavaInstruction } from '@jsprismarine/java-classfile/instructions';
import { OPCODES, decodeInstructions } from '@jsprismarine/java-classfile/instructions';

import { readServerJar } from './javaDatapack.ts';
import { FETCH_CACHE, REFERENCES } from './references.ts';

/**
 * Reads a Java class's hierarchy and the instructions of each method out of the pinned server jar.
 *
 * Some Java rules live only in code, such as the checks a packet handler makes before it acts
 * on a block position, or whether a mob can be leashed. A row that compares against one reads the
 * class file, so a Java version that changes the rule fails the row instead of leaving a comment
 * that no longer says what Java does. Nothing here runs the class; it is parsed as data.
 */

/** One method of a class and the methods its code calls. */
export interface JavaMethod {
    readonly name: string;
    readonly descriptor: string;
    /** `Owner.name` of each `invoke*` instruction but `invokedynamic`, in the order they appear. */
    readonly calls: readonly string[];
    /** The method's code, decoded; empty for an abstract or native method. */
    readonly instructions: readonly JavaInstruction[];
}

/** A class's place in the hierarchy and its methods. */
export interface JavaClass {
    /** The binary name, such as `net/minecraft/world/entity/Mob`. */
    readonly name: string;
    /** The superclass's binary name, absent for `java/lang/Object`. */
    readonly superName?: string;
    readonly interfaces: readonly string[];
    readonly methods: readonly JavaMethod[];
    /**
     * The numeric `static final` constants, by field name: the values `javac` writes as a field's
     * `ConstantValue` attribute, such as `Sniffer.SNIFFER_BABY_START_AGE`.
     */
    readonly constants: ReadonlyMap<string, number>;
}

/** The simple name of a member reference, `Owner.member`, as {@link JavaMethod.calls} lists it. */
const simpleMember = (member: string): string => member.slice(member.lastIndexOf('/') + 1);

/**
 * A parsed class file as the parity rows read it: its hierarchy, and each method's decoded code.
 *
 * @param parsed - The class file, parsed.
 */
const javaClassView = (parsed: ClassFile): JavaClass => ({
    name: parsed.name,
    ...(parsed.superName === undefined ? {} : { superName: parsed.superName }),
    interfaces: parsed.interfaces,
    methods: parsed.methods.map((method): JavaMethod => {
        const instructions = method.code === undefined ? [] : decodeInstructions(parsed, method.code);
        return {
            name: method.name,
            descriptor: method.descriptor,
            calls: instructions.flatMap((instruction) =>
                instruction.opcode >= OPCODES.INVOKEVIRTUAL &&
                instruction.opcode <= OPCODES.INVOKEINTERFACE &&
                instruction.member !== undefined
                    ? [simpleMember(instruction.member)]
                    : []
            ),
            instructions
        };
    }),
    constants: new Map(
        parsed.fields.flatMap((field) =>
            field.numericValue === undefined ? [] : [[field.name, field.numericValue] as const]
        )
    )
});

/**
 * Writes a cache file under a temporary name and renames it into place. Test workers fill the
 * cache in parallel, and a reader that only checks whether the file exists must never parse one
 * another worker is still writing.
 */
const writeCacheFile = (target: string, contents: Uint8Array | string): void => {
    mkdirSync(dirname(target), { recursive: true });
    const partial = `${target}.${process.pid}.${threadId}.tmp`;
    writeFileSync(partial, contents);
    renameSync(partial, target);
};

/** The inner server jar's entries, inflated once per process when a class is not cached yet. */
let inflatedJar: Map<string, Uint8Array> | undefined;

/** Parsed class files by binary name, so a hierarchy walk reads each class file once. */
const parsedClassFiles = new Map<string, ClassFile | undefined>();

/** The parity view of each parsed class, by binary name. */
const parsedClasses = new Map<string, JavaClass | undefined>();

/**
 * One class file of the pinned Java server jar, parsed, or undefined when the jar holds no such
 * class, which is the case for the JDK classes at the top of every hierarchy.
 *
 * Reading the jar inflates every entry, so each class file is kept in the fetch cache beside the
 * jar and later runs read that copy.
 *
 * @param className - The class's binary name, such as `net/minecraft/world/entity/Mob`.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedClassFile = (className: string): ClassFile | undefined => {
    if (parsedClassFiles.has(className)) return parsedClassFiles.get(className);

    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');

    const version = basename(dirname(jarPath)) || 'unknown';
    const entry = `${className}.class`;
    const cached = join(FETCH_CACHE, 'java-classes', version, ...entry.split('/'));
    let parsed: ClassFile | undefined;
    if (existsSync(cached)) parsed = parseJavaClass(readFileSync(cached));
    else if (className.startsWith('net/minecraft/') || className.startsWith('com/mojang/')) {
        inflatedJar ??= readServerJar(jarPath);
        const bytes = inflatedJar.get(entry);
        if (bytes !== undefined) {
            writeCacheFile(cached, bytes);
            parsed = parseJavaClass(bytes);
        }
    }
    parsedClassFiles.set(className, parsed);
    return parsed;
};

/**
 * One class of the pinned Java server jar with its methods decoded, or undefined when the jar
 * holds no such class.
 *
 * @param className - The class's binary name, such as `net/minecraft/world/entity/Mob`.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaClassFile = (className: string): JavaClass | undefined => {
    if (parsedClasses.has(className)) return parsedClasses.get(className);
    const parsed = pinnedClassFile(className);
    const view = parsed === undefined ? undefined : javaClassView(parsed);
    parsedClasses.set(className, view);
    return view;
};

/**
 * Every class of the pinned Java server jar under `net/minecraft/` whose constant pool names
 * `text`, such as a method name, parsed. Any class that calls or overrides a method names it there,
 * so this finds every caller without parsing the rest of the jar.
 *
 * @param text - The name to look for, such as `canBePickedFromInside`.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaClassesNaming = (text: string): readonly JavaClass[] => {
    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');
    const version = basename(dirname(jarPath)) || 'unknown';
    const needle = Buffer.from(text, 'utf-8');
    return pinnedJavaClassNames('net/minecraft/').flatMap((name) => {
        const cached = join(FETCH_CACHE, 'java-classes', version, ...`${name}.class`.split('/'));
        const bytes = existsSync(cached)
            ? readFileSync(cached)
            : (inflatedJar ??= readServerJar(jarPath)).get(`${name}.class`);
        if (bytes === undefined || Buffer.from(bytes).indexOf(needle) < 0) return [];
        const parsed = pinnedJavaClassFile(name);
        return parsed === undefined ? [] : [parsed];
    });
};

/**
 * The methods of one class in the pinned Java server jar.
 *
 * @param className - The class's binary name, such as
 *   `net/minecraft/server/network/ServerGamePacketListenerImpl`.
 * @throws {Error} When the jar is not in the fetch cache, or does not hold the class.
 */
export const pinnedJavaClass = (className: string): JavaMethod[] => {
    const parsed = pinnedJavaClassFile(className);
    if (parsed === undefined) throw new Error(`the server jar holds no ${className}.class`);
    return [...parsed.methods];
};

/**
 * Each number a method's code pushes onto the stack, in the order it appears: the `iconst`
 * shorthands, `bipush` and `sipush`, and the numbers `ldc` loads.
 *
 * @param method - A parsed method; none reads as no constants.
 */
export const numericConstants = (method: JavaMethod | undefined): readonly number[] =>
    (method?.instructions ?? []).flatMap((instruction) =>
        typeof instruction.constant === 'number' ? [instruction.constant] : []
    );

/**
 * The method a class runs for a name with no arguments: its own, or the nearest superclass's,
 * which is what a virtual call on an instance of the class dispatches to.
 *
 * @param className - The class's binary name.
 * @param name - The method's name; only a method that takes no arguments matches.
 * @returns The method and the class that declares it, or undefined when no class in the chain declares one.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaMethod = (
    className: string,
    name: string
): { readonly owner: string; readonly method: JavaMethod } | undefined => {
    for (let owner: string | undefined = className; owner !== undefined;) {
        const parsed = pinnedJavaClassFile(owner);
        if (parsed === undefined) return undefined;
        const method = parsed.methods.find(
            (candidate) => candidate.name === name && candidate.descriptor.startsWith('()')
        );
        if (method !== undefined) return { owner, method };
        owner = parsed.superName;
    }
    return undefined;
};

/**
 * One instruction of a method's code that names something a row can compare: a method it calls,
 * a field it reads or writes, or a constant it pushes. Targets are `Owner.member` with the owner's
 * simple name, as {@link JavaMethod.calls} lists them.
 */
export type JavaOperation =
    | { readonly kind: 'call'; readonly target: string }
    | { readonly kind: 'field'; readonly target: string; readonly write: boolean }
    | { readonly kind: 'string'; readonly value: string }
    | { readonly kind: 'number'; readonly value: number };

/**
 * A method's calls, field accesses and pushed constants, in the order its code has them; every
 * other instruction is left out.
 *
 * @param method - A parsed method.
 */
export const javaOperations = (method: Pick<JavaMethod, 'instructions'>): readonly JavaOperation[] =>
    method.instructions.flatMap((instruction): JavaOperation[] => {
        if (typeof instruction.constant === 'number') return [{ kind: 'number', value: instruction.constant }];
        if (typeof instruction.constant === 'string') return [{ kind: 'string', value: instruction.constant }];
        if (instruction.member === undefined) return [];
        const target = instruction.member.slice(instruction.member.lastIndexOf('/') + 1);
        if (instruction.opcode >= OPCODES.GETSTATIC && instruction.opcode <= OPCODES.PUTFIELD)
            return [
                {
                    kind: 'field',
                    target,
                    write: instruction.opcode === OPCODES.PUTSTATIC || instruction.opcode === OPCODES.PUTFIELD
                }
            ];
        if (instruction.opcode >= OPCODES.INVOKEVIRTUAL && instruction.opcode <= OPCODES.INVOKEINTERFACE)
            return [{ kind: 'call', target }];
        return [];
    });

/**
 * The binary name of every class in the pinned jar under a package prefix, such as
 * `net/minecraft/world/entity/`.
 *
 * The first listing inflates the jar and keeps the names in the fetch cache beside the class
 * files, so later runs read that list.
 *
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaClassNames = (prefix: string): readonly string[] => {
    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');
    const index = join(FETCH_CACHE, 'java-classes', basename(dirname(jarPath)) || 'unknown', 'classes.json');
    let names: readonly string[] | undefined;
    if (existsSync(index)) {
        // Parsed JSON boundary; the file is only written below, as a list of class names.
        const parsed: unknown = JSON.parse(readFileSync(index, 'utf-8'));
        if (Array.isArray(parsed)) names = parsed.filter((name): name is string => typeof name === 'string');
    }
    if (names === undefined) {
        inflatedJar ??= readServerJar(jarPath);
        names = [...inflatedJar.keys()]
            .filter((entry) => entry.endsWith('.class'))
            .map((entry) => entry.slice(0, -'.class'.length));
        writeCacheFile(index, JSON.stringify(names));
    }
    return names.filter((name) => name.startsWith(prefix));
};

/**
 * The numeric `static final` constants of one class in the pinned Java server jar, by field name.
 *
 * @param className - The class's binary name, such as `net/minecraft/world/entity/AgeableMob`.
 * @throws {Error} When the jar is not in the fetch cache, or does not hold the class.
 */
export const pinnedJavaConstants = (className: string): ReadonlyMap<string, number> => {
    const parsed = pinnedJavaClassFile(className);
    if (parsed === undefined) throw new Error(`the server jar holds no ${className}.class`);
    return parsed.constants;
};

/** One member a method's code reaches: a call, a field read or a field write, as `Owner.name`. */
export interface JavaMemberRef {
    readonly kind: 'call' | 'get' | 'put';
    readonly member: string;
}

/** One field write in a method's code. */
export interface JavaFieldStore {
    readonly field: string;
    /** The int constant stored, or undefined when the value was computed. */
    readonly value: number | undefined;
}

/**
 * Every method call and field read and write a method's code makes, as `Owner.name` with the
 * owner's simple name, in code order.
 *
 * @param method - A parsed method.
 */
export const javaMemberRefs = (method: Pick<JavaMethod, 'instructions'>): readonly JavaMemberRef[] =>
    javaOperations(method).flatMap((operation): JavaMemberRef[] =>
        operation.kind === 'call'
            ? [{ kind: 'call', member: operation.target }]
            : operation.kind === 'field'
              ? [{ kind: operation.write ? 'put' : 'get', member: operation.target }]
              : []
    );

/**
 * Each `putfield` and `putstatic` in a method's code, in order, with the int constant the
 * instruction before it pushed, when it pushed one. A constructor's `this.xpReward = 5` reads as
 * `{ field: 'Mob.xpReward', value: 5 }`.
 *
 * @param method - A parsed method.
 */
export const javaFieldStores = (method: Pick<JavaMethod, 'instructions'>): readonly JavaFieldStore[] => {
    const operations = javaOperations(method);
    return operations.flatMap((operation, index): JavaFieldStore[] => {
        if (operation.kind !== 'field' || !operation.write) return [];
        const before = operations[index - 1];
        return [
            {
                field: operation.target,
                value: before?.kind === 'number' && Number.isInteger(before.value) ? before.value : undefined
            }
        ];
    });
};
