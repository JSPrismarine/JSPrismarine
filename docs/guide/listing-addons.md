---
title: Listing an addon
description: Take an addon you publish to a page in the marketplace on jsprismarine.dev, and deprecate it when its time is up.
group: Documents
category: Guides
---

# Listing an addon

The [marketplace](../addons/README.md) on jsprismarine.dev lists JSPrismarine's own addons and
addons from other people's repositories. Each listed addon gets a card owners can search and filter,
and a page built from its README, icon and screenshots, with the command that installs it. This
guide takes an addon you already publish from your own repository to a page there.

## What a listing is

A listing is one line in <!-- fact:addons.listingsFile -->`addons/listings.json`<!-- /fact --> in
JSPrismarine's repository, naming your repository and the addons of it the marketplace shows. You
add it in a pull request, and a maintainer reviews it.

The review checks that each addon is what its listing says it is, and that the listing is not spam.
Nobody reviews your scripts. Every community addon's page says "Listed, not reviewed" beside its
install command, so owners know that JSPrismarine checks each download against the hash your index
gives, and nothing more. Your scripts run in the script host's sandbox, with the Script API's reach,
on every server that installs them.

The page content comes from your addon itself, version by version. A listing names the addon, not a
version: the marketplace shows the newest version your index lists.

## Before you start

You need:

- An addon that publishes from your repository's
  <!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release, the way
  [Publishing addons](publishing-addons.md) sets it up. Owners install it as
  `addon install <owner>/<repo>/<name>`.
- A license in its `addon.json`, as an SPDX expression such as `MIT`. The build already asks for
  one.
- `@jsprismarine/addon-tools` new enough to write listings. The release workflow runs the newest
  version unless you pin `tools`. An older version drops the listings of published versions when it
  rewrites your index, so pin one that writes them.
- A pin of the release workflow that attaches listing files. A workflow pinned before listings
  existed publishes an index naming listing files it never attaches, and the marketplace cannot
  show them. Moving the pin later does not help that version, since the workflow attaches files only
  for versions the index does not list yet. Move the pin to a current commit on JSPrismarine's
  `master` before you release a version with listing keys.

## Fill in the listing

The marketplace reads everything from the addon's folder. Beside `description`, `minServer` and
`license`, `addon.json` takes the listing keys
<!-- fact:addons.listingKeys -->`title`, `tags`, `authors`, `screenshots`, `deprecated` and `replacedBy`<!-- /fact -->:

```json
{
    "description": "Named places players save and travel back to with /warp.",
    "minServer": "0.23.0",
    "license": "MIT",
    "title": "Warps",
    "tags": ["gameplay"],
    "authors": ["Ada Lovelace"],
    "screenshots": [{ "file": "media/sign.png", "alt": "A warp sign beside the spawn point." }]
}
```

- `title` is the addon's name on its card and page. Without it the build takes the README's first
  heading, then the manifest header's `name`.
- `tags` put the addon under the marketplace's filters. They come from a fixed list:
  <!-- fact:addons.tags -->`admin`, `chat`, `gameplay`, `performance` and `world`<!-- /fact -->. Pick
  the ones an owner would filter by.
- `authors` are the people who wrote the addon, as the page credits them.
- <!-- fact:addons.iconFile -->`pack_icon.png`<!-- /fact --> in the folder is the addon's icon, the
  same file Bedrock shows for the pack. It has to be a square PNG; 256 by 256 pixels reads well on
  a card and on the page. Without one, the card shows the title's first letter.
- `screenshots` are images under <!-- fact:addons.mediaDirectory -->`media/`<!-- /fact -->, each a
  <!-- fact:addons.screenshotTypes -->`.png`, `.jpg`, `.jpeg` or `.webp`<!-- /fact --> with alt text
  that says what it shows to a reader who cannot see it. The page shows them in the order you list
  them. The pack leaves `media/` out, so servers never download them.

The README is the body of the page. The page drops its first heading, since the page's title
replaces it, and puts the rest under that title. Write it for an owner deciding whether to install
the addon: what it does, the commands it adds, who may run them, and anything to set up. On the
page:

