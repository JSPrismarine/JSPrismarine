import { assert, expect, describe, beforeEach, it } from 'vitest';
import StringRange from '../context/StringRange';
import Suggestion from '../suggestion/Suggestion';
import SuggestionsBuilder from '../suggestion/SuggestionsBuilder';

describe('SuggestionsBuilderTest', () => {
    let builder: SuggestionsBuilder;

    beforeEach(() => {
        builder = new SuggestionsBuilder('Hello w', 6);
    });

    it('suggest_appends', () => {
        const result = builder.suggest('world!').build();
        assert.deepEqual(result.getList(), [new Suggestion(StringRange.between(6, 7), 'world!')]);
        assert.deepEqual(result.getRange(), StringRange.between(6, 7));
        assert.equal(result.isEmpty(), false);
    });

    it('suggest_replaces', () => {
        const result = builder.suggest('everybody').build();
        assert.deepEqual(result.getList(), [new Suggestion(StringRange.between(6, 7), 'everybody')]);
        assert.deepEqual(result.getRange(), StringRange.between(6, 7));
        assert.equal(result.isEmpty(), false);
    });

    it('suggest_noop', () => {
        const result = builder.suggest('w').build();
        assert.deepEqual(result.getList(), []);
        assert.deepEqual(result.isEmpty(), true);
    });

    it('suggest_multiple', () => {
        const result = builder.suggest('world!').suggest('everybody').suggest('weekend').build();
        expect(result.getList()).to.have.deep.members([
            new Suggestion(StringRange.between(6, 7), 'everybody'),
            new Suggestion(StringRange.between(6, 7), 'weekend'),
            new Suggestion(StringRange.between(6, 7), 'world!')
        ]);
        assert.deepEqual(result.getRange(), StringRange.between(6, 7));
        assert.deepEqual(result.isEmpty(), false);
    });

    it('restart', () => {
        builder.suggest("won't be included in restart");
        const other = builder.restart();
        expect(other).to.not.deep.equal(builder);
        assert.deepEqual(other.getInput(), builder.getInput());
        assert.deepEqual(other.getStart(), builder.getStart());
        assert.deepEqual(other.getRemaining(), builder.getRemaining());
    });

    it('sort_alphabetical', () => {
        const result = builder.suggest('2').suggest('4').suggest('6').suggest('8').suggest('30').suggest('32').build();
        const actual = result.getList().map((v) => v.getText());
        expect(actual).to.have.deep.members(['2', '30', '32', '4', '6', '8']);
    });

    it('sort_numerical', () => {
        const result = builder.suggest(2).suggest(4).suggest(6).suggest(8).suggest(30).suggest(32).build();
        const actual = result.getList().map((v) => v.getText());
        expect(actual).to.have.deep.members(['2', '4', '6', '8', '30', '32']);
    });

    it('sort_mixed', () => {
        const result = builder
            .suggest('11')
            .suggest('22')
            .suggest('33')
            .suggest('a')
            .suggest('b')
            .suggest('c')
            .suggest(2)
            .suggest(4)
            .suggest(6)
            .suggest(8)
            .suggest(30)
            .suggest(32)
            .suggest('3a')
            .suggest('a3')
            .build();
        const actual = result.getList().map((v) => v.getText());
        expect(actual).to.have.deep.members([
            '11',
            '2',
            '22',
            '33',
            '3a',
            '4',
            '6',
            '8',
            '30',
            '32',
            'a',
            'a3',
            'b',
            'c'
        ]);
    });
});
