import { instructionLength, parseJavaClass } from './classFile.ts';
import type { JavaClass, JavaCodeMethod, JavaConstant, JavaMemberRef } from './classFile.ts';

/**
 * Reads the goals each Java mob registers, with their constructor arguments, out of a Java
 * Edition server jar's bytecode.
 *
 * A mob's `registerGoals` builds its goals with constants, such as
 * `new LookAtPlayerGoal(this, Player.class, 6.0F)`. This module runs that bytecode symbolically:
 * it tracks constants, `this`, class literals, lambdas and constructed objects through the operand
 * stack, records every goal handed to `GoalSelector.addGoal`, and follows each goal's constructor
 * chain (a mob's own subclass such as `Fox$FoxPanicGoal`, then the vanilla class's `this(...)`
 * overloads) down to the constructor that takes every parameter, so the defaults Java fills in
 * come from Java's code too. Parameter names come from the local variable tables Mojang's jar keeps.
 *
 * Nothing here runs a class. A branch's two arms are both walked, which is what a list of every
 * goal a mob can register wants: a skeleton registers its bow goal or its melee goal by held item,
 * and both are its goals.
 */

/** A value on the symbolic operand stack. */
export type JavaValue =
    | JavaConstant
    | { readonly kind: 'self' }
    | JavaObject
    | { readonly kind: 'field'; readonly field: JavaMemberRef }
    | { readonly kind: 'lambda'; readonly target: JavaMemberRef | undefined }
    | { readonly kind: 'array'; readonly items: JavaValue[] }
    | {
          readonly kind: 'call';
          readonly method: JavaMemberRef;
          readonly receiver: JavaValue | undefined;
          readonly args: readonly JavaValue[];
      }
    | { readonly kind: 'unknown' };

/** An object a `new` instruction made, filled in when its constructor runs. */
export interface JavaObject {
    readonly kind: 'object';
    readonly className: string;
    /** The constructor that ran and its arguments, once it has. */
    constructed?: { readonly descriptor: string; readonly args: readonly JavaValue[] };
    /** The instance methods called on it afterwards, such as `setAlertOthers`, with their arguments. */
    readonly calls: { readonly name: string; readonly args: readonly JavaValue[] }[];
}

/** One goal a Java mob registers. */
export interface JavaGoal {
    /** The vanilla goal class it is, by simple name, such as `LookAtPlayerGoal`. */
    readonly goal: string;
    /**
     * Every class from the one constructed down to `Goal`, by simple name, such as
     * `Fox$FoxPanicGoal`, `PanicGoal`.
     */
    readonly classes: readonly string[];
    /** Every named constructor parameter along the chain, with the value the vanilla class ends up with. */
    readonly params: ReadonlyMap<string, JavaValue>;
    /** The instance methods called on the goal after construction, such as `setAlertOthers`. */
    readonly calls: readonly { readonly name: string; readonly args: readonly JavaValue[] }[];
    /** Which selector it was added to. */
    readonly selector: 'goal' | 'target';
    /** The priority it was added with, when that was a constant. */
    readonly priority: number | undefined;
}

const GOAL_PACKAGE = 'net/minecraft/world/entity/ai/goal/';
const ENTITY_TYPES = 'net/minecraft/world/entity/EntityTypes';
const MOB = 'net/minecraft/world/entity/Mob';
const TABLESWITCH_OP = 0xaa;
const LOOKUPSWITCH_OP = 0xab;
const UNKNOWN: JavaValue = { kind: 'unknown' };
const SELF: JavaValue = { kind: 'self' };

const simpleName = (className: string): string => className.slice(className.lastIndexOf('/') + 1);

/** A method descriptor's parameter types, each with whether it takes two stack slots, and its return type. */
const parseDescriptor = (descriptor: string): { readonly params: readonly boolean[]; readonly returns: string } => {
    const params: boolean[] = [];
    let at = 1;
    while (descriptor[at] !== ')') {
        const start = at;
        while (descriptor[at] === '[') at += 1;
        if (descriptor[at] === 'L') at = descriptor.indexOf(';', at);
        params.push(at === start && (descriptor[at] === 'J' || descriptor[at] === 'D'));
        at += 1;
    }
    return { params, returns: descriptor.slice(at + 1) };
};

