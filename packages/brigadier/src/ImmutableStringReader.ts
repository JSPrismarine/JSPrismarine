export default interface ImmutableStringReader {
    getString(): string;

    getRemainingLength(): number;

    getTotalLength(): number;

    getCursor(): number;

    getRead(): string;

    getRemaining(): string;

    canRead(length: number): boolean;

    canRead(): boolean;

    peek(): string;

    peek(offset: number): string;
}
