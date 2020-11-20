use anyhow::Result;
use log::{Level, LevelFilter, Log, Metadata, Record};
use std::{
    fs::{File, OpenOptions},
    sync::Mutex,
};
use termcolor::{Color, ColorChoice, ColorSpec, NoColor, StandardStream, WriteColor};

use crate::config;



/// Our own `Log` implementation.
struct Logger {
    level_filter: LevelFilter,
    file: Option<Mutex<File>>,
    stdout: Option<Mutex<StandardStream>>,
}

/// Installs our own logger globally. Must only be called once!
pub(crate) fn init(config: &config::Log) -> Result<()> {
    let stdout = match config.stdout {
        // TODO: we might want to pass color choice via args
        true => Some(Mutex::new(StandardStream::stdout(ColorChoice::Always))),
        false => None,
    };

    let file = config.file.as_ref()
        .map(|path| OpenOptions::new().append(true).create(true).open(path))
        .transpose()?
        .map(Mutex::new);

    let logger = Logger {
        level_filter: config.level,
        file,
        stdout,
    };

    log::set_boxed_logger(Box::new(logger)).expect("`logger::init` called twice");
    log::set_max_level(config.level);

    Ok(())
}

impl Log for Logger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.target().starts_with("tobira")
            && metadata.level() <= self.level_filter
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        if let Some(stdout) = &self.stdout {
            // We ignore a poisened mutex. The stdout handle doesn't contain
            // anything "state" that other threads could have tainted. The worst
            // that could happen is slightly weird formatting.
            //
            // We also ignore possible errors writing to `stdout`. Because...
            // what are we supposed to do? It's better the server keeps running
            // without logs than the server going down?
            let mut stdout = stdout.lock().unwrap_or_else(|e| e.into_inner());
            let _ = write(record, &mut *stdout);
        }

        if let Some(file) = &self.file {
            // See comment above about stdout.
            let mut file = file.lock().unwrap_or_else(|e| e.into_inner());
            let _ = write(record, &mut NoColor::new(&mut *file));
        }
    }

    fn flush(&self) {}
}

fn write(record: &Record, out: &mut impl WriteColor) -> Result<()> {
    // Figure out styles/colors for the parts of the message.
    let (level_color, level_bold) = match record.level() {
        Level::Error => (Color::Red, true),
        Level::Warn => (Color::Yellow, true),
        Level::Info => (Color::Green, false),
        Level::Debug => (Color::Blue, false),
        Level::Trace => (Color::Magenta, false),
    };
    let mut level_style = ColorSpec::new();
    level_style.set_fg(Some(level_color));
    level_style.set_bold(level_bold);

    let mut dim_style = ColorSpec::new();
    dim_style.set_dimmed(true);

    let body_color = match record.level() {
        Level::Error => Some(Color::Red),
        Level::Warn => Some(Color::Yellow),
        Level::Info => Some(Color::Green),
        Level::Debug => None,
        Level::Trace => None,
    };
    let mut body_style = ColorSpec::new();
    body_style.set_fg(body_color);
    if record.level() == Level::Trace {
        body_style.set_dimmed(true);
    }


    // Print time, level and target.
    out.set_color(&dim_style)?;
    write!(out, "{}[", chrono::Local::now().format("[%Y-%m-%d][%H:%M:%S.%3f]"))?;
    out.set_color(&level_style)?;
    write!(out, "{:5}", record.level())?;
    out.set_color(&dim_style)?;
    write!(out, "][{}]", record.target())?;

    // Print actual message
    let msg = record.args().to_string();
    let mut lines = msg.lines();

    // First line
    out.set_color(&body_style)?;
    write!(out, "  {}", lines.next().unwrap_or(""))?;
    out.reset()?;
    writeln!(out)?;

    // Print remaining lines with a padding such that the message is
    // nicely aligned. I know this only works if the target is ASCII,
    // but that's a fair assumption.
    let padding = "[2020-11-15][18:45:35.972][INFO ]".len() + 2 + record.target().len();
    for line in lines {
        out.set_color(&dim_style)?;
        write!(out, "{:padding$}|", "", padding = padding - 1)?;
        out.set_color(&body_style)?;
        write!(out, "  {msg}", msg = line)?;
        out.reset()?;
        writeln!(out)?;
    }

    Ok(())
}
