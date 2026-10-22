---
sidebar_position: 1
---

# Contributing to Tobira

You want to contribute to Tobira by suggesting or implementing features, fixing bugs, improving documentation or in some other way? Great! 
But please do read [our contribution guidelines](https://github.com/elan-ev/tobira/blob/main/docs/CONTRIBUTING.md) first! 
The gist: open an issue before working on new features or bigger changes.


## Getting started with the code base

Be sure to check out [all the documentation for developers](.) which contains valuable information!
Reading about [the general architecture of Tobira](../overview) also helps.
This should get you started.
If you have any more questions, feel free to ask and ping us devs [in the Opencast chat](https://opencast.org/communication/).


## Branches

Tobira uses `main` as main branch.
Releases are created from that branch and most PRs should target it.
`main` should always be in a releasable state.
There is also `next`, which is sometimes used to prepare bigger releases.
PRs that we cannot immediately release should target that branch (e.g. a big feature is split into multiple PRs, or we want to cluster breaking changes).


## Creating Pull Requests

When creating a PR, please describe **what** the PR changes and **why** you think this change is useful.
This makes it a lot easier for us to understand and review PRs.

Additionally:

- Try to keep your commits as atomic as possible and provide a [good message for each commit](https://chris.beams.io/posts/git-commit/).
- If your PR relates to an existing issue, please link that issue.
- Our CI, which performs a lot of automated tests, **must** succeed for your PR.
  Otherwise it cannot be merged.
  If the CI fails and you think it is not caused by your change, please ping us.

We will review your pull request and comment with any issues we found or any points that require discussion.
For larger PRs, there are usually multiple rounds of review + you pushing the requested changes until the PR is ready to be merged.

### License

Tobira is licensed under [Apache 2.0](https://github.com/elan-ev/tobira/blob/main/LICENSE).

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.


## Being Pragmatic

For every rule, there is an exception.
If you find that there is a good reason one of the rules does not apply to you, please bring it up and explain why.
We like to be pragmatic if necessary instead of just blindly following rules.
