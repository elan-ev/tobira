use crate::{
    client::Client, errors::Error, indexes::Index, request::HttpClient, DefaultHttpClient,
};
use either::Either;
use serde::{de::DeserializeOwned, Deserialize, Serialize, Serializer};
use serde_json::{Map, Value};
use std::collections::HashMap;

#[derive(Deserialize, Debug, Eq, PartialEq, Clone)]
pub struct MatchRange {
    pub start: usize,
    pub length: usize,

    /// If the match is somewhere inside a (potentially nested) array, this
    /// field is set to the index/indices of the matched element(s).
    ///
    /// In the simple case, if the field has the value `["foo", "bar"]`, then
    /// searching for `ba` will return `indices: Some([1])`. If the value
    /// contains multiple nested arrays, the first index describes the most
    /// top-level array, and descending from there. For example, if the value is
    /// `[{ x: "cat" }, "bear", { y: ["dog", "fox"] }]`, searching for `dog`
    /// will return `indices: Some([2, 0])`.
    pub indices: Option<Vec<usize>>,
}

#[derive(Serialize, Debug, Eq, PartialEq, Clone)]
#[serde(transparent)]
pub struct Filter<'a> {
    #[serde(with = "either::serde_untagged")]
    inner: Either<&'a str, Vec<&'a str>>,
}

impl<'a> Filter<'a> {
    #[must_use]
    pub fn new(inner: Either<&'a str, Vec<&'a str>>) -> Filter<'a> {
        Filter { inner }
    }
}

#[derive(Debug, Clone, Serialize)]
pub enum MatchingStrategies {
    #[serde(rename = "all")]
    ALL,
    #[serde(rename = "last")]
    LAST,
    #[serde(rename = "frequency")]
    FREQUENCY,
}

