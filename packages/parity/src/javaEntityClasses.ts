import type { JavaInstruction } from '@jsprismarine/java-classfile/instructions';
import { OPCODES } from '@jsprismarine/java-classfile/instructions';

import type { JavaClass, JavaMethod } from './javaClassFile.ts';
import { pinnedJavaClassFile } from './javaClassFile.ts';

/**
 * Java Edition's entity classes, read out of the pinned server jar: which class each entity type
 * constructs, the hierarchy above it, and what a simple rule method of it returns.
 *
 * A rule such as `Mob.canBeLeashed` is a few instructions that return a constant or test the
 * entity's state. Reading it from the class file, rather than copying it into a table, makes a
 * row fail when Java changes the rule.
 */

const ENTITY_TYPES = 'net/minecraft/world/entity/EntityTypes';
const ENTITY_TYPE_IDS = 'net/minecraft/world/entity/EntityTypeIds';

/** A class of the pinned jar, which every caller here expects to exist. */
const required = (className: string): JavaClass => {
    const parsed = pinnedJavaClassFile(className);
    if (parsed === undefined) throw new Error(`the server jar holds no ${className}.class`);
    return parsed;
};

/** The binary name and member of `owner/Binary/Name.member`. */
const splitMember = (member: string): { readonly owner: string; readonly name: string } => {
    const dot = member.lastIndexOf('.');
    return { owner: member.slice(0, dot), name: member.slice(dot + 1) };
};

/** The class whose instances a factory method handle or method creates, following lambdas and factories. */
const createdClass = (member: string, depth = 0): string | undefined => {
    if (depth > 4) return undefined;
    const { owner, name } = splitMember(member);
    if (name === '<init>') return owner;
    const method = pinnedJavaClassFile(owner)?.methods.find((candidate) => candidate.name === name);
    if (method === undefined) return undefined;
    for (const instruction of method.instructions) {
        if (instruction.opcode === OPCODES.NEW && instruction.type !== undefined) return instruction.type;
        for (const handle of instruction.handles ?? []) {
            const created = createdClass(handle, depth + 1);
            if (created !== undefined) return created;
        }
    }
    return undefined;
};

let entityClasses: ReadonlyMap<string, string> | undefined;

/**
 * Every Java entity type id and the class its factory constructs, from the registrations in
 * `EntityTypes`' static initializer. A type registered with no factory, such as the player, has
 * no entry.
 */
export const javaEntityClasses = (): ReadonlyMap<string, string> => {
    if (entityClasses !== undefined) return entityClasses;

    // EntityTypeIds assigns each key from a string constant: `ldc "allay"`, then `putstatic ALLAY`.
    const ids = new Map<string, string>();
    const idsInit = required(ENTITY_TYPE_IDS).methods.find((method) => method.name === '<clinit>');
    let pending: string | undefined;
    for (const instruction of idsInit?.instructions ?? []) {
        if (typeof instruction.constant === 'string') pending = instruction.constant;
        else if (instruction.opcode === 0xb3 && instruction.member !== undefined && pending !== undefined) {
            ids.set(splitMember(instruction.member).name, `minecraft:${pending}`);
            pending = undefined;
        }
    }

    // EntityTypes registers each type as `getstatic EntityTypeIds.KEY`, a factory, then `register`.
    const classes = new Map<string, string>();
    const typesInit = required(ENTITY_TYPES).methods.find((method) => method.name === '<clinit>');
    let key: string | undefined;
    let created: string | undefined;
    for (const instruction of typesInit?.instructions ?? []) {
        const member = instruction.member === undefined ? undefined : splitMember(instruction.member);
        if (instruction.opcode === 0xb2 && member?.owner === ENTITY_TYPE_IDS) {
            key = ids.get(member.name);
            created = undefined;
            continue;
        }
        if (key === undefined) continue;
        if (created === undefined) {
            for (const handle of instruction.handles ?? []) created ??= createdClass(handle);
            if (
                instruction.opcode === OPCODES.INVOKESTATIC &&
                member?.owner === ENTITY_TYPES &&
                member.name !== 'register'
            )
                created ??= createdClass(`${member.owner}.${member.name}`);
        }
        if (
            instruction.opcode === OPCODES.INVOKESTATIC &&
            member?.owner === ENTITY_TYPES &&
            member.name === 'register'
        ) {
            if (created !== undefined) classes.set(key, created);
            key = undefined;
        }
    }
    entityClasses = classes;
    return classes;
};

