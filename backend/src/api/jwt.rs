use juniper::{GraphQLEnum, GraphQLObject};
use serde_json::json;

use crate::{
    api::err::{invalid_input, not_authorized},
    auth::AuthState,
    db::util::select,
    prelude::*,
};

use super::{err::ApiResult, Context, Id};

pub(crate) async fn event_read_jwts(
    events: Vec<String>,
    context: &Context,
) -> ApiResult<Vec<EventJwt>> {
    let sql = "select opencast_id \
        from events \
        where read_roles && $1 and opencast_id = any($2)\
    ";

    context.db.query_raw(sql, dbargs![&context.auth.roles_vec(), &events])
        .await?
        .map_ok(|row| {
            let opencast_id = row.get::<_, String>(0);
            let jwt = context.jwt.event_read_token(&opencast_id);
            EventJwt { jwt, event: opencast_id }
        })
        .try_collect::<Vec<_>>()
        .await?
        .pipe(Ok)
}

pub(crate) async fn service_jwt(
    service: JwtService,
    event: Option<Id>,
    opencast_id: Option<String>,
    context: &Context,
) -> ApiResult<String> {
    let AuthState::User(user) = &context.auth.state else {
        return Err(not_authorized!("only logged in users can get a JWT"));
    };

    macro_rules! deny {
        ($action:literal) => {
            return Err(not_authorized!(
                "User {} does not have permission to {}",
                user.username,
                $action,
            ));
        };
    }

    match service {
        JwtService::Upload => {
            if !user.can_upload(&context.config.auth) {
                deny!("upload");
            }
            let payload = if let Some(opencast_id) = opencast_id {
                let key = format!("e:{opencast_id}");

                // TODO: remove once OC18 is released
                let read_role = format!("ROLE_EPISODE_{}_READ", opencast_id);
                let write_role = format!("ROLE_EPISODE_{}_WRITE", opencast_id);

                json!({
                    "oc": {
                        key: ["read", "write"],
                    },
                    // TODO: remove redundant roles once OC18 is released
                    "roles": ["ROLE_STUDIO", read_role, write_role],
                })
            } else {
                json!({ "roles": ["ROLE_STUDIO"] })
            };

            Ok(context.jwt.service_token(&user, payload))
        }

        JwtService::Studio => {
            if !user.can_use_studio(&context.config.auth) {
                deny!("use Studio");
            }
            Ok(context.jwt.service_token(&user, json!({
                "roles": ["ROLE_STUDIO"],
            })))
        }

        JwtService::Editor => {
            if !user.can_use_editor(&context.config.auth) {
                deny!("use the editor");
            }
            let Some(event) = event else {
                return Err(invalid_input!("'event' is not specified for editor JWT"));
            };
            let Some(event) = event.key_for(Id::EVENT_KIND) else {
                return Err(invalid_input!("'event' is not an event"));
            };

            let (selection, mapping) = select!(opencast_id, write_roles);
            let row = context.db.query_opt(
                &format!("select {selection} from events where id = $1"),
                &[&event],
            ).await?;
            let Some(row) = row else {
                return Err(invalid_input!("'event' does not exist"));
            };
            let opencast_id: String = mapping.opencast_id.of(&row);
            let write_roles: Vec<String> = mapping.write_roles.of(&row);

            if !context.auth.overlaps_roles(&write_roles) {
                deny!("edit that event");
            }

            let key = format!("e:{opencast_id}");
            Ok(context.jwt.service_token(&user, json!({
                "oc": {
                    key: ["read", "write"],
                },
            })))
        }
    }
}

/// Services a user can be pre-authenticated for using a JWT
#[derive(GraphQLEnum)]
pub(crate) enum JwtService {
    Upload,
    Studio,
    Editor,
}

#[derive(GraphQLObject)]
pub struct EventJwt {
    event: String,
    jwt: String,
}
