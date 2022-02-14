import React, { useEffect, useRef, useState, useTransition } from "react";

import { bug } from "./util/err";


/** A single route. You probably want to use `makeRoute` to create this. */
export type Route = {
    /**
     * Checks if this route matches with the given URL. If it does, this
     * function may prepare the route and then has to return a `MatchedRoute`.
     * If the URL doesn't match this route, `null` should be returned.
     */
    match: (url: URL) => MatchedRoute | null;
};

/** A route used as fallback (if no other route matches) */
export type FallbackRoute = {
    /** Similar to `Route.match`, but without the option to return null. */
    prepare: (url: URL) => MatchedRoute;
};

/**
 * A route that has been successfully matched against an URL and has been
 * prepared. It can now be rendered.
 */
export type MatchedRoute = {
    /** Called during React rendering phase. */
    render: () => JSX.Element;

    /** Called once the route is no longer active. Can be used for cleanup. */
    dispose?: () => void;
};

/** Creates the internal representation of the given route. */
export const makeRoute = (match: (url: URL) => MatchedRoute | null): Route => ({ match });


type Listener = () => void;

/** Routing definition */
interface Config {
    /** The fallback route. Used when no routes in `routes` match. */
    fallback: FallbackRoute;

    /** All routes. They are matched in order, with the first matching one "winning". */
    routes: Route[];

    /**
     * A component that is rendered as child of `<Router>` to indicate the
     * transition from one route to another. The `isPending` props is `true` if
     * the app is currently transitioning from one route to another.
     */
    LoadingIndicator?: (props: { isPending: boolean }) => JSX.Element;

    /** If set to `true`, debug messages are logged via `console.debug`. Default: `false`. */
    debug?: boolean;
}

