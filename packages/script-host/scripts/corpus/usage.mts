/**
 * Counts which Script API modules, declarations and members a script uses, by walking its syntax
 * tree and following values through the generated shape.
 *
 * The counter parses JavaScript and TypeScript alike with oxc (through `rolldown/utils`), and reads
 * TypeScript sources rather than a build's bundle, so a type annotation such as `(player: Player)`
 * gives the counter a type. It follows a value from an import through property types, method return
 * types, `await`, array elements and destructuring, gives a callback's parameters the types the
 * shape's closure declares, and checks an object literal's keys against the interface it is passed
 * as. `getComponent` with a literal component id gets the component's class. Values it cannot follow,
 * such as a value passed in from another file, are not counted.
 */
import type { ESTree } from 'rolldown/utils';
import { parseSync } from 'rolldown/utils';

import type { ClosureType, ExternalType, ShapeDeclaration, ShapeMember, ShapeType } from '../../src/shape/format.ts';
import { isPrimitiveType } from '../../src/shape/format.ts';
import type { DeclarationShape, ModuleShape } from '../../src/shape/history.ts';

/** What a value in a script is, as far as the counter can tell. */
type Value =
    /** A namespace import, `import * as mc from '@minecraft/server'`. */
    | { readonly kind: 'namespace'; readonly module: string }
    /** A declaration itself: a class, enum, error or function the script names. */
    | { readonly kind: 'static'; readonly module: string; readonly name: string }
    /** A value of a class or interface. */
    | { readonly kind: 'instance'; readonly module: string; readonly name: string }
    | { readonly kind: 'array'; readonly element: Value }
    | { readonly kind: 'promise'; readonly value: Value }
    /** A string the script spells out, kept for `getComponent`'s argument. */
    | { readonly kind: 'string'; readonly value: string };

/** A name a scope binds. */
interface Binding {
    value: Value | undefined;
    /** For an imported name: where it comes from, and whether only types may use it. */
    readonly imported?: { readonly module: string; readonly name: string; readonly typeOnly: boolean };
}

/** A block of bindings, chained to the enclosing one. */
class Scope {
    readonly bindings = new Map<string, Binding>();
    readonly parent: Scope | undefined;
    /** Whether a function body starts here. */
    readonly body: boolean;

    constructor(parent?: Scope, body = false) {
        this.parent = parent;
        this.body = body;
    }

    lookup(name: string): Binding | undefined {
        return this.bindings.get(name) ?? this.parent?.lookup(name);
    }

    /**
     * The binding an assignment to `name` writes. The counter visits a function body where it is
     * written, which is not when it runs, and it may never run. So a name bound outside the
     * nearest function body gets a copy in that body, which the assignment changes instead.
     */
    assignable(name: string): Binding | undefined {
        const own = this.bindings.get(name);
        if (own !== undefined) return own;
        if (!this.body) return this.parent?.assignable(name);
        const outer = this.parent?.lookup(name);
        if (outer === undefined) return undefined;
        const copy = { ...outer };
        this.bindings.set(name, copy);
        return copy;
    }

    declare(name: string, value: Value | undefined): void {
        this.bindings.set(name, { value });
    }
}

/** A member found on a declaration or one of its bases, with the declaration that declares it. */
interface FoundMember {
    readonly module: string;
    readonly owner: string;
    readonly name: string;
    readonly member: ShapeMember;
    /** Whether the owner is an interface, a plain object shape with no behavior to implement. */
    readonly field: boolean;
}

/** Member names every object has, which are never a missing API member. */
const OBJECT_MEMBERS: ReadonlySet<string> = new Set([
    'constructor',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'prototype',
    'toJSON',
    'toLocaleString',
    'toString',
    'valueOf'
]);

/** Array methods whose first argument is a callback over the elements, and what each returns. */
const ARRAY_CALLBACKS: Readonly<Record<string, 'array' | 'element' | 'other'>> = {
    every: 'other',
    filter: 'array',
    find: 'element',
    findLast: 'element',
    flatMap: 'other',
    forEach: 'other',
    map: 'other',
    some: 'other',
    sort: 'array',
    toSorted: 'array'
};

/** Array methods whose callback compares two elements rather than visiting one. */
const ARRAY_COMPARATORS: ReadonlySet<string> = new Set(['sort', 'toSorted']);

/** Array methods without a callback that return an element or the same kind of array. */
const ARRAY_RESULTS: Readonly<Record<string, 'array' | 'element'>> = {
    at: 'element',
    concat: 'array',
    pop: 'element',
    reverse: 'array',
    shift: 'element',
    slice: 'array',
    splice: 'array',
    toReversed: 'array'
};