- Raw HTML in the README shows as text, and only relative, `http:`, `https:` and `mailto:` links
  stay links.
- A relative link opens the file on GitHub from the addon's folder, `addons/<name>/`.
- An image shows when it is one of your listed screenshots, such as `![A warp sign](media/sign.png)`.
  Any other image becomes a link to it, so the page loads nothing the marketplace has not checked.

`jsp-addon build` checks each of these keys, the tag list and the icon, so a mistake fails the build
on your pull request rather than on the page.

## Release a version

A listing is fixed with the version it belongs to. The build writes the README, the icon and the
screenshots beside each pack, the release workflow uploads them, and the index entry for that
version gains a `listing` that links each file with its SHA-256. Changing any of them for a version
already on the release fails the build, as changing the pack does. So raise the version to publish a
new listing, the same way you would for a change to the scripts.

After the release, open your `index.json` and check that the new version's entry has a `listing`
with your title, tags and files. Versions you published before listings existed have none; the
marketplace shows their description until a newer version has one.

## Open the pull request

Fork JSPrismarine's repository and add your repository to
<!-- fact:addons.listingsFile -->`addons/listings.json`<!-- /fact -->, naming each addon to list:

```json
{
    "$schema": "./listings.schema.json",
    "listings": [{ "repository": "you/your-addons", "addons": ["warps", "homes"] }]
}
```

Then run `pnpm run addons:listings`, which reads your index and writes the snapshot the site builds
from, <!-- fact:addons.listingsLockFile -->`addons/listings.lock.json`<!-- /fact -->, and commit both
files. A check on the pull request fails when the snapshot does not match the listings file.

Open the pull request with the
[addon listing template](../../.github/PULL_REQUEST_TEMPLATE/addon-listing.md): add
`?template=addon-listing.md` to the address of GitHub's page for the new pull request, or paste the
template into its description. Its checklist asks for what the review looks at: the repository, the
install id of each addon, the license, the tags, the alt text and a README that says what the addon
does.

Each addon is named on its own, so a new addon in a listed repository needs a pull request of its
own before the marketplace shows it.

## After it merges

The addon's page lives at `/addons/<owner>/<repo>/<name>` on jsprismarine.dev, and its card joins
the marketplace once the site deploys.

A workflow refreshes the snapshot every day at
<!-- fact:addons.listingsRefreshTime -->05:41 UTC<!-- /fact -->. It reads each listed repository's
index, moves each addon to its newest version, and opens a pull request that merges itself once its
checks pass. A version you release shows on the marketplace within a day.

If your release or its index goes away, the snapshot keeps the last version it saw, so the page
still shows its text, without the README and the images. After
<!-- fact:addons.listingsMissingDays -->7<!-- /fact --> days the marketplace marks the addon
deprecated. An archived repository's addons are marked deprecated at the next refresh. Nothing
removes a listing on its own.

## Deprecate an addon

When owners should stop installing an addon, release a new version whose `addon.json` says why, and
name the addon that replaces it, if one does:

```json
{
    "deprecated": "Use warps-plus instead.",
    "replacedBy": "you/your-addons/warps-plus"
}
```

`replacedBy` is an install id: a bare name means one of JSPrismarine's own addons, so name another
repository's addon as `<owner>/<repo>/<name>`. The marketplace hides the addon behind its "Show
deprecated" filter, and its page opens with your reason and a link to the replacement. Servers that
install or update to that version print the reason as a warning, and `addon list` marks the addon.
Neither refuses it, so an owner who needs it can still have it.

A deprecation belongs to the version that carries it. Versions you published before it stay as
they were, and an owner who pinned one of them sees the warning only after they update to the
deprecated version.

To have an addon taken off the marketplace, open a pull request that removes it from
<!-- fact:addons.listingsFile -->`addons/listings.json`<!-- /fact --> and runs
`pnpm run addons:listings` again. Servers that installed it keep it, since they install from your
repository and not from the marketplace.
