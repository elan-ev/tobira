import { fetchQuery, graphql, GraphQLTaggedNode } from "react-relay";
import { OperationType } from "relay-runtime";

import { bug } from "../util/err";
import CONFIG from "../config";
import { environment } from ".";
import { authLinkTokenQuery } from "./__generated__/authLinkTokenQuery.graphql";
import { authUploadTokenQuery } from "./__generated__/authUploadTokenQuery.graphql";

/**
 * Authenticate an external link using a JWT.
 * A JWT is added only if you enabled the `pre_auth_external_links` config option.
 * Returns a new `URL` (as opposed to modifying its parameter) in any case, though.
 */
export const authenticateLink = async (link: URL | string): Promise<URL> => {
    const authenticatedLink = new URL(link);
    if (CONFIG.auth.preAuthExternalLinks) {
        const query = graphql`
            query authLinkTokenQuery {
                externalLinkJwt
            }
        `;
        const result = await getJwt<authLinkTokenQuery>(query);
        authenticatedLink.searchParams.append("jwt", result.externalLinkJwt);
    }
    return authenticatedLink;
};

/** Fetches a new JWT for uploading to Opencast */
export const getUploadJwt = async (): Promise<string> => {
    const query = graphql`
        query authUploadTokenQuery {
            uploadJwt
        }
    `;
    const result = await getJwt<authUploadTokenQuery>(query);
    return result.uploadJwt;
};

/**
 * Internal helper function to fetch JWTs mainly to hide the ceremony involved
 * with using Relay observables. Errors (as opposed to rejects) when the query returns
 * more or less than one result(s).
 */
const getJwt = <
    Query extends OperationType,
>(
    query: GraphQLTaggedNode,
): Promise<Query["response"]> => new Promise((resolve, reject) => {
    let gotResult = false;
    let out: Query["response"];

    // Use "network-only" as we always want a fresh JWTs. `fetchQuery` should already
    // never write any values into the cache, but better make sure.
    fetchQuery<Query>(environment, query, {}, { fetchPolicy: "network-only" }).subscribe({
        complete: () => {
            if (!gotResult) {
                bug("'complete' callback before receiving any data");
            } else {
                resolve(out);
            }
        },
        error: (error: unknown) => reject(error),
        next: data => {
            if (gotResult) {
                bug("unexpected second data when retrieving JWT");
            } else {
                out = data;
                gotResult = true;
            }
        },
    });
});
