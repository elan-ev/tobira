use deadpool_postgres::Pool;
use prometheus_client::{metrics::gauge::Gauge, registry::{Registry, Unit}, encoding::text::encode};



struct MetricDesc {
    name: &'static str,
    help: &'static str,
    unit: Unit,
}

const SYNC_LAG: MetricDesc = MetricDesc {
    name: "sync_lag",
    help: "Number of seconds which the Tobira database is behind the Opencast data",
    unit: Unit::Seconds,
};
const PROC_USS : MetricDesc = MetricDesc {
    name: "proc_uss",
    help: "Unique Set Size (memory exclusively allocated for Tobira)",
    unit: Unit::Bytes,
};
const PROC_PSS : MetricDesc = MetricDesc {
    name: "proc_pss",
    help: "Proportional Set Size",
    unit: Unit::Bytes,
};
const PROC_RSS : MetricDesc = MetricDesc {
    name: "proc_rss",
    help: "Resident Set Size",
    unit: Unit::Bytes,
};
const PROC_SHARED_MEMORY : MetricDesc = MetricDesc {
    name: "proc_shared_memory",
    help: "Shared memory (memory shared with other processes)",
    unit: Unit::Bytes,
};


pub(crate) struct Metrics {}

impl Metrics {
    pub(crate) fn new() -> Self {
        Self {}
    }

    pub(crate) async fn gather_and_encode(&self, db_pool: &Pool) -> Vec<u8> {
        let mut reg = <Registry>::default();

        // Information from the DB.
        if let Ok(db) = db_pool.get().await {
            // Sync lag
            let sql = "select extract(epoch from now() - harvested_until) from sync_status";
            if let Ok(row) = db.query_one(sql, &[]).await {
                add_gauge(&mut reg, SYNC_LAG, row.get::<_, f64>(0) as u64);
            }
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

fn add_gauge(reg: &mut Registry, metric: MetricDesc, value: u64) {
    let gauge = <Gauge>::default();
    gauge.set(value);
    reg.register_with_unit(
        format!("tobira_{}", metric.name),
        metric.help,
        metric.unit,
        Box::new(gauge),
    );
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
