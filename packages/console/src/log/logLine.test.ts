import type { LogEntry } from '@jsprismarine/console-protocol';
import { LOG_LEVELS } from '@jsprismarine/logger';
import type { LogLevel } from '@jsprismarine/logger';
import type { StyledText } from '@opentui/core';
import { parseColor } from '@opentui/core';
import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../theme';
import type { LogLineOptions } from './logLine';
import { formatLogLine } from './logLine';
import type { StoredRecord } from './types';

const at = new Date(2024, 0, 1, 12, 5, 33).getTime();

type Base = LogEntry & { generation: number };

function base(overrides: Partial<Base> = {}): Base {
    return {
        seq: 1,
        level: 'info',
        namespace: 'Server',
        at,
        message: 'Server started',
        formatted: 'Server started',
        generation: 1,
        ...overrides
    };
}

const record = (overrides: Partial<Base> = {}): StoredRecord => ({ ...base(overrides), kind: 'log' });

const options = (overrides: Partial<LogLineOptions> = {}): LogLineOptions => ({
    width: 80,
    wrap: false,
    showNamespace: true,
    levelStyle: 'full',
    theme: defaultTheme,
    ...overrides
});

const text = (rows: readonly StyledText[]) => rows.map((row) => row.chunks.map((chunk) => chunk.text).join(''));

