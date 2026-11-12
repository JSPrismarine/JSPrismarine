#!/usr/bin/env bash
# Decides whether this run publishes a nightly release, and writes `publish=true` or
# `publish=false` to the step's outputs. Nightlies are published at most once every six hours; a
# run that already owns the latest nightly's tag publishes again, so a rerun can finish its release.
#
# NIGHTLY_FORCE=1, as a run started by hand sets, publishes whatever the interval says.
#
# Reads BUILD_VERSION, GITHUB_REPOSITORY, GH_TOKEN and NIGHTLY_FORCE.
set -euo pipefail

if [[ "${NIGHTLY_FORCE:-}" == 1 ]]; then
    echo "publish=true" >> "$GITHUB_OUTPUT"
    echo "Publishing the nightly release: this run was started by hand."
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
