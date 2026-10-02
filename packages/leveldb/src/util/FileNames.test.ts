import { describe, expect, it } from 'vitest';

import {
    CURRENT_FILE_NAME,
    FileKind,
    LOCK_FILE_NAME,
    logFileName,
    manifestFileName,
    parseFileName,
    tableFileName,
    tempFileName
} from './FileNames';

describe('leveldb', () => {
    describe('FileNames', () => {
        it('pads file numbers to six digits', () => {
            expect(tableFileName(5)).toBe('000005.ldb');
            expect(logFileName(42)).toBe('000042.log');
            expect(manifestFileName(1)).toBe('MANIFEST-000001');
            expect(tempFileName(7)).toBe('000007.dbtmp');
        });

        it('keeps going past six digits rather than truncating', () => {
            expect(tableFileName(1234567)).toBe('1234567.ldb');
        });

        it('round-trips every name it builds', () => {
            expect(parseFileName(tableFileName(5))).toEqual({ kind: FileKind.Table, number: 5 });
            expect(parseFileName(logFileName(42))).toEqual({ kind: FileKind.Log, number: 42 });
            expect(parseFileName(manifestFileName(1))).toEqual({ kind: FileKind.Manifest, number: 1 });
            expect(parseFileName(tempFileName(7))).toEqual({ kind: FileKind.Temp, number: 7 });
            expect(parseFileName(CURRENT_FILE_NAME)).toEqual({ kind: FileKind.Current });
            expect(parseFileName(LOCK_FILE_NAME)).toEqual({ kind: FileKind.Lock });
        });

        it('reads .sst as a table too', () => {
            // What upstream LevelDB called tables before it switched to .ldb. Databases that old
            // still occur, and a reader that ignores them silently loses whole levels.
            expect(parseFileName('000009.sst')).toEqual({ kind: FileKind.Table, number: 9 });
        });

        it('recognises the info logs, which are not numbered', () => {
            expect(parseFileName('LOG')).toEqual({ kind: FileKind.Info });
            expect(parseFileName('LOG.old')).toEqual({ kind: FileKind.Info });
        });

        it('ignores anything it does not recognise', () => {
            for (const name of ['', 'random.txt', '000001', 'MANIFEST-', 'MANIFEST-abc', '.ldb', 'abc.ldb']) {
                expect(parseFileName(name)).toBeNull();
            }
        });

        it('ignores a number too large to be exact', () => {
            expect(parseFileName('99999999999999999999.ldb')).toBeNull();
        });
    });
});
