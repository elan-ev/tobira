import { useRef } from "react";
import { Transition } from "react-transition-group";
import { match } from "@opencast/appkit";

import { isSearchActive } from "../routes/Search";
import { useRouterState } from "../router";
import { COLORS } from "../color";


/** A thin colored line at the top of the page indicating a page load */
export const LoadingIndicator: React.FC = () => {
    const { isTransitioning } = useRouterState();
    const ref = useRef<HTMLDivElement>(null);

    // If search is active, there is a loading indicator next to the search input.
    if (isSearchActive()) {
        return null;
    }

    const START_DURATION = 1200;
    const EXIT_DURATION = 150;

    // TODO: maybe disable this for `prefers-reduced-motion: reduce`
    return <Transition nodeRef={ref} in={isTransitioning} timeout={EXIT_DURATION}>{state => (
        <div ref={ref} css={{
            position: "fixed",
            zIndex: 2000,
            left: 0,
            top: 0,
            height: 4,
            backgroundColor: COLORS.primary0,
            ...match(state, {
                "entering": () => ({
                    width: "70%",
                    transition: `width ${START_DURATION}ms`,
                }),
                "entered": () => ({
                    width: "70%",
                    transition: `width ${START_DURATION}ms`,
                }),
                "exiting": () => ({
                    width: "100%",
                    opacity: 0,
                    transition: `width ${EXIT_DURATION}ms, `
                        + `opacity ${0.2 * EXIT_DURATION}ms ease ${0.8 * EXIT_DURATION}ms`,
                }),
                "exited": () => ({
                    width: "0%",
                    transition: "none",
                }),
                "unmounted": () => ({}),
            }),
        }} />
    )}</Transition>;
};
