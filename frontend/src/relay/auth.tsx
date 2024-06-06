import React from "react";
import { fetchQuery, graphql } from "react-relay";
import { bug, match } from "@opencast/appkit";

import CONFIG from "../config";
import { environment } from ".";
import { authJwtQuery, JwtService } from "./__generated__/authJwtQuery.graphql";
import { FormEvent, PropsWithChildren } from "react";
import { Link } from "../router";
import { LinkButton } from "../ui/Button";


/** Different external services we can link to using JWT pre-authentication */
type JwtLinkedService = "EDITOR" | "STUDIO";

const serviceUrl = (service: JwtLinkedService): URL => new URL(match(service, {
    EDITOR: () => CONFIG.opencast.editorUrl,
    STUDIO: () => CONFIG.opencast.studioUrl,
}));

export type ExternalLinkProps = PropsWithChildren<{
    className?: string;
    fallback: "link" | "button";
} & ({
    service: "STUDIO";
    params: {
        "return.target": string;
        "return.label": string;
    };
} | {
    service: "EDITOR";
    params: {
        id: string;
        callbackUrl: string;
        callbackSystem: string;
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
export const ExternalLink = React.forwardRef<HTMLButtonElement, ExternalLinkProps>(({
    className,
    fallback,
    service,
    children,
    params,
}, ref) => {
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
        const form = event.target as HTMLFormElement & { jwt: HTMLInputElement };
        form.jwt.value = await getJwt(service);
        form.submit();
    };

    return <form action={redirect.toString()} method="POST" onSubmit={onSubmit}>
        <input type="hidden" name="target" value={target.toString()} />
        <input type="hidden" name="jwt" />

        <button
            {...{ ref, className }}
            css={{
                backgroundColor: "transparent",
                border: "none",
            }}
        >{children}</button>
    </form>;
});

/**
 * Internal helper function to fetch JWTs mainly to hide the ceremony involved
 * with using Relay observables. Errors (as opposed to rejects) when the query returns
 * more or less than one result(s).
 */
export const getJwt = (service: JwtService): Promise<string> => (
    new Promise((resolve, reject) => {
        let gotResult = false;
        let out: authJwtQuery["response"];
        const query = graphql`
            query authJwtQuery($service: JwtService!) {
                jwt(service: $service)
            }
        `;
        fetchQuery<authJwtQuery>(
            environment,
            query,
            { service },
            // Use "network-only" as we always want a fresh JWTs. `fetchQuery` should already
            // never write any values into the cache, but better make sure.
            { fetchPolicy: "network-only" },
        ).subscribe({
            complete: () => {
                if (!gotResult) {
                    bug("'complete' callback before receiving any data");
                } else {
                    resolve(out.jwt);
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
