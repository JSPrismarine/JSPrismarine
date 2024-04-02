import { assert, expect, describe, it } from 'vitest';
import StringRange from '../context/StringRange';
import Suggestion from '../suggestion/Suggestion';
import Suggestions from '../suggestion/Suggestions';

describe('SuggestionsTest', () => {
    it('merge_empty', () => {
        const merged = Suggestions.merge('foo b', []);
        assert.equal(merged.isEmpty(), true);
    });

    it('merge_single', () => {
        const suggestions = new Suggestions(StringRange.at(5), [new Suggestion(StringRange.at(5), 'ar')]);
        const merged = Suggestions.merge('foo b', [suggestions]);
        assert.deepEqual(merged, suggestions);
    });

    it('merge_multiple', () => {
        const a = new Suggestions(StringRange.at(5), [
            new Suggestion(StringRange.at(5), 'ar'),
            new Suggestion(StringRange.at(5), 'az'),
            new Suggestion(StringRange.at(5), 'Az')
        ]);
        const b = new Suggestions(StringRange.between(4, 5), [
            new Suggestion(StringRange.between(4, 5), 'foo'),
            new Suggestion(StringRange.between(4, 5), 'qux'),
            new Suggestion(StringRange.between(4, 5), 'apple'),
            new Suggestion(StringRange.between(4, 5), 'Bar')
        ]);
        const merged = Suggestions.merge('foo b', [a, b]);
        expect(merged.getList()).to.have.deep.members([
            new Suggestion(StringRange.between(4, 5), 'apple'),
            new Suggestion(StringRange.between(4, 5), 'bar'),
            new Suggestion(StringRange.between(4, 5), 'Bar'),
            new Suggestion(StringRange.between(4, 5), 'baz'),
            new Suggestion(StringRange.between(4, 5), 'bAz'),
            new Suggestion(StringRange.between(4, 5), 'foo'),
            new Suggestion(StringRange.between(4, 5), 'qux')
        ]);
    });
});
