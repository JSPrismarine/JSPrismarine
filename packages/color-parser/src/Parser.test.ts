import { describe, expect, it } from 'vitest';
import Parser from './Parser';
describe('Parser', () => {
    it('should replace color codes with console colors', () => {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: strips the ANSI color the parser emits
        expect(Parser('§cHello §eworld§r!').replace(/\u001b\[\d+m/g, '')).toBe('Hello world!');
    });

    it('should replace color codes with custom prefix', () => {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: strips the ANSI color the parser emits
        expect(Parser('@cHello @eworld@r!', '@').replace(/\u001b\[\d+m/g, '')).toBe('Hello world!');
    });

    it('should replace color codes without clearAtEnd', () => {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: strips the ANSI color the parser emits
        expect(Parser('§cHello §eworld§r!', '§', false).replace(/\u001b\[\d+m/g, '')).toBe('Hello world!');
    });
});
