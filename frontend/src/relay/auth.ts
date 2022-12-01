import { fetchQuery, graphql, GraphQLTaggedNode } from "react-relay";
import { OperationType } from "relay-runtime";

import { match } from "../util";
import { bug } from "../util/err";
import CONFIG from "../config";
import { environment } from ".";
import { authLinkTokenQuery } from "./__generated__/authLinkTokenQuery.graphql";
import { authUploadTokenQuery } from "./__generated__/authUploadTokenQuery.graphql";


/**
 * Authenticate a link to one of the Opencast hosted services we link to.
 * A JWT is added only if you enabled the `pre_auth_external_links` config option.
 */
export const authenticateLink = async (service: "EDITOR" | "STUDIO"): Promise<URL> => {
    const authenticatedLink = new URL(match(service, {
        EDITOR: () => CONFIG.opencast.editorUrl,
        STUDIO: () => CONFIG.opencast.studioUrl,
    }));
    if (CONFIG.auth.preAuthExternalLinks) {
        const query = graphql`
            query authLinkTokenQuery($service: JwtService!) {
                jwt(service: $service)
            }
        `;
        const result = await getJwt<authLinkTokenQuery>(query, { service });
        authenticatedLink.searchParams.append("jwt", result.jwt);
    }
    return authenticatedLink;
};

/** Fetches a new JWT for uploading to Opencast */
export const getUploadJwt = async (): Promise<string> => {
    const query = graphql`
        query authUploadTokenQuery {
            jwt(service: UPLOAD)
        }
    `;
    const result = await getJwt<authUploadTokenQuery>(query);
    return result.jwt;
};

/**
 * Internal helper function to fetch JWTs mainly to hide the ceremony involved
 * with using Relay observables. Errors (as opposed to rejects) when the query returns
 * more or less than one result(s).
 */
const getJwt = <Query extends OperationType>(
    query: GraphQLTaggedNode,
    variables: Query["variables"] = {},
): Promise<Query["response"]> => (
    new Promise((resolve, reject) => {
        let gotResult = false;
        let out: Query["response"];

        fetchQuery<Query>(
            environment,
            query,
            variables,
            // Use "network-only" as we always want a fresh JWTs. `fetchQuery` should already
            // never write any values into the cache, but better make sure.
            { fetchPolicy: "network-only" },
        ).subscribe({
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
    })
);