/** Where a constructor's object goes when it calls another constructor on itself. */
interface ConstructorCall {
    readonly owner: string;
    readonly descriptor: string;
    readonly args: readonly JavaValue[];
}

/** What the walker reports back to the analysis driving it. */
interface WalkHooks {
    /** The object standing for the instance under construction, when walking a goal's constructor. */
    readonly constructing?: JavaObject;
    /** Called when the instance under construction calls a constructor on itself. */
    readonly onSelfConstructor?: (call: ConstructorCall) => void;
    /** Called when a constructor finishes on an object a `new` made. */
    readonly onConstructed?: (object: JavaObject) => void;
    /** Called for `GoalSelector.addGoal`. */
    readonly onAddGoal?: (selector: JavaValue, priority: JavaValue, goal: JavaValue) => void;
    /** Called for a call on `this` to another of the mob's own methods. */
    readonly onSelfCall?: (method: JavaMemberRef, special: boolean) => void;
    /** The mob's instance fields assigned so far, which `getfield` on `this` reads and `putfield` writes. */
    readonly fields?: Map<string, JavaValue>;
    /** A class and its superclasses, nearest first, which tells a builder-style call from any other. */
    readonly superChain: (className: string) => readonly string[];
}

const isWide = (value: JavaValue | undefined): boolean => value?.kind === 'number' && value.wide;

const arithmetic = (opcode: number, left: JavaValue, right: JavaValue): JavaValue => {
    if (left.kind !== 'number' || right.kind !== 'number') return UNKNOWN;
    // iadd..dadd, isub..dsub, imul..dmul, idiv..ddiv, in groups of four.
    const group = Math.floor((opcode - 0x60) / 4);
    const value =
        group === 0
            ? left.value + right.value
            : group === 1
              ? left.value - right.value
              : group === 2
                ? left.value * right.value
                : group === 3 && right.value !== 0
                  ? left.value / right.value
                  : undefined;
    return value === undefined ? UNKNOWN : { kind: 'number', value, wide: left.wide };
};

/**
 * Walks one method's bytecode with a symbolic stack, visiting each instruction once along a
 * worklist of branch targets, and reports what it sees through `hooks`.
 */
