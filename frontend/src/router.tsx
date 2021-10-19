import React, { useEffect, useRef, useState, useTransition } from "react";
import { Transition } from "react-transition-group";

import { match } from "./util";
import { bug } from "./util/err";


/**
 * The definition of one route.
 *
 * If what the `prepare` function returns (the type parameter `Prepared`) has a
 * method called `dispose`, it will be called automatically once the route
 * unmounts. This is mostly just useful for `PreparedQuery` of relay. Just be
 * aware of that in case you return anything that has a `dispose` method which
 * is not supposed to be called.
 */
export type Route<Prepared> = {
    /**
     * A regex describing the route's path. If the regex matches the path, the
     * route is taken. Regex may contain capture groups. All captures are
     * passed to `prepare`.
     */
    path: string;

    /**
     * A function that is called as soon as the route becomes active. In
     * particular, called outside of a React rendering context.
     *
     * It is passed the route parameters which are simply the captures from the
     * path regex. This is the array returned by `RegExp.exec` but with the
     * first element (the whole match) removed.
     */
    prepare: (routeParams: string[], getParams: URLSearchParams) => Prepared;

    /**
     * The function for rendering this route. The value that `prepare` returned
     * is passed as argument.
     */
    render: (prepared: Prepared) => JSX.Element;
};

/**
 * A route which has been matched and whose `prepare` function was already
 * called.
 */
export type MatchedRoute<Prepared> = {
    prepared: Prepared;
    render: (prepared: Prepared) => JSX.Element;
};

/**
 * Matches the given full href against our route array, returning the first
 * matched route or throwing an error if no route matches.
 */
const matchRoute = (routes: Routes, href: string): MatchedRoute<any> => {
    const url = new URL(href);
    const currentPath = decodeURI(url.pathname);

    const match = routes
        .map((route, index) => {
            // Use the route's regex to check whether the current path matches.
            // We modify the regex to make sure the whole path matches and that
            // a trailing slash is always optional.
            const regex = new RegExp(`^${route.path}/?$`, "u");
            const params = regex.exec(currentPath);
            if (params === null) {
                return null;
            }

            return { params: params.slice(1), index };
        })
        .find(x => x != null);

    if (match == null) {
        // It is our responsibility to make sure there is always one matching
        // route. We do that by having the `NotFound` route match everything.
        return bug("no route matched in router: there should be a match-all route at the end");
    }

    const { params, index } = match;
    const route = routes[index];

    return {
        prepared: route.prepare(params, url.searchParams),
        render: route.render,
    };
};


/**
 * The routing context is just used internally by this module to allow setting
 * a new route from `<Link>` components anywhere in the tree.
 */
export const RoutingContext = React.createContext<RouterControl | null>(null);
type ContextData = {
    activeRoute: MatchedRoute<any>;
    setActiveRoute: (newRoute: MatchedRoute<any>) => void;
    onRouteChangeListeners: OnRouteChangeListener[];
    routes: Routes;
};

type OnRouteChangeListener = () => void;

/**
 * An array of routes.
 *
 * TODO: this is not as type safe as we would like. Each individual route is not
 * forced to have the same `Prepared` type in `prepare` and `render`. Enforcing
 * this is rather tricky, though.
 */
export type Routes = readonly Route<any>[];

type RouterProps = {
    initialRoute: MatchedRoute<any>;
    routes: Routes;
};

