import { fetchQuery, graphql, GraphQLTaggedNode } from "react-relay";
import { OperationType } from "relay-runtime";

import { match } from "../util";
import { bug } from "../util/err";
import CONFIG from "../config";
import { environment } from ".";
import { authLinkTokenQuery } from "./__generated__/authLinkTokenQuery.graphql";
import { authUploadTokenQuery } from "./__generated__/authUploadTokenQuery.graphql";
import { FormEvent, PropsWithChildren } from "react";
import { Link } from "../router";
import { LinkButton } from "../ui/Button";


/** Different external services we can link to using JWT pre-authentication */
type JwtService = "EDITOR" | "STUDIO";

const serviceUrl = (service: JwtService): URL => new URL(match(service, {
    EDITOR: () => CONFIG.opencast.editorUrl,
    STUDIO: () => CONFIG.opencast.studioUrl,
}));

type ExternalLinkProps = PropsWithChildren<{
    className?: string;
    fallback: "link" | "button";
} & ({
    service: "STUDIO";
    params: {
        "return.target": URL;
    };
} | {
    service: "EDITOR";
    params: {
        mediaPackageId: string;
    };
})>;

/**
 * Authenticate a link to one of the Opencast hosted services we link to
 * when `pre_auth_external_links` is enabled.
 * In that case, this renders a form `POST`-ing you to Opencasts redirect endpoint
 * passing along a JWT to get an authenticated session.
 * The redirection then takes you to the final destination.
 * If the setting is not enabled, this is just a normal link.
 */
export const ExternalLink: React.FC<ExternalLinkProps> = ({
    className,
    fallback,
    service,
    children,
    params,
}) => {
    const target = serviceUrl(service);
    for (const [key, value] of Object.entries(params)) {
        target.searchParams.append(key, value);
    }

    if (!CONFIG.auth.preAuthExternalLinks) {
        return match(fallback, {
            link: () => <Link className={className} to={target.toString()} target="_blank">
                {children}
            </Link>,
            button: () => <LinkButton className={className} to={target.toString()} target="_blank">
                {children}
            </LinkButton>,
        });
    }

    const redirect = new URL("/redirect/get", target);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();

        const query = graphql`
            query authLinkTokenQuery($service: JwtService!) {
                jwt(service: $service)
            }
        `;
        const result = await getJwt<authLinkTokenQuery>(query, { service });

        const form = event.target as HTMLFormElement & { jwt: HTMLInputElement };
        form.jwt.value = result.jwt;

        form.submit();
    };

    return <form action={redirect.toString()} method="POST" target="_blank" onSubmit={onSubmit}>
        <input type="hidden" name="target" value={target.toString()} />
        <input type="hidden" name="jwt" value="test" />

        <button className={className}>
            {children}
        </button>
    </form>;
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
