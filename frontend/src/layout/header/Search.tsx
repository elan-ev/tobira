import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineSearch } from "react-icons/hi";
import { ProtoButton, screenWidthAtMost } from "@opencast/appkit";
import { LuX } from "react-icons/lu";

import { useRouter } from "../../router";
import {
    SearchRoute,
    isSearchActive,
    isValidSearchItemType,
    SEARCH_TIMINGS,
} from "../../routes/Search";
import { focusStyle } from "../../ui";
import { currentRef } from "../../util";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { COLORS } from "../../color";
import { useUser } from "../../User";


type SearchFieldProps = {
    variant: "desktop" | "mobile";
};

export const SearchField: React.FC<SearchFieldProps> = ({ variant }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const ref = useRef<HTMLInputElement>(null);

    // If the user is unknown, then we are still in the initial loading phase.
    // We don't want users to input anything into the search field in that
    // state, as their input would be ignored and discarded as soon as the
    // initial-loading phase is done.
    const disabled = useUser() === "unknown";

    // Register global shortcut to focus search bar
    useEffect(() => {
        const handleShortcut = (ev: KeyboardEvent) => {
            // Clear input field. See comment inside `handleNavigation` function
            // in `routes/Search.tsx` for explanation. I'd rather do this here than
            // needing to pass the input ref.
            if (ev.key === "Escape" && ref.current) {
                ref.current.value = "";
            }
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

    const height = 42;
    const spinnerSize = 24;
    const paddingSpinner = (height - spinnerSize) / 2;
    const iconStyle = { position: "absolute", right: paddingSpinner, top: paddingSpinner } as const;


    const onSearchRoute = isSearchActive();
    const getSearchParam = (searchParameter: string) => {
        const searchParams = new URLSearchParams(document.location.search);
        return onSearchRoute
            ? searchParams.get(searchParameter) ?? undefined
            : undefined;
    };
    const defaultValue = getSearchParam("q");


    const search = (q: string) => {
        if (!(q in SEARCH_TIMINGS)) {
            SEARCH_TIMINGS[q] = {};
        }
        SEARCH_TIMINGS[q].startSearch = window.performance.now();
        const filters = {
            itemType: isValidSearchItemType(getSearchParam("f")),
            start: getSearchParam("start"),
            end: getSearchParam("end"),
        };
        router.goto(SearchRoute.url({ query: q, ...filters }));
    };

    return (
        <div css={{
            position: "relative",
            margin: "0 8px",
            flex: 1,
            ...variant === "desktop" && {
                maxWidth: 372,
                [screenWidthAtMost(NAV_BREAKPOINT)]: {
                    display: "none",
                },
            },
        }}>
            <HiOutlineSearch css={{
                position: "absolute",
                height: "100%",
                left: 11,
                fontSize: 23,
                color: COLORS.neutral60,
            }} />
            <form onSubmit={event => {
                event.preventDefault();
                search(currentRef(ref).value);

                // Hide mobile keyboard on enter. The mobile keyboard hides lots
                // of results and intuitively, pressing "enter" on it should
                // close the keyboard. We don't want to remove focus for
                // desktop users though, since that doesn't do any good. The
                // check is not perfect but should actually detect virtual
                // keyboard very reliably.
                const visualHeight = window.visualViewport?.height;
                if (visualHeight && visualHeight < window.innerHeight) {
                    ref.current?.blur();
                }
            }}>
                <label css={{ display: "flex" }}>
                    <span css={{ display: "none" }}>{t("search.input-label")}</span>
                    <input
                        ref={ref}
                        type="text"
                        disabled={disabled}
                        placeholder={t("search.input-label")}
                        defaultValue={defaultValue}
                        // We only want to autofocus if the user just pressed
                        // the search button in the header (mobile only). This
                        // only happens on non-search routes.
                        autoFocus={variant === "mobile" && !onSearchRoute}
                        css={{
                            flex: 1,
                            color: COLORS.neutral60,
                            backgroundColor: COLORS.neutral05,
                            border: `1px solid ${COLORS.neutral40}`,
                            borderRadius: 4,
                            minWidth: 50,
                            height,
                            paddingLeft: 42,
                            paddingRight: 12,
                            ":hover": {
                                borderColor: COLORS.neutral25,
                                outline: `2.5px solid ${COLORS.neutral25}`,
                                outlineOffset: -1,
                            },
                            ":focus-visible": { borderColor: COLORS.focus },
                            ...focusStyle({ offset: -1 }),
                            "&::placeholder": {
                                color: COLORS.neutral60,
                                opacity: 1,
                            },
                        }}
                    />
                </label>
            </form>
            <ProtoButton
                // Just clear the search input
                onClick={() => {
                    const input = currentRef(ref);
                    input.value = "";
                    input.focus();
                }}
                css={{
                    ":hover, :focus": {
                        color: COLORS.neutral90,
                        borderColor: COLORS.neutral25,
                        outline: `2.5px solid ${COLORS.neutral25}`,
                    },
                    ...focusStyle({}),
                    borderRadius: 4,
                    color: COLORS.neutral60,
                    ...iconStyle,
                }}
            ><LuX size={spinnerSize} css={{ display: "block" }} /></ProtoButton>
        </div>
    );
};
