import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineSearch } from "react-icons/hi";
import { useRouter } from "../../router";
import { isSearchActive } from "../../routes/Search";
import { Spinner } from "../../ui/Spinner";
import { currentRef } from "../../util";

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

    const extraCss = {
        width: "100%",
        ...variant === "desktop" && {
            maxWidth: 372,
            [`@media (max-width: ${NAV_BREAKPOINT}px)`]: {
                display: "none",
            },
        },
    };

    const height = 42;
    const spinnerSize = 24;
    const paddingSpinner = (height - spinnerSize) / 2;

    const lastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(lastTimeout.current));

    const defaultValue = isSearchActive()
        ? new URLSearchParams(document.location.search).get("q") ?? undefined
        : undefined;

    const onSearchRoute = document.location.pathname === "/~search";
    const search = (expression: string) => {
        const newUrl = `/~search?q=${encodeURIComponent(expression)}`;
        router.goto(newUrl, onSearchRoute);
    };

    return <div css={{ position: "relative", margin: "0 8px", ...extraCss }}>
        <HiOutlineSearch css={{
            position: "absolute",
            height: "100%",
            left: 11,
            fontSize: 23,
            color: "var(--grey40)",
        }} />
        <form onSubmit={() => {
            clearTimeout(lastTimeout.current);
            search(currentRef(ref).value);
        }}>
            <label>
                <span css={{ display: "none" }}>{t("search.input-label")}</span>
                <input
                    ref={ref}
                    type="text"
                    placeholder={t("search.input-label")}
                    defaultValue={defaultValue}
                    // The `onSearchRoute` part of this is a hacky fix to the search
                    // losing focus when transitioning from any route to the search
                    // route.
                    autoFocus={variant === "mobile" || onSearchRoute}
                    onChange={e => {
                        clearTimeout(lastTimeout.current);
                        lastTimeout.current = setTimeout(() => {
                            search(e.target.value);
                        }, 30);
                    }}
                    css={{
                        color: "var(--grey40)",
                        border: "1px solid var(--grey65)",
                        borderRadius: 4,
                        minWidth: 50,
                        height,
                        paddingLeft: 42,
                        paddingRight: 12,
                        ":hover": { outline: "2px solid var(--grey80)" },
                        ":focus": { outline: "2px solid var(--accent-color)" },
                        "&::placeholder": {
                            color: "var(--grey40)",
                            opacity: 1,
                        },
                        ...extraCss,
                    }}
                />
            </label>
        </form>
        {router.isTransitioning && isSearchActive() && <Spinner
            size={spinnerSize}
            css={{ position: "absolute", right: paddingSpinner, top: paddingSpinner }}
        />}
    </div>;
};
