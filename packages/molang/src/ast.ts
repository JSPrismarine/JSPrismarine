/** A numeric literal. Molang numbers are floats; `true` and `false` lex to 1 and 0. */
export interface NumberNode {
    kind: 'number';
    value: number;
}

/** A single-quoted string literal with its case preserved. */
export interface StringNode {
    kind: 'string';
    value: string;
}

/**
 * A dotted reference such as `query.is_baby`, `variable.a.b` or `math.pi`. `domain` is the
 * normalized first segment (aliases `q`, `v`, `t` and `c` are expanded) and `path` the remaining
 * segments.
 */
export interface ReferenceNode {
    kind: 'reference';
    domain: 'query' | 'math' | 'variable' | 'temp' | 'context' | 'geometry' | 'material' | 'texture' | 'array';
    path: readonly string[];
}

/** `this`, the value the expression ultimately writes to. */
export interface ThisNode {
    kind: 'this';
}

/** A call such as `math.clamp(a, b, c)` or `query.anger_level(this)`. */
export interface CallNode {
    kind: 'call';
    callee: ReferenceNode;
    args: readonly ExpressionNode[];
}

/** A unary operation, `!a` or `-a`. */
export interface UnaryNode {
    kind: 'unary';
    operator: '!' | '-';
    operand: ExpressionNode;
}

/** The binary operators of the language, including `??`. */
export type BinaryOperator = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||' | '??';

/** A binary operation. */
export interface BinaryNode {
    kind: 'binary';
    operator: BinaryOperator;
    left: ExpressionNode;
    right: ExpressionNode;
}

/** `A ? B : C`, or the binary conditional `A ? B` when `otherwise` is undefined. */
export interface TernaryNode {
    kind: 'ternary';
    condition: ExpressionNode;
    then: ExpressionNode;
    otherwise?: ExpressionNode;
}

/** The arrow operator `left->right`; evaluates `right` against the entity `left` resolves to. */
export interface ArrowNode {
    kind: 'arrow';
    left: ExpressionNode;
    right: ExpressionNode;
}

/** Array access `target[index]`. */
export interface IndexNode {
    kind: 'index';
    target: ExpressionNode;
    index: ExpressionNode;
}

/** An assignment to `variable.*` or `temp.*` storage. */
export interface AssignNode {
    kind: 'assign';
    target: ReferenceNode;
    value: ExpressionNode;
}

/** `return <expression>;` ends the whole expression with the value. */
export interface ReturnNode {
    kind: 'return';
    value: ExpressionNode;
}

/**
 * `break` and `continue` inside a loop body. They may appear where an expression is expected, as
 * in `(v.x > 5) ? break`, and evaluate to 0 outside a loop.
 */
export interface LoopControlNode {
    kind: 'break' | 'continue';
}

/** A braced statement list `{ a = 1; b = 2; }`. */
export interface BlockNode {
    kind: 'block';
    statements: readonly StatementNode[];
}

/** `loop(count, expression)`; the engine caps `count` at 1024. */
export interface LoopNode {
    kind: 'loop';
    count: ExpressionNode;
    body: ExpressionNode;
}

/** `for_each(variable, array, expression)`. */
export interface ForEachNode {
    kind: 'for_each';
    variable: ReferenceNode;
    array: ExpressionNode;
    body: ExpressionNode;
}

/** Any expression form. */
export type ExpressionNode =
    | NumberNode
    | StringNode
    | ReferenceNode
    | ThisNode
    | CallNode
    | UnaryNode
    | BinaryNode
    | TernaryNode
    | ArrowNode
    | IndexNode
    | AssignNode
    | BlockNode
    | LoopNode
    | ForEachNode
    | LoopControlNode;

/** A statement in a complex expression. */
export type StatementNode = ExpressionNode | ReturnNode;

/**
 * A parsed Molang expression. A simple expression has one statement and no `;` and returns its
 * value; a complex expression runs its statements and returns 0 unless a `return` runs.
 */
export interface ProgramNode {
    kind: 'program';
    complex: boolean;
    statements: readonly StatementNode[];
}
