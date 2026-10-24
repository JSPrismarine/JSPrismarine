import { describe, expect, it } from 'vitest';
import type { ExpressionNode, ProgramNode, StatementNode } from './ast';
import { parse } from './parser';
import { rulesForEngineVersion } from './version';

const MODERN = rulesForEngineVersion([1, 21, 0]);
const LEGACY = rulesForEngineVersion([1, 17, 0]);

const print = (node: ExpressionNode | StatementNode): string => {
    switch (node.kind) {
        case 'number':
            return String(node.value);
        case 'string':
            return `'${node.value}'`;
        case 'reference':
            return [node.domain, ...node.path].join('.');
        case 'this':
            return 'this';
        case 'call':
            return `${print(node.callee)}(${node.args.map(print).join(', ')})`;
        case 'unary':
            return `(${node.operator}${print(node.operand)})`;
        case 'binary':
            return `(${print(node.left)} ${node.operator} ${print(node.right)})`;
        case 'ternary':
            return node.otherwise
                ? `(${print(node.condition)} ? ${print(node.then)} : ${print(node.otherwise)})`
                : `(${print(node.condition)} ? ${print(node.then)})`;
        case 'arrow':
            return `(${print(node.left)} -> ${print(node.right)})`;
        case 'index':
            return `${print(node.target)}[${print(node.index)}]`;
        case 'assign':
            return `(${print(node.target)} = ${print(node.value)})`;
        case 'return':
            return `return ${print(node.value)}`;
        case 'break':
        case 'continue':
            return node.kind;
        case 'block':
            return `{ ${node.statements.map(print).join('; ')} }`;
        case 'loop':
            return `loop(${print(node.count)}, ${print(node.body)})`;
        case 'for_each':
            return `for_each(${print(node.variable)}, ${print(node.array)}, ${print(node.body)})`;
    }
};

const simple = (source: string, rules = MODERN) => {
    const program: ProgramNode = parse(source, rules);
    expect(program.statements).toHaveLength(1);
    return print(program.statements[0]!);
};

describe('parse', () => {
    it('expands the q, v, t and c aliases', () => {
        expect(simple('q.is_baby')).toBe('query.is_baby');
        expect(simple('v.x')).toBe('variable.x');
        expect(simple('t.x')).toBe('temp.x');
        expect(simple('c.other')).toBe('context.other');
    });

    describe('precedence and associativity', () => {
        it.each([
            ['1 + 2 * 3', '(1 + (2 * 3))'],
            ['1 - 2 - 3', '((1 - 2) - 3)'],
            ['1 / 2 / 3', '((1 / 2) / 3)'],
            ['-2 * 3', '((-2) * 3)'],
            ['!1 + 2', '((!1) + 2)'],
            ['1 + 2 < 3 + 4', '((1 + 2) < (3 + 4))'],
            ['1 < 2 == 3 < 4', '((1 < 2) == (3 < 4))'],
            ['1 == 2 && 3 == 4', '((1 == 2) && (3 == 4))'],
            ['1 && 2 || 3 && 4', '((1 && 2) || (3 && 4))'],
            ['1 || 2 ? 3 : 4', '((1 || 2) ? 3 : 4)'],
            ['1 ? 2 : 3 ?? 4', '((1 ? 2 : 3) ?? 4)'],
            ['variable.x = 1 ?? 2', '(variable.x = (1 ?? 2))'],
            ['!variable.a->query.is_baby', '(!(variable.a -> query.is_baby))']
        ])('parses %s as %s with the 1.18.20 rules', (source, expected) => {
            expect(simple(source)).toBe(expected);
        });

        it('parses a && b || c as (a && b) || c at 1.18.20, the rule bridge-core/molang and molangjs both get wrong', () => {
            expect(simple('variable.a && variable.b || variable.c')).toBe('((variable.a && variable.b) || variable.c)');
        });

        it('parses a && b || c as a && (b || c) before 1.18.20', () => {
            expect(simple('variable.a && variable.b || variable.c', LEGACY)).toBe(
                '(variable.a && (variable.b || variable.c))'
            );
        });

        it('parses comparison over equality at 1.18.20 and the reverse before it', () => {
            expect(simple('1 == 2 < 3')).toBe('(1 == (2 < 3))');
            expect(simple('1 == 2 < 3', LEGACY)).toBe('((1 == 2) < 3)');
        });

        it('parses the ternary right-to-left at 1.18.10 and left-to-right before it', () => {
            expect(simple('1 ? 2 : 3 ? 4 : 5')).toBe('(1 ? 2 : (3 ? 4 : 5))');
            expect(simple('1 ? 2 : 3 ? 4 : 5', LEGACY)).toBe('((1 ? 2 : 3) ? 4 : 5)');
        });
    });

    it('parses the binary conditional without an else branch', () => {
        expect(simple('query.is_baby ? 2')).toBe('(query.is_baby ? 2)');
    });

    it('parses calls, this, strings and the arrow operator', () => {
        expect(simple('query.anger_level(this) >= 40')).toBe('(query.anger_level(this) >= 40)');
        expect(simple("query.block_state('minecraft:cardinal_direction') == 'east'")).toBe(
            "(query.block_state('minecraft:cardinal_direction') == 'east')"
        );
        expect(simple('context.other->query.remaining_durability')).toBe(
            '(context.other -> query.remaining_durability)'
        );
    });

    it('parses complex expressions with statements, loops and returns', () => {
        const program = parse('v.x = 0; loop(10, { v.x = v.x + 1; (v.x > 5) ? break; }); return v.x;', MODERN);
        expect(program.complex).toBe(true);
        expect(program.statements.map(print)).toEqual([
            '(variable.x = 0)',
            'loop(10, { (variable.x = (variable.x + 1)); ((variable.x > 5) ? break) })',
            'return variable.x'
        ]);
    });

    it('parses for_each and array access', () => {
        expect(simple('for_each(t.e, query.foo, { t.x = 1; })')).toBe('for_each(temp.e, query.foo, { (temp.x = 1) })');
        expect(simple('array.textures[query.variant]')).toBe('array.textures[query.variant]');
    });

    it('rejects trailing tokens and unknown domains', () => {
        expect(() => parse('1 2', MODERN)).toThrowError(/unexpected/i);
        expect(() => parse('future.thing', MODERN)).toThrowError(/unknown/i);
    });
});
