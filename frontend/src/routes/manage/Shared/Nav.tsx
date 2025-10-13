import { ParseKeys } from "i18next";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    LuCornerLeftUp,
} from "react-icons/lu";
import { CSSObject } from "@emotion/react";

import { ellipsisOverflowCss, LinkList, LinkWithIcon } from "../../../ui";
import { Link } from "../../../router";
import { ManageVideoSubPageType } from "../Video/Shared";



export type SharedManageNavProps = {
    active: ManageVideoSubPageType;
};

/** Simple nav element linking back to the item table overview page. */
type ReturnLinkProps = {
    url: "/~manage/series" | "/~manage/videos";
    title: ParseKeys;
};

export const ReturnLink: React.FC<ReturnLinkProps> = ({ url, title }) => {
    const { t } = useTranslation();
    const items = [
        <LinkWithIcon key={url} to={url} iconPos="left">
            <LuCornerLeftUp />
            {t(title)}
        </LinkWithIcon>,
    ];

    return <LinkList items={items} />;
};

type NavEntry = {
    url: string;
    page: string;
    body: ReactNode;
}

type ManageNavProps = SharedManageNavProps & {
    link: string;
    ariaLabel: string;
    title: string;
    thumbnail: ReactNode;
    navEntries: NavEntry[];
    additionalStyles?: CSSObject;
}

export const ManageNav: React.FC<ManageNavProps> = ({
    active,
    link,
    ariaLabel,
    title,
    thumbnail,
    navEntries,
    additionalStyles,
}) => {
    const items = navEntries.map(({ url, page, body }, i) => (
        <LinkWithIcon key={i} to={url} iconPos="left" active={page === active}>
            {body}
        </LinkWithIcon>
    ));

    const header = (
        <div css={{ display: "flex", flexDirection: "column" }}>
            <Link
                aria-label={ariaLabel}
                to={link}
                css={{
                    display: "block",
                    position: "relative",
                    width: "100%",
                    maxWidth: "calc(40vh * 16 / 9)",
                    alignSelf: "center",
                    "& > svg": {
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        zIndex: 5,
                        fontSize: 64,
                        color: "white",
                        transform: "translate(-50%, -50%)",
                    },
                    "&:not(:hover, :focus) > svg": {
                        display: "none",
                    },
                    "&:hover > div, &:focus > div": {
                        filter: "brightness(70%)",
                    },
                    ...additionalStyles,
                }}
            >
                {thumbnail}
            </Link>
            <div css={{
                textAlign: "center",
                fontWeight: "bold",
                marginTop: 4,
                marginBottom: 8,
                ...ellipsisOverflowCss(2),
            }}>{title}</div>
        </div>
    );

    return <LinkList items={[header, ...items]} />;
};
