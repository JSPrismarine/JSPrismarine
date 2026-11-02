import { takeCoverage } from 'node:v8';

// The e2e server's `stop` command leaves its process alive; the runner kills it after a grace
// period, so snapshots during the run preserve coverage before that forced exit.
setInterval(takeCoverage, 10_000).unref();
process.on('exit', takeCoverage);
