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

    // The original goto doesn't quite work for us, as the readiness check is insufficient
    // for Tobira. This one makes sure the graphql response is returned and the
    // "Loading..." is not shown anymore.
    page: async ({ page }, use) => {
        const originalGoTo = page.goto.bind(page) as typeof page.goto;
        page.goto = async (url: string) => {
            const res = await Promise.all([
                originalGoTo(url),
                page.waitForResponse(resp => resp.url().endsWith("/graphql"))
                    .then(() => page.getByText("Loading...").waitFor({ state: "hidden" })),
            ]);
            return res[0];
        };

        await use(page);
    },
});
