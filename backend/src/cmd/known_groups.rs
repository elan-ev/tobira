use std::{collections::HashMap, future};

use deadpool_postgres::Transaction;
use postgres_types::ToSql;
use serde_json::json;

use crate::{
    api::model::known_roles::KnownGroup,
    config::Config,
    model::TranslatedString,
    db,
    prelude::*,
};

use super::prompt_for_yes;


#[derive(Debug, clap::Parser)]
pub(crate) enum Args {
    /// Lists all known groups. The implicitly known `ROLE_USER` and
    /// `ROLE_ANONYMOUS` are not listed.
    List,

    /// Adds new known groups and updates existing ones. The groups are
    /// specified in a JSON file in this format:
    ///
    /// {
    ///     "ROLE_LECTURER": {
    ///         "label": { "default": "Lecturer", "de": "Vortragende" },
    ///         "implies": ["ROLE_STAFF"],
    ///         "large": true
    ///     }
    /// }
    ///
    /// Each entry may also have a field `sortKey` which is used to sort entries
    /// in the group selector. Entries with same `sortKey` are sorted
    /// alphabetically. Entries without `sortKey` are sorted last. By default,
    /// ROLE_ANONYMOUS has sortKey "_a" and ROLE_USER has "_b".
    Upsert {
        /// File to JSON file containing groups to add.
        file: String,
    },

    /// Removes groups specified by the given roles.
    Remove {
        /// The group role to be deleted.
        roles: Vec<String>,
    },

    /// Removes all known groups.
    Clear {
        /// If specified, skips the "Are you sure?" question.
        #[clap(long)]
        yes_absolutely_clear_known_groups: bool,
    },
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
        Args::List => list(tx).await?,
        Args::Upsert { file } => upsert(&file, &config, tx).await?,
        Args::Remove { roles } => remove(roles, tx).await?,
        Args::Clear { yes_absolutely_clear_known_groups: yes } => clear(tx, *yes).await?,
    }

    Ok(())
}

fn print_group(group: &KnownGroup) {
    print!(r#"    {}: {{ "label": {{"#, json!(group.role));

    // Sort by key to get consistent ordering (hashmap order is random).
    let mut labels = group.label.iter().collect::<Vec<_>>();
    labels.sort();
    for (lang, label) in labels {
        print!(" {}: {}", json!(lang), json!(label));
    }
    print!(r#" }}, "implies": ["#);
    for (i, role) in group.implies.iter().enumerate() {
        if i > 0 {
            print!(", ");
        }
        print!("{}", json!(role));
    }
    print!(r#"], "large": {} }}"#, group.large);
}

async fn list(tx: Transaction<'_>) -> Result<()> {
    let selection = KnownGroup::select();
    let query = format!("select {selection} from known_groups order by role");
    let rows = tx.query_raw(&query, dbargs![]).await?;
    println!();

    println!("{{");
    rows.try_for_each(|row| {
        let group = KnownGroup::from_row_start(&row);
        print_group(&group);
        println!(",");
        future::ready(Ok(()))
    }).await?;
    println!("}}");

    Ok(())
}


async fn upsert(file: &str, config: &Config, tx: Transaction<'_>) -> Result<()> {
    // Read JSON
    let content = tokio::fs::read_to_string(file).await
        .context("failed to read the file")?;
    let groups: HashMap<Role, GroupData> = serde_json::from_str(&content)
        .context("failed to deserialize")?;

    // Validate
    for role in groups.keys() {
        if config.auth.is_user_role(&role.0) {
            bail!("Role '{}' is a user role according to 'auth.user_role_prefixes'. \
                This should be added as user, not as group.", role.0);
        }
    }

    // Insert into DB
    let len = groups.len();
    for (role, info) in groups {
        let sql = "insert into known_groups (role, label, implies, sort_key, large) \
            values ($1, $2, $3, $4, $5) \
            on conflict (role) do update set \
                label = excluded.label, \
                implies = excluded.implies, \
                sort_key = excluded.sort_key, \
                large = excluded.large";
        tx.execute(sql, &[&role, &info.label, &info.implies, &info.sort_key, &info.large]).await?;
    }
    tx.commit().await?;

    println!("Upserted {} known groups", len);
    Ok(())
}

async fn remove(roles: &[String], tx: Transaction<'_>) -> Result<()> {
    if roles.iter().any(|role| !role.starts_with("ROLE_")) {
        bail!("roles must start with 'ROLE_'");
    }

    let selection = KnownGroup::select();
    let sql = format!("delete from known_groups where role = any($1) returning {selection}");
    let rows = tx.query(&sql, &[&roles]).await?;
    tx.commit().await?;

    let count = rows.len();
    if count > 0 {
        println!("{{");
        for row in &rows {
            let group = KnownGroup::from_row_start(&row);
            print_group(&group);
            println!(",");
        }
        println!("}}");
    }

    println!();
    println!("Removed the {count} groups shown above");
    if count != roles.len() {
        println!("WARNING: not all given roles were found!");
    }

    Ok(())
}

async fn clear(tx: Transaction<'_>, yes: bool) -> Result<()> {
    if !yes {
        println!("Remove all known groups? Type 'yes'");
        prompt_for_yes()?;
    }

    // We use `delete from` instead of `truncate` as we don't need the speed
    // here and `truncate` doesn't return the number of affected rows.
    let affected = tx.execute("delete from known_groups", &[]).await?;
    tx.commit().await?;
    println!("Removed {affected} known groups");

    Ok(())
}


#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroupData {
    label: TranslatedString,

    #[serde(default)]
    implies: Vec<Role>,

    large: bool,
    sort_key: Option<String>,
}

#[derive(Debug, serde::Deserialize, PartialEq, Eq, Hash, ToSql)]
#[serde(try_from = "String")]
#[postgres(transparent)]
struct Role(String);

impl TryFrom<String> for Role {
    type Error = &'static str;

    fn try_from(v: String) -> std::result::Result<Self, Self::Error> {
        if !v.starts_with("ROLE_") {
            return Err("invalid role: should start with 'ROLE_'");
        }

        Ok(Self(v))
    }
}
