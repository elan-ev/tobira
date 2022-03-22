import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineSearch } from "react-icons/hi";
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
            // If any element is focussed that could receive character input, we
            // don't do anything.
            if (/^input|textarea|select|button$/i.test(document.activeElement?.tagName ?? "")) {
                return;
            }

            // With ctrl and meta key, this could be bound to some other
            // shortcut (ctrl+s) that we want to ignore.
            if (ev.ctrlKey || ev.metaKey) {
                return;
            }

            if (ev.key === "s" || ev.key === "S" || ev.key === "/") {
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

    const height = 40;
    const spinnerSize = 22;
    const paddingSpinner = (height - spinnerSize) / 2;

    const lastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const defaultValue = isSearchActive()
        ? new URL(document.location.href).searchParams.get("q") ?? undefined
        : undefined;

    return <div css={{ position: "relative", margin: "0 8px", ...extraCss }}>
        <HiOutlineSearch css={{
            position: "absolute",
            height: "100%",
            left: 12,
            fontSize: 20,
            color: "var(--grey40)",
        }} />
        <input
            ref={ref}
            type="text"
            placeholder={t("search.input-label")}
            title={t("search.input-label")}
            defaultValue={defaultValue}
            autoFocus={variant === "mobile"}
            onChange={e => {
                if (lastTimeout.current !== null) {
                    clearTimeout(lastTimeout.current);
                }
                lastTimeout.current = setTimeout(() => {
                    router.goto(`/~search?q=${encodeURIComponent(e.target.value)}`);
                }, 30);
            }}
            css={{
                flex: "1 1 0px",
                minWidth: 50,
                height,
                borderRadius: 12,
                paddingLeft: 40,
                paddingRight: 12,
                backgroundColor: "var(--grey92)",
                border: "2px solid white",
                "&:hover": {
                    backgroundColor: "var(--grey86)",
                },
                "&:focus": {
                    outline: "none",
                    borderColor: "var(--accent-color)",
                },
                "&::placeholder": {
                    color: "var(--grey40)",
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
