import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "../../router";
import { isSearchActive } from "../../routes/Search";
import { Spinner } from "../../ui/Spinner";

import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";

type SearchFieldProps = {
    variant: "desktop" | "mobile";
};

export const SearchField: React.FC<SearchFieldProps> = ({ variant }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const ref = useRef<HTMLInputElement>(null);

    // Register global shortcut to focus search bar
    useEffect(() => {
        const handleShortcut = (ev: KeyboardEvent) => {
            if (ev.ctrlKey || ev.altKey || ev.metaKey) {
                return;
            }
            if (document.activeElement?.tagName === "INPUT") {
                return;
            }
            if (ev.key === "s" || ev.key === "S") {
                ref.current?.focus();
            }
        };

        document.addEventListener("keyup", handleShortcut);
        return () => document.removeEventListener("keyup", handleShortcut);
    }, []);

    const extraCss = variant === "desktop"
        ? {
            maxWidth: 280,
            [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                display: "none",
            },
        }
        : {
            width: "100%",
        };

    const height = 35;
    const spinnerSize = 22;
    const paddingSpinner = (height - spinnerSize) / 2;

    return <div css={{ position: "relative", margin: "0 8px" }}>
        <input
            ref={ref}
            type="text"
            placeholder={t("search.input-label")}
            onChange={e => {
                router.goto(`/~search?q=${encodeURIComponent(e.target.value)}`);
            }}
            css={{
                flex: "1 1 0px",
                minWidth: 50,
                height,
                borderRadius: 4,
                border: "1.5px solid var(--grey80)",
                padding: "0 12px",
                "&:focus": {
                    outline: "none",
                    boxShadow: "0 0 0 1px var(--accent-color)",
                    borderColor: "var(--accent-color)",
                },
                ...extraCss,
            }}
        />
        {router.isTransitioning && isSearchActive() && <Spinner
            size={spinnerSize}
            css={{ position: "absolute", right: paddingSpinner, top: paddingSpinner }}
        />}
    </div>;
};
