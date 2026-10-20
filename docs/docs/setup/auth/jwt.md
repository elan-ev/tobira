---
sidebar_position: 5
---

# Setup JWT auth

See [this section](../auth#cross-auth-users-against-opencast) on when JWTs are needed.
Tobira generates short-lived JWTs that are included in a user's request to Opencast.
Opencast checks the JWT and assigns appropriate roles.
The "trust" in this solution comes from you telling Opencast to trust a specific public key (the one from Tobira).


## Setup Tobira

For Tobira, you don't necessarily need to configure anything.
By default, a suitable signing algorithm is selected and a secret key is generated whenever Tobira is started.
That's sufficient for most use cases.
If you run multiple Tobira instances (for redundency), you need to specify a key manually as otherwise, each instance has a different key.

The algorithm and private key can be specified in `[auth.jwt]`.

<details>
<summary>Specifying key manually</summary>

```toml
[auth.jwt]
signing_algorithm = "ED25519"
secret_key = "private-key.pem"
```

The secret key file has to be a PEM/PKCS#8 encoded and match the specified algorithm.
To generate an ED25519 key, you can run this command:

```
openssl genpkey -algorithm ed25519 -out private-key.pem
```

For ES256 and ES384, run this instead:

```
openssl ecparam -name secp256r1 -genkey -noout -out sec1.pem     # or secp384r1 for ES384
openssl pkcs8 -topk8 -nocrypt -in sec1.pem -out private-key.pem
```

Here, the `sec1.pem` is encoded as SEC1 instead of PKCS#8. The second command converts the key.

</details>

:::caution
The expiration time for the JWT should be chosen to be fairly short to reduce the security risk posed by a stolen JWT.
Tobira generates a new JWT right before every request it sends to Opencast.
So you should only need to account for network delay and clock skew.
The default of 30 seconds should be fine for most installations,
but you can try to be more conservative if you want.
We strongly recommend against going higher, though. If you need that for some reason,
you should probably rather try to mitigate the underlying problem.
:::


## Setup Opencast

To enable and configure JWT in Opencast, follow this guide:
https://docs.opencast.org/develop/admin/#configuration/security.jwt/#configuration-for-jwt-based-authentication-and-authorization

A few points and suggestions regarding the configuration:

- You might need both, the request header and query parameter filter.
  - The former is for the uploader.
  - The latter makes the pre-authentication of external links (Studio, Editor) possible.
    You need it when you enabled `auth.pre_auth_external_links` in the Tobira configuration.

- You have to configure the same JWT algorithm in Opencast as you did in Tobira.

- Set the public key URL (`jwksUrl`) to `https://your-tobira.domain/.well-known/jwks.json`

- Remove the value `<property name="secret" value="***" />`

- For username, name and email mappings you can use:
  ```xml
  <property name="usernameMapping" value="['username'].asString()" />
  <property name="nameMapping" value="['name'].asString()" />
  <property name="emailMapping" value="['email'].asString()" />
  <!-- Or if you don't have emails for your user: ['username'].asString() + '@tobira.invalid' -->
  ```
  *Note*: this way, the Tobira username (which is given by its login provider) is trusted in Opencast.
You should think about the consequences this might have for the security of your installation!

- Regarding `claimConstraints`, you don't really have to check anything. But you can use this:
  ```xml
  <util:list id="jwtClaimConstraints" value-type="java.lang.String">
    <value>containsKey('username')</value>
    <value>containsKey('name')</value>
    <value>containsKey('exp')</value>
  </util:list>
  ```

- Regarding role mapping: be sure to assign a role that allows the user to use the `/ingest` API!
  Currently, you also need to explicitly list `ROLE_ANONYMOUS`.
  Finally, you also likely want to have these:
  ```xml
  <value>'ROLE_JWT_USER'</value>
  <value>'ROLE_JWT_USER_' + ['username'].asString()</value>
  ```


## Making Tobira users known to Opencast

Opencast creates a user reference for accepted JWTs that contain information about that user.
This makes the user known to Opencast, so that it can be found in the admin UI when adding users to the ACL of an event or series.

To make all Tobira users known to Opencast, set `auth.create_opencast_user_references` to `true`.
Then, whenever Tobira sees a user for the first time in a while (or their user information changed), it sends a request with a JWT for that user to `/info/me.json` on the Opencast sync node. This JWT does not grant any roles besides `ROLE_ANONYMOUS`.
Note that this stores the display name and email of all Tobira users in Opencast.
If you use `auth.session.from_login_credentials = "opencast"`, you don't need this, as all Tobira users already exist in Opencast.

:::caution
In the admin UI, these users are offered with the user role that *Opencast* derives from the username.
By default, that's `ROLE_USER_` followed by the username in uppercase, with every character other than `a-z`, `A-Z` and `0-9` replaced by `_`
(see `etc/org.opencastproject.userdirectory.UserIdRoleProvider.cfg` in Opencast).
Access granted via such an ACL entry only works in Tobira if Tobira's [user role](./user#user-information-tobira-needs) of that user is exactly the same.
:::
