import { Fragment, ReactNode } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { ParseKeys } from "i18next";

import { COLORS } from "../color";
import { focusStyle } from ".";
import FirstPage from "../icons/first-page.svg";
import LastPage from "../icons/last-page.svg";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";


type PaginationControl = {
    key: "first" | "previous" | "next" | "last";
    label: ParseKeys;
    icon: ReactNode;
    disabled: boolean;
    targetPage: number;
};

type PaginationNavProps = {
    totalItems: number;
    itemsPerPage: number;
    currentPage: number;
    renderControl: (control: PaginationControl) => ReactNode;
};

export const PaginationNav: React.FC<PaginationNavProps> = ({
    totalItems,
    itemsPerPage,
    currentPage,
    renderControl,
}) => {
    const { t } = useTranslation();
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const start = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;

    const controls: PaginationControl[] = [
        {
            key: "first",
            label: "manage.table.navigation.first",
            icon: <FirstPage />,
            disabled: !hasPrevPage,
            targetPage: hasPrevPage ? 1 : currentPage,
        },
        {
            key: "previous",
            label: "manage.table.navigation.previous",
            icon: <LuChevronLeft />,
            disabled: !hasPrevPage,
            targetPage: hasPrevPage ? currentPage - 1 : currentPage,
        },
        {
            key: "next",
            label: "manage.table.navigation.next",
            icon: <LuChevronRight />,
            disabled: !hasNextPage,
            targetPage: hasNextPage ? currentPage + 1 : currentPage,
        },
        {
            key: "last",
            label: "manage.table.navigation.last",
            icon: <LastPage />,
            disabled: !hasNextPage,
            targetPage: hasNextPage ? totalPages : currentPage,
        },
    ];

    return (
        <nav aria-label={t("general.page")} css={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 48,
            flexWrap: "wrap",
        }}>
            <span css={{
                color: COLORS.neutral70,
                display: "inline-flex",
                alignItems: "center",
            }}>
                {t("manage.table.page-showing-ids", {
                    start,
                    end,
                    total: totalItems,
                })}
            </span>

            <div css={{ display: "flex", alignItems: "center" }}>
                {controls.map(control => (
                    <Fragment key={control.key}>{renderControl(control)}</Fragment>
                ))}
            </div>
        </nav>
    );
};


export const paginationControlStyles = css({
    background: "none",
    border: "none",
    fontSize: 24,
    padding: 4,
    margin: "0 4px",
    lineHeight: 0,
    borderRadius: 4,
    "&[aria-disabled='true']": {
        color: COLORS.neutral25,
        pointerEvents: "none",
    },
    "&:not([aria-disabled='true'])": {
        color: COLORS.neutral60,
        cursor: "pointer",
        ":hover, :focus": {
            color: COLORS.neutral90,
        },
        ...focusStyle({ inset: true }),
    },
});
