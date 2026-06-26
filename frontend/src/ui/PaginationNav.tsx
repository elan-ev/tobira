import { Fragment, ReactNode } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { ParseKeys } from "i18next";

import { COLORS } from "../color";
import { focusStyle } from ".";
import FirstPage from "../icons/first-page.svg";
import LastPage from "../icons/last-page.svg";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";


type PaginationControlTarget = { to: string } | { onClick: () => void };

type PaginationControl = {
    key: "first" | "previous" | "next" | "last";
    label: ParseKeys;
    icon: ReactNode;
    disabled: boolean;
    target?: PaginationControlTarget;
};

type PaginationNavProps = {
    itemsSummary: ReactNode;
    controls: PaginationControl[];
    renderControl: (control: PaginationControl) => ReactNode;
};

export const PaginationNav: React.FC<PaginationNavProps> = ({
    itemsSummary,
    controls,
    renderControl,
}) => {
    const { t } = useTranslation();

    return <nav aria-label={t("general.page")} css={{
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
            {itemsSummary}
        </span>

        <div css={{ display: "flex", alignItems: "center" }}>
            {controls.map(control => (
                <Fragment key={control.key}>
                    {renderControl(control)}
                </Fragment>
            ))}
        </div>
    </nav>;
};


type CreatePaginationControlsOptions = {
    currentPage: number;
    totalPages: number;
    navigateToPage: (page: number) => PaginationControlTarget;
};

/**
 * Returns the props for arrow nav elements as an array.
 * These are used in conjunction with the `renderControl`
 * function prop of `PaginationNav` and passed to a
 * custom nav control "wrapper" like a button or link.
 */
export const createPaginationControls = ({
    currentPage,
    totalPages,
    navigateToPage,
}: CreatePaginationControlsOptions): PaginationControl[] => {
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;

    return [
        {
            key: "first",
            label: "manage.table.navigation.first",
            icon: <FirstPage />,
            disabled: !hasPrevPage,
            target: hasPrevPage ? navigateToPage(1) : undefined,
        },
        {
            key: "previous",
            label: "manage.table.navigation.previous",
            icon: <LuChevronLeft />,
            disabled: !hasPrevPage,
            target: hasPrevPage ? navigateToPage(currentPage - 1) : undefined,
        },
        {
            key: "next",
            label: "manage.table.navigation.next",
            icon: <LuChevronRight />,
            disabled: !hasNextPage,
            target: hasNextPage ? navigateToPage(currentPage + 1) : undefined,
        },
        {
            key: "last",
            label: "manage.table.navigation.last",
            icon: <LastPage />,
            disabled: !hasNextPage,
            target: hasNextPage ? navigateToPage(totalPages) : undefined,
        },
    ];
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
