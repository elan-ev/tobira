---
sidebar_position: 4
---

# LTI 1.3

Tobira can act as an **LTI 1.3 tool** that Learning Management Systems ("platforms" in
LTI terms, e.g. Moodle or Canvas) launch. A user who clicks a Tobira activity in the LMS
is logged into Tobira and lands on a Tobira page — without a separate login.

LTI runs **alongside** the normal login: it is an additional way to create sessions, not a
replacement for `auth.source`. It therefore requires Tobira's built-in session management:

```toml
[auth]
source = "tobira-session"
```

:::note
This is the MVP of LTI support. It implements LTI 1.3 Core (launch + login). Deep Linking,
Names & Role Provisioning (NRPS), and Dynamic Registration are **not** included yet. See
[Known limitations](#known-limitations).
:::


## How it works

A launch is a standard LTI 1.3 / OpenID Connect flow across three Tobira endpoints:

1. The LMS sends the browser to **`/~lti/login`** (OIDC third-party login initiation).
   Tobira looks up the platform, issues a one-time `state` + `nonce`, and redirects back
   to the platform's authorization endpoint.
2. The platform posts a signed launch token (`id_token`, a JWT) to **`/~lti/launch`**.
   Tobira verifies the signature against the platform's public keys, checks `iss`, `aud`,
   `nonce` and `deployment_id`, and then resolves the user (see
   [Users and roles](#users-and-roles)).
3. Tobira creates a normal `tobira-session` cookie and redirects the browser to the
   target page.

**`/~lti/jwks`** serves Tobira's own public key set (the LMS uses it to verify tokens that
Tobira signs; only relevant for future service calls).

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/~lti/login` | GET/POST | OIDC third-party login initiation |
| `/~lti/launch` | POST | Receives and verifies the signed launch |
| `/~lti/jwks` | GET | Tobira's public JWK set |


## Prerequisites

- **`auth.source = "tobira-session"`** — LTI creates Tobira sessions.
- **HTTPS** — LTI 1.3 mandates it, and Tobira's session cookie is `Secure`.
- **Launch in a new window/tab, not an iframe.** Tobira's session cookie is `SameSite=Lax`,
  which is not sent inside a cross-site iframe. In the LMS, set the launch container to
  "New window". Embedding in an iframe is not supported yet.
- **The launching user must exist in Opencast.** Just like the normal login, Tobira asks
  Opencast for the user's roles; see below.


## Users and roles {#users-and-roles}

Tobira does not manage roles itself. After verifying the launch, it asks Opencast for the
user (via `/info/me.json`, impersonating the user with the `[sync]` admin credentials),
exactly like a normal login. **The user must exist in Opencast**, otherwise the launch is
rejected (`user … is not known to Opencast`).

Which launch claim provides that username is an **admin decision per platform**, set with
`username_source` on the platform entry:

| `username_source` | Uses | When |
| --- | --- | --- |
| `"preferred-username"` (default) | the `preferred_username` claim | Platforms that assert it, e.g. **Canvas** — works out of the box. |
| `"custom"` | the `username` **custom parameter** | Platforms that send no usable `preferred_username`, e.g. **Moodle** (see [Moodle setup](#moodle)). |
| `"sub"` | the raw `sub` claim | Rarely useful — `sub` is usually an opaque platform ID. |

If the configured claim is absent, the launch is **rejected** rather than falling back to
a guessed identity. The resulting username must match a user Opencast knows.

:::warning
`username_source = "custom"` trusts the `username` custom parameter to assert the user's
identity. In most LMS, custom parameters can be set **per placement, by instructors** — so
only enable `"custom"` for platforms where you accept that whoever configures a launch can
choose the asserted username. Where possible, pin the custom parameter at the tool level
(admin) to the substitution value `$User.username`. The default `"preferred-username"`
does not have this concern, because that claim is asserted by the platform.
:::


## Configuration

Enable LTI and register each platform/deployment under `[auth.lti]`:

```toml
[auth.lti]
enabled = true

[[auth.lti.platforms]]
issuer = "https://moodle.example.org"
client_id = "AbCd1234"
deployment_id = "1"
auth_login_url = "https://moodle.example.org/mod/lti/auth.php"
keyset_url = "https://moodle.example.org/mod/lti/certs.php"
username_source = "custom"   # Moodle only; see "Users and roles". Omit for Canvas etc.
```

The first five values come from the tool registration in the LMS, which labels them
differently than the LTI spec terms used here (`username_source` is Tobira-only, see
[Users and roles](#users-and-roles)):

| Config field | Moodle label | Canvas label |
| --- | --- | --- |
| `issuer` | Platform ID | Issuer |
| `client_id` | Client ID | Client ID |
| `deployment_id` | Deployment ID | Deployment ID |
| `auth_login_url` | Authentication request URL | OIDC Auth endpoint |
| `keyset_url` | Public keyset URL | Public JWKS URL |

`issuer` is compared **verbatim** against the launch's `iss` claim — copy it exactly (no
trailing slash, correct scheme and host).


## Landing page

By default the launch lands on the platform's `target_link_uri`. Most platforms default
that to the tool URL (Tobira's `/~lti/launch`), which is not a page — in that case Tobira
falls back to its **start page** (the user is logged in). Targets outside Tobira are
ignored (no open redirect).

To land directly on a specific series, set a `series` **custom parameter** to an Opencast
series ID (its `identifier`, a UUID; find it under `…/api/series/series.json` on your
Opencast). Tobira then opens that series' page.


## Moodle setup {#moodle}

*Site administration → Plugins → Activity modules → External tool → Manage tools →
configure a tool manually*, LTI version **LTI 1.3**:

- **Tool URL:** `https://tobira.example.org/~lti/launch`
- **Redirection URI(s):** `https://tobira.example.org/~lti/launch`
  — a **separate, required field**. Moodle validates the launch's `redirect_uri` against
  this list only and does **not** fall back to the Tool URL. If it is empty (or the host
  differs), the launch fails at `mod/lti/auth.php` with a generic **"Invalid request"**.
- **Initiate login URL:** `https://tobira.example.org/~lti/login`
- **Public key type:** *Keyset URL* → `https://tobira.example.org/~lti/jwks`
- **Custom parameters:**
  ```
  username=$User.username
  ```
  Required together with `username_source = "custom"` on the platform (see
  [Users and roles](#users-and-roles)) — Moodle sends no usable username otherwise. Moodle
  substitutes `$User.username` at launch time; there is no Privacy setting that shares the
  login name. Add `series=<opencast-series-id>` on a separate line to land on a series.
- **Default launch container:** **New window** (not an iframe).

Every URL must use the **exact** public host of your Tobira — a wrong subdomain fails
silently (the launch never reaches Tobira, and nothing is logged).

Moodle then shows the platform `issuer`, `client_id` and `deployment_id` — copy them into
`[[auth.lti.platforms]]` and restart Tobira. Finally, make sure the launching Moodle user
exists in Opencast under the same username.


## Debugging

Set the LTI module to debug logging to see the resolved username and the full set of
launch claims:

```toml
[log]
filters."tobira::auth::lti" = "debug"
```

Common failures and their log lines:

| Symptom | Cause |
| --- | --- |
| Nothing logged on launch | The launch never reached Tobira — wrong host/URL in the LMS tool config. |
| `mod/lti/auth.php` "Invalid request" (Moodle) | `redirect_uri` not registered — fill in Moodle's *Redirection URI(s)*. |
| `LTI login for unknown platform (iss = …)` | The launch's `iss` is not in any `[[auth.lti.platforms]]` entry. |
| `LTI launch with unknown, expired or already-used 'state'` / `nonce mismatch` | A stale or replayed launch (e.g. reloading the result page). Start a fresh launch. |
| `LTI launch: deployment_id mismatch` | `deployment_id` in the config does not match the platform. |
| `user '…' is not known to Opencast` | The resolved username does not exist in Opencast, or no username was provided (see [Users and roles](#users-and-roles)). |


## Known limitations

- **New window only** — iframe embedding needs `SameSite=None` / Storage Access work.
- **Tool key is process-ephemeral** — regenerated on restart. Fine for launches (the LMS
  refetches `/~lti/jwks`); a configurable persistent key is a later addition.
- **No Deep Linking, NRPS or Dynamic Registration yet** — platforms must be registered
  manually, and landing is via the `series` custom parameter or `target_link_uri`.