/// A single result.
///
/// Contains the complete object, optionally the formatted object, and optionally an object that contains information about the matches.
#[derive(Deserialize, Debug, Clone)]
pub struct SearchResult<T> {
    /// The full result.
    #[serde(flatten)]
    pub result: T,
    /// The formatted result.
    #[serde(rename = "_formatted")]
    pub formatted_result: Option<Map<String, Value>>,
    /// The object that contains information about the matches.
    #[serde(rename = "_matchesPosition")]
    pub matches_position: Option<HashMap<String, Vec<MatchRange>>>,
    /// The relevancy score of the match.
    #[serde(rename = "_rankingScore")]
    pub ranking_score: Option<f64>,
    #[serde(rename = "_rankingScoreDetails")]
    pub ranking_score_details: Option<Map<String, Value>>,
    /// Only returned for federated multi search.
    #[serde(rename = "_federation")]
    pub federation: Option<FederationHitInfo>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FacetStats {
    pub min: f64,
    pub max: f64,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
/// A struct containing search results and other information about the search.
pub struct SearchResults<T> {
    /// Results of the query.
    pub hits: Vec<SearchResult<T>>,
    /// Number of documents skipped.
    pub offset: Option<usize>,
    /// Number of results returned.
    pub limit: Option<usize>,
    /// Estimated total number of matches.
    pub estimated_total_hits: Option<usize>,
    // Current page number
    pub page: Option<usize>,
    // Maximum number of hits in a page.
    pub hits_per_page: Option<usize>,
    // Exhaustive number of matches.
    pub total_hits: Option<usize>,
    // Exhaustive number of pages.
    pub total_pages: Option<usize>,
    /// Distribution of the given facets.
    pub facet_distribution: Option<HashMap<String, HashMap<String, usize>>>,
    /// facet stats of the numerical facets requested in the `facet` search parameter.
    pub facet_stats: Option<HashMap<String, FacetStats>>,
    /// Processing time of the query.
    pub processing_time_ms: usize,
    /// Query originating the response.
    pub query: String,
    /// Index uid on which the search was made.
    pub index_uid: Option<String>,
}

fn serialize_with_wildcard<S: Serializer, T: Serialize>(
    data: &Option<Selectors<T>>,
    s: S,
) -> Result<S::Ok, S::Error> {
    match data {
        Some(Selectors::All) => ["*"].serialize(s),
        Some(Selectors::Some(data)) => data.serialize(s),
        None => s.serialize_none(),
    }
}

fn serialize_attributes_to_crop_with_wildcard<S: Serializer>(
    data: &Option<Selectors<&[AttributeToCrop]>>,
    s: S,
) -> Result<S::Ok, S::Error> {
    match data {
        Some(Selectors::All) => ["*"].serialize(s),
        Some(Selectors::Some(data)) => {
            let results = data
                .iter()
                .map(|(name, value)| {
                    let mut result = (*name).to_string();
                    if let Some(value) = value {
                        result.push(':');
                        result.push_str(value.to_string().as_str());
                    }
                    result
                })
                .collect::<Vec<_>>();
            results.serialize(s)
        }
        None => s.serialize_none(),
    }
}

/// Some list fields in a `SearchQuery` can be set to a wildcard value.
///
/// This structure allows you to choose between the wildcard value and an exhaustive list of selectors.
#[derive(Debug, Clone)]
pub enum Selectors<T> {
    /// A list of selectors.
    Some(T),
    /// The wildcard.
    All,
}

type AttributeToCrop<'a> = (&'a str, Option<usize>);

/// A struct representing a query.
///
/// You can add search parameters using the builder syntax.
///
/// See [this page](https://www.meilisearch.com/docs/reference/api/search#query-q) for the official list and description of all parameters.
///
/// # Examples
///
/// ```
/// # use serde::{Serialize, Deserialize};
/// # use meilisearch_sdk::{client::Client, search::*, indexes::Index};
/// #
/// # let MEILISEARCH_URL = option_env!("MEILISEARCH_URL").unwrap_or("http://localhost:7700");
/// # let MEILISEARCH_API_KEY = option_env!("MEILISEARCH_API_KEY").unwrap_or("masterKey");
/// #
/// #[derive(Serialize, Deserialize, Debug)]
/// struct Movie {
///     name: String,
///     description: String,
/// }
/// # tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
/// # let client = Client::new(MEILISEARCH_URL, Some(MEILISEARCH_API_KEY)).unwrap();
/// # let index = client
/// #  .create_index("search_query_builder", None)
/// #  .await
/// #  .unwrap()
/// #  .wait_for_completion(&client, None, None)
/// #  .await.unwrap()
/// #  .try_make_index(&client)
/// #  .unwrap();
///
/// let mut res = SearchQuery::new(&index)
///     .with_query("space")
///     .with_offset(42)
///     .with_limit(21)
///     .execute::<Movie>()
///     .await
///     .unwrap();
///
/// assert_eq!(res.limit, Some(21));
/// # index.delete().await.unwrap().wait_for_completion(&client, None, None).await.unwrap();
/// # });
/// ```
///
/// ```
/// # use meilisearch_sdk::{client::Client, search::*, indexes::Index};
/// #
/// # let MEILISEARCH_URL = option_env!("MEILISEARCH_URL").unwrap_or("http://localhost:7700");
/// # let MEILISEARCH_API_KEY = option_env!("MEILISEARCH_API_KEY").unwrap_or("masterKey");
/// #
/// # let client = Client::new(MEILISEARCH_URL, Some(MEILISEARCH_API_KEY)).unwrap();
/// # let index = client.index("search_query_builder_build");
/// let query = index.search()
///     .with_query("space")
///     .with_offset(42)
///     .with_limit(21)
///     .build(); // you can also execute() instead of build()
/// ```
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery<'a, Http: HttpClient> {
    #[serde(skip_serializing)]
    index: &'a Index<Http>,
    /// The text that will be searched for among the documents.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "q")]
    pub query: Option<&'a str>,
    /// The number of documents to skip.
    ///
    /// If the value of the parameter `offset` is `n`, the `n` first documents (ordered by relevance) will not be returned.
    /// This is helpful for pagination.
    ///
    /// Example: If you want to skip the first document, set offset to `1`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
    /// The maximum number of documents returned.
    ///
    /// If the value of the parameter `limit` is `n`, there will never be more than `n` documents in the response.
    /// This is helpful for pagination.
    ///
    /// Example: If you don't want to get more than two documents, set limit to `2`.
    ///
    /// **Default: `20`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
    /// The page number on which you paginate.
    ///
    /// Pagination starts at 1. If page is 0, no results are returned.
    ///
    /// **Default: None unless `hits_per_page` is defined, in which case page is `1`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<usize>,
    /// The maximum number of results in a page. A page can contain less results than the number of hits_per_page.
    ///
    /// **Default: None unless `page` is defined, in which case `20`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hits_per_page: Option<usize>,
    /// Filter applied to documents.
    ///
    /// Read the [dedicated guide](https://www.meilisearch.com/docs/learn/advanced/filtering) to learn the syntax.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<Filter<'a>>,
    /// Facets for which to retrieve the matching count.
    ///
    /// Can be set to a [wildcard value](enum.Selectors.html#variant.All) that will select all existing attributes.
    ///
    /// **Default: all attributes found in the documents.**
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(serialize_with = "serialize_with_wildcard")]
    pub facets: Option<Selectors<&'a [&'a str]>>,
    /// Attributes to sort.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<&'a [&'a str]>,
    /// Attributes to perform the search on.
    ///
    /// Specify the subset of searchableAttributes for a search without modifying Meilisearch’s index settings.
    ///
    /// **Default: all searchable attributes found in the documents.**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes_to_search_on: Option<&'a [&'a str]>,
    /// Attributes to display in the returned documents.
    ///
    /// Can be set to a [wildcard value](enum.Selectors.html#variant.All) that will select all existing attributes.
    ///
    /// **Default: all attributes found in the documents.**
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(serialize_with = "serialize_with_wildcard")]
    pub attributes_to_retrieve: Option<Selectors<&'a [&'a str]>>,
    /// Attributes whose values have to be cropped.
    ///
    /// Attributes are composed by the attribute name and an optional `usize` that overwrites the `crop_length` parameter.
    ///
    /// Can be set to a [wildcard value](enum.Selectors.html#variant.All) that will select all existing attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(serialize_with = "serialize_attributes_to_crop_with_wildcard")]
    pub attributes_to_crop: Option<Selectors<&'a [AttributeToCrop<'a>]>>,
    /// Maximum number of words including the matched query term(s) contained in the returned cropped value(s).
    ///
    /// See [attributes_to_crop](#structfield.attributes_to_crop).
    ///
    /// **Default: `10`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_length: Option<usize>,
    /// Marker at the start and the end of a cropped value.
    ///
    /// ex: `...middle of a crop...`
    ///
    /// **Default: `...`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_marker: Option<&'a str>,
    /// Attributes whose values will contain **highlighted matching terms**.
    ///
    /// Can be set to a [wildcard value](enum.Selectors.html#variant.All) that will select all existing attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(serialize_with = "serialize_with_wildcard")]
    pub attributes_to_highlight: Option<Selectors<&'a [&'a str]>>,
    /// Tag in front of a highlighted term.
    ///
    /// ex: `<mytag>hello world`
    ///
    /// **Default: `<em>`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight_pre_tag: Option<&'a str>,
    /// Tag after a highlighted term.
    ///
    /// ex: `hello world</ mytag>`
    ///
    /// **Default: `</em>`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight_post_tag: Option<&'a str>,
    /// Defines whether an object that contains information about the matches should be returned or not.
    ///
    /// **Default: `false`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_matches_position: Option<bool>,

    /// Defines whether to show the relevancy score of the match.
    ///
    /// **Default: `false`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_ranking_score: Option<bool>,

    ///Adds a detailed global ranking score field to each document.
    ///
    /// **Default: `false`**
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_ranking_score_details: Option<bool>,

    /// Defines the strategy on how to handle queries containing multiple words.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matching_strategy: Option<MatchingStrategies>,

    ///Defines one attribute in the filterableAttributes list as a distinct attribute.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinct: Option<&'a str>,

    ///Excludes results below the specified ranking score.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ranking_score_threshold: Option<f64>,

    /// Defines the language of the search query.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locales: Option<&'a [&'a str]>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) index_uid: Option<&'a str>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) federation_options: Option<QueryFederationOptions>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QueryFederationOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f32>,
}

