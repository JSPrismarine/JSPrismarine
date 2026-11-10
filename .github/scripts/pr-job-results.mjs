import { appendFileSync } from 'node:fs';

// Finds the jobs a push to master can skip because the merged pull request already passed them on
// the same code. Pull requests merge by rebase, so the pushed commit only matches what the pull
// request's last run tested when its tree equals the pull request head's tree. A head that was
// behind master when it merged gets a new tree, and everything runs again.
//
// Writes `passed`, a JSON array of the names of the jobs that succeeded in that run, and `run-id`,
// the run to fetch artifacts from. A matrix job also adds its name without the `(...)` suffix when
// every one of its entries succeeded, so `🎮 Client E2E` stands for all the protocols. An entry
// whose suffix ends in `, allowed to fail` is left out of that, as its run's gate leaves it out.

const apiUrl = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const workflowRef = process.env.GITHUB_WORKFLOW_REF;
if (!repository || !sha || !token || !workflowRef) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_TOKEN and GITHUB_WORKFLOW_REF are required');
}

// `owner/repo/.github/workflows/test.yml@refs/heads/master`
const workflowFile = workflowRef.split('@')[0].split('/').at(-1);

const api = async (path) => {
    const response = await fetch(`${apiUrl}/repos/${repository}/${path}`, {
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28'
        }
    });
    if (!response.ok) throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
    return response.json();
};

const write = (passed, runId) => {
    const lines = `passed=${JSON.stringify(passed)}\nrun-id=${runId}\n`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
    else process.stdout.write(lines);
};

const findPassedJobs = async () => {
    const pull = (await api(`commits/${sha}/pulls`)).find((candidate) => candidate.merged_at);
    if (!pull) {
        console.log(`${sha} did not come from a merged pull request.`);
        return undefined;
    }

    const [pushed, head] = await Promise.all([api(`git/commits/${sha}`), api(`git/commits/${pull.head.sha}`)]);
    if (pushed.tree.sha !== head.tree.sha) {
        console.log(`#${pull.number} was not up to date with master when it merged, so its runs tested other code.`);
        return undefined;
    }

    const { workflow_runs: runs } = await api(
        `actions/workflows/${workflowFile}/runs?event=pull_request&status=completed&head_sha=${pull.head.sha}&per_page=1`
    );
    const run = runs[0];
    if (!run) {
        console.log(`#${pull.number} has no completed ${workflowFile} run for ${pull.head.sha}.`);
        return undefined;
    }

    const { jobs } = await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    const passed = new Set(jobs.filter((job) => job.conclusion === 'success').map((job) => job.name));

    // The runner's own Node runs this before any setup step, so no `Map.groupBy`.
    // An entry allowed to fail, such as the NetherNet client e2e run, does not hold its matrix back.
    const matrixJobs = new Map();
    const counted = jobs.filter(
        (candidate) => / \(.+\)$/.test(candidate.name) && !/, allowed to fail\)$/.test(candidate.name)
    );
    for (const job of counted) {
        const name = job.name.replace(/ \(.+\)$/, '');
        matrixJobs.set(name, [...(matrixJobs.get(name) ?? []), job]);
    }
    for (const [name, entries] of matrixJobs) {
        if (entries.every((job) => job.conclusion === 'success')) passed.add(name);
    }

    console.log(`Reusing the results of ${run.html_url} for #${pull.number}:`);
    for (const name of passed) console.log(`  ${name}`);
    return { passed: [...passed], runId: run.id };
};

const result = await findPassedJobs();
write(result?.passed ?? [], result?.runId ?? '');
