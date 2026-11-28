import { describe, expect, it } from 'vitest';

import { javaLocaleOf, parseLang } from './lang';

describe('parseLang', () => {
    it('keeps each key and its text, placeholders and all, and drops comments', () => {
        const text = [
            '﻿## A comment',
            'item.furniture:chair.name=Chair',
            'tile.furniture:lamp.name=Lamp %s\t## trailing note',
            'chat.type.text=<%s> %s=%d',
            'not a key',
            '',
            'entity.furniture:sofa.name=Sofa   \r'
        ].join('\n');

        expect(Object.fromEntries(parseLang(text))).toEqual({
            'item.furniture:chair.name': 'Chair',
            'tile.furniture:lamp.name': 'Lamp %s',
            'chat.type.text': '<%s> %s=%d',
            'entity.furniture:sofa.name': 'Sofa'
        });
    });
});

describe('parseLang on long runs of whitespace', () => {
    it('reads a line of many tabs and comments in one pass over it', () => {
        const runs = 50_000;
        const line = `key=value${' '.repeat(runs)}${'\t##'.repeat(runs)}`;
        expect(Object.fromEntries(parseLang(line))).toEqual({ key: 'value' });
    });
});

describe('javaLocaleOf', () => {
    it('lowercases a language file at the top of texts/', () => {
        expect(javaLocaleOf('texts/en_US.lang')).toBe('en_us');
        expect(javaLocaleOf('texts/zh_TW.lang')).toBe('zh_tw');
        expect(javaLocaleOf('texts/languages.json')).toBeUndefined();
        expect(javaLocaleOf('texts/ja_JP/font/glyph_91.png')).toBeUndefined();
    });
});
