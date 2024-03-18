use std::{
    collections::HashMap,
    fs::OpenOptions,
    path::PathBuf,
};
use nu_ansi_term::{Color, Style};
use serde::Deserialize;
use termcolor::ColorChoice;
use tracing::{field::Visit, Level};
use tracing_log::NormalizeEvent;
use tracing_subscriber::{
    filter::{FilterFn, LevelFilter},
    fmt::FormatEvent,
    prelude::*,
};


use crate::{prelude::*, args::Args};


#[derive(Debug, confique::Config)]
pub(crate) struct LogConfig {
    /// Specifies what log messages to emit, based on the module path and log level.
    ///
    /// This is a map where the key specifies a module path prefix, and the
    /// value specifies a minimum log level. For each log message, the map
    /// entry with the longest prefix matching the log's module path is chosen.
    /// If no such entry exists, the log is not emitted. Otherwise, that
    /// entry's level is used to check whether the log message should be
    /// emitted.
    ///
    /// Take the following example: the following config only allows ≥"info"
    /// logs from Tobira generally, but also ≥"trace" messages from the `db`
    /// submodule. But it completely disables all logs from `tobira::db::tx`.
    /// Finally, it also enabled ≥"debug" messages from one of Tobira's
    /// dependencies, the HTTP library `hyper`.
    ///
    ///    [log]
    ///    filters.tobira = "info"
    ///    filters."tobira::db" = "trace"
    ///    filters."tobira::db::tx" = "off"
    ///    filters.hyper = "debug"
    #[config(default = { "tobira": "debug" })]
    pub(crate) filters: Filters,

    /// If this is set, log messages are also written to this file. The string
    /// `${cmd}` in this value is replaced by the subcommand name of the Tobira
    /// process, e.g. `serve`, `worker` or `other` (for less important
    /// commands). Example: "/var/log/tobira-${job}.log".
    pub(crate) file: Option<PathBuf>,

    /// If this is set to `false`, log messages are not written to stdout.
    #[config(default = true)]
    pub(crate) stdout: bool,

    /// If set to `true`, HTTP header of each incoming request are logged
    /// (with 'trace' level).
    #[config(default = false)]
    pub(crate) log_http_headers: bool,
}

#[derive(Debug, Deserialize)]
#[serde(try_from = "HashMap<String, String>")]
pub(crate) struct Filters(HashMap<String, LevelFilter>);

impl TryFrom<HashMap<String, String>> for Filters {
    type Error = String;
    fn try_from(value: HashMap<String, String>) -> Result<Self, Self::Error> {
        value.into_iter()
            .map(|(target_prefix, level)| {
                let level = parse_level_filter(&level)?;
                Ok((target_prefix, level))
            })
            .collect::<Result<_, _>>()
            .map(Self)
    }
}

fn parse_level_filter(s: &str) -> Result<LevelFilter, String> {
    match s {
        "off" => Ok(LevelFilter::OFF),
        "trace" => Ok(LevelFilter::TRACE),
        "debug" => Ok(LevelFilter::DEBUG),
        "info" => Ok(LevelFilter::INFO),
        "warn" => Ok(LevelFilter::WARN),
        "error" => Ok(LevelFilter::ERROR),
        other => Err(format!("invalid log level '{other}'")),
    }
}

/// Installs our own logger globally. Must only be called once!
pub(crate) fn init(config: &LogConfig, args: &Args, cmd: &str) -> Result<()> {
    let filter = {
        let filters = config.filters.0.clone();
        let max_level = filters.values().max().copied().unwrap_or(LevelFilter::OFF);
        let filter = FilterFn::new(move |metadata| {
            // If there are many filters, it might be worth to build an extra
            // prefix data structure, but in practice we only expect very few
            // entries.
            //
            // See the config doc comment to see the logic behind this filter.
            filters.iter()
                .filter(|(target_prefix, _)| metadata.target().starts_with(*target_prefix))
                .max_by_key(|(target_prefix, _)| target_prefix.len())
                .map(|(_, level_filter)| metadata.level() <= level_filter)
                .unwrap_or(false)
        });
        filter.with_max_level_hint(max_level)
    };

    macro_rules! subscriber {
        ($writer:expr) => {
            tracing_subscriber::fmt::layer()
                .event_format(EventFormatter(args.color))
                .with_writer($writer)
        };
    }

    let stdout_output = if config.stdout {
        Some(subscriber!(std::io::stdout))
    } else {
        None
    };

    let file_output = config.file.as_ref()
        .map(|path| -> Result<std::fs::File> {
            use std::io::Write;

            let new_path = path.to_str()
                .ok_or_else(|| anyhow!("log file path is not valid UTF-8"))?
                .replace("${cmd}", cmd);

            let mut file = OpenOptions::new()
                .append(true)
                .create(true)
                .open(new_path)
                .with_context(|| format!("failed to open/create log file '{}'", path.display()))?;

            // Add an empty line separator to see process restarts easier.
            file.write_all(b"\n").context("could not write to log file")?;

            Ok(file)
        })
        .transpose()?
        .map(|file| subscriber!(file).with_ansi(args.color == ColorChoice::Always));

    tracing_subscriber::registry()
        .with(filter)
        .with(file_output)
        .with(stdout_output)
        .init();

    Ok(())
}