/** Object keys that hold types or other things no script runs. */
const TYPE_KEYS: ReadonlySet<string> = new Set([
    'typeAnnotation',
    'returnType',
    'typeParameters',
    'typeArguments',
    'superTypeArguments',
    'implements'
]);

/** Whether a value read from a syntax node's field is itself a node. */
const isNode = (value: unknown): value is ESTree.Node =>
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string';

/** Where a use is counted. */
type UseKind = keyof ModuleUses;

/** Uses of one module, each an occurrence count by key. */
export interface ModuleUses {
    /** Declarations (`world`) and members of classes, enums and errors (`World.sendMessage`). */
    readonly uses: Map<string, number>;
    /** Fields of interfaces, such as `Vector3.x` or `EntityQueryOptions.type`. */
    readonly fields: Map<string, number>;
    /** Members the shape lacks on a type it has. */
    readonly unmatched: Map<string, number>;
}

/** A script file to count. */
export interface ScriptFile {
    /** Decides the language by its extension. */
    readonly name: string;
    readonly code: string;
}

/** What the counter needs to know about a pack's modules. */
export interface UsageContext {
    /** Whether an import of this module is a native module rather than an npm library. */
    readonly isNative: (module: string) => boolean;
    /** The shape the pack sees for a module, or undefined when none is generated. */
    readonly shape: (module: string) => ModuleShape | undefined;
}

/** Collects uses across the files of one pack. */
export class UsageCollector {
    /** Uses by module name. */
    readonly modules = new Map<string, ModuleUses>();
    readonly #context: UsageContext;
    readonly #components = new Map<string, Map<string, string>>();
    /** Members a pack adds to an API type through `declare module`, as `module type.member`. */
    readonly #augmented = new Set<string>();

    constructor(context: UsageContext) {
        this.#context = context;
    }

    /**
     * Counts the uses in a pack's files. Parses them all first, so a member one file adds to an API
     * type through `declare module` is the pack's own wherever another file uses it.
     * @returns The parser's first error for each file that had one, by file name.
     */
    addFiles(files: readonly ScriptFile[]): Map<string, string> {
        const errors = new Map<string, string>();
        const programs = files.map((file) => {
            const result = parseSync(file.name, file.code, { sourceType: 'module' });
            const [error] = result.errors;
            if (error !== undefined) errors.set(file.name, error.message);
            return result.program;
        });
        for (const program of programs) this.#augmentations(program.body);
        for (const program of programs) {
            const scope = new Scope();
            for (const statement of program.body) {
                if (statement.type === 'ImportDeclaration') this.#import(statement, scope);
            }
            for (const statement of program.body) this.#visit(statement, scope);
        }
        return errors;
    }

