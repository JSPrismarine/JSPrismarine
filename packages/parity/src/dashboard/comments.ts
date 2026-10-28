/** A GitHub issue comment with the fields needed to find the dashboard's prior report. */
export interface IssueComment {
    readonly id: number;
    readonly body: string;
    readonly user: { readonly login: string };
}

/** Finds the newest dashboard comment authored by the workflow bot. */
export const findParityComment = (
    comments: readonly IssueComment[],
    marker: string,
    botLogin = 'github-actions[bot]'
): IssueComment | undefined =>
    comments
        .filter((comment) => comment.user.login === botLogin && comment.body.includes(marker))
        .reduce<IssueComment | undefined>(
            (newest, comment) => (newest === undefined || comment.id > newest.id ? comment : newest),
            undefined
        );
