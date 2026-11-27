#!/usr/bin/env bash
# Decides whether this run publishes a nightly release, and writes `publish=true` or
# `publish=false` to the step's outputs. Nightlies are published at most once every six hours; a
# run that already owns the latest nightly's tag publishes again, so a rerun can finish its release.
#
# A push after a failed nightly run publishes whatever the interval says. Otherwise a push that
# repairs the nightly waits out the six hours from the last nightly that was published, and the
# channel keeps a build older than the fix.
#
# NIGHTLY_FORCE=1, as a run started by hand sets, publishes whatever the interval says.
#
# Reads BUILD_VERSION, GITHUB_REPOSITORY, GITHUB_RUN_ID, GH_TOKEN and NIGHTLY_FORCE.
set -euo pipefail

if [[ "${NIGHTLY_FORCE:-}" == 1 ]]; then
    echo "publish=true" >> "$GITHUB_OUTPUT"
    echo "Publishing the nightly release: this run was started by hand."
    exit 0
fi

# The last push run on master that finished before this one, this run aside: it is still going.
previous_conclusion="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/nightly.yml/runs?branch=master&event=push&status=completed&per_page=5" \
    --jq "[.workflow_runs[] | select(.id != ${GITHUB_RUN_ID})] | first | .conclusion // empty")"
if [[ "$previous_conclusion" == failure ]]; then
    echo "publish=true" >> "$GITHUB_OUTPUT"
    echo "Publishing the nightly release: the previous nightly run failed."
    exit 0
fi

latest_nightly="$(gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" \
    --jq '[.[] | select(.prerelease == true and (.tag_name | startswith("jsprismarine@")) and (.tag_name | contains("-nightly.")) and (.published_at != null)) | [.tag_name, .published_at]] | first // empty | @tsv')"
if [[ -n "$latest_nightly" ]]; then
    IFS=$'\t' read -r latest_tag latest_published_at <<< "$latest_nightly"
    if [[ "$latest_tag" != "jsprismarine@${BUILD_VERSION}" ]]; then
        latest_published_epoch="$(date -u --date="$latest_published_at" +%s)"
        current_epoch="$(date -u +%s)"
        if (( current_epoch - latest_published_epoch < 6 * 60 * 60 )); then
            echo "publish=false" >> "$GITHUB_OUTPUT"
            echo "Skipping the nightly release; the previous one was published at $latest_published_at."
            {
                echo '### Nightly release skipped'
                echo
                echo 'The previous nightly was published less than six hours ago, so this run publishes none.'
            } >> "$GITHUB_STEP_SUMMARY"
            exit 0
        fi
    fi
fi
echo "publish=true" >> "$GITHUB_OUTPUT"
