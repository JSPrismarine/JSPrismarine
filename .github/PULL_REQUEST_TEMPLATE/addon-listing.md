<!--
A request to list an addon in the marketplace on jsprismarine.dev. Listing an addon
(https://jsprismarine.dev/guide/listing-addons) walks through each step.
-->

## The addon

- Repository: <!-- owner/repo -->
- Addons this pull request lists: <!-- each name as addons/listings.json gives it -->
- Install id: <!-- owner/repo/name -->

## Checklist

- [ ] The repository publishes the addon from its `addons` release, and its `index.json` lists it
      with a `listing`.
- [ ] Each addon's `addon.json` has a `license`, a `title`, tags from the fixed list and alt text
      for each screenshot.
- [ ] The README says what the addon does, the commands it adds and who may run them.
- [ ] `pnpm run addons:listings` ran after the change to `addons/listings.json`, and this pull
      request includes the `addons/listings.lock.json` it wrote.
- [ ] I understand that the review checks the listing matches the addon and is not spam, and that
      nobody reviews the addon's scripts: its pages say "Listed, not reviewed".
