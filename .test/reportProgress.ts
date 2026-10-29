/** Reports non-gating progress as a CI warning or a local console warning. */
export const reportProgress = (message: string, title = 'Implementation progress'): void => {
    if (process.env.GITHUB_ACTIONS === 'true') {
        process.stdout.write(`::warning title=${title}::${message}\n`);
        return;
    }

    console.warn(`[${title.toLowerCase()}] ${message}`);
};