#[allow(missing_docs)]
impl<'a, Http: HttpClient> SearchQuery<'a, Http> {
    #[must_use]
    pub fn new(index: &'a Index<Http>) -> SearchQuery<'a, Http> {
        SearchQuery {
            index,
            query: None,
            offset: None,
            limit: None,
            page: None,
            hits_per_page: None,
            filter: None,
            sort: None,
            facets: None,
            attributes_to_search_on: None,
            attributes_to_retrieve: None,
            attributes_to_crop: None,
            crop_length: None,
            crop_marker: None,
            attributes_to_highlight: None,
            highlight_pre_tag: None,
            highlight_post_tag: None,
            show_matches_position: None,
            show_ranking_score: None,
            show_ranking_score_details: None,
            matching_strategy: None,
            index_uid: None,
            distinct: None,
            ranking_score_threshold: None,
            locales: None,
            federation_options: None,
        }
    }
    pub fn with_query<'b>(&'b mut self, query: &'a str) -> &'b mut SearchQuery<'a, Http> {
        self.query = Some(query);
        self
    }

    pub fn with_offset<'b>(&'b mut self, offset: usize) -> &'b mut SearchQuery<'a, Http> {
        self.offset = Some(offset);
        self
    }
    pub fn with_limit<'b>(&'b mut self, limit: usize) -> &'b mut SearchQuery<'a, Http> {
        self.limit = Some(limit);
        self
    }
    /// Add the page number on which to paginate.
    ///
    /// # Example
    ///
    /// ```
    /// # use serde::{Serialize, Deserialize};
    /// # use meilisearch_sdk::{client::*, indexes::*, search::*};
    /// #
    /// # let MEILISEARCH_URL = option_env!("MEILISEARCH_URL").unwrap_or("http://localhost:7700");
    /// # let MEILISEARCH_API_KEY = option_env!("MEILISEARCH_API_KEY").unwrap_or("masterKey");
    /// #
    /// # tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
    /// # let client = Client::new(MEILISEARCH_URL, Some(MEILISEARCH_API_KEY)).unwrap();
    /// # #[derive(Serialize, Deserialize, Debug)]
    /// # struct Movie {
    /// #     name: String,
    /// #     description: String,
    /// # }
    /// # client.create_index("search_with_page", None).await.unwrap().wait_for_completion(&client, None, None).await.unwrap();
    /// let mut index = client.index("search_with_page");
    ///
    /// let mut query = SearchQuery::new(&index);
    /// query.with_query("").with_page(2);
    /// let res = query.execute::<Movie>().await.unwrap();
    /// # index.delete().await.unwrap().wait_for_completion(&client, None, None).await.unwrap();
    /// # });
    /// ```
    pub fn with_page<'b>(&'b mut self, page: usize) -> &'b mut SearchQuery<'a, Http> {
        self.page = Some(page);
        self
    }

    /// Add the maximum number of results per page.
    ///
    /// # Example
    ///
    /// ```
    /// # use serde::{Serialize, Deserialize};
    /// # use meilisearch_sdk::{client::*, indexes::*, search::*};
    /// #
    /// # let MEILISEARCH_URL = option_env!("MEILISEARCH_URL").unwrap_or("http://localhost:7700");
    /// # let MEILISEARCH_API_KEY = option_env!("MEILISEARCH_API_KEY").unwrap_or("masterKey");
    /// #
    /// # tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
    /// # let client = Client::new(MEILISEARCH_URL, Some(MEILISEARCH_API_KEY)).unwrap();
    /// # #[derive(Serialize, Deserialize, Debug)]
    /// # struct Movie {
    /// #     name: String,
    /// #     description: String,
    /// # }
    /// # client.create_index("search_with_hits_per_page", None).await.unwrap().wait_for_completion(&client, None, None).await.unwrap();
    /// let mut index = client.index("search_with_hits_per_page");
    ///
    /// let mut query = SearchQuery::new(&index);
    /// query.with_query("").with_hits_per_page(2);
    /// let res = query.execute::<Movie>().await.unwrap();
    /// # index.delete().await.unwrap().wait_for_completion(&client, None, None).await.unwrap();
    /// # });
    /// ```
    pub fn with_hits_per_page<'b>(
        &'b mut self,
        hits_per_page: usize,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.hits_per_page = Some(hits_per_page);
        self
    }
    pub fn with_filter<'b>(&'b mut self, filter: &'a str) -> &'b mut SearchQuery<'a, Http> {
        self.filter = Some(Filter::new(Either::Left(filter)));
        self
    }
    pub fn with_array_filter<'b>(
        &'b mut self,
        filter: Vec<&'a str>,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.filter = Some(Filter::new(Either::Right(filter)));
        self
    }
    pub fn with_facets<'b>(
        &'b mut self,
        facets: Selectors<&'a [&'a str]>,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.facets = Some(facets);
        self
    }
    pub fn with_sort<'b>(&'b mut self, sort: &'a [&'a str]) -> &'b mut SearchQuery<'a, Http> {
        self.sort = Some(sort);
        self
    }

    pub fn with_attributes_to_search_on<'b>(
        &'b mut self,
        attributes_to_search_on: &'a [&'a str],
    ) -> &'b mut SearchQuery<'a, Http> {
        self.attributes_to_search_on = Some(attributes_to_search_on);
        self
    }
    pub fn with_attributes_to_retrieve<'b>(
        &'b mut self,
        attributes_to_retrieve: Selectors<&'a [&'a str]>,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.attributes_to_retrieve = Some(attributes_to_retrieve);
        self
    }
    pub fn with_attributes_to_crop<'b>(
        &'b mut self,
        attributes_to_crop: Selectors<&'a [(&'a str, Option<usize>)]>,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.attributes_to_crop = Some(attributes_to_crop);
        self
    }
    pub fn with_crop_length<'b>(&'b mut self, crop_length: usize) -> &'b mut SearchQuery<'a, Http> {
        self.crop_length = Some(crop_length);
        self
    }
    pub fn with_crop_marker<'b>(
        &'b mut self,
        crop_marker: &'a str,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.crop_marker = Some(crop_marker);
        self
    }
    pub fn with_attributes_to_highlight<'b>(
        &'b mut self,
        attributes_to_highlight: Selectors<&'a [&'a str]>,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.attributes_to_highlight = Some(attributes_to_highlight);
        self
    }
    pub fn with_highlight_pre_tag<'b>(
        &'b mut self,
        highlight_pre_tag: &'a str,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.highlight_pre_tag = Some(highlight_pre_tag);
        self
    }
    pub fn with_highlight_post_tag<'b>(
        &'b mut self,
        highlight_post_tag: &'a str,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.highlight_post_tag = Some(highlight_post_tag);
        self
    }
    pub fn with_show_matches_position<'b>(
        &'b mut self,
        show_matches_position: bool,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.show_matches_position = Some(show_matches_position);
        self
    }

    pub fn with_show_ranking_score<'b>(
        &'b mut self,
        show_ranking_score: bool,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.show_ranking_score = Some(show_ranking_score);
        self
    }

    pub fn with_show_ranking_score_details<'b>(
        &'b mut self,
        show_ranking_score_details: bool,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.show_ranking_score_details = Some(show_ranking_score_details);
        self
    }

    pub fn with_matching_strategy<'b>(
        &'b mut self,
        matching_strategy: MatchingStrategies,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.matching_strategy = Some(matching_strategy);
        self
    }
    pub fn with_index_uid<'b>(&'b mut self) -> &'b mut SearchQuery<'a, Http> {
        self.index_uid = Some(&self.index.uid);
        self
    }
    pub fn with_distinct<'b>(&'b mut self, distinct: &'a str) -> &'b mut SearchQuery<'a, Http> {
        self.distinct = Some(distinct);
        self
    }
    pub fn with_ranking_score_threshold<'b>(
        &'b mut self,
        ranking_score_threshold: f64,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.ranking_score_threshold = Some(ranking_score_threshold);
        self
    }
    pub fn with_locales<'b>(&'b mut self, locales: &'a [&'a str]) -> &'b mut SearchQuery<'a, Http> {
        self.locales = Some(locales);
        self
    }
    /// Only usable in federated multi search queries.
    pub fn with_federation_options<'b>(
        &'b mut self,
        federation_options: QueryFederationOptions,
    ) -> &'b mut SearchQuery<'a, Http> {
        self.federation_options = Some(federation_options);
        self
    }
    pub fn build(&mut self) -> SearchQuery<'a, Http> {
        self.clone()
    }
    /// Execute the query and fetch the results.
    pub async fn execute<T: 'static + DeserializeOwned + Send + Sync>(
        &'a self,
    ) -> Result<SearchResults<T>, Error> {
        self.index.execute_query::<T>(self).await
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MultiSearchQuery<'a, 'b, Http: HttpClient = DefaultHttpClient> {
    #[serde(skip_serializing)]
    client: &'a Client<Http>,
    // The weird `serialize = ""` is actually useful: without it, serde adds the
    // bound `Http: Serialize` to the `Serialize` impl block, but that's not
    // necessary. `SearchQuery` always implements `Serialize` (regardless of
    // type parameter), so no bound is fine.
    #[serde(bound(serialize = ""))]
    pub queries: Vec<SearchQuery<'b, Http>>,
}

#[allow(missing_docs)]
impl<'a, 'b, Http: HttpClient> MultiSearchQuery<'a, 'b, Http> {
    #[must_use]
    pub fn new(client: &'a Client<Http>) -> MultiSearchQuery<'a, 'b, Http> {
        MultiSearchQuery {
            client,
            queries: Vec::new(),
        }
    }
    pub fn with_search_query(
        &mut self,
        mut search_query: SearchQuery<'b, Http>,
    ) -> &mut MultiSearchQuery<'a, 'b, Http> {
        search_query.with_index_uid();
        self.queries.push(search_query);
        self
    }
    /// Adds the `federation` parameter, making the search a federated search.
    pub fn with_federation(
        self,
        federation: FederationOptions,
    ) -> FederatedMultiSearchQuery<'a, 'b, Http> {
        FederatedMultiSearchQuery {
            client: self.client,
            queries: self.queries,
            federation: Some(federation),
        }
    }

    /// Execute the query and fetch the results.
    pub async fn execute<T: 'static + DeserializeOwned + Send + Sync>(
        &'a self,
    ) -> Result<MultiSearchResponse<T>, Error> {
        self.client.execute_multi_search_query::<T>(self).await
    }
}
#[derive(Debug, Clone, Deserialize)]
pub struct MultiSearchResponse<T> {
    pub results: Vec<SearchResults<T>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FederatedMultiSearchQuery<'a, 'b, Http: HttpClient = DefaultHttpClient> {
    #[serde(skip_serializing)]
    client: &'a Client<Http>,
    #[serde(bound(serialize = ""))]
    pub queries: Vec<SearchQuery<'b, Http>>,
    pub federation: Option<FederationOptions>,
}

/// The `federation` field of the multi search API.
/// See [the docs](https://www.meilisearch.com/docs/reference/api/multi_search#federation).
#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FederationOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facets_by_index: Option<HashMap<String, Vec<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_facets: Option<bool>,
}

