import React from "react";
import { FiChevronRight, FiHome } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { Link } from "../router";


type Props = {
    path: PathSegment[];
};

type PathSegment = {
    label: string;
    link: string;
};

const LI_STYLE = {
    display: "inline-flex",
    alignItems: "center",
};

export const Breadcrumbs: React.FC<Props> = ({ path }) => {
    const { t } = useTranslation();

    return (
        <nav aria-label="breadcrumbs" css={{ overflowX: "auto", marginBottom: 24 }}>
            <ol css={{
                display: "flex",
                alignItems: "center",
                padding: 0,
                margin: 0,
                fontSize: 14,
                whiteSpace: "nowrap",
                "& svg": {
                    fontSize: 16,
                },
            }}>
                <li css={LI_STYLE}>
                    <Link to="/" css={{ lineHeight: 1 }}>
                        <FiHome title={t("home")} />
                    </Link>
                </li>
                {path.map((segment, i) => (
                    <Segment key={i} target={segment.link} active={i === path.length - 1}>
                        {segment.label}
                    </Segment>
                ))}
            </ol>
        </nav>
    );
};

type SegmentProps = {
    target: string;
    active: boolean;
};

const Segment: React.FC<SegmentProps> = ({ target, active, children }) => (
    <li css={LI_STYLE} {...active && { "aria-current": "location" }}>
        <FiChevronRight css={{ margin: "0 5px", color: "var(--grey65)" }}/>
        {active ? children : <Link to={target}>{children}</Link>}
    </li>
);
