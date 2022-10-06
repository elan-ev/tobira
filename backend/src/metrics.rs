use deadpool_postgres::Pool;
use prometheus_client::{
    metrics::{gauge::Gauge, counter::Counter, family::Family},
    registry::{Registry, Unit},
    encoding::text::{encode, Encode, SendSyncEncodeMetric},
};


struct MetricDesc {
    name: &'static str,
    help: &'static str,
    unit: Option<Unit>,
}

const SYNC_LAG: MetricDesc = MetricDesc {
    name: "sync_lag",
    help: "Number of seconds which the Tobira database is behind the Opencast data",
    unit: Some(Unit::Seconds),
};
const PROC_USS: MetricDesc = MetricDesc {
    name: "proc_uss",
    help: "Unique Set Size (memory exclusively allocated for Tobira)",
    unit: Some(Unit::Bytes),
};
const PROC_PSS: MetricDesc = MetricDesc {
    name: "proc_pss",
    help: "Proportional Set Size",
    unit: Some(Unit::Bytes),
};
const PROC_RSS: MetricDesc = MetricDesc {
    name: "proc_rss",
    help: "Resident Set Size",
    unit: Some(Unit::Bytes),
};
const PROC_SHARED_MEMORY: MetricDesc = MetricDesc {
    name: "proc_shared_memory",
    help: "Shared memory (memory shared with other processes)",
    unit: Some(Unit::Bytes),
};
const HTTP_REQUESTS: MetricDesc = MetricDesc {
    name: "http_requests",
    help: "Number of incoming HTTP requests",
    unit: None,
};
const BUILD_INFO: MetricDesc = MetricDesc {
    name: "build_info",
    help: "Different information about the app",
    unit: None,
};
const SEARCH_INDEX_QUEUE_LEN: MetricDesc = MetricDesc {
    name: "search_index_queue_len",
    help: "Number of items queued to be reindexed for search",
    unit: None,
};
const NUM_ITEMS: MetricDesc = MetricDesc {
    name: "num_items",
    help: "Number of different kinds of items in the DB",
    unit: None,
};


pub(crate) struct Metrics {
    http_requests: Family<HttpReqCategory, Counter>,
}

impl Metrics {
    pub(crate) fn new() -> Self {
        Self {
            http_requests: <Family<HttpReqCategory, Counter>>::default(),
        }
    }

    pub(crate) fn register_http_req(&self, category: HttpReqCategory) {
        self.http_requests.get_or_create(&category).inc();
    }

    pub(crate) async fn gather_and_encode(&self, db_pool: &Pool) -> Vec<u8> {
        let mut reg = <Registry>::default();

        add_any(&mut reg, HTTP_REQUESTS, Box::new(self.http_requests.clone()));

        // Add build information
        let info = <Family<Vec<(String, String)>, Gauge>>::default();
        info.get_or_create(&vec![
            ("version".into(), crate::version::identifier()),
            ("build_time_utc".into(), crate::version::build_time_utc().into()),
            ("git_commit_hash".into(), crate::version::git_commit_hash().into()),
        ]).set(1);
        add_any(&mut reg, BUILD_INFO, Box::new(info));

        // Information from the DB.
        // TODO: Do all of that in parallel?
        if let Ok(db) = db_pool.get().await {
            // Sync lag
            let sql = "select extract(epoch from now() - harvested_until) from sync_status";
            if let Ok(row) = db.query_one(sql, &[]).await {
                add_gauge(&mut reg, SYNC_LAG, row.get::<_, f64>(0) as u64);
            }

            // Search index queue length
            if let Ok(row) = db.query_one("select count(*) from search_index_queue", &[]).await {
                add_gauge(&mut reg, SEARCH_INDEX_QUEUE_LEN, row.get::<_, i64>(0) as u64);
            }

            // Number of important entities in DB
            let item_count = <Family<ItemKind, Gauge>>::default();
            let items = [
                (ItemKind::Realms, "realms"),
                (ItemKind::Events, "events"),
                (ItemKind::Series, "series"),
                (ItemKind::Blocks, "blocks"),
            ];
            for (kind, table) in items {
                let query = format!("select count(*) from {table}");
                if let Ok(row) = db.query_one(&query, &[]).await {
                    item_count.get_or_create(&kind).set(row.get::<_, i64>(0) as u64);
                }
            }
            add_any(&mut reg, NUM_ITEMS, Box::new(item_count));
        }

        // Process memory information.
        if let Some(info) = MemInfo::gather() {
            add_gauge(&mut reg, PROC_PSS, info.proportional);
            add_gauge(&mut reg, PROC_USS, info.unique);
            add_gauge(&mut reg, PROC_RSS, info.resident);
            add_gauge(&mut reg, PROC_SHARED_MEMORY, info.shared);
        }


        // We use `expect` here as I think `encode` only returns `Result`
        // because it takes a generic `Write`. But `Vec`'s `Write` impl never
        // fails.
        let mut out = Vec::new();
        encode(&mut out, &reg).expect("failed to encode Prometheus metrics");
        out
    }
}