    /** Records the members `declare module '@minecraft/server' { interface Player { ... } }` adds. */
    #augmentations(statements: readonly ESTree.Node[]): void {
        for (const statement of statements) {
            const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
            if (node?.type !== 'TSModuleDeclaration' || node.body?.type !== 'TSModuleBlock') continue;
            if (node.id.type !== 'Literal') {
                // `declare global { ... }` may hold the augmentation in turn.
                this.#augmentations(node.body.body);
                continue;
            }
            const module = node.id.value;
            for (const inner of node.body.body) {
                const declaration = inner.type === 'ExportNamedDeclaration' ? inner.declaration : inner;
                if (declaration?.type === 'TSInterfaceDeclaration') {
                    for (const member of declaration.body.body) {
                        if (
                            (member.type === 'TSPropertySignature' || member.type === 'TSMethodSignature') &&
                            member.key.type === 'Identifier'
                        )
                            this.#augmented.add(`${module} ${declaration.id.name}.${member.key.name}`);
                    }
                }
            }
        }
    }

    #module(module: string): ModuleUses {
        let uses = this.modules.get(module);
        if (uses === undefined) {
            uses = { uses: new Map(), fields: new Map(), unmatched: new Map() };
            this.modules.set(module, uses);
        }
        return uses;
    }

    #count(module: string, key: string, kind: UseKind = 'uses'): void {
        const map = this.#module(module)[kind];
        map.set(key, (map.get(key) ?? 0) + 1);
    }

    #import(node: ESTree.ImportDeclaration, scope: Scope): void {
        const module = node.source.value;
        if (!this.#context.isNative(module)) return;
        this.#module(module);
        for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier') {
                scope.bindings.set(specifier.local.name, { value: { kind: 'namespace', module } });
            } else if (specifier.type === 'ImportSpecifier') {
                const name = specifier.imported.type === 'Literal' ? specifier.imported.value : specifier.imported.name;
                const typeOnly = node.importKind === 'type' || specifier.importKind === 'type';
                scope.bindings.set(specifier.local.name, { value: undefined, imported: { module, name, typeOnly } });
            }
        }
    }

    /** Counts a reference to a module's declaration and returns its value. */
    #reference(module: string, name: string): Value {
        this.#count(module, name);
        const declaration = this.#context.shape(module)?.declarations.get(name)?.declaration;
        if (declaration?.kind === 'object') {
            return this.#fromShapeType(module, declaration.type) ?? { kind: 'static', module, name };
        }
        return { kind: 'static', module, name };
    }

    /**
     * Finds a member on a declaration or the bases it extends.
     * @returns The member; `augmented` for one the pack declares itself; `missing` when the shape
     * has the type but not the member; `unknown-type` when the shape lacks the type.
     */
    #findMember(module: string, name: string, member: string): FoundMember | 'augmented' | 'missing' | 'unknown-type' {
        let current: { module: string; name: string } | undefined = { module, name };
        const visited = new Set<string>();
        while (current !== undefined && !visited.has(`${current.module} ${current.name}`)) {
            visited.add(`${current.module} ${current.name}`);
            const declaration: DeclarationShape | undefined = this.#context
                .shape(current.module)
                ?.declarations.get(current.name);
            if (declaration === undefined) return visited.size === 1 ? 'unknown-type' : 'missing';
            const kind: ShapeDeclaration = declaration.declaration;
            const found = declaration.members.get(member);
            if (found !== undefined)
                return {
                    module: current.module,
                    owner: current.name,
                    name: member,
                    member: found,
                    field: kind.kind === 'interface'
                };
            if (this.#augmented.has(`${current.module} ${current.name}.${member}`)) return 'augmented';
            const base: string | ExternalType | undefined =
                kind.kind === 'class' || kind.kind === 'interface' ? kind.base : undefined;
            current =
                base === undefined
                    ? undefined
                    : typeof base === 'string'
                      ? { module: current.module, name: base }
                      : { module: base.module, name: base.name };
        }
        return 'missing';
    }

    /** Counts a member access on a value, and returns the member when the shape has it. */
    #member(target: Value | undefined, name: string): FoundMember | undefined {
        if (target === undefined || (target.kind !== 'static' && target.kind !== 'instance')) return undefined;
        if (this.#context.shape(target.module) === undefined) {
            // No generated shape to check against: count a declaration's direct members as written.
            if (target.kind === 'static') this.#count(target.module, `${target.name}.${name}`);
            return undefined;
        }
        const found = this.#findMember(target.module, target.name, name);
        if (found === 'unknown-type' || found === 'augmented') return undefined;
        if (found === 'missing') {
            if (!OBJECT_MEMBERS.has(name)) this.#count(target.module, `${target.name}.${name}`, 'unmatched');
            return undefined;
        }
        this.#count(found.module, `${found.owner}.${found.name}`, found.field ? 'fields' : 'uses');
        return found;
    }

    /** Reads a property of a value: counts it and returns the property's value. */
    #property(target: Value | undefined, name: string): Value | undefined {
        if (target?.kind === 'namespace') return this.#reference(target.module, name);
        const found = this.#member(target, name);
        if (found === undefined) return undefined;
        if (found.member.kind === 'property') return this.#fromShapeType(found.module, found.member.type);
        if (found.member.kind === 'constant' && typeof found.member.value === 'string')
            return { kind: 'string', value: found.member.value };
        return undefined;
    }

    /** Turns a type from the shape into a value the counter can follow. */
    #fromShapeType(module: string, type: ShapeType): Value | undefined {
        if (typeof type === 'string')
            return isPrimitiveType(type) ? undefined : { kind: 'instance', module, name: type };
        switch (type.kind) {
            case 'external':
                return { kind: 'instance', module: type.module, name: type.name };
            case 'optional':
                return this.#fromShapeType(module, type.type);
            case 'variant': {
                const values = type.types.flatMap((each) => this.#fromShapeType(module, each) ?? []);
                const [first] = values;
                return values.every((each) => JSON.stringify(each) === JSON.stringify(first)) ? first : undefined;
            }
            case 'array': {
                const element = this.#fromShapeType(module, type.element);
                return element === undefined ? undefined : { kind: 'array', element };
            }
            case 'promise': {
                const value = this.#fromShapeType(module, type.type);
                return value === undefined ? undefined : { kind: 'promise', value };
            }
            default:
                return undefined;
        }
    }

    /** The closure a parameter type declares, looking through optional and variant types. */
    #closureOf(type: ShapeType | undefined): ClosureType | undefined {
        if (type === undefined || typeof type === 'string') return undefined;
        if (type.kind === 'closure') return type;
        if (type.kind === 'optional') return this.#closureOf(type.type);
        if (type.kind === 'variant') {
            for (const each of type.types) {
                const closure = this.#closureOf(each);
                if (closure !== undefined) return closure;
            }
        }
        return undefined;
    }

    /** The class a literal component id names, among the classes that extend `family`. */
    #component(module: string, family: string, id: string): Value {
        const key = `${module} ${family}`;
        let ids = this.#components.get(key);
        if (ids === undefined) {
            ids = new Map();
            for (const [name, declaration] of this.#context.shape(module)?.declarations ?? []) {
                const componentId = declaration.members.get('componentId');
                if (componentId?.kind !== 'constant' || typeof componentId.value !== 'string') continue;
                if (this.#extends(module, name, family)) ids.set(componentId.value, name);
            }
            this.#components.set(key, ids);
        }
        const name = ids.get(id.includes(':') ? id : `minecraft:${id}`) ?? family;
        return { kind: 'instance', module, name };
    }

    #extends(module: string, name: string, family: string): boolean {
        let current: string | undefined = name;
        const visited = new Set<string>();
        while (current !== undefined && !visited.has(current)) {
            if (current === family) return true;
            visited.add(current);
            const declaration: ShapeDeclaration | undefined = this.#context
                .shape(module)
                ?.declarations.get(current)?.declaration;
            const base: string | ExternalType | undefined =
                declaration?.kind === 'class' ? declaration.base : undefined;
            current = typeof base === 'string' ? base : undefined;
        }
        return false;
    }

    /** The type a TypeScript annotation names, when it is a class or interface the script imports. */
    #fromAnnotation(node: ESTree.TSType | ESTree.TSTypeAnnotation | null | undefined, scope: Scope): Value | undefined {
        if (node === null || node === undefined) return undefined;
        switch (node.type) {
            case 'TSTypeAnnotation':
                return this.#fromAnnotation(node.typeAnnotation, scope);
            case 'TSArrayType': {
                const element = this.#fromAnnotation(node.elementType, scope);
                return element === undefined ? undefined : { kind: 'array', element };
            }
            case 'TSUnionType': {
                const values = node.types.flatMap((each) => this.#fromAnnotation(each, scope) ?? []);
                return values.length === 1 ? values[0] : undefined;
            }
            case 'TSParenthesizedType':
                return this.#fromAnnotation(node.typeAnnotation, scope);
            case 'TSTypeReference': {
                const { typeName } = node;
                const [argument] = node.typeArguments?.params ?? [];
                if (typeName.type === 'Identifier') {
                    const inner = argument === undefined ? undefined : this.#fromAnnotation(argument, scope);
                    if (typeName.name === 'Array' && inner !== undefined) return { kind: 'array', element: inner };
                    if (typeName.name === 'Promise' && inner !== undefined) return { kind: 'promise', value: inner };
                    const imported = scope.lookup(typeName.name)?.imported;
                    return imported === undefined
                        ? undefined
                        : { kind: 'instance', module: imported.module, name: imported.name };
                }
                if (typeName.type === 'TSQualifiedName' && typeName.left.type === 'Identifier') {
                    const namespace = scope.lookup(typeName.left.name)?.value;
                    return namespace?.kind === 'namespace'
                        ? { kind: 'instance', module: namespace.module, name: typeName.right.name }
                        : undefined;
                }
                return undefined;
            }
            default:
                return undefined;
        }
    }

    /** Binds a declaration's or parameter's names, counting the properties a destructuring reads. */
    #bind(pattern: ESTree.Node, value: Value | undefined, scope: Scope): void {
        switch (pattern.type) {
            case 'Identifier':
                scope.declare(pattern.name, this.#fromAnnotation(pattern.typeAnnotation, scope) ?? value);
                return;
            case 'ObjectPattern': {
                const source = this.#fromAnnotation(pattern.typeAnnotation, scope) ?? value;
                for (const property of pattern.properties) {
                    if (property.type === 'RestElement') {
                        this.#bind(property.argument, undefined, scope);
                        continue;
                    }
                    const key = this.#staticKey(property.key, property.computed, scope);
                    this.#bind(property.value, key === undefined ? undefined : this.#property(source, key), scope);
                }
                return;
            }
            case 'ArrayPattern': {
                const source = this.#fromAnnotation(pattern.typeAnnotation, scope) ?? value;
                const element = source?.kind === 'array' ? source.element : undefined;
                for (const each of pattern.elements) {
                    if (each === null) continue;
                    this.#bind(each, each.type === 'RestElement' ? source : element, scope);
                }
                return;
            }
            case 'AssignmentPattern': {
                const fallback = this.#visit(pattern.right, scope);
                this.#bind(pattern.left, value ?? fallback, scope);
                return;
            }
            case 'RestElement':
                this.#bind(pattern.argument, undefined, scope);
                return;
            case 'TSParameterProperty':
                this.#bind(pattern.parameter, value, scope);
                return;
            default:
                this.#visit(pattern, scope);
        }
    }

    /** A property key the source spells out, visiting a computed one. */
    #staticKey(key: ESTree.PropertyKey, computed: boolean, scope: Scope): string | undefined {
        if (!computed && key.type === 'Identifier') return key.name;
        if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
        if (computed) {
            const value = this.#visit(key, scope);
            return value?.kind === 'string' ? value.value : undefined;
        }
        return undefined;
    }

    /** Visits a function, binding its parameters to the values a caller gives them. */
    #function(
        node: ESTree.Function | ESTree.ArrowFunctionExpression,
        scope: Scope,
        parameters: readonly (Value | undefined)[] = []
    ): void {
        const inner = new Scope(scope, true);
        if (node.type !== 'ArrowFunctionExpression' && node.id !== null && node.type === 'FunctionExpression')
            inner.declare(node.id.name, undefined);
        node.params.forEach((parameter, index) => this.#bind(parameter, parameters[index], inner));
        if (node.body === null) return;
        if (node.body.type === 'BlockStatement') {
            for (const statement of node.body.body) this.#visit(statement, inner);
        } else {
            this.#visit(node.body, inner);
        }
    }

    /** Visits an object literal, checking its keys against the interface it is passed as. */
    #object(node: ESTree.ObjectExpression, scope: Scope, expected: Value | undefined): void {
        for (const property of node.properties) {
            if (property.type === 'SpreadElement') {
                this.#visit(property.argument, scope);
                continue;
            }
            const key = this.#staticKey(property.key, property.computed, scope);
            const found = key === undefined ? undefined : this.#member(expected, key);
            const type = found?.member.kind === 'property' ? found.member.type : undefined;
            this.#argument(property.value, type, found?.module ?? '', scope);
        }
    }

    /** Visits a value passed where the shape expects `type`: a callback, an options object or else. */
    #argument(node: ESTree.Node, type: ShapeType | undefined, module: string, scope: Scope): Value | undefined {
        if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
            const closure = this.#closureOf(type);
            this.#function(
                node,
                scope,
                closure?.arguments.map((each) => this.#fromShapeType(module, each))
            );
            return undefined;
        }
        if (node.type === 'ObjectExpression') {
            const expected = type === undefined ? undefined : this.#fromShapeType(module, type);
            this.#object(node, scope, expected?.kind === 'instance' ? expected : undefined);
            return undefined;
        }
        return this.#visit(node, scope);
    }

    #arguments(
        nodes: readonly ESTree.Node[],
        types: readonly (ShapeType | undefined)[],
        module: string,
        scope: Scope
    ): (Value | undefined)[] {
        return nodes.map((node, index) => this.#argument(node, types[index], module, scope));
    }

    #call(node: ESTree.CallExpression, scope: Scope): Value | undefined {
        const callee = node.callee;
        if (callee.type === 'MemberExpression' && callee.property.type !== 'PrivateIdentifier') {
            const target = this.#visit(callee.object, scope);
            // `world.getPlayers()` and `world['getPlayers']()` name the same member.
            const name = this.#staticKey(callee.property, callee.computed, scope);
            if (name === undefined) {
                // A key only known at run time, such as `handlers[index]()`.
                return this.#callStatic(target?.kind === 'array' ? target.element : undefined, node.arguments, scope);
            }
            if (target?.kind === 'array') return this.#arrayCall(target, name, node.arguments, scope);
            if (target?.kind === 'promise' && name === 'then') {
                const [callback, ...rest] = node.arguments;
                if (callback !== undefined) this.#callback(callback, [target.value], scope);
                for (const each of rest) this.#visit(each, scope);
                return undefined;
            }
            if (target?.kind === 'namespace')
                return this.#callStatic(this.#reference(target.module, name), node.arguments, scope);
            const found = this.#member(target, name);
            if (found?.member.kind !== 'method') {
                for (const each of node.arguments) this.#visit(each, scope);
                return undefined;
            }
            const values = this.#arguments(
                node.arguments,
                found.member.arguments.map((each) => each.type),
                found.module,
                scope
            );
            const [first] = values;
            if (name === 'getComponent' && first?.kind === 'string') {
                const family = this.#componentFamily(found.member.returns);
                if (family !== undefined) return this.#component(found.module, family, first.value);
            }
            return this.#fromShapeType(found.module, found.member.returns);
        }
        return this.#callStatic(this.#visit(callee, scope), node.arguments, scope);
    }

    /** Calls a module function the script imported, or anything else the counter cannot follow. */
    #callStatic(callee: Value | undefined, args: readonly ESTree.Node[], scope: Scope): Value | undefined {
        const declaration =
            callee?.kind === 'static'
                ? this.#context.shape(callee.module)?.declarations.get(callee.name)?.declaration
                : undefined;
        if (callee?.kind !== 'static' || declaration?.kind !== 'function') {
            for (const each of args) this.#visit(each, scope);
            return undefined;
        }
        this.#arguments(
            args,
            declaration.arguments.map((each) => each.type),
            callee.module,
            scope
        );
        return this.#fromShapeType(callee.module, declaration.returns);
    }

    /** The component base class a `getComponent` returns, such as `EntityComponent`. */
    #componentFamily(type: ShapeType): string | undefined {
        if (typeof type === 'string') return type.endsWith('Component') ? type : undefined;
        if (type.kind === 'optional') return this.#componentFamily(type.type);
        if (type.kind === 'variant') {
            for (const each of type.types) {
                const family = this.#componentFamily(each);
                if (family !== undefined) return family;
            }
        }
        if (type.kind === 'script') return /(\w+Component)ReturnType/.exec(type.text)?.[1];
        return undefined;
    }

    /** Passes element values to a callback argument, or visits a non-function argument. */
    #callback(node: ESTree.Node, parameters: readonly (Value | undefined)[], scope: Scope): void {
        if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
            this.#function(node, scope, parameters);
        } else {
            this.#visit(node, scope);
        }
    }

    #arrayCall(
        target: Extract<Value, { kind: 'array' }>,
        name: string,
        args: readonly ESTree.Node[],
        scope: Scope
    ): Value | undefined {
        const callback = ARRAY_CALLBACKS[name];
        const [first, ...rest] = args;
        if (callback !== undefined && first !== undefined) {
            const parameters = ARRAY_COMPARATORS.has(name)
                ? [target.element, target.element]
                : [target.element, undefined, target];
            this.#callback(first, parameters, scope);
            for (const each of rest) this.#visit(each, scope);
            return callback === 'array' ? target : callback === 'element' ? target.element : undefined;
        }
        if (name === 'reduce' && first !== undefined) {
            this.#callback(first, [undefined, target.element], scope);
            for (const each of rest) this.#visit(each, scope);
            return undefined;
        }
        for (const each of args) this.#visit(each, scope);
        const result = ARRAY_RESULTS[name];
        return result === 'array' ? target : result === 'element' ? target.element : undefined;
    }

    #new(node: ESTree.NewExpression, scope: Scope): Value | undefined {
        const callee = this.#visit(node.callee, scope);
        if (callee?.kind !== 'static' || this.#context.shape(callee.module) === undefined) {
            for (const each of node.arguments) this.#visit(each, scope);
            return callee?.kind === 'static'
                ? { kind: 'instance', module: callee.module, name: callee.name }
                : undefined;
        }
        const found = this.#member(callee, 'constructor');
        const parameters = found?.member.kind === 'constructor' ? found.member.arguments.map((each) => each.type) : [];
        this.#arguments(node.arguments, parameters, callee.module, scope);
        return { kind: 'instance', module: callee.module, name: callee.name };
    }

    /** The values a `for...of` loop's variable takes from what it iterates. */
    #iterated(value: Value | undefined): Value | undefined {
        if (value?.kind === 'array') return value.element;
        if (value?.kind !== 'instance') return undefined;
        const declaration = this.#context.shape(value.module)?.declarations.get(value.name)?.declaration;
        return declaration?.kind === 'class' && declaration.iterator !== undefined
            ? this.#fromShapeType(value.module, declaration.iterator.type)
            : undefined;
    }

    /** Visits a node, counting the uses in it, and returns the value of an expression. */
    #visit(node: ESTree.Node | null | undefined, scope: Scope): Value | undefined {
        if (node === null || node === undefined) return undefined;
        switch (node.type) {
            case 'ImportDeclaration':
            case 'TSInterfaceDeclaration':
            case 'TSTypeAliasDeclaration':
            case 'TSDeclareFunction':
            case 'TSEnumDeclaration':
            case 'BreakStatement':
            case 'ContinueStatement':
                return undefined;
            case 'Identifier': {
                const binding = scope.lookup(node.name);
                if (binding?.imported !== undefined && !binding.imported.typeOnly)
                    return this.#reference(binding.imported.module, binding.imported.name);
                return binding?.value;
            }
            case 'Literal':
                return typeof node.value === 'string' ? { kind: 'string', value: node.value } : undefined;
            case 'TemplateLiteral': {
                for (const each of node.expressions) this.#visit(each, scope);
                const [only] = node.quasis;
                return node.expressions.length === 0 && only?.value.cooked != null
                    ? { kind: 'string', value: only.value.cooked }
                    : undefined;
            }
            case 'MemberExpression': {
                const target = this.#visit(node.object, scope);
                if (node.property.type === 'PrivateIdentifier') return undefined;
                if (!node.computed && node.property.type === 'Identifier')
                    return this.#property(target, node.property.name);
                const key = this.#visit(node.property, scope);
                if (key?.kind === 'string') return this.#property(target, key.value);
                return target?.kind === 'array' ? target.element : undefined;
            }
            case 'CallExpression':
                return this.#call(node, scope);
            case 'NewExpression':
                return this.#new(node, scope);
            case 'ChainExpression':
            case 'ParenthesizedExpression':
            case 'TSNonNullExpression':
            case 'TSSatisfiesExpression':
            case 'TSInstantiationExpression':
                return this.#visit(node.expression, scope);
            case 'TSAsExpression':
            case 'TSTypeAssertion': {
                const value = this.#visit(node.expression, scope);
                return this.#fromAnnotation(node.typeAnnotation, scope) ?? value;
            }
            case 'AwaitExpression': {
                const value = this.#visit(node.argument, scope);
                return value?.kind === 'promise' ? value.value : value;
            }
            case 'ConditionalExpression': {
                this.#visit(node.test, scope);
                const consequent = this.#visit(node.consequent, scope);
                const alternate = this.#visit(node.alternate, scope);
                return consequent ?? alternate;
            }
            case 'LogicalExpression': {
                const left = this.#visit(node.left, scope);
                const right = this.#visit(node.right, scope);
                return left ?? right;
            }
            case 'SequenceExpression': {
                let last: Value | undefined;
                for (const each of node.expressions) last = this.#visit(each, scope);
                return last;
            }
            case 'AssignmentExpression': {
                const value = this.#visit(node.right, scope);
                if (node.left.type === 'Identifier') {
                    const binding = scope.assignable(node.left.name);
                    if (binding !== undefined && binding.imported === undefined) {
                        // `=` replaces the value, even with one the counter cannot follow. `??=` and
                        // `||=` keep a value the name already has. Arithmetic leaves no API value.
                        binding.value =
                            node.operator === '='
                                ? value
                                : node.operator === '??=' || node.operator === '||='
                                  ? (binding.value ?? value)
                                  : undefined;
                    }
                } else {
                    this.#assignTarget(node.left, scope);
                }
                return value;
            }
            case 'ObjectExpression':
                this.#object(node, scope, undefined);
                return undefined;
            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
                this.#function(node, scope);
                return undefined;
            case 'FunctionDeclaration':
                if (node.id !== null) scope.declare(node.id.name, undefined);
                this.#function(node, scope);
                return undefined;
            case 'ClassDeclaration':
            case 'ClassExpression':
                if (node.id !== null && node.type === 'ClassDeclaration') scope.declare(node.id.name, undefined);
                for (const decorator of node.decorators) this.#visit(decorator, scope);
                this.#visit(node.superClass, scope);
                for (const element of node.body.body) {
                    if (element.type === 'MethodDefinition' || element.type === 'TSAbstractMethodDefinition') {
                        if (element.computed) this.#visit(element.key, scope);
                        this.#function(element.value, scope);
                    } else if (
                        element.type === 'PropertyDefinition' ||
                        element.type === 'AccessorProperty' ||
                        element.type === 'TSAbstractPropertyDefinition' ||
                        element.type === 'TSAbstractAccessorProperty'
                    ) {
                        if (element.computed) this.#visit(element.key, scope);
                        this.#visit(element.value, scope);
                    } else if (element.type === 'StaticBlock') {
                        const inner = new Scope(scope);
                        for (const statement of element.body) this.#visit(statement, inner);
                    }
                }
                return undefined;
            case 'VariableDeclaration':
                for (const declarator of node.declarations) {
                    const annotation =
                        declarator.id.type === 'Identifier'
                            ? this.#fromAnnotation(declarator.id.typeAnnotation, scope)
                            : undefined;
                    if (declarator.init?.type === 'ObjectExpression' && annotation?.kind === 'instance') {
                        // An annotated object literal is checked against its interface, like an argument.
                        this.#object(declarator.init, scope, annotation);
                        this.#bind(declarator.id, undefined, scope);
                    } else {
                        this.#bind(declarator.id, this.#visit(declarator.init, scope), scope);
                    }
                }
                return undefined;
            case 'BlockStatement':
            case 'StaticBlock': {
                const inner = new Scope(scope);
                for (const statement of node.body) this.#visit(statement, inner);
                return undefined;
            }
            case 'ForOfStatement':
            case 'ForInStatement': {
                const iterated = this.#visit(node.right, scope);
                const inner = new Scope(scope);
                const element = node.type === 'ForOfStatement' ? this.#iterated(iterated) : undefined;
                if (node.left.type === 'VariableDeclaration') {
                    for (const declarator of node.left.declarations) this.#bind(declarator.id, element, inner);
                } else {
                    this.#visit(node.left, inner);
                }
                this.#visit(node.body, inner);
                return undefined;
            }
            case 'ForStatement': {
                const inner = new Scope(scope);
                this.#visit(node.init, inner);
                this.#visit(node.test, inner);
                this.#visit(node.update, inner);
                this.#visit(node.body, inner);
                return undefined;
            }
            case 'CatchClause': {
                const inner = new Scope(scope);
                if (node.param !== null) this.#bind(node.param, undefined, inner);
                this.#visit(node.body, inner);
                return undefined;
            }
            case 'LabeledStatement':
                return this.#visit(node.body, scope);
            case 'ExportNamedDeclaration':
                return this.#visit(node.declaration, scope);
            case 'ExportDefaultDeclaration':
                return this.#visit(node.declaration, scope);
            case 'ExportAllDeclaration':
                return undefined;
            case 'TSModuleDeclaration':
                if (node.body?.type === 'TSModuleBlock') {
                    const inner = new Scope(scope);
                    for (const statement of node.body.body) this.#visit(statement, inner);
                }
                return undefined;
            default:
                if (node.type.startsWith('TS') && node.type !== 'TSExportAssignment') return undefined;
                this.#visitChildren(node, scope);
                return undefined;
        }
    }

    /** Visits what an assignment's target reads: the objects of its members, and its defaults. */
    #assignTarget(node: ESTree.Node, scope: Scope): void {
        switch (node.type) {
            case 'Identifier':
                return;
            case 'ObjectPattern':
                for (const property of node.properties) {
                    if (property.type === 'RestElement') {
                        this.#assignTarget(property.argument, scope);
                    } else {
                        if (property.computed) this.#visit(property.key, scope);
                        this.#assignTarget(property.value, scope);
                    }
                }
                return;
            case 'ArrayPattern':
                for (const each of node.elements) if (each !== null) this.#assignTarget(each, scope);
                return;
            case 'AssignmentPattern':
                this.#visit(node.right, scope);
                this.#assignTarget(node.left, scope);
                return;
            case 'RestElement':
                this.#assignTarget(node.argument, scope);
                return;
            default:
                this.#visit(node, scope);
        }
    }

    /** Visits every child node of a node this walker has no special case for. */
    #visitChildren(node: ESTree.Node, scope: Scope): void {
        for (const [key, value] of Object.entries(node)) {
            if (key === 'parent' || TYPE_KEYS.has(key)) continue;
            if (Array.isArray(value)) {
                for (const each of value) if (isNode(each)) this.#visit(each, scope);
            } else if (isNode(value)) {
                this.#visit(value, scope);
            }
        }
    }
}