#[allow(missing_docs)]
impl<'a, 'b, Http: HttpClient> FederatedMultiSearchQuery<'a, 'b, Http> {
    /// Execute the query and fetch the results.
    pub async fn execute<T: 'static + DeserializeOwned + Send + Sync>(
        &'a self,
    ) -> Result<FederatedMultiSearchResponse<T>, Error> {
        self.client
            .execute_federated_multi_search_query::<T>(self)
            .await
    }
}

/// Returned by federated multi search.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FederatedMultiSearchResponse<T> {
    /// Merged results of the query.
    pub hits: Vec<SearchResult<T>>,

    // TODO: are offset, limit and estimated_total_hits really non-optional? In
    // my tests they are always returned, but that's not a proof.
    /// Number of documents skipped.
    pub offset: usize,
    /// Number of results returned.
    pub limit: usize,
    /// Estimated total number of matches.
    pub estimated_total_hits: usize,

    /// Distribution of the given facets.
    pub facet_distribution: Option<HashMap<String, HashMap<String, usize>>>,
    /// facet stats of the numerical facets requested in the `facet` search parameter.
    pub facet_stats: Option<HashMap<String, FacetStats>>,
    /// Processing time of the query.
    pub processing_time_ms: usize,
}

/// Returned for each hit in `_federation` when doing federated multi search.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FederationHitInfo {
    pub index_uid: String,
    pub queries_position: usize,
    // TOOD: not mentioned in the docs, is that optional?
    pub weighted_ranking_score: f32,
}