fn add_any(reg: &mut Registry, metric: MetricDesc, value: Box<dyn SendSyncEncodeMetric>) {
    let name = format!("tobira_{}", metric.name);
    match metric.unit {
        Some(unit) => reg.register_with_unit(name, metric.help, unit, value),
        None => reg.register(name, metric.help, value),
    }
}

fn add_gauge(reg: &mut Registry, metric: MetricDesc, value: u64) {
    let gauge = <Gauge>::default();
    gauge.set(value);
    add_any(reg, metric, Box::new(gauge));
}


#[derive(Debug)]
struct MemInfo {
    resident: u64,
    proportional: u64,
    unique: u64,
    shared: u64,
}

impl MemInfo {
    /// Tries to gather memory info of the current process. If that fails,
    /// `None` is returned.
    fn gather() -> Option<Self> {
        let smaps = procfs::process::Process::myself().ok()?.smaps().ok()?;

        let mut out = Self {
            resident: 0,
            proportional: 0,
            unique: 0,
            shared: 0,
        };

        for (_, map_info) in smaps {
            out.resident += map_info.map.get("Rss").copied().unwrap_or(0);
            out.proportional += map_info.map.get("Pss").copied().unwrap_or(0);
            out.unique += map_info.map.get("Private_Clean").copied().unwrap_or(0);
            out.unique += map_info.map.get("Private_Dirty").copied().unwrap_or(0);
            out.shared += map_info.map.get("Shared_Clean").copied().unwrap_or(0);
            out.shared += map_info.map.get("Shared_Dirty").copied().unwrap_or(0);
        }

        Some(out)
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub(crate) enum HttpReqCategory {
    /// `POST /graphql`
    GraphQL,
    /// `POST /~session`
    Login,
    /// `DELETE /~session`
    Logout,
    /// `GET /~assets/*`
    Assets,
    /// `GET /~metrics`
    Metrics,
    /// Everything else that ends up serving our index HTML (the app basically).
    App,
    /// Everything else
    Other,
}

impl Encode for HttpReqCategory {
    fn encode(&self, writer: &mut dyn std::io::Write) -> Result<(), std::io::Error> {
        let s = match self {
            HttpReqCategory::GraphQL => b"graphql" as &[_],
            HttpReqCategory::Login => b"login",
            HttpReqCategory::Logout => b"logout",
            HttpReqCategory::Assets => b"assets",
            HttpReqCategory::Metrics => b"metrics",
            HttpReqCategory::App => b"app",
            HttpReqCategory::Other => b"other",
        };
        writer.write_all(b"category=\"")?;
        writer.write_all(s)?;
        writer.write_all(b"\"")?;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub(crate) enum ItemKind {
    Realms,
    Events,
    Series,
    Blocks,
}

impl Encode for ItemKind {
    fn encode(&self, writer: &mut dyn std::io::Write) -> Result<(), std::io::Error> {
        let s = match self {
            ItemKind::Realms => b"realms" as &[_],
            ItemKind::Events => b"events",
            ItemKind::Series => b"series",
            ItemKind::Blocks => b"blocks",
        };
        writer.write_all(b"item=\"")?;
        writer.write_all(s)?;
        writer.write_all(b"\"")?;
        Ok(())
    }
}
