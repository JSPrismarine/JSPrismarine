/** Imports the server entry and reports total Node startup time and CPU use for the loader probe. */
try {
    await import('../src/Server.ts');
} catch (error) {
    process.stdout.write(
        `${JSON.stringify({
            node: process.version,
            elapsedMs: process.uptime() * 1000,
            cpuMs: (process.resourceUsage().userCPUTime + process.resourceUsage().systemCPUTime) / 1000,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            diagnostic: error instanceof Error ? error.stack : undefined
        })}\n`
    );
    process.exitCode = 1;
}

if (process.exitCode !== 1) {
    process.stdout.write(
        `${JSON.stringify({
            node: process.version,
            elapsedMs: process.uptime() * 1000,
            cpuMs: (process.resourceUsage().userCPUTime + process.resourceUsage().systemCPUTime) / 1000
        })}\n`
    );
}
