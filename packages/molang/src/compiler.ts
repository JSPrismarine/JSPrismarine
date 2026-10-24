import type { ExpressionNode, ProgramNode, ReferenceNode, StatementNode } from './ast';
import type { Diagnostic } from './diagnostics';
import type { MathFunction } from './math';
import { MATH_FUNCTIONS } from './math';
import type { QueryRegistry } from './queries';
import type { MolangScope, MolangStruct, MolangValue } from './scope';
import type { MolangVersionRules } from './version';

/** The result of reading a `variable.*`, `temp.*` or `context.*` name that is not defined. */
const MISSING = Symbol('missing');

type Evaluated = MolangValue | typeof MISSING;

interface Frame {
    scope: MolangScope;
    temp: Map<string, MolangValue>;
    loopDepth: number;
}

type Closure = (frame: Frame) => Evaluated;

class ReturnSignal {
    public constructor(public readonly value: Evaluated) {}
}
const BREAK = Symbol('break');
const CONTINUE = Symbol('continue');

/** The engine caps `loop` at 1024 iterations. */
const LOOP_LIMIT = 1024;

const toNumber = (value: Evaluated): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const truthy = (value: Evaluated): boolean => toNumber(value) !== 0;
const bool = (value: boolean): number => (value ? 1 : 0);

const equals = (left: Evaluated, right: Evaluated): boolean => {
    if (typeof left === 'string' || typeof right === 'string') return left === right;
    return toNumber(left) === toNumber(right);
};

const variableStore = (frame: Frame): Map<string, MolangValue> => {
    const scope = frame.scope;
    if (scope.entity?.variables) return scope.entity.variables;
    scope.variables ??= new Map();
    return scope.variables;
};

const readPath = (root: MolangValue | undefined, path: readonly string[]): Evaluated => {
    let current: MolangValue | undefined = root;
    for (const segment of path) {
        if (current === undefined) return MISSING;
        if (typeof current !== 'object' || current.kind !== 'struct') return MISSING;
        current = current.members.get(segment);
    }
    return current ?? MISSING;
};

const writePath = (store: Map<string, MolangValue>, path: readonly string[], value: MolangValue): void => {
    const [head, ...rest] = path;
    if (head === undefined) return;
    if (rest.length === 0) {
        store.set(head, value);
        return;
    }
    let container = store.get(head);
    if (typeof container !== 'object' || container.kind !== 'struct') {
        const struct: MolangStruct = { kind: 'struct', members: new Map() };
        store.set(head, struct);
        container = struct;
    }
    writePath(container.members, rest, value);
};

/** A compiled Molang expression: the parse diagnostics and a closure to evaluate it. */
export interface CompiledMolang {
    /** The source text the expression was compiled from. */
    source: string;
    /** The parsed program, or undefined when the source failed to parse. */
    ast?: ProgramNode;
    /** Problems found at parse or bind time; the closure still evaluates, erroring parts as 0. */
    diagnostics: readonly Diagnostic[];
    /** Evaluates the expression over the scope. Booleans come back as 0 and 1. */
    evaluate: (scope: MolangScope) => MolangValue;
}

/** Compiles a parsed program into a closure over a scope. */
export function compileProgram(
    source: string,
    program: ProgramNode,
    rules: MolangVersionRules,
    queries: QueryRegistry
): CompiledMolang {
    const diagnostics: Diagnostic[] = [];
    const compiler = new Compiler(rules, queries, diagnostics);
    const statements = program.statements.map((statement) => compiler.compileStatement(statement));
    const complex = program.complex;
    const evaluate = (scope: MolangScope): MolangValue => {
        const frame: Frame = { scope, temp: new Map(), loopDepth: 0 };
        try {
            let last: Evaluated = 0;
            for (const statement of statements) last = statement(frame);
            if (complex) return 0;
            return last === MISSING ? 0 : last;
        } catch (signal) {
            if (signal instanceof ReturnSignal) return signal.value === MISSING ? 0 : signal.value;
            throw signal;
        }
    };
    return { source, ast: program, diagnostics, evaluate };
}

class Compiler {
    public constructor(
        private readonly rules: MolangVersionRules,
        private readonly queries: QueryRegistry,
        private readonly diagnostics: Diagnostic[]
    ) {}