describe('formatLogLine', () => {
    it.each(['https', 'http', 'ws', 'wss', 'devtools'])('keeps the full %s URL on every wrapped fragment', (scheme) => {
        const url = `${scheme}://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=127.0.0.1:12345/abcdef`;
        const rows = formatLogLine(record({ message: `DevTools: ${url}` }), options({ width: 50, wrap: true }));
        const fragments = rows.flatMap((row) => row.chunks.filter((chunk) => chunk.link));
        expect(fragments.map((chunk) => chunk.text).join('')).toBe(url);
        expect(fragments.every((chunk) => chunk.link?.url === url)).toBe(true);
    });

    it('retains URL targets through Minecraft styles, search highlighting, and truncation', () => {
        const url = 'https://example.com/long/path';
        const rows = formatLogLine(
            record({ message: 'https://§cexample.com/long/path' }),
            options({ width: 50, highlight: 'example' })
        );
        const fragments = rows.flatMap((row) => row.chunks.filter((chunk) => chunk.link));
        expect(fragments.length).toBeGreaterThan(1);
        expect(fragments.every((chunk) => chunk.link?.url === url)).toBe(true);
        expect(fragments.some((chunk) => chunk.bg)).toBe(true);
    });

    it('lays out time, level, namespace, and message in fixed columns', () => {
        expect(text(formatLogLine(record(), options()))).toEqual(['12:05:33 INFO    Server       Server started']);
    });

    it('colors the level token with the level color and the message with the text color', () => {
        const [row] = formatLogLine(record({ level: 'error' }), options());
        const level = row!.chunks.find((chunk) => chunk.text.startsWith('ERROR'));
        expect(level?.fg?.equals(parseColor(defaultTheme.error))).toBe(true);
        const message = row!.chunks.at(-1);
        expect(message?.fg?.equals(parseColor(defaultTheme.text))).toBe(true);
    });

    it('adds a muted repeat count without including it in the source text', () => {
        const [row] = formatLogLine(record(), options({ repeatCount: 3 }));
        const count = row!.chunks.find((chunk) => chunk.text === ' (x3)');

        expect(text([row!])).toEqual(['12:05:33 INFO    Server       Server started (x3)']);
        expect(count?.fg?.equals(parseColor(defaultTheme.textMuted))).toBe(true);
        expect(row!.sourceText).toBe('12:05:33 INFO    Server       Server started');
        expect(row!.sourceEnd).toBe([...row!.sourceText].length);
    });

    it('uses one-letter level tokens in the short style and can hide the namespace column', () => {
        const short = (level: LogLevel) =>
            text(formatLogLine(record({ level }), options({ levelStyle: 'short', showNamespace: false })))[0];
        expect(short('warn')).toBe('12:05:33 W Server started');
        expect(LOG_LEVELS.map((level) => short(level)?.charAt(9))).toEqual(['E', 'W', 'I', 'V', 'D', 'S']);
    });

    it('truncates long namespaces to the column width', () => {
        const [row] = text(formatLogLine(record({ namespace: 'AVeryLongNamespaceName' }), options()));
        expect(row).toBe('12:05:33 INFO    AVeryLongNa… Server started');
    });

    it('converts § codes in the message through the theme', () => {
        const [row] = formatLogLine(record({ message: 'hello §cworld' }), options());
        const red = row!.chunks.find((chunk) => chunk.text === 'world');
        expect(red?.fg?.equals(parseColor(defaultTheme.chat.c))).toBe(true);
        expect(text([row!])[0]).toBe('12:05:33 INFO    Server       hello world');
    });

    it('truncates the message with an ellipsis when wrap is off', () => {
        const rows = text(formatLogLine(record({ message: 'a'.repeat(100) }), options({ width: 50 })));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveLength(50);
        expect(rows[0]!.endsWith('aaa…')).toBe(true);
    });

    it('measures and cuts by code points so astral characters fill one column each', () => {
        const [row] = text(
            formatLogLine(record({ message: '😀'.repeat(30) }), options({ width: 40, showNamespace: false }))
        );
        expect([...row!]).toHaveLength(40);
        expect(row!.endsWith('😀…')).toBe(true);
        const [wrapped, rest] = text(
            formatLogLine(
                record({ message: '😀'.repeat(30) }),
                options({ width: 40, wrap: true, showNamespace: false })
            )
        );
        expect([...wrapped!]).toHaveLength(40);
        expect([...rest!.trim()]).toHaveLength(7);
    });

    it('wraps on word boundaries and indents continuation rows under the message column', () => {
        const message = 'the quick brown fox jumps over the lazy dog';
        const rows = text(formatLogLine(record({ message }), options({ width: 50, wrap: true, showNamespace: false })));
        expect(rows).toEqual(['12:05:33 INFO    the quick brown fox jumps over', '                 the lazy dog']);
    });

    it('breaks words longer than the message column', () => {
        const rows = text(
            formatLogLine(record({ message: 'x'.repeat(40) }), options({ width: 37, wrap: true, showNamespace: false }))
        );
        expect(rows).toEqual([`12:05:33 INFO    ${'x'.repeat(20)}`, `                 ${'x'.repeat(20)}`]);
    });

    it('renders a separator as a full-width rule with the time, reason, and generation', () => {
        const [row] = text(
            formatLogLine(
                { ...base({ message: 'server restarted', generation: 2 }), kind: 'separator' },
                options({ width: 60 })
            )
        );
        expect(row).toBe('─── 12:05:33 server restarted (generation 2) ───────────────');
        expect(row).toHaveLength(60);
    });

    it('renders raw child output muted and prefixed by its stream', () => {
        const [row] = formatLogLine({ ...base({ message: 'node warning' }), kind: 'raw', stream: 'stderr' }, options());
        expect(text([row!])[0]).toBe('12:05:33 stderr  node warning');
        expect(row!.chunks.every((chunk) => chunk.fg?.equals(parseColor(defaultTheme.textMuted)))).toBe(true);
    });

    it('renders a dropped notice from the message the store wrote', () => {
        const [row] = formatLogLine(
            { ...base({ message: '42 log lines were dropped' }), kind: 'dropped', count: 42 },
            options()
        );
        expect(text([row!])[0]).toBe('12:05:33 42 log lines were dropped');
        expect(row!.chunks.at(-1)?.fg?.equals(parseColor(defaultTheme.warning))).toBe(true);
    });

    it('highlights search hits inside the message without changing its text', () => {
        const [row] = formatLogLine(
            record({ message: 'Player Steve joined; steve again' }),
            options({ highlight: 'steve' })
        );
        expect(text([row!])[0]).toBe('12:05:33 INFO    Server       Player Steve joined; steve again');
        const hits = row!.chunks.filter((chunk) => chunk.bg !== undefined);
        expect(hits.map((chunk) => chunk.text)).toEqual(['Steve', 'steve']);
        expect(hits[0]!.bg?.equals(parseColor(defaultTheme.selection))).toBe(true);
    });
});
