use std::collections::{HashMap, HashSet};

use deadpool_postgres::Transaction;
use futures::{pin_mut, StreamExt};

use crate::{
    prelude::*,
    auth::{JwtContext, User},
    db::{self, util::select},
    config::Config,
    sync::OcClient,
};

use super::prompt_for_yes;


#[derive(Debug, clap::Parser)]
pub(crate) enum Args {
    /// Adds new known users and updates existing ones. Specified in a JSON file
    /// in this format (the email is optional):
    ///
    /// {
    ///     "ROLE_USER_PLUSTIG": {
    ///         "username": "plustig",
    ///         "display_name": "Peter Lustig",
    ///         "email": "peter@lustig.de"
    ///     }
    /// }
    Upsert {
        /// File to JSON file containing users to add.
        file: String,
    },

    /// Removes all known users.
    Clear {
        /// If specified, skips the "Are you sure?" question.
        #[clap(long)]
        yes_absolutely_clear_known_users: bool,
    },

    /// Makes Opencast create or update a user reference for every known user.
    ///
    /// This sends the same request that Tobira sends when it sees a user with
    /// `auth.create_opencast_user_references` enabled. Requires
    /// `auth.jwt.secret_key` to be set.
    CreateOpencastUserReferences,
}

/// How many requests are sent to Opencast in parallel when creating user
/// references.
const OPENCAST_REQUEST_CONCURRENCY: usize = 8;



#[derive(serde::Deserialize)]
struct UserData {
    username: String,
    display_name: String,
    email: Option<String>,
}


pub(crate) async fn run(config: Config, args: &Args) -> Result<()> {
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    let mut conn = db.get().await?;
    let tx = conn.build_transaction()
        .isolation_level(tokio_postgres::IsolationLevel::Serializable)
        .start()
        .await?;

    match args {
        Args::Upsert { file } => upsert(&file, &config, tx).await?,
        // Args::Remove { roles } => remove(roles, tx).await?,
        Args::Clear { yes_absolutely_clear_known_users: yes } => clear(tx, *yes).await?,
        Args::CreateOpencastUserReferences => {
            create_opencast_user_references(&config, tx).await?
        }
    }

    Ok(())
}

async fn upsert(file: &str, config: &Config, tx: Transaction<'_>) -> Result<()> {
    // Read JSON
    let content = tokio::fs::read_to_string(file).await
        .context("failed to read the file")?;
    let users: HashMap<String, UserData> = serde_json::from_str(&content)
        .context("failed to deserialize")?;

    // Validate
    for role in users.keys() {
        if !config.auth.is_user_role(role) {
            bail!("Role {role} does not start with any prefix \
                specified in 'auth.user_role_prefixes'!");
        }
    }
    let mut usernames = HashSet::new();
    for info in users.values() {
        if !usernames.insert(&info.username) {
            bail!("Username '{}' occurs more than once in the input data", info.username);
        }
    }

    info!("Loaded {} users from file", users.len());


    // Insert into DB. Since we could be dealing with lots of users, we want to
    // use `copy in` instead of N inserts. However, we need to control the
    // behavior on conflict. To do that we create a temporary table, copy in
    // there and then copy everything over. It's a bit annoying but works. We
    // also need a dummy insert to acquire the col types.
    let tmp_table = format!("tmp_table_{}", rand::random::<u64>());
    let sql = format!("create temp table {tmp_table} \
        (like users including defaults including identity) \
        on commit drop");
    tx.execute(&sql, &[]).await?;

    let columns = ["username", "display_name", "email", "user_role"];
    let col_list = columns.join(", ");
    let writer = db::util::bulk_insert(&tmp_table, &columns, &tx).await?;
    pin_mut!(writer);

    for (role, info) in users {
        writer.as_mut().write_raw(dbargs![
            &info.username,
            &info.display_name,
            &info.email,
            &role,
        ]).await?;
    }
    writer.finish().await?;
    debug!("Sent user data to temporary table");

    let sql = format!("
        insert into users ({col_list})
            select {col_list} from {tmp_table}
            on conflict (user_role) do update set
                username = excluded.username,
                display_name = excluded.display_name,
                email = excluded.email
    ");
    let affected = tx.execute(&sql, &[]).await?;
    tx.commit().await?;
    info!("Finished inserting users");


    println!("Upserted {affected} known users");
    Ok(())
}

async fn clear(tx: Transaction<'_>, yes: bool) -> Result<()> {
    if !yes {
        println!("Remove all known users? Type 'yes'");
        prompt_for_yes()?;
    }

    // We use `delete from` instead of `truncate` as we don't need the speed
    // here and `truncate` doesn't return the number of affected rows.
    let affected = tx.execute("delete from users", &[]).await?;
    tx.commit().await?;
    println!("Removed {affected} known users");

    Ok(())
}

async fn create_opencast_user_references(config: &Config, tx: Transaction<'_>) -> Result<()> {
    if config.auth.jwt.secret_key.is_none() {
        bail!("'auth.jwt.secret_key' is not set, so the JWTs would be signed with a \
            newly generated key that Opencast does not know. Configure a fixed key first.");
    }
    let jwt = JwtContext::new(&config.auth.jwt)?;
    let oc_client = OcClient::new(config)?;

    let (selection, mapping) = select!(
        username, display_name, email, user_role, user_realm_handle,
    );
    let users = tx.query(&format!("select {selection} from users"), &[]).await?
        .into_iter()
        .map(|row| User {
            username: mapping.username.of(&row),
            display_name: mapping.display_name.of(&row),
            email: mapping.email.of(&row),
            // Not stored in the DB, but also not needed for the JWT.
            roles: HashSet::new(),
            user_role: mapping.user_role.of(&row),
            user_realm_handle: mapping.user_realm_handle.of(&row),
        })
        .collect::<Vec<_>>();
    tx.commit().await?;

    let Some((first, rest)) = users.split_first() else {
        println!("There are no known users");
        return Ok(());
    };

    // Errors are most likely caused by a misconfiguration, which would make all requests fail.
    // So this only continues if the first one succeeds.
    create_opencast_user_reference(first, &jwt, &oc_client).await
        .with_context(|| format!("failed to create user reference for '{}'", first.username))?;

    info!("Sending requests for the remaining {} known users to Opencast...", rest.len());
    let jwt = &jwt;
    let oc_client = &oc_client;
    let mut requests = futures::stream::iter(rest)
        .map(|user| async move {
            (user, create_opencast_user_reference(user, jwt, oc_client).await)
        })
        .buffer_unordered(OPENCAST_REQUEST_CONCURRENCY);

    let mut num_failed = 0;
    while let Some((user, res)) = requests.next().await {
        if let Err(e) = res {
            warn!("Failed to create Opencast user reference for '{}': {e:#}", user.username);
            num_failed += 1;
        }
    }

    let num_ok = users.len() - num_failed;
    println!("Created or updated Opencast user references for {num_ok} of {} known users",
        users.len());
    if num_failed > 0 {
        bail!("{num_failed} requests failed (see log for details)");
    }

    Ok(())
}

async fn create_opencast_user_reference(
    user: &User,
    jwt: &JwtContext,
    oc_client: &OcClient,
) -> Result<()> {
    oc_client.create_user_reference(&user.username, &jwt.user_reference_token(user)).await
}
