import { assert, describe, it } from 'vitest';
import StringRange from '../context/StringRange';
import Suggestion from '../suggestion/Suggestion';

describe('SuggestionTest', () => {
    it('apply_insertation_start', () => {
        const suggestion = new Suggestion(StringRange.at(0), 'And so I said: ');
        assert.equal(suggestion.apply('Hello world!'), 'And so I said: Hello world!');
    });

    it('apply_insertation_middle', () => {
        const suggestion = new Suggestion(StringRange.at(6), 'small ');
        assert.equal(suggestion.apply('Hello world!'), 'Hello small world!');
    });

    it('apply_insertation_end', () => {
        const suggestion = new Suggestion(StringRange.at(5), ' world!');
        assert.equal(suggestion.apply('Hello'), 'Hello world!');
    });

    it('apply_replacement_start', () => {
        const suggestion = new Suggestion(StringRange.between(0, 5), 'Goodbye');
        assert.equal(suggestion.apply('Hello world!'), 'Goodbye world!');
    });

    it('apply_replacement_middle', () => {
        const suggestion = new Suggestion(StringRange.between(6, 11), 'Alex');
        assert.equal(suggestion.apply('Hello world!'), 'Hello Alex!');
    });

    it('apply_replacement_end', () => {
        const suggestion = new Suggestion(StringRange.between(6, 12), 'Creeper!');
        assert.equal(suggestion.apply('Hello world!'), 'Hello Creeper!');
    });

    it('apply_replacement_everything', () => {
        const suggestion = new Suggestion(StringRange.between(0, 12), 'Oh dear.');
        assert.equal(suggestion.apply('Hello world!'), 'Oh dear.');
    });

    it('expand_unchanged', () => {
        const suggestion = new Suggestion(StringRange.at(1), 'oo');
        assert.deepEqual(suggestion.expand('f', StringRange.at(1)), suggestion);
    });

    it('expand_left', () => {
        const suggestion = new Suggestion(StringRange.at(1), 'oo');
        assert.deepEqual(
            suggestion.expand('f', StringRange.between(0, 1)),
            new Suggestion(StringRange.between(0, 1), 'foo')
        );
    });

    it('expand_right', () => {
        const suggestion = new Suggestion(StringRange.at(0), 'minecraft:');
        assert.deepEqual(
            suggestion.expand('fish', StringRange.between(0, 4)),
            new Suggestion(StringRange.between(0, 4), 'minecraft:fish')
        );
    });

    it('expand_both', () => {
        const suggestion = new Suggestion(StringRange.at(11), 'minecraft:');
        assert.deepEqual(
            suggestion.expand('give Steve fish_block', StringRange.between(5, 21)),
            new Suggestion(StringRange.between(5, 21), 'Steve minecraft:fish_block')
        );
    });

    it('expand_replacement', () => {
        const suggestion = new Suggestion(StringRange.between(6, 11), 'strangers');
        assert.deepEqual(
            suggestion.expand('Hello world!', StringRange.between(0, 12)),
            new Suggestion(StringRange.between(0, 12), 'Hello strangers!')
        );
    });
});
