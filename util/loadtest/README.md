# Load-testing utilities for Tobira

This app allows you to load test Tobira, giving you information such as:
- How many requests (of a specific kind) per second can Tobira handle?
- Do any requests start failing under too much load?

Currently, this is just a very bare bones, quickly written script!
We are using [`goose`](https://github.com/tag1consulting/goose) as the framework for writing load tests.

## Running

Be sure to build Tobira in release mode, e.g. via `x.sh build-release`!
Also make sure that the configured log level is not "trace" or anything else that could print something per incoming request.
That would create a huge log and influences the result.

Run with:

```
cargo run -r -- --host http://localhost:3080 --report-file=report.html --no-reset-metrics --hatch-rate 5 --run-time 20s
```

There are many CLI options, i.e. run `cargo run -r -- -h` to see them all.
To get meaningful data, you likely have to adjust some of these values.

*Note*: there are multiple kinds of requests defined in `src/main.rs`.
By default a mix of all of them is executed.
To just run one of them, pass the `--scenarios` option, e.g. `--scenarios="indexhtml"`.
List all scenarios via:

```
cargo run -r -- --scenarios-list
```

`run.sh` might also be useful for you, though that's just an ad-hoc script.