/** Provides the required context for `<Link>` and `<ActiveRoute>` components. */
export const Router: React.FC<RouterProps> = ({ initialRoute, routes, children }) => {
    const onRouteChangeListeners = useRef<OnRouteChangeListener[]>([]);
    const [activeRoute, setActiveRouteRaw] = useState(initialRoute);
    const [isPending, startTransition] = useTransition();

    const setActiveRoute = (newRoute: MatchedRoute<any>) => {
        startTransition(() => {
            setActiveRouteRaw(newRoute);
            for (const listener of onRouteChangeListeners.current) {
                listener();
            }
        });
    };

    // We need to listen to `popstate` events.
    useEffect(() => {
        const onPopState = () => {
            setActiveRoute(matchRoute(routes, window.location.href));
        };

        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    // We sometimes need to dispose of a prepared value when switching to
    // another route. We do that here. If this method does not exist, we just
    // do nothing.
    useEffect(() => () => {
        /* eslint-disable */
        const prepared = activeRoute.prepared;
        if (typeof prepared?.dispose === "function") {
            prepared?.dispose();
        }
        /* eslint-enable */
    });

    const contextData = {
        setActiveRoute,
        activeRoute,
        onRouteChangeListeners: onRouteChangeListeners.current,
        routes,
    };

    return (
        <RoutingContext.Provider value={new RouterControl(contextData)}>
            <LoadingIndicator isPending={isPending} />
            {children}
        </RoutingContext.Provider>
    );
};

/**
 * Renders the currently matched route. Has to be used somewhere inside of a
 * `<Router>`.
 */
export const ActiveRoute: React.FC = () => {
    const context = React.useContext(RoutingContext);
    if (context === null) {
        throw new Error("<ActiveRoute> used without a parent <Router>! That's not allowed.");
    }

    return context.data.activeRoute.render(context.data.activeRoute.prepared);
};


type LinkProps = {
    to: string;

    /**
     * If `true`, a standard `<a>` link without special onClick handler is used.
     * If you set this to `true` unconditionally, rather use `<a>` directly.
     * This is just convenient if you need to switch between router-link and
     * html-link based on a boolean. Default: `false`.
     */
    htmlLink?: boolean;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">;

/**
 * An internal link, using our own routing. Should be used instead of `<a>`. Has
 * to be mounted below a `<Router>`!
 *
 * This component reacts to clicks and prevents any default action (e.g. the
 * browser navigating to that link). Instead, our router is notified of the new
 * route and renders appropriately.
 */
export const Link: React.FC<LinkProps> = ({
    to,
    children,
    onClick,
    htmlLink = false,
    ...props
}) => {
    const context = React.useContext(RoutingContext);
    if (context === null) {
        throw new Error("<Link> used without a parent <Router>! That's not allowed.");
    }

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        // We only want to react to simple mouse clicks.
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button !== 0) {
            return;
        }

        e.preventDefault();
        const href = (e.currentTarget as HTMLAnchorElement).href;
        context.data.setActiveRoute(matchRoute(context.data.routes, href));

        history.pushState(null, "", href);

        // If the caller specified a handler, we will call it as well.
        if (onClick) {
            onClick(e);
        }
    };

    return <a href={to} onClick={htmlLink ? onClick : handleClick} {...props}>{children}</a>;
};


export class RouterControl {
    /** Should not be used outside of this module */
    public data: ContextData;

    /** Should not be used outside of this module */
    public constructor(data: ContextData) {
        this.data = data;
    }

    public goto(uri: string): void {
        const href = new URL(uri, document.baseURI).href;
        this.data.setActiveRoute(matchRoute(this.data.routes, href));
        history.pushState(null, "", href);
    }

    public listen(listener: () => void): void {
        this.data.onRouteChangeListeners.push(listener);
    }
}

export const useRouter = (): RouterControl => {
    const control = React.useContext(RoutingContext);
    if (control === null) {
        throw new Error("`useRouter` used without a parent <Router>! That's not allowed.");
    }

    return control;
};

/**
 * Intended to be called before `React.render` to obtain the initial route for
 * the application.
 */
export const matchInitialRoute = (routes: Routes): MatchedRoute<any> =>
    matchRoute(routes, window.location.href);

/** A thin colored line at the top of the page indicating a page load */
const LoadingIndicator: React.FC<{ isPending: boolean }> = ({ isPending }) => {
    const START_DURATION = 1200;
    const EXIT_DURATION = 150;

    // TODO: maybe disable this for `prefers-reduced-motion: reduce`
    return <Transition in={isPending} timeout={EXIT_DURATION}>{state => (
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