    public compileStatement(node: StatementNode): Closure {
        if (node.kind === 'return') {
            const value = this.compile(node.value);
            return (frame) => {
                throw new ReturnSignal(value(frame));
            };
        }
        return this.compile(node);
    }

    public compile(node: ExpressionNode): Closure {
        switch (node.kind) {
            case 'number': {
                const value = node.value;
                return () => value;
            }
            case 'string': {
                const value = node.value;
                return () => value;
            }
            case 'this':
                return (frame) => ({ kind: 'scope', scope: frame.scope });
            case 'reference':
                return this.compileReference(node);
            case 'call':
                return this.compileCall(node.callee, node.args);
            case 'unary': {
                const operand = this.compile(node.operand);
                return node.operator === '!'
                    ? (frame) => bool(!truthy(operand(frame)))
                    : (frame) => -toNumber(operand(frame));
            }
            case 'binary':
                return this.compileBinary(node.operator, node.left, node.right);
            case 'ternary': {
                const condition = this.compile(node.condition);
                const then = this.compile(node.then);
                const otherwise = node.otherwise ? this.compile(node.otherwise) : () => 0;
                return (frame) => (truthy(condition(frame)) ? then(frame) : otherwise(frame));
            }
            case 'arrow': {
                const left = this.compile(node.left);
                const right = this.compile(node.right);
                return (frame) => {
                    const target = left(frame);
                    // A null or dead left side returns 0 without evaluating the right side.
                    if (typeof target !== 'object' || target.kind !== 'scope') return 0;
                    return right({ scope: target.scope, temp: frame.temp, loopDepth: frame.loopDepth });
                };
            }
            case 'index': {
                const target = this.compile(node.target);
                const index = this.compile(node.index);
                return (frame) => {
                    const array = target(frame);
                    if (typeof array !== 'object' || array.kind !== 'array' || array.elements.length === 0) return 0;
                    // C-style cast to int, clamped at zero for negatives, wrapped by the size.
                    const offset = Math.max(0, Math.trunc(toNumber(index(frame)))) % array.elements.length;
                    return array.elements[offset] ?? 0;
                };
            }
            case 'assign': {
                const target = node.target;
                const value = this.compile(node.value);
                return (frame) => {
                    const result = value(frame);
                    const stored = result === MISSING ? 0 : result;
                    if (target.domain === 'temp') writePath(frame.temp, target.path, stored);
                    else writePath(variableStore(frame), target.path, stored);
                    return stored;
                };
            }
            case 'block': {
                const statements = node.statements.map((statement) => this.compileStatement(statement));
                return (frame) => {
                    let last: Evaluated = 0;
                    for (const statement of statements) last = statement(frame);
                    return last;
                };
            }
            case 'loop': {
                const count = this.compile(node.count);
                const body = this.compile(node.body);
                return (frame) => {
                    const iterations = Math.min(LOOP_LIMIT, Math.trunc(toNumber(count(frame))));
                    const inner: Frame = { ...frame, loopDepth: frame.loopDepth + 1 };
                    for (let i = 0; i < iterations; i++) {
                        try {
                            body(inner);
                        } catch (signal) {
                            if (signal === BREAK) break;
                            if (signal === CONTINUE) continue;
                            throw signal;
                        }
                    }
                    return 0;
                };
            }
            case 'for_each': {
                const variable = node.variable;
                const array = this.compile(node.array);
                const body = this.compile(node.body);
                return (frame) => {
                    const target = array(frame);
                    if (typeof target !== 'object' || target.kind !== 'array') return 0;
                    const inner: Frame = { ...frame, loopDepth: frame.loopDepth + 1 };
                    for (const element of target.elements) {
                        if (variable.domain === 'temp') writePath(frame.temp, variable.path, element);
                        else writePath(variableStore(frame), variable.path, element);
                        try {
                            body(inner);
                        } catch (signal) {
                            if (signal === BREAK) break;
                            if (signal === CONTINUE) continue;
                            throw signal;
                        }
                    }
                    return 0;
                };
            }
            case 'break':
                return (frame) => {
                    if (frame.loopDepth > 0) throw BREAK;
                    return 0;
                };
            case 'continue':
                return (frame) => {
                    if (frame.loopDepth > 0) throw CONTINUE;
                    return 0;
                };
        }
    }