/** Every class and interface a class extends or implements, itself first, nearest first. */
export const javaAncestry = (className: string): readonly string[] => {
    const seen: string[] = [];
    const visit = (name: string): void => {
        if (seen.includes(name)) return;
        seen.push(name);
        const parsed = pinnedJavaClassFile(name);
        if (parsed === undefined) return;
        if (parsed.superName !== undefined) visit(parsed.superName);
        for (const parent of parsed.interfaces) visit(parent);
    };
    visit(className);
    return seen;
};

/** Whether an entity class is, extends or implements another class, such as `monster/Enemy`. */
export const javaIsA = (className: string, ancestor: string): boolean => javaAncestry(className).includes(ancestor);

/**
 * The method an instance of a class runs for a name: its own, the nearest superclass's, then an
 * interface's default.
 */
export const javaResolveMethod = (
    className: string,
    name: string,
    descriptor?: string
): { readonly owner: string; readonly method: JavaMethod } | undefined => {
    const matches = (method: JavaMethod): boolean =>
        method.name === name && (descriptor === undefined || method.descriptor === descriptor);
    const ancestry = javaAncestry(className);
    // Superclasses first: the ancestry lists a class before its interfaces only along the
    // superclass chain, so look for a concrete method there before any interface default.
    for (
        let owner: string | undefined = className;
        owner !== undefined;
        owner = pinnedJavaClassFile(owner)?.superName
    ) {
        const method = pinnedJavaClassFile(owner)?.methods.find(matches);
        if (method !== undefined && method.instructions.length > 0) return { owner, method };
    }
    for (const owner of ancestry) {
        const method = pinnedJavaClassFile(owner)?.methods.find(matches);
        if (method !== undefined && method.instructions.length > 0) return { owner, method };
    }
    return undefined;
};

/**
 * The state a rule method reads off a fresh entity, by getter name: `isAngry`, `isTamed`,
 * `isMobControlled` and the like, and how many passengers it carries.
 */
export interface JavaEntityState {
    /** Boolean and integer getters the method calls on the entity, by simple name. */
    readonly getters: Readonly<Record<string, boolean | number>>;
    /** The entity's passenger count, which `getPassengers().size()` and `passengers.isEmpty()` read. */
    readonly passengers?: number;
}

/** A value on the evaluator's stack. */
type StackValue =
    | { readonly kind: 'this' }
    | { readonly kind: 'int'; readonly value: number }
    | { readonly kind: 'passengers' }
    | { readonly kind: 'opaque' };

/**
 * Evaluates a no-argument `boolean` or `int` method of an entity class against a state, by
 * interpreting its instructions: constants, the entity's getters, `instanceof`, comparisons and
 * branches. A method that does anything else throws, so a rule that grows past this subset fails
 * the row that reads it rather than answering wrongly.
 *
 * @param className - The entity's class.
 * @param name - The method, such as `canBeLeashed`.
 * @param state - What the entity's getters return.
 * @returns The method's result; a boolean is 0 or 1.
 * @throws {Error} When the method is missing or uses an instruction the evaluator does not model.
 */
