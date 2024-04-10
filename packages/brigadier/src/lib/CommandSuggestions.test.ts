import { assert, expect, describe, beforeEach, it } from 'vitest';
import StringRange from './context/StringRange';
import Suggestion from './suggestion/Suggestion';
import CommandDispatcher from './CommandDispatcher';
import { literal } from './builder/LiteralArgumentBuilder';
import { argument } from './builder/RequiredArgumentBuilder';
import { DefaultType } from './arguments/ArgumentType';
import StringReader from './StringReader';

const { integer, word } = DefaultType;

describe('Command Suggestion Test', () => {
    let subject: CommandDispatcher<Object>;
    const source = {};

    beforeEach(() => {
        subject = new CommandDispatcher();
    });

    async function testSuggestions(contents: string, cursor: number, range: StringRange, ...suggestions: string[]) {
        const result = await subject.getCompletionSuggestions(subject.parse(contents, source), cursor);
        assert.deepEqual(result.getRange(), range);

        const expected: any[] = [];
        for (let suggestion of suggestions) {
            expected.push(new Suggestion(range, suggestion));
        }

        expect(result.getList()).to.have.deep.members(expected);
    }

    function inputWithOffset(input: string, offset: number): StringReader {
        const result = new StringReader(input);
        result.setCursor(offset);
        return result;
    }

    it('getCompletionSuggestions_rootCommands', async () => {
        subject.register(literal('foo'));
        subject.register(literal('bar'));
        subject.register(literal('baz'));

        const result = await subject.getCompletionSuggestions(subject.parse('', source));

        expect(result.getRange()).to.deep.equal(StringRange.at(0));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.at(0), 'bar'),
            new Suggestion(StringRange.at(0), 'baz'),
            new Suggestion(StringRange.at(0), 'foo')
        ]);
    });

    it('getCompletionSuggestions_rootCommands_withInputOffset', async () => {
        subject.register(literal('foo'));
        subject.register(literal('bar'));
        subject.register(literal('baz'));

        const result = await subject.getCompletionSuggestions(subject.parse(inputWithOffset('OOO', 3), source));

        expect(result.getRange()).to.deep.equal(StringRange.at(3));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.at(3), 'bar'),
            new Suggestion(StringRange.at(3), 'baz'),
            new Suggestion(StringRange.at(3), 'foo')
        ]);
    });

    it('getCompletionSuggestions_rootCommands_partial', async () => {
        subject.register(literal('foo'));
        subject.register(literal('bar'));
        subject.register(literal('baz'));

        const result = await subject.getCompletionSuggestions(subject.parse('b', source));

        expect(result.getRange()).to.deep.equal(StringRange.between(0, 1));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.between(0, 1), 'bar'),
            new Suggestion(StringRange.between(0, 1), 'baz')
        ]);
    });

    it('getCompletionSuggestions_rootCommands_partial_withInputOffset', async () => {
        subject.register(literal('foo'));
        subject.register(literal('bar'));
        subject.register(literal('baz'));

        const result = await subject.getCompletionSuggestions(subject.parse(inputWithOffset('Zb', 1), source));

        expect(result.getRange()).to.deep.equal(StringRange.between(1, 2));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.between(1, 2), 'bar'),
            new Suggestion(StringRange.between(1, 2), 'baz')
        ]);
    });

    it('getCompletionSuggestions_subCommands', async () => {
        subject.register(literal('parent').then(literal('foo')).then(literal('bar')).then(literal('baz')));

        const result = await subject.getCompletionSuggestions(subject.parse('parent ', source));

        expect(result.getRange()).to.deep.equal(StringRange.at(7));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.at(7), 'bar'),
            new Suggestion(StringRange.at(7), 'baz'),
            new Suggestion(StringRange.at(7), 'foo')
        ]);
    });

    it('getCompletionSuggestions_movingCursor_subCommands', async () => {
        subject.register(literal('parent_one').then(literal('faz')).then(literal('fbz')).then(literal('gaz')));

        subject.register(literal('parent_two'));

        await testSuggestions('parent_one faz ', 0, StringRange.at(0), 'parent_one', 'parent_two');
        await testSuggestions('parent_one faz ', 1, StringRange.between(0, 1), 'parent_one', 'parent_two');
        await testSuggestions('parent_one faz ', 7, StringRange.between(0, 7), 'parent_one', 'parent_two');
        await testSuggestions('parent_one faz ', 8, StringRange.between(0, 8), 'parent_one');
        await testSuggestions('parent_one faz ', 10, StringRange.at(0));
        await testSuggestions('parent_one faz ', 11, StringRange.at(11), 'faz', 'fbz', 'gaz');
        await testSuggestions('parent_one faz ', 12, StringRange.between(11, 12), 'faz', 'fbz');
        await testSuggestions('parent_one faz ', 13, StringRange.between(11, 13), 'faz');
        await testSuggestions('parent_one faz ', 14, StringRange.at(0));
        await testSuggestions('parent_one faz ', 15, StringRange.at(0));
    });

    it('getCompletionSuggestions_subCommands_partial', async () => {
        subject.register(literal('parent').then(literal('foo')).then(literal('bar')).then(literal('baz')));

        const parse = subject.parse('parent b', source);
        const result = await subject.getCompletionSuggestions(parse);

        expect(result.getRange()).to.deep.equal(StringRange.between(7, 8));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.between(7, 8), 'bar'),
            new Suggestion(StringRange.between(7, 8), 'baz')
        ]);
    });

    it('getCompletionSuggestions_subCommands_partial_withInputOffset', async () => {
        subject.register(literal('parent').then(literal('foo')).then(literal('bar')).then(literal('baz')));

        const parse = subject.parse(inputWithOffset('junk parent b', 5), source);
        const result = await subject.getCompletionSuggestions(parse);

        expect(result.getRange()).to.deep.equal(StringRange.between(12, 13));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.between(12, 13), 'bar'),
            new Suggestion(StringRange.between(12, 13), 'baz')
        ]);
    });

    it('getCompletionSuggestions_redirect', async () => {
        const actual = subject.register(literal('actual').then(literal('sub')));
        subject.register(literal('redirect').redirect(actual));

        const parse = subject.parse('redirect ', source);
        const result = await subject.getCompletionSuggestions(parse);

        expect(result.getRange()).to.deep.equal(StringRange.at(9));
        expect(result.getList()).to.deep.equal([new Suggestion(StringRange.at(9), 'sub')]);
    });

    it('getCompletionSuggestions_redirectPartial', async () => {
        const actual = subject.register(literal('actual').then(literal('sub')));
        subject.register(literal('redirect').redirect(actual));

        const parse = subject.parse('redirect s', source);
        const result = await subject.getCompletionSuggestions(parse);

        expect(result.getRange()).to.deep.equal(StringRange.between(9, 10));
        expect(result.getList()).to.deep.equal([new Suggestion(StringRange.between(9, 10), 'sub')]);
    });

    it('getCompletionSuggestions_movingCursor_redirect', async () => {
        const actualOne = subject.register(
            literal('actual_one').then(literal('faz')).then(literal('fbz')).then(literal('gaz'))
        );

        subject.register(literal('actual_two'));
        subject.register(literal('redirect_one').redirect(actualOne));
        subject.register(literal('redirect_two').redirect(actualOne));

        await testSuggestions(
            'redirect_one faz ',
            0,
            StringRange.at(0),
            'actual_one',
            'actual_two',
            'redirect_one',
            'redirect_two'
        );
        await testSuggestions('redirect_one faz ', 9, StringRange.between(0, 9), 'redirect_one', 'redirect_two');
        await testSuggestions('redirect_one faz ', 10, StringRange.between(0, 10), 'redirect_one');
        await testSuggestions('redirect_one faz ', 12, StringRange.at(0));
        await testSuggestions('redirect_one faz ', 13, StringRange.at(13), 'faz', 'fbz', 'gaz');
        await testSuggestions('redirect_one faz ', 14, StringRange.between(13, 14), 'faz', 'fbz');
        await testSuggestions('redirect_one faz ', 15, StringRange.between(13, 15), 'faz');
        await testSuggestions('redirect_one faz ', 16, StringRange.at(0));
        await testSuggestions('redirect_one faz ', 17, StringRange.at(0));
    });

    it('getCompletionSuggestions_redirectPartial_withInputOffset', async () => {
        const actual = subject.register(literal('actual').then(literal('sub')));
        subject.register(literal('redirect').redirect(actual));

        const parse = subject.parse(inputWithOffset('/redirect s', 1), source);
        const result = await subject.getCompletionSuggestions(parse);

        expect(result.getRange()).to.deep.equal(StringRange.between(10, 11));
        expect(result.getList()).to.deep.equal([new Suggestion(StringRange.between(10, 11), 'sub')]);
    });

    it('getCompletionSuggestions_redirect_lots', async () => {
        const loop = subject.register(literal('redirect'));
        subject.register(
            literal('redirect').then(
                literal('loop').then(
                    argument('loop', integer()).redirect(loop as any) as any // FIXME
                )
            )
        );

        const result = await subject.getCompletionSuggestions(
            subject.parse('redirect loop 1 loop 02 loop 003 ', source)
        );

        expect(result.getRange()).to.deep.equal(StringRange.at(33));
        expect(result.getList()).to.have.deep.members([new Suggestion(StringRange.at(33), 'loop')]);
    });

    it('getCompletionSuggestions_execute_simulation', async () => {
        const execute = subject.register(literal('execute'));
        subject.register(
            literal('execute')
                .then(
                    literal('as').then(
                        argument('name', word()).redirect(execute as any) as any // FIXME
                    )
                )
                .then(
                    literal('store').then(
                        argument('name', word()).redirect(execute as any) as any // FIXME
                    )
                )
                .then(literal('run').executes(async () => 0))
        );

        const parse = subject.parse('execute as Dinnerbone as', source);
        const result = await subject.getCompletionSuggestions(parse);

        assert.equal(result.isEmpty(), true);
    });

    it('getCompletionSuggestions_execute_simulation_partial', async () => {
        const execute = subject.register(literal('execute'));
        subject.register(
            literal('execute')
                .then(literal('as').then(literal('bar').redirect(execute)).then(literal('baz').redirect(execute)))
                .then(
                    literal('store').then(
                        argument('name', word()).redirect(execute as any) as any // FIXME
                    )
                )
                .then(literal('run').executes(async () => 0))
        );

        const parse = subject.parse('execute as bar as ', source);
        const result = await subject.getCompletionSuggestions(parse);

        expect(result.getRange()).to.deep.equal(StringRange.at(18));
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.at(18), 'bar'),
            new Suggestion(StringRange.at(18), 'baz')
        ]);
    });
});
