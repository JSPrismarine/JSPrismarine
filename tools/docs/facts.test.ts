import { describe, expect, it } from 'vitest';

import { applyFacts } from './facts.mts';

const facts = new Map([
    ['node.minimum', '26.4.0'],
    ['commands.list', 'say tell\nkick'],
    ['protocol.newest', '2225']
]);

describe('applyFacts', () => {
    it('replaces plain text and drops the markers for the published page', () => {
        const { text, stale } = applyFacts('Protocol <!-- fact:protocol.newest -->2193<!-- /fact -->.', facts);
        expect(text).toBe('Protocol 2225.');
        expect(stale).toEqual([{ name: 'protocol.newest', was: '2193', now: '2225' }]);
    });

    it('keeps inline code around the value', () => {
        const { text } = applyFacts('Node.js <!-- fact:node.minimum -->`25.0.0`<!-- /fact --> or newer', facts);
        expect(text).toBe('Node.js `26.4.0` or newer');
    });

    it('keeps a fenced block and its language around a multi-line value', () => {
        const source = '<!-- fact:commands.list -->\n```text\nsay\n```\n<!-- /fact -->';
        expect(applyFacts(source, facts).text).toBe('\n```text\nsay tell\nkick\n```\n');
    });

    it('keeps the markers when writing back to the source, and reports nothing for a current value', () => {
        const source = 'Protocol <!-- fact:protocol.newest -->2225<!-- /fact -->.';
        const result = applyFacts(source, facts, { keepMarkers: true });
        expect(result.text).toBe(source);
        expect(result.stale).toEqual([]);
    });

    it('leaves a marker written as an example in inline code alone', () => {
        const source = 'Write `<!-- fact:protocol.newest -->2193<!-- /fact -->` around the value.';
        expect(applyFacts(source, facts).text).toBe(source);
    });

    it('reports a marker that names no fact and leaves it untouched', () => {
        const source = 'Port <!-- fact:server.ports -->19132<!-- /fact -->';
        const result = applyFacts(source, facts);
        expect(result.unknown).toEqual(['server.ports']);
        expect(result.text).toBe(source);
    });
});
