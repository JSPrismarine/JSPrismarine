import fs from 'node:fs';
import path from 'node:path';

const reportPath = path.resolve('coverage/client-e2e/lcov.info');
const report = fs.readFileSync(reportPath, 'utf8');
const sourceFiles = [...report.matchAll(/^SF:(packages\/[^\n]+)$/gm)];
const coveredLines = report.split('\n').some((line) => {
    if (!line.startsWith('DA:')) return false;
    return Number(line.split(',')[1]) > 0;
});

if (sourceFiles.length === 0 || !coveredLines) {
    throw new Error(`${reportPath} contains no covered package source lines`);
}

console.log(`client-e2e coverage includes ${sourceFiles.length} package source files`);
