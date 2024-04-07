import { describe, expect, it } from 'vitest';
import Parser from './Parser';
describe('Parser', () => {
    it('should replace color codes with console colors', () => {
        expect(Parser('§cHello §eworld§r!').replace(/\u001b\[\d+m/g, '')).toBe('Hello world!');
    });

    it('should replace color codes with custom prefix', () => {
        expect(Parser('@cHello @eworld@r!', '@').replace(/\u001b\[\d+m/g, '')).toBe('Hello world!');
    });

    it('should replace color codes without clearAtEnd', () => {
        expect(Parser('§cHello §eworld§r!', '§', false).replace(/\u001b\[\d+m/g, '')).toBe('Hello world!');
    });
});
