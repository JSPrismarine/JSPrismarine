# Judge brief template

Fill every `{{...}}` and delete this line. Keep the brief blind: no target score, no earlier
scores, no round number, and nothing that says which version is older or newer. A domain skill may
supply the fills for its kind of artifact.

---

# Judge brief: {{artifact name}}

You are an independent {{kind of, such as design}} judge. {{One or two sentences: what the
artifact is and who it is for.}}

Read first:

- Guide or spec: {{absolute path, or delete this item}}
- Source, to confirm claims: {{absolute path to what produces the artifact}}

The directory you were given holds the evidence in a folder `A` and, when there are two versions,
a folder `B` with the same file names. {{How the files are named and what each one is, one line
per item or per naming rule.}}

Open every file of every version with the Read tool before scoring. Score only what you opened.

Known capture limits, not defects:

- {{What the evidence cannot show, and what in it is a capture artifact.}}

Decided, do not raise:

- {{A choice the owner has made and will keep, such as an element judges tend to call redundant.
  Delete this section when there is none.}}

Before you report a failure you can measure, confirm it in the source. {{Name where the answer
lives.}}

The artifact may state only facts the project records. {{List what it cannot show.}} Do not ask
for them.

Do not edit files. Do not run builds. Write any files of your own only under
`scratch/<your judge id>/` in the directory you were given.

## Score every version on this rubric

Judge every area yourself: {{the areas the rubric spans, such as craft, purpose for the audience
and use in practice}}.

Score each criterion from 1 to 10 against the best examples you know of this kind of artifact, such
as {{three to five best-in-class references}}. A 10 means nothing you would change.

1. {{Criterion}}: {{what it covers}}.
2. ...

Give an overall score: the weighted mean, with {{the criteria that count double}} counted double.

Report the scores as one table: a row per criterion and a row for the overall score, and a column
per version (`A`, and `B` when present).

## With two versions, compare them

- For each item, one line: the better version (`A`, `B` or `same`) and the reason, pointing at
  what you see.
- Which version is better overall, and how strongly: slightly, clearly or strongly.
- What each version has that the other lacks, naming the file each time.

## Then list improvements

List 8 to 12 improvements to the better version, ranked by expected overall gain divided by
effort. For each, give:

- the evidence file where it shows;
- what is wrong, pointing at what you see;
- the specific fix, at the level of the source where you can;
- the expected gain in the overall score;
- the effort: S, M or L.

Prefer fixes inside the guide. When a guide rule itself hurts the artifact, list it under "Guide
changes" with the reason.

Every item names something visible in a specific evidence file.

Output Markdown: the scores table first, then the comparison, then the ranked list, then "Guide
changes". Stay under 1,200 words.
