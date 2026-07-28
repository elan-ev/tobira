---
sidebar_position: 100
---

# RFC: LTI 1.3 / LTI Advantage integration

| | |
|---|---|
| **Status** | Draft / for discussion. **LTI 1.3 Core is implemented** (see below); Deep Linking, NRPS and Dynamic Registration are not. |
| **Author** | rrolf@uni-osnabrück.de |
| **Scope** | Backend (`backend/src/auth`), frontend (selection UI), docs |
| **Target** | LTI 1.3 Core + Deep Linking 2.0 + NRPS 2.0 (LTI Advantage) |

> **Implementation status.** The Core launch (`/~lti/login`, `/~lti/launch`, `/~lti/jwks`)
> is built and verified end-to-end against Moodle; operator documentation lives in
> [`docs/setup/auth/user/lti.md`](../setup/auth/user/lti). Where the implementation settled
> an open question differently than sketched here, the code and that document are
> authoritative — notably **OQ8 (identity mapping)**, which is resolved by the per-platform
> `username_source` config option. Later phases (§7) remain proposals.

This document proposes adding LTI 1.3 support to Tobira so it can be embedded as a
standalone LTI **tool** in LMS **platforms** such as Moodle and Canvas. The primary
driver is **Deep Linking**: letting teachers pick individual videos, series or
playlists from Tobira's UI and embed links to them inside a course. Tobira keeps
handling all Opencast authentication itself; the LMS only delegates identity.

> **Why a video portal as an LTI tool?** Tobira already has the more usable UIs for
> browsing recordings, series and playlists than the Opencast LTI module. Exposing it
> over LTI lets institutions surface those UIs directly inside their LMS.


## 0. Basis: PR #1706 (OIDC support)

**This work builds directly on [PR #1706 — "Add OpenID Connect support (MVP)"](https://github.com/elan-ev/tobira/pull/1706)**
by the maintainer, not on a green field. #1706 adds OIDC login (authorization-*code*
flow) and, in doing so, already builds most of the auth foundation LTI needs. LTI 1.3 is
"OIDC with a specific launch shape", so the overlap is large.

**Reused from #1706 (do not reimplement):**