const walk = (owner: JavaClass, method: JavaCodeMethod, locals: JavaValue[], hooks: WalkHooks): void => {
    const code = method.code;
    if (code === undefined) return;
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const visited = new Set<number>();
    const pending: { readonly pc: number; readonly stack: JavaValue[]; readonly locals: JavaValue[] }[] = [
        { pc: 0, stack: [], locals }
    ];

    while (pending.length > 0) {
        const state = pending.pop();
        if (state === undefined) break;
        const { stack } = state;
        const vars = state.locals;
        let pc = state.pc;
        const pop = (): JavaValue => stack.pop() ?? UNKNOWN;
        const popMany = (count: number): JavaValue[] => {
            const values: JavaValue[] = [];
            for (let index = 0; index < count; index++) values.unshift(pop());
            return values;
        };
        const branch = (target: number): void => {
            if (!visited.has(target)) pending.push({ pc: target, stack: [...stack], locals: [...vars] });
        };

        while (pc < code.length && !visited.has(pc)) {
            visited.add(pc);
            const opcode = view.getUint8(pc);
            const next = pc + instructionLength(code, pc);
            const u1 = (): number => view.getUint8(pc + 1);
            const u2 = (): number => view.getUint16(pc + 1);

            if (opcode === 0x00) {
                // nop
            } else if (opcode === 0x01) stack.push(UNKNOWN);
            else if (opcode >= 0x02 && opcode <= 0x08)
                stack.push({ kind: 'number', value: opcode - 0x03, wide: false });
            else if (opcode === 0x09 || opcode === 0x0a)
                stack.push({ kind: 'number', value: opcode - 0x09, wide: true });
            else if (opcode >= 0x0b && opcode <= 0x0d)
                stack.push({ kind: 'number', value: opcode - 0x0b, wide: false });
            else if (opcode === 0x0e || opcode === 0x0f)
                stack.push({ kind: 'number', value: opcode - 0x0e, wide: true });
            else if (opcode === 0x10) stack.push({ kind: 'number', value: view.getInt8(pc + 1), wide: false });
            else if (opcode === 0x11) stack.push({ kind: 'number', value: view.getInt16(pc + 1), wide: false });
            else if (opcode === 0x12) stack.push(owner.constant(u1()) ?? UNKNOWN);
            else if (opcode === 0x13 || opcode === 0x14) stack.push(owner.constant(u2()) ?? UNKNOWN);
            else if (opcode >= 0x15 && opcode <= 0x19) stack.push(vars[u1()] ?? UNKNOWN);
            else if (opcode >= 0x1a && opcode <= 0x2d) stack.push(vars[(opcode - 0x1a) % 4] ?? UNKNOWN);
            else if (opcode >= 0x2e && opcode <= 0x35) {
                popMany(2);
                stack.push(UNKNOWN);
            } else if (opcode >= 0x36 && opcode <= 0x3a) vars[u1()] = pop();
            else if (opcode >= 0x3b && opcode <= 0x4e) vars[(opcode - 0x3b) % 4] = pop();
            else if (opcode >= 0x4f && opcode <= 0x56) {
                const [array, index, value] = popMany(3);
                if (array?.kind === 'array' && index?.kind === 'number' && value !== undefined) {
                    array.items[index.value] = value;
                }
            } else if (opcode === 0x57) pop();
            else if (opcode === 0x58) {
                if (!isWide(pop())) pop();
            } else if (opcode === 0x59) stack.push(stack.at(-1) ?? UNKNOWN);
            else if (opcode === 0x5a) {
                const [second, first] = popMany(2);
                if (second !== undefined && first !== undefined) stack.push(first, second, first);
            } else if (opcode === 0x5b) {
                const [third, second, first] = popMany(3);
                if (third !== undefined && second !== undefined && first !== undefined) {
                    stack.push(first, third, second, first);
                }
            } else if (opcode === 0x5c) {
                const top = stack.at(-1);
                if (isWide(top) && top !== undefined) stack.push(top);
                else stack.push(...stack.slice(-2));
            } else if (opcode >= 0x5d && opcode <= 0x5e) {
                // dup2_x1 and dup2_x2 never appear in goal construction; keep the depth right for the wide case.
                const top = pop();
                const below = popMany(opcode === 0x5d ? 1 : 2);
                stack.push(top, ...below, top);
            } else if (opcode === 0x5f) {
                const [second, first] = popMany(2);
                if (second !== undefined && first !== undefined) stack.push(first, second);
            } else if (opcode >= 0x60 && opcode <= 0x73) {
                const [left, right] = popMany(2);
                stack.push(left === undefined || right === undefined ? UNKNOWN : arithmetic(opcode, left, right));
            } else if (opcode >= 0x74 && opcode <= 0x77) {
                const value = pop();
                stack.push(value.kind === 'number' ? { ...value, value: -value.value } : UNKNOWN);
            } else if (opcode >= 0x78 && opcode <= 0x83) {
                popMany(2);
                stack.push(UNKNOWN);
            } else if (opcode === 0x84) {
                // iinc
            } else if (opcode >= 0x85 && opcode <= 0x93) {
                const value = pop();
                // i2l, f2l, d2l, i2d, l2d, f2d widen; l2i, l2f, d2i, d2f, f2i narrow.
                const wide = [0x85, 0x87, 0x8a, 0x8c, 0x8d, 0x8f].includes(opcode);
                stack.push(value.kind === 'number' ? { kind: 'number', value: value.value, wide } : UNKNOWN);
            } else if (opcode >= 0x94 && opcode <= 0x98) {
                popMany(2);
                stack.push(UNKNOWN);
            } else if (opcode >= 0x99 && opcode <= 0x9e) {
                pop();
                branch(pc + view.getInt16(pc + 1));
            } else if (opcode >= 0x9f && opcode <= 0xa6) {
                popMany(2);
                branch(pc + view.getInt16(pc + 1));
            } else if (opcode === 0xa7) {
                branch(pc + view.getInt16(pc + 1));
                break;
            } else if (opcode === 0xc8) {
                branch(pc + view.getInt32(pc + 1));
                break;
            } else if (opcode === TABLESWITCH_OP || opcode === LOOKUPSWITCH_OP) {
                pop();
                const operands = (pc + 4) & ~3;
                branch(pc + view.getInt32(operands));
                if (opcode === TABLESWITCH_OP) {
                    const cases = view.getInt32(operands + 8) - view.getInt32(operands + 4) + 1;
                    for (let entry = 0; entry < cases; entry++) branch(pc + view.getInt32(operands + 12 + 4 * entry));
                } else {
                    const cases = view.getInt32(operands + 4);
                    for (let entry = 0; entry < cases; entry++) branch(pc + view.getInt32(operands + 12 + 8 * entry));
                }
                break;
            } else if (opcode >= 0xac && opcode <= 0xb1) break;
            else if (opcode === 0xb2) stack.push({ kind: 'field', field: owner.member(u2()) });
            else if (opcode === 0xb3) pop();
            else if (opcode === 0xb4) {
                const field = owner.member(u2());
                const target = pop();
                stack.push(
                    target.kind === 'self'
                        ? (hooks.fields?.get(field.name) ?? { kind: 'field', field })
                        : { kind: 'field', field }
                );
            } else if (opcode === 0xb5) {
                const field = owner.member(u2());
                const value = pop();
                if (pop().kind === 'self') hooks.fields?.set(field.name, value);
            } else if (opcode >= 0xb6 && opcode <= 0xb9) {
                const invoked = owner.member(u2());
                const { params, returns } = parseDescriptor(invoked.descriptor);
                const args = popMany(params.length);
                const receiver = opcode === 0xb8 ? undefined : pop();
                if (invoked.name === '<init>') {
                    if (receiver !== undefined && receiver === hooks.constructing) {
                        hooks.onSelfConstructor?.({ owner: invoked.owner, descriptor: invoked.descriptor, args });
                    } else if (receiver?.kind === 'object' && receiver.constructed === undefined) {
                        receiver.constructed = { descriptor: invoked.descriptor, args };
                        hooks.onConstructed?.(receiver);
                    }
                } else if (invoked.owner === `${GOAL_PACKAGE}GoalSelector` && invoked.name === 'addGoal') {
                    const [priority, goal] = args;
                    if (receiver !== undefined && priority !== undefined && goal !== undefined) {
                        hooks.onAddGoal?.(receiver, priority, goal);
                    }
                } else if (receiver?.kind === 'self') hooks.onSelfCall?.(invoked, opcode === 0xb7);
                else if (receiver?.kind === 'object') receiver.calls.push({ name: invoked.name, args });

                if (returns !== 'V') {
                    // A builder-style call on a goal, such as `setAlertOthers`, hands the goal back,
                    // typed as the goal's class or one it extends.
                    const builder =
                        receiver?.kind === 'object' &&
                        returns.startsWith('L') &&
                        hooks.superChain(receiver.className).includes(returns.slice(1, -1));
                    stack.push(
                        builder && receiver !== undefined ? receiver : { kind: 'call', method: invoked, receiver, args }
                    );
                }
            } else if (opcode === 0xba) {
                const index = u2();
                popMany(parseDescriptor(owner.dynamicDescriptor(index)).params.length);
                stack.push({ kind: 'lambda', target: owner.lambdaTarget(index) });
            } else if (opcode === 0xbb) {
                stack.push({ kind: 'object', className: owner.className(u2()), calls: [] });
            } else if (opcode === 0xbc || opcode === 0xbd) {
                const size = pop();
                stack.push({
                    kind: 'array',
                    items: size.kind === 'number' ? new Array<JavaValue>(size.value).fill(UNKNOWN) : []
                });
            } else if (opcode === 0xbe) {
                pop();
                stack.push(UNKNOWN);
            } else if (opcode === 0xbf) break;
            else if (opcode === 0xc0) {
                // checkcast leaves the reference as it is.
            } else if (opcode === 0xc1) {
                pop();
                stack.push(UNKNOWN);
            } else if (opcode === 0xc2 || opcode === 0xc3) pop();
            else if (opcode === 0xc4) {
                const inner = u1();
                const slot = view.getUint16(pc + 2);
                if (inner >= 0x15 && inner <= 0x19) stack.push(vars[slot] ?? UNKNOWN);
                else if (inner >= 0x36 && inner <= 0x3a) vars[slot] = pop();
            } else if (opcode === 0xc5) {
                popMany(view.getUint8(pc + 3));
                stack.push({ kind: 'array', items: [] });
            } else if (opcode === 0xc6 || opcode === 0xc7) {
                pop();
                branch(pc + view.getInt16(pc + 1));
            } else
                throw new Error(
                    `opcode 0x${opcode.toString(16)} at ${pc} in ${owner.name}.${method.name} is not handled`
                );

            pc = next;
        }
    }
};