type TracingWriter<'a> = tracing_subscriber::fmt::format::Writer<'a>;

#[derive(Clone, Copy)]
struct EventFormatter(ColorChoice);

impl<S, N> FormatEvent<S, N> for EventFormatter
where
    S: tracing::Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
    N: for<'a> tracing_subscriber::fmt::FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        // TODO: maybe print infos about the span
        _ctx: &tracing_subscriber::fmt::FmtContext<'_, S, N>,
        mut writer: TracingWriter<'_>,
        event: &tracing::Event<'_>,
    ) -> std::fmt::Result {
        // Helper macros to conditionally emit ANSI control codes
        let use_ansi = self.0 == ColorChoice::Always
            || (writer.has_ansi_escapes() && self.0 != ColorChoice::Never);
        macro_rules! wr {
            ($style:expr, $fmt:literal $($args:tt)*) => {{
                with_style(&mut writer, use_ansi, $style, |w| {
                    write!(w, $fmt $($args)*)
                })?;
            }};
        }

        // Normalize metadata of log events
        let normalized_metadata = event.normalized_metadata();
        let metadata = normalized_metadata.as_ref().unwrap_or(event.metadata());

        // Determine styles/colors
        let dim_style = Style::new().dimmed();
        let level_style = match *metadata.level() {
            Level::ERROR => Style::new().fg(Color::Red).bold(),
            Level::WARN => Style::new().fg(Color::Yellow).bold(),
            Level::INFO => Style::new().fg(Color::Green),
            Level::DEBUG => Style::new().fg(Color::Blue),
            Level::TRACE => Style::new().fg(Color::Magenta),
        };
        let body_style = match *metadata.level() {
            Level::ERROR => Style::new().fg(Color::Red),
            Level::WARN => Style::new().fg(Color::Yellow),
            Level::INFO => Style::new(),
            Level::DEBUG => Style::new().dimmed(),
            Level::TRACE => Style::new().fg(Color::DarkGray),
        };


        // Print time, level and target.
        wr!(dim_style, "{} ", chrono::Local::now().format("%Y-%m-%d %H:%M:%S.%3f"));
        wr!(level_style, "{:5}", metadata.level());
        wr!(dim_style, " {} >  ", metadata.target());


        // ---- Print message & all fields ------------------------------------
        // `tracing-subscriber` intends this part to be done by the
        // `FormatFields` trait, but this doesn't work for us since we want to
        // have pretty multi-line printing. For that we need to switch between
        // dimmed_style and body_style. The latter depends on the level which is
        // inaccessible in `FieldFormatter`. So we do all of that here.

        fn ignore_field(name: &str) -> bool {
            name == "message" || name.starts_with("log.") || name.starts_with("tobira.")
        }

        // We first visit all fields to gather some information on how to print
        // them. We also remember the `message` field. This is always the first
        // field in my tests and other code seems to rely on it, but I haven't
        // seen it guaranteed anywhere. And we need to allocate an intermediate
        // string anyway.
        #[derive(Debug)]
        struct ProbeVisitor {
            message: Option<String>,
            // Print each field on its own line.
            multiline: bool,
            num_fields: u32,
        }

        impl Visit for ProbeVisitor {
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
                if !ignore_field(field.name()) {
                    self.num_fields += 1;
                }

                if field.name() == "message" {
                    self.message = Some(format!("{value:?}"));
                }
            }

            fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
                if !ignore_field(field.name()) {
                    self.num_fields += 1;
                }

                // "tobira.multiline" is a special flag that we can set to print
                //  each variable on its own line.
                match field.name() {
                    "tobira.multiline" => self.multiline = value,
                    _ => {}
                }
            }
        }

        let mut probe = ProbeVisitor {
            message: None,
            multiline: false,
            num_fields: 0,
        };
        event.record(&mut probe);


        struct PrintContext<'a> {
            prefix: &'a str,
            use_ansi: bool,
            body_style: Style,
        }

        fn print_multiline(
            s: &str,
            out: &mut TracingWriter<'_>,
            ctx: &PrintContext<'_>,
        ) -> std::fmt::Result {
            macro_rules! with_style {
                ($style:expr, |$arg:ident| $body:tt) => {
                    with_style(out, ctx.use_ansi, $style, |$arg| $body)?;
                };
            }

            let mut lines = s.lines();

            // First line
            with_style!(ctx.body_style, |out| {
                write!(out, "{}", lines.next().unwrap_or(""))
            });

            for line in lines {
                write!(out, "{}", ctx.prefix)?;
                with_style!(ctx.body_style, |out| { write!(out, "{line}") });
            }

            Ok(())
        }

        // Print all other fields
        struct Printer<'a, 'w> {
            buffer: String,
            ctx: PrintContext<'a>,
            multiline: bool,
            separator: &'a str,
            needs_separator: bool,
            out: TracingWriter<'w>,
        }

        impl Visit for Printer<'_, '_> {
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
                // Ignore some fields
                let name = field.name();
                if name == "message" || name.starts_with("log.") || name.starts_with("tobira.") {
                    return;
                }

                let _ = (|| -> std::fmt::Result {
                    use std::fmt::Write;

                    self.buffer.clear();
                    write!(self.buffer, "{value:?}").unwrap();

                    if self.needs_separator {
                        write!(self.out, "{}", self.separator)?;
                    }

                    let key_style = self.ctx.body_style.italic();
                    with_style(&mut self.out, self.ctx.use_ansi, key_style, |out| {
                        write!(out, "{}", field.name())
                    })?;
                    with_style(&mut self.out, self.ctx.use_ansi, self.ctx.body_style, |out| {
                        write!(out, "{}", if self.multiline { " = " } else { "=" })
                    })?;

                    if self.multiline {
                        print_multiline(&self.buffer, &mut self.out, &self.ctx)?;
                    } else {
                        with_style(&mut self.out, self.ctx.use_ansi, self.ctx.body_style, |out| {
                            write!(out, "{}", self.buffer)
                        })?;
                    }
                    self.needs_separator = true;

                    Ok(())
                })();
            }
        }



        // The padded prefix to make the message nicely aligned. I know this
        // only works if the target is ASCII, but that's a fair assumption.
        let prefix = {
            let padding = "2021-05-04 19:40:18.270 DEBUG ".len() + 2 + metadata.target().len();
            format!(
                "\n{:padding$}{prefix}>{suffix}  ",
                "",
                padding = padding - 1,
                prefix = if use_ansi { dim_style.prefix() } else { Style::new().prefix() },
                suffix = if use_ansi { dim_style.suffix() } else { Style::new().suffix() },
            )
        };

        let print_ctx = PrintContext {
            prefix: &prefix,
            use_ansi,
            body_style,
        };

        // Print main message
        if let Some(msg) = &probe.message {
            print_multiline(msg, &mut writer, &print_ctx)?;
        }

        // Print fields
        if probe.num_fields > 0 {
            if probe.message.is_some() {
                wr!(level_style, " ~~ ");
            }
            let mut printer = Printer {
                separator: if probe.multiline { &prefix } else { " " },
                needs_separator: probe.multiline && probe.message.is_some(),
                ctx: print_ctx,
                multiline: probe.multiline,
                out: writer.by_ref(),
                // Reuse the string from before as scratch buffer
                buffer: probe.message.unwrap_or_default(),
            };
            event.record(&mut printer);
        }

        writeln!(writer, "{}", if use_ansi { nu_ansi_term::ansi::RESET } else { "" })?;

        Ok(())
    }
}

fn with_style(
    out: &mut TracingWriter<'_>,
    use_ansi: bool,
    style: Style,
    f: impl FnOnce(&mut TracingWriter<'_>) -> std::fmt::Result,
) -> std::fmt::Result {
    if use_ansi {
        write!(out, "{}", style.prefix())?;
    }
    f(out)?;
    if use_ansi {
        write!(out, "{}", style.suffix())?;
    }
    Ok(())
}
