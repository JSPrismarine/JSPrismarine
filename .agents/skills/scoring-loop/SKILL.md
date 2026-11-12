---
name: scoring-loop
description: Hill-climb any artifact in rounds scored by blind, independent LLM judges.
disable-model-invocation: true
---

# Scoring loop

Improve an artifact in **rounds**. Each round captures a fixed **evidence set**, has a fresh
panel of judges score it beside the previous round without knowing which is which, and then
applies the findings that hold up. You
are the **orchestrator**. You hold the scores, the round numbers and the A/B key, and the judges
hold none of them.

The artifact is anything a judge can read as files: prose, a prompt's outputs, an API's shape, a
visual surface. A domain skill supplies the capture and the rubric for its kind of artifact:
[`design-scoring-loop`](../design-scoring-loop/SKILL.md) for visual surfaces. With no domain skill,
you define both in steps 1 and 2.

Before starting, get from the user: the artifact, the parts of it that matter, the target score if
they have one, and anything they want kept as it is. If the artifact has a guide or a spec, read it
in full.

## 1. Fix the evidence set

The evidence set is the files a judge reads to score one round. Everything round-specific lives in
the scratchpad (`$S` below), never in the repository: `$S/rounds/r0`, `$S/rounds/r1`, and so on.

- The same items under the same file names every round, so rounds compare like with like.
- A deterministic capture: pin whatever varies between runs (locale, clock, seed, viewport), so a
  difference between rounds is a change you made.
- Small enough that a judge reads all of it. Crop or sample long items the same way every round.
- A written list of **capture limits**: what the evidence cannot show, and what in it is a capture
  artifact, not a defect.

Done when `r0` holds every item and you have opened each one and found no artifact the list of
capture limits leaves out.

## 2. Write the brief once

Fill in [`judge-brief.md`](judge-brief.md) and save it as `$S/judge-brief.md`. One brief serves
every judge and every round. Keep the rubric fixed for the whole loop; changing it mid-loop breaks
the score trajectory.

Keep the brief **blind**. It never states the target score, any earlier score, the round number,
or which version is newer. Anchored judges drift toward the number they were shown, and a judge
who knows a version is "after the fixes" scores it up.

List under "Decided, do not raise" each choice the user has made and will keep. Judges then spend
their improvement slots elsewhere. Add to the list as the user decides more.

## 3. Run a round

1. Capture `$S/rounds/r<n>`.
2. Stage it with [`scripts/stage.mjs`](scripts/stage.mjs):
   `node stage.mjs $S/judge $S/rounds/r<n> $S/rounds/r<n-1>` (round 0 has no previous round, so
   leave the last argument out). It prints a directory with a neutral name that holds the two
   rounds as `A` and `B` in a random order, and a `scratch/` folder for the judges. The key goes
   to `$S/keys/`, which no judge is told about.
3. Spawn the **panel**: one Opus judge at medium effort, one Sonnet judge, and one judge for each
   other model or provider the user names. Ask the user for those before round 0. Name each
   judge's model explicitly; a judge that inherits the orchestrator's model is the wrong judge.
   Spawn fresh judges every round, all in parallel: a continued judge carries its old scores into
   the new round. Give each judge the brief path, the staged directory and a judge id (`j1`,
   `j2`, ...) for its scratch folder.

Every judge covers every area of the rubric and scores both versions, so each returns a table
with a row per criterion and a column per version.

Done when every judge has returned its scores table, its comparison and its ranked list.

## 4. Act on the findings

1. Read the key and relabel each judge's columns as old and new. Build one table per round: a
   row per judge, the old overall, the new overall and the difference.
2. Read the round by the **paired difference**: new minus old from the same judge, averaged over
   the panel. Both scores come from one judge in one sitting, so the difference carries less noise
   than two scores from different rounds. A panel mean under about ±0.2 is noise. An item where a
   judge preferred the old side is a regression; fix it before anything else.
3. Pick the findings to act on: those raised by more than one judge, or those you confirm yourself
   in the evidence and the source. Judges report things already fixed, misread details and
   contradict each other between rounds; drop a finding you cannot confirm.
4. Keep what the user asked to keep, even when judges call it redundant or noisy. A change that
   removes it needs the user's agreement first. Improve it instead.
5. Make real fixes. A change aimed at a rubric line rather than at the artifact's audience (padding
   it with claims, hiding a weak part from the capture) raises the score and lowers the artifact.
6. Rebuild, capture, and look at every changed item yourself before the next round.

Change the guide or spec only after the round is judged, in the commit that lands the change. A
judge reads the guide, and a rule that already describes one version tells it which version is
newer.

Follow the repository's own rules for the changes themselves, and commit in small slices when the
user asked for commits.

## 5. Stop and report

Stop when the user's target is reached. Stop early and ask when the panel prefers the old side two
rounds in a row.

On a **plateau**, stop making small fixes. A plateau is three rounds in which the new version's
panel mean stays within ±0.2, even while the judges keep preferring each new version. Small fixes
have run out by then, and what is left is structure. Bring the user the structural changes the
judges keep asking for, as choices, and continue with the ones they pick.

Report to the user: the old and new panel means per round, the per-criterion scores for the first
and last round, the changes that moved the score, the findings you rejected and why, and anything
judges wanted removed that you kept.

## 6. Fold the rules back

The artifact is the source of truth; its guide follows it. Write each rule the loop established
into the guide, and raise the judges' "Guide changes" items with the user before applying them.
