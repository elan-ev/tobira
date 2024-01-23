// This file defines a bunch of fixtures to insert a set of data into the DB
// before the test.

import * as fs from "fs/promises";
import { test as base } from "./isolation";
import postgres from "postgres";

export type CustomTestFixtures = {
    /** The standard data set suitable for most tests. */
    standardData: StandardData;
};

export type StandardData = Record<string, never>;

export const test = base.extend<CustomTestFixtures>({
    standardData: async ({ tobiraProcess }, use, workerInfo) => {
        // Create temporary database for this Tobira process
        const sql = postgres(`postgres://tobira:tobira@127.0.0.1/${tobiraProcess.dbName}`, {
            onnotice: () => {},
        });
        const code = await fs.readFile(`${workerInfo.config.rootDir}/fixtures/standard.sql`);
        await sql.unsafe(code.toString());
        await sql.end();
        await use({});
    },
});