    private compileReference(node: ReferenceNode): Closure {
        const path = node.path;
        switch (node.domain) {
            case 'variable':
                return (frame) => readPath(variableStore(frame).get(path[0] ?? ''), path.slice(1));
            case 'temp':
                return (frame) => readPath(frame.temp.get(path[0] ?? ''), path.slice(1));
            case 'context':
                return (frame) => readPath(frame.scope.context?.get(path[0] ?? ''), path.slice(1));
            case 'math':
            case 'query':
                return this.compileCall(node, []);
            default:
                this.diagnostics.push({
                    code: 'client-only-resource',
                    message: `${node.domain}.${path.join('.')} is a client resource; it evaluates to 0 on the server`
                });
                return () => 0;
        }
    }

    private compileCall(callee: ReferenceNode, args: readonly ExpressionNode[]): Closure {
        const compiledArgs = args.map((argument) => this.compile(argument));
        const name = callee.path.join('.');
        const evaluateArgs = (frame: Frame) =>
            compiledArgs.map((argument) => {
                const value = argument(frame);
                return value === MISSING ? 0 : value;
            });
        if (callee.domain === 'math') {
            const mathFunctions: Readonly<Partial<Record<string, MathFunction>>> = MATH_FUNCTIONS;
            const fn = mathFunctions[name];
            if (!fn) {
                this.diagnostics.push({
                    code: 'unknown-math-function',
                    message: `math.${name} is not a known math function`
                });
                return () => 0;
            }
            return (frame) => fn.evaluate(evaluateArgs(frame).map((value) => toNumber(value)));
        }
        if (callee.domain === 'query') {
            const query = this.queries.get(name);
            if (!query) {
                this.diagnostics.push({ code: 'unknown-query', message: `query.${name} is not a registered query` });
                return () => 0;
            }
            return (frame) => query.evaluate(frame.scope, evaluateArgs(frame));
        }
        return this.compileReference(callee);
    }

    private compileBinary(operator: string, leftNode: ExpressionNode, rightNode: ExpressionNode): Closure {
        const left = this.compile(leftNode);
        const right = this.compile(rightNode);
        switch (operator) {
            case '??':
                return (frame) => {
                    const value = left(frame);
                    return value === MISSING ? right(frame) : value;
                };
            case '&&':
                return (frame) => bool(truthy(left(frame)) && truthy(right(frame)));
            case '||':
                return (frame) => bool(truthy(left(frame)) || truthy(right(frame)));
            case '==':
                return (frame) => bool(equals(left(frame), right(frame)));
            case '!=':
                return (frame) => bool(!equals(left(frame), right(frame)));
            case '<':
                return (frame) => bool(toNumber(left(frame)) < toNumber(right(frame)));
            case '<=':
                return (frame) => bool(toNumber(left(frame)) <= toNumber(right(frame)));
            case '>':
                return (frame) => bool(toNumber(left(frame)) > toNumber(right(frame)));
            case '>=':
                return (frame) => bool(toNumber(left(frame)) >= toNumber(right(frame)));
            case '+':
                return (frame) => toNumber(left(frame)) + toNumber(right(frame));
            case '-':
                return (frame) => toNumber(left(frame)) - toNumber(right(frame));
            case '*':
                return (frame) => toNumber(left(frame)) * toNumber(right(frame));
            case '/': {
                // Before 1.19.60, dividing by a dynamically determined negative value divided by
                // its absolute value instead.
                const literalDivisor =
                    rightNode.kind === 'number' ||
                    (rightNode.kind === 'unary' && rightNode.operator === '-' && rightNode.operand.kind === 'number');
                const fixNegative = this.rules.divideByNegativeValue;
                return (frame) => {
                    let divisor = toNumber(right(frame));
                    if (!fixNegative && !literalDivisor) divisor = Math.abs(divisor);
                    if (divisor === 0) return 0;
                    return toNumber(left(frame)) / divisor;
                };
            }
            default:
                return () => 0;
        }
    }
}
