---
sidebar_position: 7
---

# Create a release

:::note
This documentation is only relevant for maintainers of Tobira who are able to create official releases.
:::

## Preparation

- Make sure all pull requests merged since the last release have at least one `changelog:*` label.
  See: [All merged PRs without `changelog:*` label since the 1.0 release][prs-without-label].
  (If you miss some here, this is just a bit more work for you later. Don't worry!)

- Make sure `master` has been successfully deployed and potentially do a quick test run with it.

[prs-without-label]: https://github.com/elan-ev/tobira/pulls?q=is%3Apr+-label%3Achangelog%3Auser%2Cchangelog%3Adev%2Cchangelog%3Aadmin%2Cchangelog%3Abreaking+is%3Amerged+closed%3A%3E2022-07-28+

## Creating the release

:::caution
All these steps should happen on the same day so that all dates (build date, release date, ...) are the same.
Otherwise it might be confusing.
:::

- Run `./util/scripts/make-release.sh v1.3` from the root folder.
  Replace `v1.3` with the new release name.
  The script will guide you through most of the process.

- After the script is done, go to GitHub and open the draft release.
  Check and improve the generated release notes.
  See checklist below!

- Once you are happy with the release notes, wait for GitHub actions to finish building the release binary.
  That is automatically attached to the draft.

- Once all that is done, publish the release.


## Checklist for writing release notes

- All changes that are breaking according to our versioning policy have to be in the "Breaking changes" section!
- All other changes that might be breaking or require attention should be emphasized somehow.
- You can highlight some noteworthy changes by making them bold.
  Bold points should be ordered at the top of each section.
  (Don't overdo it; if more than half of the points are bold, that's harder to read.)
- Make sure all change descriptions are easy to understand.
  Some PR titles can be unfit for release notes as they require too much context.
  Especially in the section for users, try to explain it to technically inclined users.
- If an action from the administrator (e.g. resync) is required to use some new features, also note that.
- Remove all "by PeterLustig" for all regular contributors to make the release notes less noisy.
- If in doubt, check older releases.
