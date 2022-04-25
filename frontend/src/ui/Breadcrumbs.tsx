import React, { ReactNode } from "react";
import { FiChevronRight, FiHome } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { Link } from "../router";
import { FOCUS_STYLE_INSET } from ".";


type Props = {
    path: {
        label: string;
        link: string;
    }[];
    tail: JSX.Element | string;
};

const LI_STYLE = {
    display: "inline-flex",
    alignItems: "center",
};

export const Breadcrumbs: React.FC<Props> = ({ path, tail }) => {
    const { t } = useTranslation();

    return (
        <nav aria-label="breadcrumbs" css={{ overflowX: "auto", marginBottom: 16 }}>
            <ol css={{
                display: "flex",
                alignItems: "center",
                padding: 0,
                margin: 0,
                fontSize: 14,
                flexWrap: "wrap",
                whiteSpace: "nowrap",
                "& svg": {
                    fontSize: 16,
                },
            }}>
                <li css={LI_STYLE}>
                    <Link to="/" css={{ lineHeight: 1, padding: 2, ...FOCUS_STYLE_INSET }}>
                        <FiHome title={t("home")} />
                    </Link>
                </li>
                {path.map((segment, i) => (
                    <Segment key={i} target={segment.link}>{segment.label}</Segment>
                ))}
                <Segment>{tail}</Segment>
            </ol>
        </nav>
    );
};

type SegmentProps = {
    /** The link target or `undefined` if this item segment is active */
    target?: string;
    children: ReactNode;
};

const TEXT_STYLE = {
    textOverflow: "ellipsis" as const,
    overflow: "hidden" as const,
    padding: 2,
};

const Segment: React.FC<SegmentProps> = ({ target, children }) => (
    <li
        css={{ maxWidth: "100%", ...LI_STYLE }}
        {...target === undefined && { "aria-current": "location" }}
    >
        <FiChevronRight css={{ margin: "0 3px", flexShrink: 0, color: "var(--grey65)" }}/>
        {target === undefined
            ? <div css={TEXT_STYLE}>{children}</div>
            : <Link css={[TEXT_STYLE, FOCUS_STYLE_INSET]} to={target}>{children}</Link>}
    </li>
);