| Piece (in #1706) | LTI use |
|---|---|
| `jwtea` crate (`Jwks`, `RawJwt::decode`, `Validator` trait) | verify platform launch JWTs against the platform JWKS (see §4.1) |
| `IdTokenValidator` (`aud`/`azp`/`iss`/clock-skew) | LTI launch validator = same pattern + `nonce` + `deployment_id` |
| `create_session_with_cookies(user, ctx)` (`auth/mod.rs`) | the session entry point — build a `User`, call this (see §3) |
| `tobira-oidc-state` state cookie | LTI `state` binding / login-CSRF protection (§6) |
| `DiscoveryInfo` (OIDC discovery + JWKS fetch) | platform key retrieval |
| `auth/opencast.rs` (fetch roles from Opencast) | one option for role resolution (see caveat below) |

**LTI-specific delta to add on top:**

- **Third-party-initiated login** (platform-initiated, carrying `iss`/`login_hint`/
  `target_link_uri`) — vs. #1706's user-initiated `/~oidc/login`.
- **`response_type=id_token` + `response_mode=form_post`**: the platform POSTs the
  `id_token` straight to the launch endpoint — there is **no `code` exchange** like
  #1706's backchannel `fetch_token`.
- LTI `nonce` (required) + `deployment_id`; LTI claims (`message_type`, roles,
  `resource_link`, `deep_linking_settings`); Deep Linking response; later NRPS.
- Manual per-platform registration (`client_id`/`deployment_id`/`keyset_url`), since LTI
  platforms are typically registered by hand rather than via pure OIDC discovery.

**Status / coordination:** #1706 is an in-progress MVP, **not yet merged**, and currently
conflicts with `main`. Its own central open question — *how to map ID-token claims to a
Tobira user* (config string vs. Rhai/Lua/JS/WASM; currently hardcoded, `TODO`) — is the
**same** problem as this RFC's §5.6 (role mapping) and OQ8 (identity mapping). It must be
solved *once*, upstream, with the maintainer. ⚠️ Note also that the MVP tech sheet (#1697)
explicitly *rejected* "ask Opencast for roles", whereas #1706 does exactly that
(`auth/opencast.rs`) — reconcile before building.

## 1. Goals and non-goals

**Goals**

- Tobira acts as an LTI 1.3 tool that can be launched from any conformant platform.
- **Deep Linking 2.0**: teachers select content in Tobira; Tobira returns
  `ltiResourceLink` content items to the LMS.
- **Resource link launch**: a previously embedded link launches the learner straight
  into the relevant Tobira page (event / series / realm).
- **Names and Role Provisioning (NRPS) 2.0**: use the course roster to grant access to
  series and playlists (and individual events) for *course groups* — e.g. "all members
  of course X may view this series", "instructors of course X may edit it". (Per-role
  *page/realm visibility* is not supported by Tobira today — see §5.8 — so it is out of
  scope for the first iteration.)
- Reuse Tobira's existing session, user and role model — LTI runs **alongside** normal
  login (sharing the session machinery), not as a replacement for it (see §3).

**Non-goals (for the first iteration)**

- Assignment and Grade Services (AGS) — Tobira is not a graded activity.
- Proctoring, Submission Review, Caliper, Course Groups.
- LTI 1.1 / LTI 1.0 backwards compatibility (legacy, not worth the security cost).

**Possible later additions**

- Dynamic Registration — automated tool registration instead of manual key exchange.


## 2. The LTI 1.3 spec landscape

There is no "LTI 1.3a". The relevant specs are **LTI 1.3 Core** plus the **LTI
Advantage** service bundle:

| Component | Spec | In scope? | Notes |
|---|---|---|---|
| OIDC third-party-initiated login | Core | yes | mandatory handshake |
| Signed launch message (JWT/JWS, RS256) | Core | yes | security-critical verification |
| Tool JWKS + key rotation | Core | yes | needed for DL response & service grants |
| **Deep Linking 2.0** | Advantage | **yes** | the main feature |
| **Names & Role Provisioning (NRPS) 2.0** | Advantage | **yes** | course roster → group-based access |
| Assignment & Grade Services (AGS) 2.0 | Advantage | no | grading — not applicable |
| Dynamic Registration | optional | later | nice-to-have |
| PNS / Proctoring / Submission Review / Course Groups | optional | no | out of scope |


## 3. How LTI maps onto Tobira's auth architecture

> **Design note.** LTI must **not** be framed as a replacement "auth source", and
> `auth.source` is no longer current Tobira terminology. LTI is configured and runs **in
> addition to** the main user login, sharing much of its code. So: LTI reuses the
> session/user machinery below, but runs **alongside** normal login — a user must still be
> able to log in directly, not only via LTI.

Tobira's authentication is deliberately pluggable. The current sources
(`AuthSource` in [`backend/src/auth/config.rs`], dispatched in
[`backend/src/auth/mod.rs`]) are:

- `None`
- `TobiraSession` — DB-backed sessions (`user_sessions` table, `tobira-session` cookie)
- `TrustAuthHeaders` — a trusted reverse proxy sets `x-tobira-username`, … headers
- `Callback` — an external service validates the request and returns user info

A user is modelled as `struct User { username, display_name, email, roles, user_role,
user_realm_handle }` (`backend/src/auth/mod.rs`). **An LTI launch produces exactly this
shape of data** (`sub`, `name`, `email`, the `roles` claim). So the proposal is:

> **Treat a verified LTI launch as another way to create a session, reusing the session
> machinery — but running alongside normal login, not instead of it.** After a verified
> launch, Tobira builds a `User` and calls `create_session_with_cookies()` (added by
> [#1706](https://github.com/elan-ev/tobira/pull/1706)) — the same path `/~oidc/callback`
> already uses. This does **not** require disabling other login methods; LTI is additive.

Everything downstream (realms, ACLs, GraphQL, the `HasRoles` trait) then works
unchanged, because the user is an ordinary authenticated Tobira user.

**Reused building blocks** (all already present):

| Need | Existing code |
|---|---|
| Create session + set cookie | `User::persist_new_session()` / `create_session()` (`auth/mod.rs`, `auth/handlers.rs`) |
| User model & roles | `struct User`, `HasRoles` trait (`auth/mod.rs`) |
| Route registration | central `match path` in `handle()` (`http/handlers.rs`) |
| JWT signing + JWKS serving | `JwtContext`, `/.well-known/jwks.json` (`auth/jwt.rs`, `http/handlers.rs`) |
| HTTP client for platform JWKS | `ctx.http_client` (hyper) and `reqwest` |


## 4. Key technical decisions (need core-team input)

### 4.1 Tobira's JWT module is sign-only and EC/Ed25519-only

`backend/src/auth/jwt.rs` uses `aws-lc-rs` purely to **sign** JWTs with ES256 / ES384 /
Ed25519, and serves the corresponding JWKS at `/.well-known/jwks.json`. LTI needs two
things this module does **not** currently provide:

1. **Verification of incoming launch JWTs** — RS256, signature checked against the
   platform's JWKS (fetched and cached). Not present today.
2. **A tool key pair** to sign the Deep Linking response JWT and the OAuth2
   `client_assertion` used for service calls (NRPS/AGS). Platforms such as Moodle and
   Canvas in practice expect **RSA (RS256)** from tools; Tobira's existing EC keys are
   generally not accepted as tool keys.

**Consequence:** the LTI module needs its own **RSA key pair** and its own JWKS endpoint
(`/~lti/jwks`), separate from the Opencast-facing `/.well-known/jwks.json`.

**Decision: use `jwtea` — already chosen by the maintainer in [PR #1706](https://github.com/elan-ev/tobira/pull/1706).**

This supersedes the earlier `jsonwebtoken`-vs-`aws-lc-rs` deliberation: PR #1706 (OIDC
support) already introduced the **`jwtea`** crate and uses it to download JWKS and verify
incoming ID-token JWTs. Since LTI builds on that same OIDC foundation (see §0), it must
use the same library for consistency. `jwtea` provides exactly the verification pattern
LTI needs:

- `Jwks` — download and hold the platform's public keys.
- `RawJwt::decode(keys, validator, …)` — decode + verify a JWT against the JWKS.
- A `jwtea::Validator` trait — #1706's `IdTokenValidator` already enforces `aud`, `azp`,
  `iss`, and clock skew (`BasicValidator { allowed_clock_skew }`). **The LTI launch
  validator is the same pattern plus two checks: `nonce` (replay-protected) and
  `deployment_id`.**

**Single crypto backend (aws-lc-rs), but note the split.** `jwtea` is built **on
`aws-lc-rs`**, not `ring`, so an earlier "two crypto stacks" worry is void. However —
**`jwtea` is verification-only**: it parses JWKS and verifies incoming JWTs, but has no
signing API and cannot build a JWK. The **tool side** (signing the Deep Linking response
and the NRPS `client_assertion`, and serving `/~lti/jwks`) is therefore done with
`aws-lc-rs`'s RSA directly (`rsa::KeyPair::generate`/`from_pkcs8`, `sign`, and — with the
`ring-io` feature enabled — `public_key().modulus()`/`.exponent()` to build the JWK).
So: **verify = `jwtea`, sign / serve keyset = `aws-lc-rs`.** The tool needs its own RSA
key pair + `/~lti/jwks` endpoint, separate from the Opencast-facing EC keys in
`auth/jwt.rs`.

### 4.2 The session cookie is hard-coded to `SameSite=Lax`

`SessionId::set_cookie()` in `backend/src/auth/session_id.rs` sets `SameSite=Lax`. In the
standard LTI scenario Tobira renders **inside the LMS iframe** (cross-site), where a
`Lax` cookie is **not sent** — so the session silently fails.

Required: make the cookie `SameSite=None; Secure` for the embedded case. Even then,
browsers increasingly block third-party cookies, so we should plan for at least one of:

- **Storage Access API** to request cookie access from within the iframe, or
- **CHIPS** partitioned cookies (`Partitioned` attribute), or
- launching Tobira in a **new top-level window/tab** instead of an iframe (LTI permits
  this; sidesteps third-party cookies but is a worse UX for embeds).

This is the classic LTI-in-iframe pain point and should be settled in the design phase.

**Open decision:** make `SameSite` configurable per deployment, or auto-relax it only on
the LTI routes? A blanket `SameSite=None` weakens CSRF posture for non-LTI deployments,
so it should be opt-in.


## 5. Proposed design

### 5.1 Endpoints

All under the existing `/~` internal-route convention, registered in the central
`match path` in `http/handlers.rs`:

| Route | Method | Purpose |
|---|---|---|
| `/~lti/login` | GET/POST | OIDC third-party-initiated login (issues `state` + `nonce`, redirects to platform `auth_login_url`) |
| `/~lti/launch` | POST | Receives the `id_token`, verifies it, builds a `User`, creates a session, then routes to content or the Deep Linking UI |
| `/~lti/jwks` | GET | Tool public keys (RSA) for the platform to verify our signed JWTs |
| `/~lti/deep-link-return` | POST | Builds and auto-POSTs the `DeepLinkingResponse` JWT to the platform's return URL |

### 5.2 Module layout

*Illustrative, not prescriptive* — this many files is likely unnecessary, and the file
layout need not be settled here. The point is the responsibilities, not the file count.
Mirrors the existing `auth/` structure:

```
backend/src/auth/lti/
  mod.rs        – route dispatch, platform registry lookup
  config.rs     – [auth.lti] config + per-platform entries
  oidc.rs       – /~lti/login: state+nonce generation, redirect
  launch.rs     – /~lti/launch: fetch+verify id_token, claims → User → session
  jwks.rs       – tool RSA key pair, /~lti/jwks, client_assertion signing
  deeplink.rs   – detect DeepLinkingRequest, build+POST the response JWT
  claims.rs     – LTI claim types (serde), role mapping
  nonce.rs      – nonce/state store with TTL (replay protection)
  nrps.rs       – NRPS client (client_credentials grant), roster sync, role augmentation
```

### 5.3 Configuration sketch

```toml
[auth]
source = "tobira-session"

[auth.lti]
# Tool key for signing DL responses & service grants (RSA, PEM/PKCS8).
tool_private_key = "/etc/tobira/lti-tool-key.pem"
# Relax the session cookie so it survives the LMS iframe.
cookie_same_site_none = true
# NRPS: fetch course rosters for group-based access.
nrps_enabled = true
# Background roster refresh interval; omit to sync only on launch.
nrps_sync_interval = "6h"
# How long to retain roster PII after the last sync.
nrps_retention = "30d"

# One entry per registered platform/deployment.
[[auth.lti.platforms]]
issuer = "https://moodle.example.org"
client_id = "AbCd1234"
deployment_id = "1"
auth_login_url = "https://moodle.example.org/mod/lti/auth.php"
auth_token_url = "https://moodle.example.org/mod/lti/token.php"
keyset_url = "https://moodle.example.org/mod/lti/certs.php"
```

### 5.4 Launch flow

```
LMS (Moodle/Canvas)              Tobira backend                         Browser
  │ 1. OIDC login init ─────────▶ /~lti/login
  │                               └─ store state+nonce, redirect ──────▶
  │ ◀── 2. authorize (login_hint) ─┘
  │ 3. POST id_token (JWT) ──────▶ /~lti/launch
  │                               ├─ look up platform by (iss, client_id)
  │                               ├─ fetch+cache platform JWKS by `kid`
  │                               ├─ verify sig (RS256) + iss/aud/azp/exp/nonce/deployment_id
  │                               ├─ map claims → User, persist_new_session()
  │                               ├─ Set-Cookie: tobira-session (SameSite=None)
  │                               └─ branch on message_type ───────────▶ content page OR DL selection UI
```

`message_type = LtiResourceLinkRequest` → resolve `target_link_uri` / a custom claim to a
realm or event ID and redirect. `message_type = LtiDeepLinkingRequest` → render the
selection UI.

### 5.5 Deep Linking flow

1. A Deep Linking launch is detected; the `deep_linking_settings` claim
   (`deep_link_return_url`, accepted types, multiple, …) is stored against the session.
2. The frontend reuses the existing browse components (series / playlists / events) in a
   **selection mode**.
3. On confirm, `/~lti/deep-link-return` builds a `DeepLinkingResponse` JWT whose
   `https://purl.imsglobal.org/spec/lti-dl/claim/content_items` array contains
   `ltiResourceLink` items (`url`, `title`, optional `iframe` dimensions, custom params
   encoding the Tobira target), signs it with the **tool key**, and auto-submits a form
   POST to `deep_link_return_url`.

### 5.6 Role mapping

Map the LTI `roles` claim to Tobira/Opencast `ROLE_*` values, e.g.
`http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor` → an instructor/moderator
role; `…#Learner` → `ROLE_USER`. The exact mapping should be configurable per platform.
Without NRPS, access control derives solely from these launch claims.

### 5.7 NRPS and group-based access

Goal: grant access to realms (pages), series and playlists to *course groups* — e.g.
"all members of course X may view this series", "instructors of course X may edit it".

**Core mechanism — context-derived roles registered as known groups.** Tobira ACLs are
role-based: a user may access a resource if it holds a matching `ROLE_*`
(`HasRoles::overlaps_roles`). Tobira already has a group model purpose-built for this —
see §5.8. We mint a deterministic role per LTI context (course) and register it as a
**known group** so it gets a friendly, localised label in the ACL UI:

- `ROLE_LTI_<hash(issuer + context_id)>` — every member of the course
- `ROLE_LTI_<hash(...)>_INSTRUCTOR` — role-scoped within the course (optional)

When a teacher embeds or deep-links content from a course, the selection UI offers to
set the resource ACL to that course's group role. Members then match the ACL and gain
access. The basic mechanism works from launch claims alone — but only for the launching
user, and only after they have launched from that context.

> **Caveat — `implies` is not transitive at runtime.** The `known_groups.implies` field
> is *display-only* metadata for the ACL UI; it is **not** expanded into a user's roles
> during access checks (`overlaps_roles` is a plain set intersection). So an instructor
> role must not rely on `implies` to also grant member access — the launch / role
> augmentation must add **every** applicable context role to the session explicitly.

**Where NRPS comes in.** NRPS lets the tool fetch the **full roster of the context**, so
group access works for *every* member — including those who have not launched yet, and
on direct navigation to Tobira (not only via the course launch):

- A launch carrying the NRPS claim
  (`…/spec/lti-nrps/claim/namesroleservice` → `context_memberships_url`) tells Tobira
  where to fetch the roster.
- Auth is an **OAuth2 `client_credentials` grant** with a signed `client_assertion` JWT
  (signed with the **tool RSA key** from §4.1) and scope
  `…/spec/lti-nrps/scope/contextmembership.readonly`. → This makes the tool key from
  §4.1 *required*, reinforcing that decision.
- The response lists members with `user_id` (matching the launch `sub`), their `roles`,
  a `status` (Active/Inactive/Deleted), and — subject to the platform's privacy
  settings — name and email.

**Storage & role augmentation.**

- `lti_context(issuer, context_id, label, title, group_role)` — registered contexts.
- `lti_membership(issuer, context_id, lti_user_id, roles, status, synced_at)` — roster.
- On session creation / role resolution, Tobira augments the user's roles with the
  `group_role` of every context in which they are an *active* member (joined on the LTI
  user id ↔ Tobira username). This is what makes group access apply beyond the original
  launch.

**Identity mapping.** The join key is the Tobira `username`, which must be derived
deterministically from the launch (recommended: from `(issuer, client_id, sub)` or a
configured claim) and must match what NRPS returns as `user_id`.

**Sync timing.** Membership can be refreshed (a) lazily on each launch from a context,
(b) on a scheduled background job (cf. `db_maintenance()` in `auth/mod.rs`), or (c) both.
Eager sync gives accurate membership at the cost of periodic service calls and stored
PII (see §6).

### 5.8 Tobira's existing permission model (and how groups fit)

Investigation of the backend confirms the mechanism above maps cleanly onto what Tobira
already has:

**ACL columns per resource type**

| Resource | Columns | Notes |
|---|---|---|
| Events | `read_roles`, `write_roles`, `preview_roles` | synced from Opencast |
| Series | `read_roles`, `write_roles` | synced from Opencast |
| Playlists | `read_roles`, `write_roles` | `db/migrations/35-playlists.sql` |
| Realms (pages) | `moderator_roles`, `admin_roles` + `flattened_*` | `db/migrations/30-realm-permissions.sql` |

**Enforcement** is a direct set intersection: `context.auth.overlaps_roles(read_roles)`
(see `model/event/mod.rs`), short-circuited by `is_admin`. There is no role hierarchy at
enforcement time — a user gains access iff a role string it actually holds appears in the
resource's role list.

**Realm (page) permissions are edit-only — there is no per-role page visibility.**
Confirmed in `api/model/realm/mod.rs`: realms have exactly two permission levels, both
gating *editing*:

- `moderator_roles` → `can_current_user_moderate()` (add subpages, edit content and
  non-critical settings)
- `admin_roles` → `is_current_user_page_admin()` (full control: edit ACL, change path,
  delete)

Both flow down the realm tree automatically via the `flattened_*` columns maintained by
triggers (`db/migrations/30-realm-permissions.sql`). **There is no `read_roles` /
visibility column on realms** — a page is always viewable; what is actually protected is
the *content* embedded in it (series / videos / playlists), each via its own
`read_roles`.

⚠️ **Consequence for group access:** "release a *page* to a course group" in the sense of
restricting who can *see* the page is **not expressible today** and would require a new
feature (a realm `read_roles` column with flattened inheritance, enforcement on the realm
read path, and GraphQL/UI support). Group-based access to **series, playlists and
events** works out of the box via their `read_roles`. Recommendation for the first
iteration: scope group access to series/playlists/events; treat per-role page visibility
as a separate, optional enhancement to propose to the core team.

**Group model — `known_groups`.** The table
`known_groups(role pk, label hstore, implies text[], large bool, sort_key)`
(`db/migrations/24-known-groups.sql`) is purpose-built for exactly this use case — its
own migration comment uses `ROLE_COURSE_123_LEARNER` as the example. It provides:

- `label` — localised (`{ "default": …, "de": … }`), shown in the ACL selector and on
  ACL entries (`RoleInfo` in `api/model/acl.rs`), so LTI course groups can display as
  e.g. *"Course: Machine Learning (SS26)"* instead of an opaque role.
- `implies` — **display-only** (see caveat in §5.7), not enforced.
- `large` — drives a UI warning when granting write access to big groups; a whole-course
  membership role should likely be flagged `large`.

**Gap to close:** `known_groups` is currently populated **only via the CLI**
(`tobira known-groups upsert <file.json>`, `cmd/known_groups.rs`) — there is no runtime
API. LTI course groups appear and change dynamically, so the LTI module must be able to
**upsert known groups at runtime** (refactor the CLI's insert logic into a shared
function). Access still works via raw role strings without this, but the ACL UI would
show no labels and admins could not discover course groups — so it is needed for a usable
feature.


## 6. Security considerations

- **JWT verification is the critical path.** Enforce `iss`, `aud`/`azp`, `exp`/`iat`
  (with bounded clock skew), and `deployment_id`. Reject unexpected `alg`.
- **Nonce replay protection.** Persist issued nonces with a TTL and reject reuse.
- **State binding.** Bind the OIDC `state` to the browser (cookie) to prevent
  login-CSRF on the launch endpoint.
- **JWKS caching with rotation.** Honour `kid`; refetch on unknown `kid`; cap cache TTL.
- **Cookie scope.** `SameSite=None` must be opt-in and only paired with `Secure`.
- **Privacy / GDPR (DSGVO).** NRPS returns personal data (names, emails) for *all*
  course members, not just the launching user. Store only what is needed, honour the
  `status` field (drop Deleted/Inactive members), make roster sync and PII retention
  configurable (`nrps_retention`), and document this for the institution's
  data-protection review. Platforms may also redact PII depending on their privacy
  settings, so the tool must work with partial member data.
- **Service token handling.** Cache the NRPS `client_credentials` access token until
  expiry; never log it. The `client_assertion` JWT must be short-lived and audience-
  scoped to the platform token endpoint.
- **Test against the 1EdTech reference implementation** and real Moodle/Canvas
  instances — unit tests alone do not cover the protocol's failure modes.


## 7. Implementation plan (phased)

- **Phase 0 — Spike.** Stand up the dev stack (`x.sh`) + a local Moodle (Docker). One
  endpoint that fetches a real launch JWT, verifies it against the platform JWKS, and
  logs the claims. Resolves the RSA question (§4.1) immediately.
- **Phase 1 — LTI as an auth source (Core).** `/~lti/login`, `/~lti/launch`,
  `/~lti/jwks`; platform config; claims → `User` → session; configurable `SameSite`;
  nonce/state validation.
- **Phase 2 — Resource link launch → content.** Resolve target to realm/event; role
  mapping.
- **Phase 3 — Deep Linking 2.0.** Selection UI (reuse browse components) + signed
  `DeepLinkingResponse`.
- **Phase 4 — NRPS & group-based access.** `client_credentials` grant + tool key,
  roster fetch/sync (`lti_context` / `lti_membership` tables), context-derived group
  roles registered in `known_groups` (requires factoring `cmd/known_groups.rs`'s upsert
  into a runtime-callable function — see §5.8), role augmentation on session creation,
  ACL UI to grant a course group. Depends on the tool RSA key from Phase 1/§4.1.
- **Phase 5 — Hardening & conformance.** Full claim validation, JWKS rotation, PII
  retention enforcement, 1EdTech reference + Moodle/Canvas testing.
- **Phase 6 (optional) — Dynamic Registration.**


## 8. Open questions for the core team

1. ~~RSA via `aws-lc-rs` vs. adding `jsonwebtoken`?~~ *(resolved by [PR #1706](https://github.com/elan-ev/tobira/pull/1706):
   use **`jwtea`**, the JWT crate the OIDC work already introduced — see §0 and §4.1.)*
   Remaining sub-point: confirm `jwtea` can *sign* RS256 for the tool side (DL response /
   `client_assertion`); if not, use `aws-lc-rs` RSA for signing only.
2. How to expose the `SameSite=None` relaxation safely? (§4.2)
3. ~~Multi-tenant: one tool key for all platforms, or per-tenant keys?~~ *(resolved:
   Tobira has no multi-tenancy — one completely separate Tobira runs per tenant. So: one
   tool key per Tobira instance; no per-tenant key handling needed.)*
4. ~~Should LTI be a compile-time feature flag or always built in?~~ *(resolved: **always
   built in.** Tobira uses no compile-time feature flags, and adding one here would bring
   a lot of mostly unnecessary complexity.)*
5. Is `auth.source = "tobira-session"` the intended host mode, or should LTI be its own
   `AuthSource` variant?
6. **Group modelling** *(resolved — see §5.8)*: use synthetic per-context roles
   registered in `known_groups`; group access targets series/playlists/events via
   `read_roles`. Confirmed findings:
   - (b) **Resolved:** realms have no per-role visibility — `moderator_roles` /
     `admin_roles` gate editing only. Restricting who can *see* a page would be a new
     feature; out of scope for iteration 1.
   - (a) **Open (core team):** is a runtime `known_groups` upsert API acceptable, or
     should group registration stay CLI/batch-only?
   - (c) **Open (design):** how are role-scoped grants (instructor vs. member) surfaced
     in the ACL selector?
7. **NRPS sync strategy & PII retention:** lazy (on launch) vs. scheduled background
   sync, and how long roster PII may be retained (DSGVO).
8. **Identity mapping:** how is the Tobira `username` derived from the launch so it
   reliably matches the NRPS `user_id` across platforms?