export const evaluateJavaMethod = (className: string, name: string, state: JavaEntityState, depth = 0): number => {
    if (depth > 6) throw new Error(`${name} recurses too deeply to evaluate`);
    const resolved = javaResolveMethod(className, name);
    if (resolved === undefined) throw new Error(`${className} has no ${name}`);
    const { instructions } = resolved.method;
    const at = new Map(instructions.map((instruction, index) => [instruction.pc, index]));
    const stack: StackValue[] = [];
    const pop = (): StackValue => {
        const value = stack.pop();
        if (value === undefined) throw new Error(`${name} pops an empty stack`);
        return value;
    };
    const int = (value: StackValue): number => {
        if (value.kind !== 'int') throw new Error(`${name} compares a value the evaluator does not model`);
        return value.value;
    };
    const jump = (instruction: JavaInstruction): number => {
        const index = instruction.target === undefined ? undefined : at.get(instruction.target);
        if (index === undefined) throw new Error(`${name} branches outside its code`);
        return index;
    };

    let index = 0;
    for (let steps = 0; steps < 500 && index < instructions.length; steps++) {
        const instruction = instructions[index];
        if (instruction === undefined) break;
        const { opcode } = instruction;
        index += 1;
        if (opcode === OPCODES.ALOAD_0) stack.push({ kind: 'this' });
        else if (typeof instruction.constant === 'number' && opcode <= OPCODES.LDC2_W)
            stack.push({ kind: 'int', value: instruction.constant });
        else if (opcode === OPCODES.IRETURN || opcode === OPCODES.DRETURN) return int(pop());
        else if (opcode === OPCODES.GOTO) index = jump(instruction);
        else if (opcode === OPCODES.IFEQ || opcode === OPCODES.IFNE) {
            const value = int(pop());
            if ((opcode === OPCODES.IFEQ) === (value === 0)) index = jump(instruction);
        } else if (opcode >= OPCODES.IF_ICMPEQ && opcode <= OPCODES.IF_ICMPLE) {
            const right = int(pop());
            const left = int(pop());
            const taken = [left === right, left !== right, left < right, left >= right, left > right, left <= right][
                opcode - OPCODES.IF_ICMPEQ
            ];
            if (taken === true) index = jump(instruction);
        } else if (opcode === OPCODES.INSTANCEOF && instruction.type !== undefined) {
            pop();
            stack.push({ kind: 'int', value: javaIsA(className, instruction.type) ? 1 : 0 });
        } else if (opcode === 0xb2) stack.push({ kind: 'opaque' });
        else if (opcode === OPCODES.GETFIELD && instruction.member?.endsWith('.passengers')) {
            pop();
            stack.push({ kind: 'passengers' });
        } else if (
            (opcode === OPCODES.INVOKEVIRTUAL || opcode === OPCODES.INVOKEINTERFACE) &&
            instruction.member !== undefined
        ) {
            const member = splitMember(instruction.member).name;
            const descriptor = instruction.descriptor ?? '';
            const argumentCount = descriptor.startsWith('()') ? 0 : descriptor.startsWith('(L') ? 1 : -1;
            if (argumentCount < 0)
                throw new Error(`${name} calls ${member} with arguments the evaluator does not model`);
            for (let argument = 0; argument < argumentCount; argument++) pop();
            const receiver = pop();
            if (receiver.kind === 'passengers') {
                const count = state.passengers ?? 0;
                if (member === 'size') stack.push({ kind: 'int', value: count });
                else if (member === 'isEmpty') stack.push({ kind: 'int', value: count === 0 ? 1 : 0 });
                else throw new Error(`${name} reads the passenger list with ${member}`);
            } else if (receiver.kind !== 'this')
                throw new Error(`${name} calls ${member} on something other than the entity`);
            else if (member === 'getPassengers') stack.push({ kind: 'passengers' });
            else if (member === 'isVehicle') stack.push({ kind: 'int', value: (state.passengers ?? 0) > 0 ? 1 : 0 });
            else if (member in state.getters) {
                const value = state.getters[member];
                stack.push({ kind: 'int', value: typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? 0) });
            } else if (argumentCount === 0)
                stack.push({ kind: 'int', value: evaluateJavaMethod(className, member, state, depth + 1) });
            else throw new Error(`${name} calls ${member}, which the state does not answer`);
        } else throw new Error(`${name} uses opcode 0x${opcode.toString(16)}, which the evaluator does not model`);
    }
    throw new Error(`${name} does not return`);
};

/**
 * The int bound a method passes to `RandomSource.nextInt(int)`, which is how Java writes a one in
 * `n` chance such as a taming roll.
 *
 * @returns Every bound, in code order.
 */
export const javaRandomBounds = (className: string, methodName: string): readonly number[] => {
    const method = pinnedJavaClassFile(className)?.methods.find((candidate) => candidate.name === methodName);
    const bounds: number[] = [];
    const instructions = method?.instructions ?? [];
    for (const [index, instruction] of instructions.entries()) {
        if (instruction.member !== 'net/minecraft/util/RandomSource.nextInt' || instruction.descriptor !== '(I)I')
            continue;
        const pushed = instructions[index - 1]?.constant;
        if (typeof pushed === 'number') bounds.push(pushed);
    }
    return bounds;
};

