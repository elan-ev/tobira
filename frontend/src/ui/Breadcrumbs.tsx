import React, { ReactNode } from "react";
import { FiChevronRight, FiHome } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { Link } from "../router";
import { FOCUS_STYLE_INSET } from ".";


export type Props = {
    path: {
        label: string;
        link: string;
        render?: (label: string) => NonNullable<ReactNode>;
    }[];
    tail: NonNullable<JSX.Element> | string;
};

export const Breadcrumbs: React.FC<Props> = ({ path, tail }) => {
    const { t } = useTranslation();
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: path.map(({ label, link }, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: label,
            item: new URL(link, document.baseURI).href,
        })),
    };

    return (
        <nav aria-label="breadcrumbs" css={{ overflowX: "auto", marginBottom: 16 }}>
            {path.length > 0 && (
                <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
            )}
            <BreadcrumbsContainer>
                <li>
                    <Link to="/" css={{ lineHeight: 1, padding: 2, ...FOCUS_STYLE_INSET }}>
                        <FiHome aria-label={t("home")} />
                    </Link>
                </li>
                {path.map((segment, i) => (
                    <Segment key={i} target={segment.link}>
                        {(segment.render ?? (l => l))(segment.label)}
                    </Segment>
                ))}
                <Segment>{tail}</Segment>
            </BreadcrumbsContainer>
        </nav>
    );
};

export const BreadcrumbsContainer: React.FC<React.PropsWithChildren> = ({ children }) => (
    <ol css={{
        display: "flex",
        alignItems: "center",
        padding: 0,
        margin: 0,
        fontSize: 14,
        flexWrap: "wrap",
        whiteSpace: "nowrap",
        svg: { fontSize: 16 },
        li: {
            display: "inline-flex",
            alignItems: "center",
        },
    }}>{children}</ol>
);

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
        css={{ maxWidth: "100%" }}
        {...target === undefined && { "aria-current": "location" }}
    >
        <BreadcrumbSeparator />
        {target === undefined
            ? <div css={TEXT_STYLE}>{children}</div>
            : <Link css={[TEXT_STYLE, FOCUS_STYLE_INSET]} to={target}>{children}</Link>}
    </li>
);

export const BreadcrumbSeparator: React.FC = () => (
    <FiChevronRight css={{ margin: "0 3px", flexShrink: 0, color: "var(--grey65)" }} />
);
