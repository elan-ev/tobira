# JWT for cross-origin user authentication (e.g. for uploading videos)

In some situations, users of Tobira (or rather, their browsers) need to communicate with Opencast directly.
For example, take the video uploader:
the best option is to load the video file directly to Opencast and not proxy it through Tobira first.
But for these cases, users logged into Tobira should automatically be authenticated against Opencast.

This is achieved by using JWT-based authentication.
Tobira generates short-lived JWT-tokens that are included in a user's request to Opencast.
Opencast checks the JWT and assign appropriate roles.


## Setup Tobira

For Tobira, you only need to configure some values in `auth.jwt`, for example:

```toml
[auth.jwt]
signing_algorithm = "ES256"
secret_key = "jwt-key.pem"
expiration_time = "3min"
```

Currently, the only supported signing algorithm is `ES256`.
The secret key has to be a key matching the algorithm.
For `ES256`, that's an EC key encoded as PKCS#8.
To generate such a key, you can run these commands:

```
openssl ecparam -name secp256r1 -genkey -noout -out sec1.pem
openssl pkcs8 -topk8 -nocrypt -in sec1.pem -out private-key.pem
```

**Important**: the expiration time for the JWT should be chosen fairly short to reduce the security risk of a stolen JWT.
Whenever a request to Opencast is sent, Tobira will generate a new JWT right before that.
So you should only need to account for network delay and clock skew.

*However*, due to a stupid set of circumstances, currently, the JWT has to live as long as the video upload takes.
So, potentially very long in case of large videos of slow connections.
This is a bug, or at the very least a terrible UX that needs fixing.
We're on it!


## Setup Opencast

To enable and configure JWT in Opencast, follow this guide:
https://docs.opencast.org/develop/admin/#configuration/security.jwt/#configuration-for-jwt-based-authentication-and-authorization

A few points and suggestions regarding the configuration:

- You have to configure the same JWT algorithm in Opencast as you did in Tobira.

- Set the public key URL (`jwksUrl`) to `https://your-tobira.domain/.well-known/jwks.json`

- Remove the value `<property name="secret" value="***" />`

- For username, name and email mappings you can use:
  ```xml
  <property name="usernameMapping" value="['username'].asString()" />
  <property name="nameMapping" value="['name'].asString()" />
  <property name="emailMapping" value="['username'].asString() + '@tobira.invalid'" />
  ```
  *Note*: this way, the Tobira username (which is given by the its login provider) is trusted in Opencast.
  Be aware of what this means for your installation.

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