#[cfg(test)]
mod tests {
    use crate::{
        client::*,
        key::{Action, KeyBuilder},
        search::*,
    };
    use big_s::S;
    use meilisearch_test_macro::meilisearch_test;
    use serde::{Deserialize, Serialize};
    use serde_json::{json, Map, Value};

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct Nested {
        child: String,
    }

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct Document {
        id: usize,
        value: String,
        kind: String,
        number: i32,
        nested: Nested,
    }

    impl PartialEq<Map<String, Value>> for Document {
        #[allow(clippy::cmp_owned)]
        fn eq(&self, rhs: &Map<String, Value>) -> bool {
            self.id.to_string() == rhs["id"]
                && self.value == rhs["value"]
                && self.kind == rhs["kind"]
        }
    }

    async fn setup_test_index(client: &Client, index: &Index) -> Result<(), Error> {
        let t0 = index.add_documents(&[
            Document { id: 0, kind: "text".into(), number: 0, value: S("Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."), nested: Nested { child: S("first") } },
            Document { id: 1, kind: "text".into(), number: 10, value: S("dolor sit amet, consectetur adipiscing elit"), nested: Nested { child: S("second") } },
            Document { id: 2, kind: "title".into(), number: 20, value: S("The Social Network"), nested: Nested { child: S("third") } },
            Document { id: 3, kind: "title".into(), number: 30, value: S("Harry Potter and the Sorcerer's Stone"), nested: Nested { child: S("fourth") } },
            Document { id: 4, kind: "title".into(), number: 40, value: S("Harry Potter and the Chamber of Secrets"), nested: Nested { child: S("fift") } },
            Document { id: 5, kind: "title".into(), number: 50, value: S("Harry Potter and the Prisoner of Azkaban"), nested: Nested { child: S("sixth") } },
            Document { id: 6, kind: "title".into(), number: 60, value: S("Harry Potter and the Goblet of Fire"), nested: Nested { child: S("seventh") } },
            Document { id: 7, kind: "title".into(), number: 70, value: S("Harry Potter and the Order of the Phoenix"), nested: Nested { child: S("eighth") } },
            Document { id: 8, kind: "title".into(), number: 80, value: S("Harry Potter and the Half-Blood Prince"), nested: Nested { child: S("ninth") } },
            Document { id: 9, kind: "title".into(), number: 90, value: S("Harry Potter and the Deathly Hallows"), nested: Nested { child: S("tenth") } },
        ], None).await?;
        let t1 = index
            .set_filterable_attributes(["kind", "value", "number"])
            .await?;
        let t2 = index.set_sortable_attributes(["title"]).await?;

        t2.wait_for_completion(client, None, None).await?;
        t1.wait_for_completion(client, None, None).await?;
        t0.wait_for_completion(client, None, None).await?;

        Ok(())
    }

