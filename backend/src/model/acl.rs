use std::collections::HashSet;
use juniper::GraphQLInputObject;
use serde::Serialize;


/// A role being granted permission to perform certain actions.
#[derive(Debug, GraphQLInputObject, Serialize)]
pub struct AclItem {
    pub role: String,
    pub actions: Vec<String>,
}

/// ACL as stored in the DB: separate lists per action.
#[derive(Debug, Clone)]
pub(crate) struct AclForDb {
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,
    // todo: add custom and preview roles for events when sent by frontend
    // preview_roles: Option<Vec<String>>,
    // custom_action_roles: Option<CustomActions>,
}

impl AclForDb {
    pub(crate) fn empty() -> Self {
        Self {
            read_roles: Vec::new(),
            write_roles: Vec::new(),
        }
    }

    pub(crate) fn from_items(entries: &[AclItem]) -> Self {
        let mut read_roles = HashSet::new();
        let mut write_roles = HashSet::new();
        // let mut preview_roles = HashSet::new();
        // let mut custom_action_roles = CustomActions::default();

        for entry in entries {
            let role = &entry.role;
            for action in &entry.actions {
                match action.as_str() {
                    // "preview" => { preview_roles.insert(role.clone()); }
                    "read" => { read_roles.insert(role.clone()); }
                    "write" => { write_roles.insert(role.clone()); }
                    _ => {
                        // custom_action_roles.0.entry(action)
                        //     .or_insert_default()
                        //     .push(role.clone());
                        todo!();
                    }
                };
            }
        }

        AclForDb {
            read_roles: read_roles.into_iter().collect(),
            write_roles: write_roles.into_iter().collect(),
            // todo: add custom and preview roles when sent by frontend
            // preview_roles: preview_roles.into_iter().collect(),
            // custom_action_roles,
        }
    }

    /// Returns the list of roles that are allowed to perform the given action.
    pub(crate) fn roles_for_action(&self, action: &str) -> &[String] {
        match action {
            "read" => &self.read_roles,
            "write" => &self.write_roles,
            _ => &[],
        }
    }
}