/** A method's locals at entry: `this` when it has one, then each argument, a wide one taking two slots. */
const entryLocals = (self: JavaValue | undefined, descriptor: string, args: readonly JavaValue[]): JavaValue[] => {
    const locals: JavaValue[] = self === undefined ? [] : [self];
    parseDescriptor(descriptor).params.forEach((wide, index) => {
        locals.push(args[index] ?? UNKNOWN);
        if (wide) locals.push(UNKNOWN);
    });
    return locals;
};

/** Reads the goals of the Java mobs in one jar. */
export interface JavaGoalReader {
    /** A class of the jar, parsed once, or undefined when the jar holds no such class. */
    javaClass(className: string): JavaClass | undefined;
    /** A class and its superclasses, nearest first, as far as the jar holds them. */
    javaSuperChain(className: string): readonly string[];
    /**
     * The class each Java entity type constructs, read from the generic signature of its
     * `EntityTypes` field, such as `EntityType<Cow> COW`.
     *
     * @param javaId - The namespaced entity type, such as `minecraft:cow`.
     * @returns The class's binary name, or undefined when no field names the type.
     */
    javaEntityClass(javaId: string): string | undefined;
    /** Every entity type the jar's `EntityTypes` declares, with the class it constructs. */
    javaEntityClasses(): ReadonlyMap<string, string>;
    /**
     * Every goal a Java mob class can register, from its own methods and its superclasses' up to
     * `Mob`, each method resolved as a call on that class would resolve it.
     *
     * @param entityClass - The mob's binary class name, from {@link JavaGoalReader.javaEntityClass}.
     */
    javaGoalsOf(entityClass: string): readonly JavaGoal[];
    /**
     * The static fields a method's code reads, such as `ItemTags.COW_FOOD` in a tempt predicate,
     * following its calls into the receiver's own methods, such as a lambda that calls `this.isFood`.
     *
     * @param method - The method, as a lambda target or a method reference names it.
     * @param receiverClass - The class to resolve an instance method from, for a method reference
     *   such as `this::isFood` that a subclass overrides.
     * @param depth - How many calls deep to follow.
     */
    javaStaticsRead(method: JavaMemberRef, receiverClass?: string, depth?: number): readonly JavaMemberRef[];
    /**
     * The numeric constants a method's code loads, in order, such as the `0.8F` jump chance in
     * `FloatGoal.tick` or the `40` and `40` of `LookAtPlayerGoal.start`'s `40 + nextInt(40)`.
     *
     * @param className - The declaring class's binary name.
     * @param methodName - The method's name; the first declaration with that name is read.
     */
    javaMethodNumbers(className: string, methodName: string): readonly number[];
}

