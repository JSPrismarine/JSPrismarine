import type { BinaryOperator, ExpressionNode, ProgramNode, ReferenceNode, StatementNode, TernaryNode } from './ast';
import type { Token } from './lexer';
import { MolangSyntaxError, tokenize } from './lexer';
import type { MolangVersionRules } from './version';

const DOMAIN_ALIASES = {
    q: 'query',
    v: 'variable',
    t: 'temp',
    c: 'context',
    query: 'query',
    variable: 'variable',
    temp: 'temp',
    context: 'context',
    math: 'math',
    geometry: 'geometry',
    material: 'material',
    texture: 'texture',
    array: 'array'
} as const;

type Domain = (typeof DOMAIN_ALIASES)[keyof typeof DOMAIN_ALIASES];

interface BinaryRule {
    precedence: number;
    rightAssociative?: boolean;
}

/**
 * Binding powers; higher binds tighter. The ranks follow the "Operator Precedence" table of
 * Mojang's generated Molang documentation, with C ranks for the operators it omits (unary minus
 * with `!`; call, `->` and `[ ]` above `!`; `=` below `??`). Two rows are versioned: before
 * 1.18.20 `||` bound tighter than `&&` and equality tighter than comparison.
 */
const binaryRules = (rules: MolangVersionRules): Readonly<Record<BinaryOperator, BinaryRule>> => ({
    '??': { precedence: 2 },
    '||': { precedence: rules.andBeforeOr ? 4 : 5 },
    '&&': { precedence: rules.andBeforeOr ? 5 : 4 },
    '==': { precedence: rules.andBeforeOr ? 6 : 7 },
    '!=': { precedence: rules.andBeforeOr ? 6 : 7 },
    '<': { precedence: rules.andBeforeOr ? 7 : 6 },
    '<=': { precedence: rules.andBeforeOr ? 7 : 6 },
    '>': { precedence: rules.andBeforeOr ? 7 : 6 },
    '>=': { precedence: rules.andBeforeOr ? 7 : 6 },
    '+': { precedence: 8 },
    '-': { precedence: 8 },
    '*': { precedence: 9 },
    '/': { precedence: 9 }
});

const TERNARY_PRECEDENCE = 3;
const ASSIGN_PRECEDENCE = 1;
const UNARY_PRECEDENCE = 10;
const ARROW_PRECEDENCE = 11;
const INDEX_PRECEDENCE = 12;

const isBinaryOperator = (
    value: string,
    rules: Readonly<Record<BinaryOperator, BinaryRule>>
): value is BinaryOperator => Object.hasOwn(rules, value);

class Parser {
    private index = 0;
    private readonly binary: Readonly<Record<BinaryOperator, BinaryRule>>;

    public constructor(
        private readonly source: string,
        private readonly tokens: Token[],
        private readonly rules: MolangVersionRules
    ) {
        this.binary = binaryRules(rules);
    }

    public parseProgram(): ProgramNode {
        const statements: StatementNode[] = [];
        let complex = false;
        while (this.index < this.tokens.length) {
            statements.push(this.parseStatement());
            if (this.take(';')) complex = true;
            else break;
        }
        if (this.index < this.tokens.length) {
            throw new MolangSyntaxError(`unexpected token ${this.peek()!.value}`, this.peek()!.start);
        }
        if (statements.length === 0) throw new MolangSyntaxError('empty expression', 0);
        return { kind: 'program', complex, statements };
    }

    private parseStatement(): StatementNode {
        const token = this.peek();
        if (token?.kind === 'keyword' && token.value === 'return') {
            this.index++;
            return { kind: 'return', value: this.parseExpression(0) };
        }
        return this.parseExpression(0);
    }

    private parseExpression(minPrecedence: number): ExpressionNode {
        let left = this.parsePrefix();
        for (;;) {
            const token = this.peek();
            if (!token || token.kind !== 'operator') break;
            if (token.value === '->' && ARROW_PRECEDENCE > minPrecedence) {
                this.index++;
                left = { kind: 'arrow', left, right: this.parseExpression(ARROW_PRECEDENCE) };
                continue;
            }
            if (token.value === '[' && INDEX_PRECEDENCE > minPrecedence) {
                this.index++;
                const index = this.parseExpression(0);
                this.expect(']');
                left = { kind: 'index', target: left, index };
                continue;
            }
            if (token.value === '?' && TERNARY_PRECEDENCE > minPrecedence) {
                this.index++;
                left = this.parseTernary(left);
                continue;
            }
            if (token.value === '=' && ASSIGN_PRECEDENCE >= minPrecedence) {
                if (left.kind !== 'reference' || (left.domain !== 'variable' && left.domain !== 'temp')) {
                    throw new MolangSyntaxError('only variable.* and temp.* can be assigned', token.start);
                }
                this.index++;
                left = { kind: 'assign', target: left, value: this.parseExpression(ASSIGN_PRECEDENCE) };
                continue;
            }
            if (!isBinaryOperator(token.value, this.binary)) break;
            const rule = this.binary[token.value];
            if (rule.precedence <= minPrecedence) break;
            this.index++;
            left = {
                kind: 'binary',
                operator: token.value,
                left,
                right: this.parseExpression(rule.precedence)
            };
        }
        return left;
    }

