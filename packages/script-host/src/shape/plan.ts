/**
 * What the binding hands the engine runtime to install one module: each export with the checks
 * its members run, as JSON. The binding builds it from a module shape, with every type
 * reduced to what a check needs and every member given the id the host dispatches on.
 */
import type { Privilege } from './format';

/** A value check, from a member's metadata type. */
export type RuntimeType =
    | { readonly kind: 'any' | 'boolean' | 'string' | 'number' | 'undefined' }
    /** A closure; `signature` is how BDS's errors write its type, such as `() => void`. */
    | { readonly kind: 'function'; readonly signature: string }
    | { readonly kind: 'instance' | 'enum'; readonly module: string; readonly name: string }
    /** An interface or a map: any object. */
    | { readonly kind: 'object'; readonly name: string }
    | { readonly kind: 'array'; readonly element: RuntimeType }
    | { readonly kind: 'optional'; readonly type: RuntimeType }
    | { readonly kind: 'variant'; readonly types: readonly RuntimeType[] }
    /** An argument the host converts and checks itself, which the runtime passes on as it is. */
    | { readonly kind: 'host' };

/** One argument's checks. */
export interface RuntimeArgument {
    readonly type: RuntimeType;
    /** Whether the argument may be left out or `undefined`. */
    readonly optional: boolean;
    /** The value an omitted argument takes. */
    readonly default?: string | number | boolean;
    readonly min?: number;
    readonly max?: number;
    readonly maxLength?: number;
}

/** A call into the host: its member id and the checks its arguments pass first. */
export interface RuntimeCall {
    readonly id: number;
    readonly arguments: readonly RuntimeArgument[];
    /** How many arguments a call must pass. */
    readonly required: number;
    /**
     * Set when the member returns plain data, an interface or an array of plain values, which the
     * host passes as one JSON string and the runtime parses.
     */
    readonly json?: true;
}

/** A member of a class. */
export type RuntimeMember =
    | { readonly kind: 'method'; readonly name: string; readonly static: boolean; readonly call: RuntimeCall }
    | {
          readonly kind: 'property';
          readonly name: string;
          readonly static: boolean;
          readonly get: number;
          /** Set when the getter returns plain data as JSON, as {@link RuntimeCall.json} is. */
          readonly json?: true;
          /** Absent for a read-only property. Its one argument is the value. */
          readonly set?: RuntimeCall;
      }
    | {
          readonly kind: 'constant';
          readonly name: string;
          readonly static: boolean;
          readonly value: string | number | boolean;
      };

/** One name a module exports. */
export type RuntimeExport =
    | {
          readonly kind: 'class';
          readonly name: string;
          readonly base?: { readonly module: string; readonly name: string };
          /** Absent when scripts cannot construct the class. */
          readonly construct?: RuntimeCall;
          readonly iterable: boolean;
          readonly members: readonly RuntimeMember[];
      }
    | {
          readonly kind: 'error';
          readonly name: string;
          readonly construct?: RuntimeCall;
          readonly properties: readonly string[];
      }
    | { readonly kind: 'enum'; readonly name: string; readonly values: readonly [string, string | number | boolean][] }
    | { readonly kind: 'constant'; readonly name: string; readonly value: string | number | boolean }
    | { readonly kind: 'object'; readonly name: string; readonly module: string; readonly className: string }
    | { readonly kind: 'function'; readonly name: string; readonly call: RuntimeCall };

/** Everything one module installs, with each class after the class it extends. */
export interface RuntimePlan {
    readonly module: string;
    readonly exports: readonly RuntimeExport[];
}

/** What the host dispatches a member id to. */
export interface MemberEntry {
    readonly module: string;
    /** The class or error; empty for a module function. */
    readonly owner: string;
    readonly member: string;
    readonly access: 'call' | 'construct' | 'get' | 'set';
    /** The privileges besides `default` that the member may run under, from its metadata. */
    readonly privilege: readonly Privilege[];
}
