import { Transition } from "react-transition-group";
import { useRouter } from "../router";
import { match } from "../util";


/** A thin colored line at the top of the page indicating a page load */
export const LoadingIndicator: React.FC = () => {
    const router = useRouter();

    const START_DURATION = 1200;
    const EXIT_DURATION = 150;

    // TODO: maybe disable this for `prefers-reduced-motion: reduce`
    return <Transition in={router.isTransitioning} timeout={EXIT_DURATION}>{state => (
        <div css={{
            position: "fixed",
            left: 0,
            top: 0,
            height: 4,
            backgroundColor: "var(--accent-color)",
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
