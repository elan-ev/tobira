use std::collections::{HashMap, HashSet};

use deadpool_postgres::Transaction;
use futures::pin_mut;

use crate::{
    prelude::*,
    db,
    config::Config,
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
    Clear,
}



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
        Args::Clear => clear(tx).await?,
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

async fn clear(tx: Transaction<'_>) -> Result<()> {
    println!("Remove all known users? Type 'yes'");
    prompt_for_yes()?;

    // We use `delete from` instead of `truncate` as we don't need the speed
    // here and `truncate` doesn't return the number of affected rows.
    let affected = tx.execute("delete from users", &[]).await?;
    tx.commit().await?;
    println!("Removed {affected} known users");

    Ok(())
}