/** Props of the `<Link>` component. */
type LinkProps = {
    to: string;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">;

/** Props of the `<Router>` component. */
type RouterProps = {
    initialRoute: MatchedRoute;
    children: JSX.Element;
};

export type RouterLib = {
    /**
     * Matches the given full href against all routes, returning the first
     * matched route or throwing an error if no route matches.
     */
    matchRoute: (href: string) => MatchedRoute;

    /**
     * Like `matchRoute(window.location.href)`. Intended to be called before
     * `React.render` to obtain the initial route for the application.
     */
    matchInitialRoute: () => MatchedRoute;

    /** Hook to obtain a reference to the router. */
    useRouter: () => RouterControl;

    /**
     * An internal link, using the defined routes. Should be used instead of
     * `<a>`. Has to be mounted below a `<Router>`!
     *
     * This component reacts to clicks and prevents any default action (e.g. the
     * browser navigating to that link). Instead, our router is notified of the new
     * route and renders appropriately.
     */
    Link: (props: LinkProps) => JSX.Element;

    /**
     * Renders the currently matched route. Has to be used somewhere inside of a
     * `<Router>`.
     */
    ActiveRoute: () => JSX.Element;

    /** Provides the required context for `<Link>` and `<ActiveRoute>` components. */
    Router: (props: RouterProps) => JSX.Element;
};

/** Obtained via `useRouter`, allowing you to perform some routing-related actions. */
export interface RouterControl {
    /** Navigates to a new URI, just like creating a `<Link to={uri}>` and clicking it. */
    goto(uri: string): void;

    /**
     * Adds a listener function that is called whenever a route transition is
     * initiated. Neither the location nor the matched route has to change: the
     * listener is also called when a navigation to the current location is
     * initiated.
     *
     * Returns a function that removes the listener. Call the function at an
     * appropriate time to prevent memory leaks.
     */
    addListener(listener: Listener): () => void;
}

export const makeRouter = <C extends Config, >(config: C): RouterLib => {
    // Helper to log debug messages if `config.debug` is true.
    const debugLog = (...args: any[]) => {
        if (config.debug) {
            console.debug("[rauta] ", ...args);
        }
    };

    const useRouterImpl = (caller: string): RouterControl => {
        const context = React.useContext(Context);
        if (context === null) {
            return bug(`${caller} used without a parent <Router>! That's not allowed.`);
        }

        return {
            goto: (uri: string): void => {
                const href = new URL(uri, document.baseURI).href;
                const newRoute = matchRoute(href);

                // When navigating to new routes, the scroll position always
                // starts as 0 (i.e. the very top).
                context.setActiveRoute({ route: newRoute, initialScroll: 0 });
                history.pushState({ scrollY: 0 }, "", href);

                debugLog(`Setting active route for '${href}' to: `, newRoute);
            },

            addListener: (listener: () => void): () => void => {
                const obj = { listener };
                context.listeners.push(obj);
                return () => {
                    context.listeners = context.listeners.filter(l => l !== obj);
                };
            },
        };
    };

    const Link = ({ to, children, onClick, ...props }: LinkProps) => {
        const router = useRouterImpl("<Link>");

        const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            // We only want to react to simple mouse clicks.
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button !== 0) {
                return;
            }

            e.preventDefault();
            router.goto(to);

            // If the caller specified a handler, we will call it as well.
            if (onClick) {
                onClick(e);
            }
        };

        return <a href={to} onClick={handleClick} {...props}>{children}</a>;
    };

    const matchRoute = (href: string): MatchedRoute => {
        const url = new URL(href);
        for (const route of config.routes) {
            const matched: MatchedRoute | null = route.match(url);

            if (matched !== null) {
                return matched;
            }
        }

        return config.fallback.prepare(url);
    };

    const matchInitialRoute = (): MatchedRoute => matchRoute(window.location.href);

    type ActiveRoute = {
        route: MatchedRoute;

        /** A scroll position that should be restored when the route is first rendered */
        initialScroll: number | null;
    };

    type ContextData = {
        activeRoute: ActiveRoute;
        setActiveRoute: (newRoute: ActiveRoute) => void;
        listeners: { listener: Listener }[];
    };

    const Context = React.createContext<ContextData | null>(null);

    const useRouter = (): RouterControl => useRouterImpl("`useRouter`");

    /** Provides the required context for `<Link>` and `<ActiveRoute>` components. */
    const Router = ({ initialRoute, children }: RouterProps) => {
        const listeners = useRef<{ listener: Listener }[]>([]);
        const [activeRoute, setActiveRouteRaw] = useState<ActiveRoute>({
            route: initialRoute,
            initialScroll: null, // We do not want to restore any scroll position
        });
        const [isPending, startTransition] = useTransition();

        const setActiveRoute = (newRoute: ActiveRoute) => {
            startTransition(() => {
                setActiveRouteRaw(() => newRoute);
                for (const { listener } of listeners.current) {
                    listener();
                }
            });
        };

        // Register some event listeners and set global values.
        useEffect(() => {
            // Whenever the user navigates forwards or backwards in the browser,
            // we have to render the corresponding route. We also restore the
            // scroll position which we store within the history state.
            const onPopState = (e: PopStateEvent) => {
                const newRoute = matchRoute(window.location.href);
                setActiveRoute({ route: newRoute, initialScroll: e.state?.scrollY });
                debugLog(
                    "Reacting to 'popstate' event: setting active route for"
                        + `'${window.location.href}' to: `,
                    newRoute,
                );
            };

            // To actually get the correct scroll position into the history state, we
            // unfortunately need to listen for scroll events. They can fire at a high
            // rate, but `replaceState` is really fast to call. On jsbench.me the line
            // could be executed 1 million times per second. And scroll events are usually
            // not fired faster than `requestAnimationFrame`. So this should be fine!
            const onScroll = () => {
                history.replaceState({ scrollY: window.scrollY }, "");
            };

            // To prevent the browser restoring any scroll position.
            history.scrollRestoration = "manual";

            window.addEventListener("popstate", onPopState);
            window.addEventListener("scroll", onScroll);
            return () => {
                window.removeEventListener("popstate", onPopState);
                window.removeEventListener("scroll", onScroll);
            };
        }, []);

        // Dispose of routes when they are no longer needed.
        useEffect(() => () => {
            if (activeRoute.route.dispose) {
                debugLog("Disposing of route: ", activeRoute);
                activeRoute.route.dispose();
            }
        }, [activeRoute]);

        const contextData = {
            setActiveRoute,
            activeRoute,
            listeners: listeners.current,
        };

        return (
            <Context.Provider value={contextData}>
                {config.LoadingIndicator && <config.LoadingIndicator isPending={isPending} />}
                {children}
            </Context.Provider>
        );
    };

    const ActiveRoute = () => {
        const context = React.useContext(Context);
        if (context === null) {
            throw new Error("<ActiveRoute> used without a parent <Router>! That's not allowed.");
        }

        useEffect(() => {
            const scroll = context.activeRoute.initialScroll;
            if (scroll != null) {
                debugLog("Restoring scroll position to: ", scroll);
                window.scrollTo(0, scroll);
            }
        }, [context.activeRoute]);

        return context.activeRoute.route.render();
    };

    return {
        Link,
        matchRoute,
        matchInitialRoute,
        useRouter,
        ActiveRoute,
        Router,
    };
};

