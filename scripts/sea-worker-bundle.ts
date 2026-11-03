/** Rewrites the CommonJS require base in a self-contained SEA worker bundle. */
export const rewriteSeaWorkerRequireBase = (source: string): string =>
    source.replaceAll('createRequire(import.meta.url)', 'createRequire(process.execPath)');