    private parseTernary(condition: ExpressionNode): TernaryNode {
        const then = this.parseExpression(TERNARY_PRECEDENCE);
        if (!this.take(':')) return { kind: 'ternary', condition, then };
        // Right-associative from 1.18.10: the else branch may contain another ternary. Before
        // that, the whole `A ? B : C` becomes the condition of any ternary that follows.
        const otherwise = this.parseExpression(
            this.rules.ternaryRightAssociative ? TERNARY_PRECEDENCE - 1 : TERNARY_PRECEDENCE
        );
        return { kind: 'ternary', condition, then, otherwise };
    }

    private parsePrefix(): ExpressionNode {
        const token = this.peek();
        if (!token) throw new MolangSyntaxError('unexpected end of expression', this.source.length);
        if (token.kind === 'number') {
            this.index++;
            return { kind: 'number', value: Number.parseFloat(token.value) };
        }
        if (token.kind === 'string') {
            this.index++;
            return { kind: 'string', value: token.value };
        }
        if (token.kind === 'operator') {
            if (token.value === '!' || token.value === '-') {
                this.index++;
                return { kind: 'unary', operator: token.value, operand: this.parseExpression(UNARY_PRECEDENCE) };
            }
            if (token.value === '(') {
                this.index++;
                const inner = this.parseExpression(0);
                this.expect(')');
                return inner;
            }
            if (token.value === '{') return this.parseBlock();
        }
        if (token.kind === 'keyword') {
            this.index++;
            switch (token.value) {
                case 'this':
                    return { kind: 'this' };
                case 'true':
                    return { kind: 'number', value: 1 };
                case 'false':
                    return { kind: 'number', value: 0 };
                case 'break':
                case 'continue':
                    return { kind: token.value };
                case 'loop': {
                    this.expect('(');
                    const count = this.parseExpression(0);
                    this.expect(',');
                    const body = this.parseExpression(0);
                    this.expect(')');
                    return { kind: 'loop', count, body };
                }
                case 'for_each': {
                    this.expect('(');
                    const variable = this.parseReference();
                    this.expect(',');
                    const array = this.parseExpression(0);
                    this.expect(',');
                    const body = this.parseExpression(0);
                    this.expect(')');
                    return { kind: 'for_each', variable, array, body };
                }
                default:
                    throw new MolangSyntaxError(`unexpected keyword ${token.value}`, token.start);
            }
        }
        if (token.kind === 'identifier') {
            const reference = this.parseReference();
            if (this.take('(')) {
                const args: ExpressionNode[] = [];
                if (!this.take(')')) {
                    do {
                        args.push(this.parseExpression(0));
                    } while (this.take(','));
                    this.expect(')');
                }
                return { kind: 'call', callee: reference, args };
            }
            return reference;
        }
        throw new MolangSyntaxError(`unexpected token ${token.value}`, token.start);
    }

    private parseBlock(): ExpressionNode {
        this.expect('{');
        const statements: StatementNode[] = [];
        while (!this.take('}')) {
            statements.push(this.parseStatement());
            if (!this.take(';')) {
                this.expect('}');
                break;
            }
        }
        return { kind: 'block', statements };
    }

    private parseReference(): ReferenceNode {
        const token = this.peek();
        if (!token || token.kind !== 'identifier') {
            throw new MolangSyntaxError('expected an identifier', token?.start ?? this.source.length);
        }
        this.index++;
        const [head = '', ...path] = token.value.split('.');
        const aliases: Readonly<Partial<Record<string, Domain>>> = DOMAIN_ALIASES;
        const domain = aliases[head];
        if (!domain) throw new MolangSyntaxError(`unknown scope ${head}`, token.start);
        return { kind: 'reference', domain, path };
    }

    private peek(): Token | undefined {
        return this.tokens[this.index];
    }

    private take(value: string): boolean {
        const token = this.peek();
        if (token?.kind === 'operator' && token.value === value) {
            this.index++;
            return true;
        }
        return false;
    }

    private expect(value: string): void {
        if (!this.take(value)) {
            const token = this.peek();
            throw new MolangSyntaxError(
                `expected ${value}${token ? `, found ${token.value}` : ''}`,
                token?.start ?? this.source.length
            );
        }
    }
}

/**
 * Parses Molang source text into an AST under the given versioned rules.
 *
 * @throws {MolangSyntaxError} When the text is not a valid Molang expression.
 */
export function parse(source: string, rules: MolangVersionRules): ProgramNode {
    return new Parser(source, tokenize(source), rules).parseProgram();
}
