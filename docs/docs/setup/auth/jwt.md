---
sidebar_position: 5
---

# Setup JWT auth

See [this section](../auth#cross-auth-users-against-opencast) on when JWTs are needed.
Tobira generates short-lived JWTs that are included in a user's request to Opencast.
Opencast checks the JWT and assigns appropriate roles.
The "trust" in this solution comes from you telling Opencast to trust a specific public key (the one from Tobira).


## Setup Tobira

For Tobira, you only need to configure some values in `auth.jwt`, for example:

```toml
[auth.jwt]
signing_algorithm = "ES256"
secret_key = "jwt-key.pem"
```

The secret key has to be a key matching the algorithm.
For `ES256`, that's an EC key encoded as PKCS#8.
To generate such a key, you can run these commands (you can replace `secp256r1` with other supported values like `secp384r1`):

```
openssl ecparam -name secp256r1 -genkey -noout -out sec1.pem
openssl pkcs8 -topk8 -nocrypt -in sec1.pem -out private-key.pem
```

Here, the `sec1.pem` is encoded as SEC1 instead of PKCS#8. The second command converts the key.

**Important**: the expiration time for the JWT should be chosen to be fairly short to reduce the security risk posed by a stolen JWT.
Tobira generates a new JWT right before every request it sends to Opencast.
So you should only need to account for network delay and clock skew.
The default of 30 seconds should be fine for most installations,
but you can try to be more conservative if you want.
We strongly recommend against going higher, though. If you need that for some reason,
you should probably rather try to mitigate the underlying problem.


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
  <property name="emailMapping" value="['username'].asString() + '@tobira.invalid'" />
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
