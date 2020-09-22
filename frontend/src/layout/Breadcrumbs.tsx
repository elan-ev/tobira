import { jsx } from "@emotion/core";
import React from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleRight, faHome } from '@fortawesome/free-solid-svg-icons'


type Props = {
    path: Item[],
};

type Item = {
    label: string,
    href: string,
}

export const Breadcrumbs: React.FC<Props> = ({ path }) => {
    // TODO: i18n Home
    return (
        <nav aria-label="breadcrumbs" css={{ marginBottom: 16 }}>
            <ol css={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li css={{ display: "inline" }}>
                    <a href="/"><FontAwesomeIcon title="Home" icon={faHome} /></a>
                </li>
                { path.map((segment, i) => {
                    const aria = i == path.length - 1 && { "aria-current": "location" as const };

                    return (
                        <li key={i} css={{ display: "inline" }}>
                            <FontAwesomeIcon icon={faAngleRight} css={{ margin: "0 8px" }}/>
                            <a href={segment.href} {...aria}>{segment.label}</a>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};