/** Whether an instruction stores an int local: `istore` or `istore_0` to `istore_3`. */
const storesInt = (instruction: JavaInstruction): boolean =>
    instruction.opcode === OPCODES.ISTORE || (instruction.opcode >= 0x3b && instruction.opcode <= 0x3e);

/** Whether an instruction loads an int local: `iload` or `iload_0` to `iload_3`. */
const loadsInt = (instruction: JavaInstruction): boolean =>
    instruction.opcode === OPCODES.ILOAD || (instruction.opcode >= 0x1a && instruction.opcode <= 0x1d);

/**
 * The int a method's `if (stack.is(Items.X))` chain assigns to the local it finally passes to a
 * method, item by item, such as the temper `AbstractHorse.handleEating` hands `modifyTemper`.
 * An item whose branch never assigns it gets 0, the local's starting value.
 *
 * @param className - The class that declares the method.
 * @param methodName - The method, such as `handleEating`.
 * @param consumer - The member the local is passed to, as `owner/Binary/Name.member`.
 * @returns Each item's value, by its `Items` field name in lower case, such as `golden_apple`.
 */
export const javaItemBranchValues = (
    className: string,
    methodName: string,
    consumer: string
): ReadonlyMap<string, number> => {
    const method = pinnedJavaClassFile(className)?.methods.find((candidate) => candidate.name === methodName);
    const instructions = method?.instructions ?? [];
    const call = instructions.findIndex((instruction) =>
        instruction.member?.endsWith(`.${consumer.split('.').at(-1)}`)
    );
    const load = instructions
        .slice(0, Math.max(0, call))
        .findLast((instruction) => loadsInt(instruction) && instruction.local !== undefined);
    if (call < 0 || load?.local === undefined)
        throw new Error(`${className}.${methodName} passes no local to ${consumer}`);

    const values = new Map<string, number>();
    let pending: string[] = [];
    for (const [index, instruction] of instructions.entries()) {
        if (index >= call) break;
        const field = instruction.member;
        if (instruction.opcode === 0xb2 && field?.startsWith('net/minecraft/world/item/Items.') === true) {
            pending.push(field.slice(field.lastIndexOf('.') + 1).toLowerCase());
            continue;
        }
        if (storesInt(instruction) && instruction.local === load.local) {
            const pushed = instructions[index - 1]?.constant;
            if (typeof pushed === 'number') for (const item of pending) values.set(item, pushed);
        } else if (instruction.opcode === OPCODES.GOTO) {
            for (const item of pending) if (!values.has(item)) values.set(item, 0);
            pending = [];
        }
    }
    for (const item of pending) if (!values.has(item)) values.set(item, 0);
    return values;
};

/**
 * The int constants a method pushes as the last argument of each call to a member, such as the
 * 5 `RunAroundLikeCrazyGoal.tick` passes `modifyTemper` or the 3 `Piglin.startRiding` passes
 * `getTopPassenger`.
 */
export const javaConstantsPassedTo = (className: string, methodName: string, member: string): readonly number[] => {
    const instructions =
        pinnedJavaClassFile(className)?.methods.find((candidate) => candidate.name === methodName)?.instructions ?? [];
    return instructions.flatMap((instruction, index) => {
        const pushed = instructions[index - 1]?.constant;
        return instruction.member === member && typeof pushed === 'number' ? [pushed] : [];
    });
};

/**
 * The passenger count below which a vehicle's `mobInteract` seats the player, read from its
 * `getPassengers().size() < n` test before `doPlayerRide`, or undefined when the method seats a
 * player without counting.
 */
export const javaPlayerRideLimit = (className: string): number | undefined => {
    const resolved = javaResolveMethod(className, 'mobInteract');
    const instructions = resolved?.method.instructions ?? [];
    const ride = instructions.findIndex((instruction) => instruction.member?.endsWith('.doPlayerRide') === true);
    for (let index = ride - 1; index >= 2; index--) {
        const instruction = instructions[index];
        if (instruction?.opcode !== OPCODES.IF_ICMPGE) continue;
        const limit = instructions[index - 1]?.constant;
        if (instructions[index - 2]?.member === 'java/util/List.size' && typeof limit === 'number') return limit;
    }
    return undefined;
};
