use serde::Deserialize;
use std::time::Duration;
use time::OffsetDateTime;

use crate::{client::Client, errors::Error, request::HttpClient, tasks::*};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    #[serde(with = "time::serde::rfc3339")]
    pub enqueued_at: OffsetDateTime,
    pub index_uid: Option<String>,
    pub status: String,
    #[serde(flatten)]
    pub update_type: TaskType,
    pub task_uid: u32,
}

impl AsRef<u32> for TaskInfo {
    fn as_ref(&self) -> &u32 {
        &self.task_uid
    }
}

impl TaskInfo {
    #[must_use]
    pub fn get_task_uid(&self) -> u32 {
        self.task_uid
    }

    /// Wait until Meilisearch processes a task provided by [`TaskInfo`], and get its status.
    ///
    /// `interval` = The frequency at which the server should be polled. **Default = 50ms**
    ///
    /// `timeout` = The maximum time to wait for processing to complete. **Default = 5000ms**
    ///
    /// If the waited time exceeds `timeout` then an [`Error::Timeout`] will be returned.
    ///
    /// See also [`Client::wait_for_task`, `Index::wait_for_task`].
    ///
    /// # Example
    ///
    /// ```
    /// # use meilisearch_sdk::{client::*, indexes::*, tasks::*};
    /// # use serde::{Serialize, Deserialize};
    /// #
    /// # #[derive(Debug, Serialize, Deserialize, PartialEq)]
    /// # struct Document {
    /// #    id: usize,
    /// #    value: String,
    /// #    kind: String,
    /// # }
    /// #
    /// # let MEILISEARCH_URL = option_env!("MEILISEARCH_URL").unwrap_or("http://localhost:7700");
    /// # let MEILISEARCH_API_KEY = option_env!("MEILISEARCH_API_KEY").unwrap_or("masterKey");
    /// #
    /// # tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
    /// # let client = Client::new(MEILISEARCH_URL, Some(MEILISEARCH_API_KEY)).unwrap();
    /// let movies = client.index("movies_wait_for_completion");
    ///
    /// let status = movies.add_documents(&[
    ///     Document { id: 0, kind: "title".into(), value: "The Social Network".to_string() },
    ///     Document { id: 1, kind: "title".into(), value: "Harry Potter and the Sorcerer's Stone".to_string() },
    /// ], None)
    ///     .await
    ///     .unwrap()
    ///     .wait_for_completion(&client, None, None)
    ///     .await
    ///     .unwrap();
    ///
    /// assert!(matches!(status, Task::Succeeded { .. }));
    /// # movies.delete().await.unwrap().wait_for_completion(&client, None, None).await.unwrap();
    /// # });
    /// ```
    pub async fn wait_for_completion<Http: HttpClient>(
        self,
        client: &Client<Http>,
        interval: Option<Duration>,
        timeout: Option<Duration>,
    ) -> Result<Task, Error> {
        client.wait_for_task(self, interval, timeout).await
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::{
        client::*,
        errors::{ErrorCode, ErrorType},
        indexes::Index,
    };
    use big_s::S;
    use meilisearch_test_macro::meilisearch_test;
    use serde::{Deserialize, Serialize};
    use std::time::Duration;

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct Document {
        id: usize,
        value: String,
        kind: String,
    }

    #[test]
    fn test_deserialize_task_info() {
        let datetime = OffsetDateTime::parse(
            "2022-02-03T13:02:38.369634Z",
            &time::format_description::well_known::Rfc3339,
        )
        .unwrap();

        let task_info: TaskInfo = serde_json::from_str(
            r#"
{
  "enqueuedAt": "2022-02-03T13:02:38.369634Z",
  "indexUid": "meili",
  "status": "enqueued",
  "type": "documentAdditionOrUpdate",
  "taskUid": 12
}"#,
        )
        .unwrap();

        assert!(matches!(
            task_info,
            TaskInfo {
                enqueued_at,
                index_uid: Some(index_uid),
                task_uid: 12,
                update_type: TaskType::DocumentAdditionOrUpdate { details: None },
                status,
            }
        if enqueued_at == datetime && index_uid == "meili" && status == "enqueued"));
    }

    #[meilisearch_test]
    async fn test_wait_for_task_with_args(client: Client, movies: Index) -> Result<(), Error> {
        let task_info = movies
            .add_documents(
                &[
                    Document {
                        id: 0,
                        kind: "title".into(),
                        value: S("The Social Network"),
                    },
                    Document {
                        id: 1,
                        kind: "title".into(),
                        value: S("Harry Potter and the Sorcerer's Stone"),
                    },
                ],
                None,
            )
            .await?;

        let task = client
            .get_task(task_info)
            .await?
            .wait_for_completion(
                &client,
                Some(Duration::from_millis(1)),
                Some(Duration::from_millis(6000)),
            )
            .await?;

        assert!(matches!(task, Task::Succeeded { .. }));
        Ok(())
    }

    #[meilisearch_test]
    async fn test_failing_task(client: Client, index: Index) -> Result<(), Error> {
        let task_info = client.create_index(index.uid, None).await.unwrap();
        let task = client.wait_for_task(task_info, None, None).await?;

        let error = task.unwrap_failure();
        assert_eq!(error.error_code, ErrorCode::IndexAlreadyExists);
        assert_eq!(error.error_type, ErrorType::InvalidRequest);
        Ok(())
    }
}