    #[meilisearch_test]
    async fn test_multi_search(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;
        let search_query_1 = SearchQuery::new(&index)
            .with_query("Sorcerer's Stone")
            .build();
        let search_query_2 = SearchQuery::new(&index)
            .with_query("Chamber of Secrets")
            .build();

        let response = client
            .multi_search()
            .with_search_query(search_query_1)
            .with_search_query(search_query_2)
            .execute::<Document>()
            .await
            .unwrap();

        assert_eq!(response.results.len(), 2);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_builder(_client: Client, index: Index) -> Result<(), Error> {
        let mut query = SearchQuery::new(&index);
        query.with_query("space").with_offset(42).with_limit(21);

        let res = query.execute::<Document>().await.unwrap();

        assert_eq!(res.query, S("space"));
        assert_eq!(res.limit, Some(21));
        assert_eq!(res.offset, Some(42));
        assert_eq!(res.estimated_total_hits, Some(0));
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_numbered_pagination(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("").with_page(2).with_hits_per_page(2);

        let res = query.execute::<Document>().await.unwrap();

        assert_eq!(res.page, Some(2));
        assert_eq!(res.hits_per_page, Some(2));
        assert_eq!(res.total_hits, Some(10));
        assert_eq!(res.total_pages, Some(5));
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_string(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index.search().with_query("dolor").execute().await?;
        assert_eq!(results.hits.len(), 2);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_string_on_nested_field(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> =
            index.search().with_query("second").execute().await?;

        assert_eq!(
            &Document {
                id: 1,
                value: S("dolor sit amet, consectetur adipiscing elit"),
                kind: S("text"),
                number: 10,
                nested: Nested { child: S("second") }
            },
            &results.hits[0].result
        );

        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_limit(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index.search().with_limit(5).execute().await?;
        assert_eq!(results.hits.len(), 5);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_page(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index.search().with_page(2).execute().await?;
        assert_eq!(results.page, Some(2));
        assert_eq!(results.hits_per_page, Some(20));
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_hits_per_page(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> =
            index.search().with_hits_per_page(2).execute().await?;
        assert_eq!(results.page, Some(1));
        assert_eq!(results.hits_per_page, Some(2));
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_offset(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index.search().with_offset(6).execute().await?;
        assert_eq!(results.hits.len(), 4);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_filter(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index
            .search()
            .with_filter("value = \"The Social Network\"")
            .execute()
            .await?;
        assert_eq!(results.hits.len(), 1);

        let results: SearchResults<Document> = index
            .search()
            .with_filter("NOT value = \"The Social Network\"")
            .execute()
            .await?;
        assert_eq!(results.hits.len(), 9);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_filter_with_array(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index
            .search()
            .with_array_filter(vec![
                "value = \"The Social Network\"",
                "value = \"The Social Network\"",
            ])
            .execute()
            .await?;
        assert_eq!(results.hits.len(), 1);

        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_facet_distribution(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_facets(Selectors::All);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            results
                .facet_distribution
                .unwrap()
                .get("kind")
                .unwrap()
                .get("title")
                .unwrap(),
            &8
        );

        let mut query = SearchQuery::new(&index);
        query.with_facets(Selectors::Some(&["kind"]));
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            results
                .facet_distribution
                .clone()
                .unwrap()
                .get("kind")
                .unwrap()
                .get("title")
                .unwrap(),
            &8
        );
        assert_eq!(
            results
                .facet_distribution
                .unwrap()
                .get("kind")
                .unwrap()
                .get("text")
                .unwrap(),
            &2
        );
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_attributes_to_retrieve(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results: SearchResults<Document> = index
            .search()
            .with_attributes_to_retrieve(Selectors::All)
            .execute()
            .await?;
        assert_eq!(results.hits.len(), 10);

        let mut query = SearchQuery::new(&index);
        query.with_attributes_to_retrieve(Selectors::Some(&["kind", "id"])); // omit the "value" field
        assert!(index.execute_query::<Document>(&query).await.is_err()); // error: missing "value" field
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_sort(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("harry potter");
        query.with_sort(&["title:desc"]);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(results.hits.len(), 7);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_attributes_to_crop(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("lorem ipsum");
        query.with_attributes_to_crop(Selectors::All);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            &Document {
                id: 0,
                value: S("Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do…"),
                kind: S("text"),
                number: 0,
                nested: Nested { child: S("first") }
            },
            results.hits[0].formatted_result.as_ref().unwrap()
        );

        let mut query = SearchQuery::new(&index);
        query.with_query("lorem ipsum");
        query.with_attributes_to_crop(Selectors::Some(&[("value", Some(5)), ("kind", None)]));
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            &Document {
                id: 0,
                value: S("Lorem ipsum dolor sit amet…"),
                kind: S("text"),
                number: 0,
                nested: Nested { child: S("first") }
            },
            results.hits[0].formatted_result.as_ref().unwrap()
        );
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_crop_length(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("lorem ipsum");
        query.with_attributes_to_crop(Selectors::All);
        query.with_crop_length(200);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(&Document {
            id: 0,
            value: S("Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."),
            kind: S("text"),
            number: 0,
            nested: Nested { child: S("first") }
        },
        results.hits[0].formatted_result.as_ref().unwrap());

        let mut query = SearchQuery::new(&index);
        query.with_query("lorem ipsum");
        query.with_attributes_to_crop(Selectors::All);
        query.with_crop_length(5);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            &Document {
                id: 0,
                value: S("Lorem ipsum dolor sit amet…"),
                kind: S("text"),
                number: 0,
                nested: Nested { child: S("first") }
            },
            results.hits[0].formatted_result.as_ref().unwrap()
        );
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_customized_crop_marker(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("sed do eiusmod");
        query.with_attributes_to_crop(Selectors::All);
        query.with_crop_length(6);
        query.with_crop_marker("(ꈍᴗꈍ)");

        let results: SearchResults<Document> = index.execute_query(&query).await?;

        assert_eq!(
            &Document {
                id: 0,
                value: S("(ꈍᴗꈍ)sed do eiusmod tempor incididunt ut(ꈍᴗꈍ)"),
                kind: S("text"),
                number: 0,
                nested: Nested { child: S("first") }
            },
            results.hits[0].formatted_result.as_ref().unwrap()
        );
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_customized_highlight_pre_tag(
        client: Client,
        index: Index,
    ) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("Social");
        query.with_attributes_to_highlight(Selectors::All);
        query.with_highlight_pre_tag("(⊃｡•́‿•̀｡)⊃ ");
        query.with_highlight_post_tag(" ⊂(´• ω •`⊂)");

        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            &Document {
                id: 2,
                value: S("The (⊃｡•́‿•̀｡)⊃ Social ⊂(´• ω •`⊂) Network"),
                kind: S("title"),
                number: 20,
                nested: Nested { child: S("third") }
            },
            results.hits[0].formatted_result.as_ref().unwrap()
        );

        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_attributes_to_highlight(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("dolor text");
        query.with_attributes_to_highlight(Selectors::All);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            &Document {
                id: 1,
                value: S("<em>dolor</em> sit amet, consectetur adipiscing elit"),
                kind: S("<em>text</em>"),
                number: 10,
                nested: Nested { child: S("first") }
            },
            results.hits[0].formatted_result.as_ref().unwrap(),
        );

        let mut query = SearchQuery::new(&index);
        query.with_query("dolor text");
        query.with_attributes_to_highlight(Selectors::Some(&["value"]));
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(
            &Document {
                id: 1,
                value: S("<em>dolor</em> sit amet, consectetur adipiscing elit"),
                kind: S("text"),
                number: 10,
                nested: Nested { child: S("first") }
            },
            results.hits[0].formatted_result.as_ref().unwrap()
        );
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_show_matches_position(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("dolor text");
        query.with_show_matches_position(true);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert_eq!(results.hits[0].matches_position.as_ref().unwrap().len(), 2);
        assert_eq!(
            results.hits[0]
                .matches_position
                .as_ref()
                .unwrap()
                .get("value")
                .unwrap(),
            &vec![MatchRange {
                start: 0,
                length: 5,
                indices: None,
            }]
        );
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_show_ranking_score(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("dolor text");
        query.with_show_ranking_score(true);
        let results: SearchResults<Document> = index.execute_query(&query).await?;
        assert!(results.hits[0].ranking_score.is_some());
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_show_ranking_score_details(
        client: Client,
        index: Index,
    ) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("dolor text");
        query.with_show_ranking_score_details(true);
        let results: SearchResults<Document> = index.execute_query(&query).await.unwrap();
        assert!(results.hits[0].ranking_score_details.is_some());
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_show_ranking_score_threshold(
        client: Client,
        index: Index,
    ) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("dolor text");
        query.with_ranking_score_threshold(1.0);
        let results: SearchResults<Document> = index.execute_query(&query).await.unwrap();
        assert!(results.hits.is_empty());
        Ok(())
    }

    #[meilisearch_test]
    async fn test_query_locales(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("Harry Styles");
        query.with_locales(&["eng"]);
        let results: SearchResults<Document> = index.execute_query(&query).await.unwrap();
        assert_eq!(results.hits.len(), 7);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_phrase_search(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let mut query = SearchQuery::new(&index);
        query.with_query("harry \"of Fire\"");
        let results: SearchResults<Document> = index.execute_query(&query).await?;

        assert_eq!(results.hits.len(), 1);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_matching_strategy_all(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results = SearchQuery::new(&index)
            .with_query("Harry Styles")
            .with_matching_strategy(MatchingStrategies::ALL)
            .execute::<Document>()
            .await
            .unwrap();

        assert_eq!(results.hits.len(), 0);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_matching_strategy_last(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results = SearchQuery::new(&index)
            .with_query("Harry Styles")
            .with_matching_strategy(MatchingStrategies::LAST)
            .execute::<Document>()
            .await
            .unwrap();

        assert_eq!(results.hits.len(), 7);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_matching_strategy_frequency(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results = SearchQuery::new(&index)
            .with_query("Harry Styles")
            .with_matching_strategy(MatchingStrategies::FREQUENCY)
            .execute::<Document>()
            .await
            .unwrap();

        assert_eq!(results.hits.len(), 7);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_distinct(client: Client, index: Index) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let results = SearchQuery::new(&index)
            .with_distinct("kind")
            .execute::<Document>()
            .await
            .unwrap();

        assert_eq!(results.hits.len(), 2);
        Ok(())
    }

    #[meilisearch_test]
    async fn test_generate_tenant_token_from_client(
        client: Client,
        index: Index,
    ) -> Result<(), Error> {
        setup_test_index(&client, &index).await?;

        let meilisearch_url = option_env!("MEILISEARCH_URL").unwrap_or("http://localhost:7700");
        let key = KeyBuilder::new()
            .with_action(Action::All)
            .with_index("*")
            .execute(&client)
            .await
            .unwrap();
        let allowed_client = Client::new(meilisearch_url, Some(key.key)).unwrap();

        let search_rules = vec![
            json!({ "*": {}}),
            json!({ "*": Value::Null }),
            json!(["*"]),
            json!({ "*": { "filter": "kind = text" } }),
            json!([index.uid.to_string()]),
        ];

        for rules in search_rules {
            let token = allowed_client
                .generate_tenant_token(key.uid.clone(), rules, None, None)
                .expect("Cannot generate tenant token.");

            let new_client = Client::new(meilisearch_url, Some(token.clone())).unwrap();

            let result: SearchResults<Document> = new_client
                .index(index.uid.to_string())
                .search()
                .execute()
                .await?;

            assert!(!result.hits.is_empty());
        }

        Ok(())
    }
}
