import type { ScriptApiMembers } from '../generated/scriptApi';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import type { ModuleShape } from './history';

/** One call from a script into a member's implementation. */
export interface ScriptCall {
    readonly engine: ScriptEngine;
    /** The pack whose script made the call, as its binding names it. */
    readonly pack: string;
    /** The call's `this`: the instance, the class for a static member, or undefined for a module function. */
    readonly self: ScriptValue;
    /** The tag the host gave `self` when it made the instance, or 0. See `ScriptApiContext.create`. */
    readonly tag: number;
    /**
     * The state the host gave `self` when it made the instance, or the one a constructor's
     * implementation returned: an empty string when it has none.
     */
    readonly state: string;
    /** Replaces the state of `self`, for a member that changes its own object, such as `ItemStack.amount`. */
    setState(state: string): void;
    /** The state of an object the host made, such as a `BlockPermutation` argument; empty for any other value. */
    stateOf(value: ScriptValue): string;
    /** A plain argument, such as a `Record` of block states, as JSON; undefined when it has none. */
    stringify(value: ScriptValue): string | undefined;
    /**
     * The arguments after the metadata's checks, with each omitted argument's default filled in.
     * A setter's one argument is the value. Handles last until the implementation returns.
     */
    readonly args: readonly ScriptValue[];
}

/**
 * A method's, constructor's or module function's behavior, or a property's getter.
 *
 * A member whose metadata return type is plain data, an interface such as `Vector3` or an array
 * of plain values such as `string[]`, returns it as one JSON string, which the binding parses
 * inside the engine. A constructor may return a string, which becomes the new object's state.
 */
export type MemberFunction = (call: ScriptCall) => ScriptValue;

/** A read-only property's implementation. */
export interface GetterImplementation {
    readonly get: MemberFunction;
}

/** A writable property's implementation. A half left out throws `NotImplementedError` when used. */
export interface AccessorImplementation {
    readonly get?: MemberFunction;
    readonly set?: (call: ScriptCall) => void;
}

/** How a member binds, as `ScriptApiMembers` records it. */
export type MemberSlot = 'method' | 'constructor' | 'getter' | 'accessor';

/** The implementation a member of each slot takes. A member whose slot changed between versions takes any of them. */
export type ImplementationOf<Slot> = Slot extends 'method' | 'constructor'
    ? MemberFunction
    : Slot extends 'getter'
      ? GetterImplementation
      : Slot extends 'accessor'
        ? AccessorImplementation
        : never;

/** Any member's implementation. */
export type Implementation = MemberFunction | GetterImplementation | AccessorImplementation;

/** A generated module name. */
export type ScriptModuleName = keyof ScriptApiMembers;

/** A class of a module with members to implement, or `''` for its module-level functions. */
export type ScriptOwnerName<Module extends ScriptModuleName> = keyof ScriptApiMembers[Module] & string;

/** A member of a class. */
export type ScriptMemberName<
    Module extends ScriptModuleName,
    Owner extends ScriptOwnerName<Module>
> = keyof ScriptApiMembers[Module][Owner] & string;

const keyOf = (module: string, owner: string, member: string): string => `${module}\n${owner}\n${member}`;

/** How a member's implementation takes its arguments. */
export interface ImplementationOptions {
    /**
     * The arguments, by their metadata names, that the implementation converts and checks itself.
     * The binding passes them on unchecked, for a member whose errors BDS words itself, such as
     * `setDynamicProperty`'s value, which refuses `NaN` with `Native variant type conversion
     * failed.` and nothing after it.
     */
    readonly converts?: readonly string[];
}

/**
 * The behavior written for Script API members, by module, class and member. A member with no entry
 * is still present in every script that resolves to a version with it, and throws
 * `NotImplementedError` when used.
 */
export class ScriptApiImplementations {
    private readonly entries = new Map<string, Implementation>();
    private readonly converted = new Map<string, readonly string[]>();

    /**
     * Registers one member's behavior. The generated `ScriptApiMembers` types the names and the
     * implementation's form, so a member the metadata does not have does not compile.
     * @throws {Error} When the member already has one.
     */
    public implement<
        Module extends ScriptModuleName,
        Owner extends ScriptOwnerName<Module>,
        Member extends ScriptMemberName<Module, Owner>
    >(
        module: Module,
        owner: Owner,
        member: Member,
        implementation: ImplementationOf<ScriptApiMembers[Module][Owner][Member]>,
        options: ImplementationOptions = {}
    ): this {
        const key = keyOf(module, owner, member);
        if (this.entries.has(key)) throw new Error(`${owner}.${member} from ${module} is implemented twice`);
        this.entries.set(key, implementation);
        if (options.converts !== undefined) this.converted.set(key, options.converts);
        return this;
    }

    /** The arguments a member's implementation converts itself; see {@link ImplementationOptions.converts}. */
    public converts(module: string, owner: string, member: string): readonly string[] {
        return this.converted.get(keyOf(module, owner, member)) ?? [];
    }

    /** Finds a member's behavior. */
    public find(module: string, owner: string, member: string): Implementation | undefined {
        return this.entries.get(keyOf(module, owner, member));
    }
}

/** Implemented members over members, for one served version. */
export interface ImplementationCoverage {
    readonly implemented: number;
    readonly total: number;
}

/**
 * Counts the members of a version that need behavior and how many have it: every method,
 * constructor and property of a class, an iterable class's `next`, and every module function.
 * Enums, constants, errors and interfaces need none.
 */
export const implementationCoverage = (
    shape: ModuleShape,
    implementations: ScriptApiImplementations
): ImplementationCoverage => {
    let implemented = 0;
    let total = 0;
    const count = (owner: string, member: string): void => {
        total++;
        if (implementations.find(shape.module, owner, member) !== undefined) implemented++;
    };
    for (const { name, declaration, members } of shape.declarations.values()) {
        if (declaration.kind === 'function') count('', name);
        if (declaration.kind !== 'class') continue;
        for (const [member, value] of members) if (value.kind !== 'constant') count(name, member);
        if (declaration.iterator !== undefined && !members.has('next')) count(name, 'next');
    }
    return { implemented, total };
};
