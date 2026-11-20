import { describe, expect, it } from 'vitest';

import { fitText, measure } from './fitText.ts';
import { typefaces } from './typefaces.ts';

const display = { face: typefaces.display, tracking: -0.045, lineHeight: 0.96 };
const mono = { face: typefaces.monoBold, tracking: 0, lineHeight: 1 };
const sizes = [112, 96, 80, 64, 48] as const;

describe('measure', () => {
    it('reads advance widths from the font, so mono characters share one width and wider text measures wider', () => {
        const setting = { face: typefaces.mono, size: 20, tracking: 0 };
        expect(measure('iiii', setting)).toBeCloseTo(measure('WWWW', setting));
        expect(measure('WWWW', { ...setting, face: typefaces.body })).toBeGreaterThan(
            measure('iiii', { ...setting, face: typefaces.body })
        );
        expect(measure('ab', { ...setting, tracking: 0.1 })).toBeCloseTo(measure('ab', setting) + 2 * 0.1 * 20);
    });

    it('knows which characters the fonts cover', () => {
        expect(typefaces.display.metrics.covers('A'.codePointAt(0) ?? 0)).toBe(true);
        expect(typefaces.mono.metrics.covers('…'.codePointAt(0) ?? 0)).toBe(true);
        expect(typefaces.display.metrics.covers(0x1f600)).toBe(false);
    });
});

describe('fitText', () => {
    it('keeps the largest size for a short title', () => {
        const fitted = fitText('Releases', { ...display, sizes, width: 700, maxLines: 4 });
        expect(fitted).toEqual({ size: sizes[0], lines: ['Releases'], truncated: false });
    });

    it('steps down in size until a long title fits its lines and height, and no line is wider than the box', () => {
        const title =
            'Packet handlers share one shape in both directions, and serverbound handlers run in the input step';
        const fitted = fitText(title, { ...display, sizes, width: 650, maxLines: 5, maxHeight: 420 });
        expect(fitted.truncated).toBe(false);
        expect(fitted.size).toBeLessThan(sizes[0]);
        expect(fitted.lines.length * fitted.size * display.lineHeight).toBeLessThanOrEqual(420);
        expect(fitted.lines.join(' ')).toBe(title);
        for (const line of fitted.lines)
            expect(measure(line, { ...display, size: fitted.size })).toBeLessThanOrEqual(650);
    });

    it('breaks a camel-case identifier between its words, without adding characters', () => {
        const name = 'ClientboundOnlineMusicPlaybackResponsePacket';
        const fitted = fitText(name, { ...mono, sizes: [80, 64], width: 660, maxLines: 4 });
        expect(fitted.lines.length).toBeGreaterThan(1);
        expect(fitted.lines.join('')).toBe(name);
        for (const line of fitted.lines) expect(line).toMatch(/^[A-Z]/);
    });

    it('breaks a package name after its scope', () => {
        const fitted = fitText('@jsprismarine/protocol', { ...mono, sizes: [60], width: 600, maxLines: 2 });
        expect(fitted.lines).toEqual(['@jsprismarine/', 'protocol']);
    });

    it('cuts text that fits at no size on its last line, with an ellipsis inside the box', () => {
        const text = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
        const fitted = fitText(text, { ...display, sizes: [64, 48], width: 400, maxLines: 2 });
        expect(fitted.truncated).toBe(true);
        expect(fitted.size).toBe(48);
        expect(fitted.lines).toHaveLength(2);
        expect(fitted.lines[1]).toMatch(/…$/);
        expect(fitted.lines[0]).not.toMatch(/…$/);
        for (const line of fitted.lines) expect(measure(line, { ...display, size: 48 })).toBeLessThanOrEqual(400);
    });

    it('cuts a single word wider than the box with no place to break', () => {
        const fitted = fitText('W'.repeat(60), { ...mono, sizes: [40], width: 300, maxLines: 1 });
        expect(fitted.truncated).toBe(true);
        expect(fitted.lines).toHaveLength(1);
        expect(measure(fitted.lines[0] ?? '', { ...mono, size: 40 })).toBeLessThanOrEqual(300);
    });

    it('breaks a word with no break point between characters, with a hyphen, rather than cut it', () => {
        const word = 'W'.repeat(30);
        const fitted = fitText(word, { ...mono, sizes: [40], width: 300, maxLines: 4 });
        expect(fitted.truncated).toBe(false);
        expect(fitted.lines.slice(0, -1).every((line) => line.endsWith('-'))).toBe(true);
        expect(fitted.lines.join('').replaceAll('-', '')).toBe(word);
        for (const line of fitted.lines) expect(measure(line, { ...mono, size: 40 })).toBeLessThanOrEqual(300);
    });

    it('ends only the last line in an ellipsis when text runs out of lines', () => {
        const fitted = fitText(`${'W'.repeat(40)} more words after it`, {
            ...mono,
            sizes: [40],
            width: 300,
            maxLines: 2
        });
        expect(fitted.truncated).toBe(true);
        expect(fitted.lines.filter((line) => line.endsWith('…'))).toEqual([fitted.lines[1]]);
    });

    it('keeps an identifier on one line when that costs less than a third of its size', () => {
        const options = { ...mono, sizes: [80, 64, 48], width: 700, maxLines: 3 };
        const split = fitText('@jsprismarine/protocol', options);
        expect(split.lines).toHaveLength(2);
        const whole = fitText('@jsprismarine/protocol', { ...options, preferOneLine: 0.5 });
        expect(whole.lines).toEqual(['@jsprismarine/protocol']);
        expect(measure(whole.lines[0] ?? '', { ...mono, size: whole.size })).toBeLessThanOrEqual(700);
        expect(fitText('@jsprismarine/protocol', { ...options, preferOneLine: 0.9 }).lines).toHaveLength(2);
    });

    it('pulls a word down so the last line is not one word alone', () => {
        const body = { face: typefaces.body, tracking: 0, lineHeight: 1.28, sizes: [30], maxLines: 4 };
        const text = 'The people who build the server and its packages every day';
        const width = measure('The people who build the server and its packages every', { ...body, size: 30 }) + 1;
        expect(fitText(text, { ...body, width }).lines.at(-1)).toBe('day');
        const balanced = fitText(text, { ...body, width, avoidWidows: true }).lines;
        expect(balanced.at(-1)).toBe('every day');
        expect(balanced.join(' ')).toBe(text);
    });

    it('measures a character the face lacks in the font satori draws it from', () => {
        const lambda = 'λ'.codePointAt(0) ?? 0;
        expect(typefaces.display.metrics.covers(lambda)).toBe(false);
        expect(measure('λ', { face: typefaces.display, size: 100, tracking: 0 })).toBeCloseTo(
            measure('λ', { face: typefaces.mono, size: 100, tracking: 0 })
        );
    });
});
