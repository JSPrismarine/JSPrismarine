import { appendFileSync } from 'node:fs';

// Finds the jobs a push to master can skip because a run already passed them on the same code: the
// merge group's run, when the pull request merged through the merge queue, or the pull request's
// own last run. Pull requests merge by rebase, so the pushed commit only matches what a run tested
// when its tree equals the tree of the commit the run tested. A pull request head that was behind
// master when it merged gets a new tree, and everything runs again.
//
// Writes `passed`, a JSON array of the names of the jobs that succeeded in that run, and `run-id`,
// the run to fetch artifacts from. A matrix job also adds its name without the `(...)` suffix when
// every one of its entries succeeded, so `🎮 Client E2E` stands for all the protocols.

const apiUrl = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const workflowRef = process.env.GITHUB_WORKFLOW_REF;
if (!repository || !sha || !token || !workflowRef) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_TOKEN and GITHUB_WORKFLOW_REF are required');
}

// `owner/repo/.github/workflows/ci.yml@refs/heads/master`. A workflow that reads another one's runs,
// such as `coverage.yml` reading `ci.yml`'s, names it in `RESULTS_WORKFLOW`.
const workflowFile = process.env.RESULTS_WORKFLOW || workflowRef.split('@')[0].split('/').at(-1);

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

/**
 * The newest completed merge group run whose head commit has the pushed commit's tree. The queue
 * builds the commits it merges, so the run of the group that landed this push tested this tree,
 * whether or not master got the same SHA.
 */
const findMergeGroupRun = async (tree) => {
    const { workflow_runs: runs } = await api(
        `actions/workflows/${workflowFile}/runs?event=merge_group&status=completed&per_page=20`
    );
    for (const run of runs) {
        if (run.head_sha === sha) return run;
        // A head that cannot be read is no match, and the search goes on.
        const head = await api(`git/commits/${run.head_sha}`).catch(() => undefined);
        if (head?.tree.sha === tree) return run;
    }
    return undefined;
};

/** The merged pull request's last completed run, when its head has the pushed commit's tree. */
const findPullRequestRun = async (tree) => {
    const pull = (await api(`commits/${sha}/pulls`)).find((candidate) => candidate.merged_at);
    if (!pull) {
        console.log(`${sha} did not come from a merged pull request.`);
        return undefined;
    }
    const head = await api(`git/commits/${pull.head.sha}`);
    if (head.tree.sha !== tree) {
        console.log(`#${pull.number} was not up to date with master when it merged, so its runs tested other code.`);
        return undefined;
    }
    const { workflow_runs: runs } = await api(
        `actions/workflows/${workflowFile}/runs?event=pull_request&status=completed&head_sha=${pull.head.sha}&per_page=1`
    );
    if (!runs[0]) console.log(`#${pull.number} has no completed ${workflowFile} run for ${pull.head.sha}.`);
    return runs[0];
};

const findPassedJobs = async () => {
    const { tree } = await api(`git/commits/${sha}`);
    const run = (await findMergeGroupRun(tree.sha)) ?? (await findPullRequestRun(tree.sha));
    if (!run) return undefined;

    const { jobs } = await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    const passed = new Set(jobs.filter((job) => job.conclusion === 'success').map((job) => job.name));

    // The runner's own Node runs this before any setup step, so no `Map.groupBy`.
    const matrixJobs = new Map();
    for (const job of jobs.filter((candidate) => / \(.+\)$/.test(candidate.name))) {
        const name = job.name.replace(/ \(.+\)$/, '');
        matrixJobs.set(name, [...(matrixJobs.get(name) ?? []), job]);
    }
    for (const [name, entries] of matrixJobs) {
        if (entries.every((job) => job.conclusion === 'success')) passed.add(name);
    }

    console.log(`Reusing the results of ${run.html_url} (${run.event}) for ${sha}:`);
    for (const name of passed) console.log(`  ${name}`);
    return { passed: [...passed], runId: run.id };
};

const result = await findPassedJobs();
write(result?.passed ?? [], result?.runId ?? '');