/**
 * Builds a reader over one jar's classes.
 *
 * @param classBytes - The bytes of one class by binary name, or undefined when the jar holds none.
 */
export const createJavaGoalReader = (classBytes: (className: string) => Uint8Array | undefined): JavaGoalReader => {
    const classCache = new Map<string, JavaClass | undefined>();
    const javaClass = (className: string): JavaClass | undefined => {
        if (!classCache.has(className)) {
            const bytes = classBytes(className);
            classCache.set(className, bytes === undefined ? undefined : parseJavaClass(bytes));
        }
        return classCache.get(className);
    };

    const javaSuperChain = (className: string): readonly string[] => {
        const chain: string[] = [];
        for (let current: string | undefined = className; current !== undefined;) {
            chain.push(current);
            current = javaClass(current)?.superName;
        }
        return chain;
    };

    let entityClasses: ReadonlyMap<string, string> | undefined;
    const javaEntityClasses = (): ReadonlyMap<string, string> => {
        if (entityClasses === undefined) {
            const types = javaClass(ENTITY_TYPES);
            if (types === undefined) throw new Error(`the server jar holds no ${ENTITY_TYPES}`);
            const found = new Map<string, string>();
            for (const field of types.fields) {
                const match = field.signature?.match(/^Lnet\/minecraft\/world\/entity\/EntityType<L([^<;]+)[<;]/);
                if (match?.[1] !== undefined) found.set(`minecraft:${field.name.toLowerCase()}`, match[1]);
            }
            entityClasses = found;
        }
        return entityClasses;
    };
    const javaEntityClass = (javaId: string): string | undefined => javaEntityClasses().get(javaId);

    const goalCache = new Map<string, readonly JavaGoal[]>();

    /** `Mob.registerGoals`, by name and descriptor. */
    const REGISTER_GOALS = 'registerGoals()V';

    /**
     * Follows a constructed goal through its constructors to `Goal`, collecting each named
     * parameter with the value it ends up holding.
     */
    const resolveGoal = (object: JavaObject): Omit<JavaGoal, 'selector' | 'priority'> | undefined => {
        if (object.constructed === undefined) return undefined;
        const classes: string[] = [];
        const params = new Map<string, JavaValue>();
        let goal: string | undefined;
        let call: ConstructorCall | undefined = {
            owner: object.className,
            descriptor: object.constructed.descriptor,
            args: object.constructed.args
        };
        for (let depth = 0; call !== undefined && depth < 24; depth++) {
            const current: ConstructorCall = call;
            if (current.owner === `${GOAL_PACKAGE}Goal` || current.owner === 'java/lang/Object') break;
            const owner = javaClass(current.owner);
            const method = owner?.methods.find(
                (entry) => entry.name === '<init>' && entry.descriptor === current.descriptor
            );
            if (owner === undefined || method === undefined) return undefined;

            if (classes.at(-1) !== simpleName(current.owner)) classes.push(simpleName(current.owner));
            if (goal === undefined && current.owner.startsWith(GOAL_PACKAGE)) goal = simpleName(current.owner);

            const locals = entryLocals(object, current.descriptor, current.args);
            for (const [slot, name] of method.parameterNames) {
                const value = locals[slot];
                if (slot > 0 && value !== undefined) params.set(name, value);
            }
            call = undefined;
            walk(owner, method, locals, {
                superChain: javaSuperChain,
                constructing: object,
                onSelfConstructor: (next) => {
                    call ??= next;
                }
            });
        }
        // A mob's own goal that extends `Goal` directly, such as `Raider$RaiderCelebration`, is
        // named by its own class.
        const named = goal ?? classes[0];
        return named === undefined ? undefined : { goal: named, classes, params, calls: object.calls };
    };

    /** Whether a method's code hands anything to `GoalSelector.addGoal`, which is all the analysis needs to walk. */
    const addsGoals = (owner: JavaClass, method: JavaCodeMethod): boolean => {
        const code = method.code;
        if (code === undefined) return false;
        const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
        for (let pc = 0; pc < code.length; pc += instructionLength(code, pc)) {
            const opcode = view.getUint8(pc);
            if (opcode < 0xb6 || opcode > 0xb9) continue;
            const invoked = owner.member(view.getUint16(pc + 1));
            if (invoked.owner === `${GOAL_PACKAGE}GoalSelector` && invoked.name === 'addGoal') return true;
        }
        return false;
    };

    /** The methods a method's code invokes, as `name` plus descriptor, with whether each call is `invokespecial`. */
    const invokedMethods = (owner: JavaClass, method: JavaCodeMethod): { key: string; special: boolean }[] => {
        const code = method.code;
        if (code === undefined) return [];
        const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
        const invoked: { key: string; special: boolean }[] = [];
        for (let pc = 0; pc < code.length; pc += instructionLength(code, pc)) {
            const opcode = view.getUint8(pc);
            if (opcode < 0xb6 || opcode > 0xb7) continue;
            const member = owner.member(view.getUint16(pc + 1));
            invoked.push({ key: `${member.name}${member.descriptor}`, special: opcode === 0xb7 });
        }
        return invoked;
    };

    /**
     * The methods no goal can come from because the mob's `registerGoals` never reaches them: when
     * the nearest `registerGoals` override does not call `super.registerGoals()`, an ancestor's
     * `registerGoals` and the methods only it calls never run. Java's `Camel` overrides it with an
     * empty body, so `AbstractHorse.addBehaviourGoals` never adds its panic and tempt goals.
     *
     * @returns Name-and-descriptor keys to leave out.
     */
    const unreachedGoalMethods = (own: readonly JavaClass[]): ReadonlySet<string> => {
        const declaration = (owner: JavaClass) =>
            owner.methods.find((method) => `${method.name}${method.descriptor}` === REGISTER_GOALS);
        const nearest = own.findIndex((owner) => declaration(owner) !== undefined);
        const top = nearest < 0 ? undefined : own[nearest];
        const topMethod = top === undefined ? undefined : declaration(top);
        if (top === undefined || topMethod === undefined) return new Set();
        const calledByTop = invokedMethods(top, topMethod);
        if (calledByTop.some((call) => call.special && call.key === REGISTER_GOALS)) return new Set();

        const reached = new Set(calledByTop.map((call) => call.key));
        const skipped = new Set<string>();
        for (const ancestor of own.slice(nearest + 1)) {
            const method = declaration(ancestor);
            if (method === undefined) continue;
            for (const call of invokedMethods(ancestor, method)) if (!reached.has(call.key)) skipped.add(call.key);
        }
        return skipped;
    };

    const javaGoalsOf = (entityClass: string): readonly JavaGoal[] => {
        const cached = goalCache.get(entityClass);
        if (cached !== undefined) return cached;

        const chain = javaSuperChain(entityClass);
        const mobIndex = chain.indexOf(MOB);
        const own = (mobIndex < 0 ? chain : chain.slice(0, mobIndex)).flatMap((name) => javaClass(name) ?? []);
        const unreached = unreachedGoalMethods(own);

        const walked = new Set<string>();
        const queue: { readonly owner: JavaClass; readonly method: JavaCodeMethod }[] = [];
        const fields = new Map<string, JavaValue>();
        const recorded = new Map<JavaObject, JavaGoal>();
        const hooks: WalkHooks = {
            superChain: javaSuperChain,
            fields,
            onAddGoal: (selector, priority, goal) => {
                if (goal.kind !== 'object' || recorded.has(goal)) return;
                const resolved = resolveGoal(goal);
                if (resolved === undefined) return;
                const selectorName = selector.kind === 'field' ? selector.field.name : '';
                recorded.set(goal, {
                    ...resolved,
                    selector: selectorName === 'targetSelector' ? 'target' : 'goal',
                    priority: priority.kind === 'number' ? priority.value : undefined
                });
            },
            onSelfCall: (method, special) => {
                if (special)
                    queueDeclaration(
                        method,
                        own.findIndex((owner) => owner.name === method.owner),
                        true
                    );
            }
        };

        // Constructors first, ancestors before descendants, so field-held goals such as a skeleton's
        // bow goal are known when a method adds them.
        for (const owner of [...own].reverse()) {
            for (const method of owner.methods) {
                if (method.name === '<init>') walk(owner, method, entryLocals(SELF, method.descriptor, []), hooks);
            }
        }

        // The declaration a call would reach starting at chain index `from`, queued when it adds goals
        // or, for a `super` call, whatever it does, since it may only pass the call further up.
        function queueDeclaration(
            method: Pick<JavaMemberRef, 'name' | 'descriptor'>,
            from: number,
            force = false
        ): void {
            for (const owner of own.slice(Math.max(0, from))) {
                const declared = owner.methods.find(
                    (entry) => entry.name === method.name && entry.descriptor === method.descriptor
                );
                if (declared === undefined) continue;
                const key = `${owner.name}.${declared.name}${declared.descriptor}`;
                if (!walked.has(key) && !declared.static && (force || addsGoals(owner, declared))) {
                    walked.add(key);
                    queue.push({ owner, method: declared });
                }
                return;
            }
        }
        for (const owner of own) {
            for (const method of owner.methods) {
                if (method.name === '<init>' || method.name === '<clinit>') continue;
                if (unreached.has(`${method.name}${method.descriptor}`)) continue;
                queueDeclaration(method, 0);
            }
        }
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
            walk(next.owner, next.method, entryLocals(SELF, next.method.descriptor, []), hooks);
        }

        const goals = [...recorded.values()];
        goalCache.set(entityClass, goals);
        return goals;
    };

    const javaStaticsRead = (method: JavaMemberRef, receiverClass?: string, depth = 2): readonly JavaMemberRef[] => {
        const chain = receiverClass === undefined ? [method.owner] : javaSuperChain(receiverClass);
        const owners = chain.includes(method.owner) ? chain.slice(chain.indexOf(method.owner)) : [method.owner];
        // A lambda's body is the mob's own synthetic method; resolve an override from the receiver down.
        for (const name of receiverClass === undefined ? owners : [...new Set([...chain, ...owners])]) {
            const owner = javaClass(name);
            const declared = owner?.methods.find(
                (entry) => entry.name === method.name && entry.descriptor === method.descriptor
            );
            const code = declared?.code;
            if (owner === undefined || code === undefined) continue;
            const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
            const statics: JavaMemberRef[] = [];
            for (let pc = 0; pc < code.length; pc += instructionLength(code, pc)) {
                const opcode = view.getUint8(pc);
                if (opcode === 0xb2) statics.push(owner.member(view.getUint16(pc + 1)));
                else if (opcode >= 0xb6 && opcode <= 0xb9 && depth > 0) {
                    const invoked = owner.member(view.getUint16(pc + 1));
                    if (chain.includes(invoked.owner) || invoked.owner === name) {
                        statics.push(...javaStaticsRead(invoked, receiverClass, depth - 1));
                    }
                }
            }
            return statics;
        }
        return [];
    };

    const javaMethodNumbers = (className: string, methodName: string): readonly number[] => {
        const owner = javaClass(className);
        const code = owner?.methods.find((method) => method.name === methodName)?.code;
        if (owner === undefined || code === undefined) return [];
        const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
        const numbers: number[] = [];
        for (let pc = 0; pc < code.length; pc += instructionLength(code, pc)) {
            const opcode = view.getUint8(pc);
            if (opcode >= 0x02 && opcode <= 0x08) numbers.push(opcode - 0x03);
            else if (opcode >= 0x0b && opcode <= 0x0d) numbers.push(opcode - 0x0b);
            else if (opcode === 0x0e || opcode === 0x0f) numbers.push(opcode - 0x0e);
            else if (opcode === 0x10) numbers.push(view.getInt8(pc + 1));
            else if (opcode === 0x11) numbers.push(view.getInt16(pc + 1));
            else if (opcode === 0x12 || opcode === 0x13 || opcode === 0x14) {
                const constant = owner.constant(opcode === 0x12 ? view.getUint8(pc + 1) : view.getUint16(pc + 1));
                if (constant?.kind === 'number') numbers.push(constant.value);
            }
        }
        return numbers;
    };

    return {
        javaClass,
        javaSuperChain,
        javaEntityClass,
        javaEntityClasses,
        javaGoalsOf,
        javaStaticsRead,
        javaMethodNumbers
    };
};
