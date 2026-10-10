/**
 * The file names LevelDB uses inside a database directory. File numbers are zero padded to six
 * digits, and keep going once they need a seventh, so a plain integer parse is what reads them.
 */

export enum FileKind {
    Table = 'table',
    Log = 'log',
    Manifest = 'manifest',
    Current = 'current',
    Lock = 'lock',
    Temp = 'temp',
    Info = 'info'
}

export interface ParsedFileName {
    kind: FileKind;
    /** Absent for CURRENT, LOCK and the info logs, which are not numbered. */
    number?: number;
}

const pad = (number: number): string => String(number).padStart(6, '0');

/** Vanilla writes `.ldb`; upstream LevelDB used to write `.sst` and still reads both. */
export const tableFileName = (number: number): string => `${pad(number)}.ldb`;
export const logFileName = (number: number): string => `${pad(number)}.log`;
export const manifestFileName = (number: number): string => `MANIFEST-${pad(number)}`;
export const tempFileName = (number: number): string => `${pad(number)}.dbtmp`;

export const CURRENT_FILE_NAME = 'CURRENT';
export const LOCK_FILE_NAME = 'LOCK';

export const parseFileName = (name: string): ParsedFileName | null => {
    if (name === CURRENT_FILE_NAME) return { kind: FileKind.Current };
    if (name === LOCK_FILE_NAME) return { kind: FileKind.Lock };
    if (name === 'LOG' || name === 'LOG.old') return { kind: FileKind.Info };

    if (name.startsWith('MANIFEST-')) {
        const number = parseNumber(name.slice('MANIFEST-'.length));
        return number === null ? null : { kind: FileKind.Manifest, number };
    }

    const dot = name.lastIndexOf('.');
    if (dot <= 0) return null;

    const number = parseNumber(name.slice(0, dot));
    if (number === null) return null;

    switch (name.slice(dot)) {
        case '.ldb':
        case '.sst':
            return { kind: FileKind.Table, number };
        case '.log':
            return { kind: FileKind.Log, number };
        case '.dbtmp':
            return { kind: FileKind.Temp, number };
        default:
            return null;
    }
};

const parseNumber = (text: string): number | null => {
    if (text.length === 0 || !/^\d+$/.test(text)) return null;

    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
};
