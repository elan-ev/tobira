// This file defines "fixtures" that provide a perfectly isolated testing
// environment. For each worker process, one Tobira instance is started with
// its own database. The database is cleared after every test.

import * as fs from "fs/promises";
import * as child_process from "child_process";
import { test as base } from '@playwright/test';
import postgres from "postgres";
import waitPort from "wait-port";


export type CustomWorkerFixtures = {
    tobiraBinary: string;
    tobiraProcess: TobiraProcess;
};

export type CustomTestFixtures = {
    tobiraReset: TobiraReset;
};

export type TobiraProcess = {
    port: number;
    workerDir: string;
    configPath: string;
    binaryPath: string;
};

export type TobiraReset = {
    /**
     * This is for speeding up tests: tests that do not write anything to the DB
     * can call this to prevent the reset step after they are finished.
     */
    resetNotNecessaryIDoNotModifyAnything: () => void;
};

export const test = base.extend<CustomTestFixtures, CustomWorkerFixtures>({
    tobiraBinary: ["backend/target/debug/tobira", { option: true, scope: "worker" }],

    // This fixture starts a new completely isolated Tobira process (with its
    // own DB) for each Playwright worker process.
    tobiraProcess: [async ({ tobiraBinary }, use, workerInfo) => {
        // Create temporary folder
        const outDir = `${workerInfo.config.rootDir}/../test-results/`;
        const workerDir = `${outDir}/_tobira/process${workerInfo.parallelIndex}`;
        const rootPath = `${workerInfo.config.rootDir}/../../`;
        const configPath = `${workerDir}/config.toml`;
        await fs.mkdir(workerDir, { recursive: true });

        // Write config file for this test runner
        const port = 3100 + workerInfo.parallelIndex;
        const dbName = `tobira_ui_test_${workerInfo.parallelIndex}`;
        const config = tobiraConfig({
            port,
            dbName,
            index: workerInfo.parallelIndex,
            rootPath,
        })
        fs.writeFile(configPath, config, { encoding: "utf8" });

        // Create temporary database for this Tobira process
        const sql = postgres("postgres://tobira:tobira@127.0.0.1/tobira", {
            onnotice: notice => {},
        });
        await sql.unsafe(`drop database if exists ${dbName}`);
        await sql.unsafe(`create database ${dbName}`);

        // Start Tobira
        const binaryPath = `${rootPath}/${tobiraBinary}`;
        const tobiraProcess = child_process.spawn(
            binaryPath,
            ["serve", "--config", configPath],
            // { stdio: "inherit" }
        );
        await waitPort({ port, interval: 10, output: "silent" });


        // Use fixture
        await use({ port, workerDir, configPath, binaryPath });


        // Cleanup
        tobiraProcess.kill();
        await sql.unsafe(`drop database if exists ${dbName}`);
        await fs.rm(workerDir, { recursive: true });
    }, { scope: 'worker', auto: true }],

    // We set the base URL for all tests here, which depends on the port.
    baseURL: async ({ tobiraProcess }, use) => {
        await use(`http://localhost:${tobiraProcess.port}`);
    },

    // This resets the Tobira DB after every test that modifies any data.
    tobiraReset: [async ({ tobiraProcess }, use) => {
        let shouldReset = true;
        await use({
            resetNotNecessaryIDoNotModifyAnything: () => { shouldReset = false; },
        });
        if (shouldReset) {
            await new Promise(resolve => {
                const p = child_process.spawn(
                    tobiraProcess.binaryPath,
                    ["db", "reset", "--yes-absolutely-clear-db", "-c", tobiraProcess.configPath],
                    // { stdio: "inherit" }
                );
                p.on("close", resolve);
            })
        }
    }, { auto: true }],
});

// TODO: DB
const tobiraConfig = ({ index, port, dbName, rootPath }: {
    index: number,
    port: number,
    dbName: string,
    rootPath: string,
}) => `
    [general]
    site_title.en = "Tobira Videoportal"
    tobira_url = "http://localhost:${port}"
    users_searchable = true

    [http]
    port = ${port}

    [db]
    database = "${dbName}"
    user = "tobira"
    password = "tobira"
    tls_mode = "off"

    [meili]
    index_prefix = "tobira_ui_test_${index}"
    key = "tobira"

    [log]
    level = "debug"

    [auth]
    mode = "login-proxy"
    trusted_external_key = "tobira"
    pre_auth_external_links = true

    [auth.jwt]
    signing_algorithm = "ES256"

    [opencast]
    host = "https://dummy.invalid" # Not used in UI tests

    [sync]
    user = "admin"
    password = "opencast"

    [theme]
    logo.large.path = "${rootPath}/util/dev-config/logo-large.svg"
    logo.large.resolution = [425, 182]
    logo.large_dark.path = "${rootPath}/util/dev-config/logo-large-dark.svg"
    logo.large_dark.resolution = [425, 182]
    logo.small.path = "${rootPath}/util/dev-config/logo-small.svg"
    logo.small.resolution = [212, 182]
    logo.small_dark.path = "${rootPath}/util/dev-config/logo-small.svg"
    logo.small_dark.resolution = [212, 182]
    favicon = "${rootPath}/util/dev-config/favicon.svg"
`;
