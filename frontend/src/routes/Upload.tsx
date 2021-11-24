import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery, useRelayEnvironment } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../layout/Root";
import { loadQuery } from "../relay";
import { UploadQuery } from "../query-types/UploadQuery.graphql";
import { UPLOAD_PATH } from "./paths";
import { makeRoute } from "../rauta";
import { Environment, fetchQuery } from "relay-runtime";
import { UploadJwtQuery } from "../query-types/UploadJwtQuery.graphql";
import { bug } from "../util/err";
import CONFIG from "../config";


export const UploadRoute = makeRoute<PreloadedQuery<UploadQuery>>({
    path: UPLOAD_PATH,
    queryParams: [],
    prepare: () => loadQuery(query, {}),
    render: queryRef => <Upload queryRef={queryRef} />,
    dispose: prepared => prepared.dispose(),
});

const query = graphql`
    query UploadQuery {
        ... UserData
    }
`;

type Props = {
    queryRef: PreloadedQuery<UploadQuery>;
};

const Upload: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();
    const result = usePreloadedQuery(query, queryRef);
    const relayEnv = useRelayEnvironment();

    const start = async () => {
        // TODO: error handling
        const res = await ocRequest(relayEnv, "/info/me.json");
        console.log(await res.json());
    };

    return (
        <Root nav={[]} userQuery={result}>
            <div css={{ margin: "0 auto", maxWidth: 600 }}>
                <h1>{t("upload.title")}</h1>
                <button onClick={start}>Start</button>
            </div>
        </Root>
    );
};

/** Performs a request against Opencast, authenticated via JWT */
const ocRequest = async (
    relayEnv: Environment,
    path: string,
    options: RequestInit = {},
): Promise<Response> => {
    const jwt = await getJwt(relayEnv);

    const url = `${CONFIG.ocUrl}${path}`;
    return await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            "Authorization": `Bearer ${jwt}`,
        },
    });
};

/** Fetches a new JWT for uploading to Opencast */
const getJwt = (relayEnv: Environment): Promise<string> => new Promise((resolve, reject) => {
    const query = graphql`
        query UploadJwtQuery {
            uploadJwt
        }
    `;

    let out: string | null = null;

    // Use "network-only" as we always want a fresh JWTs. `fetchQuery` should already
    // never write any values into the cache, but better make sure.
    fetchQuery<UploadJwtQuery>(relayEnv, query, {}, { fetchPolicy: "network-only" }).subscribe({
        complete: () => {
            if (out === null) {
                bug("'complete' callback before receiving any data");
            } else {
                resolve(out);
            }
        },
        error: (error: unknown) => reject(error),
        next: data => {
            if (out !== null) {
                bug("unexpected second data when retrieving JWT");
            } else {
                out = data.uploadJwt;
            }
        },
    });
});
