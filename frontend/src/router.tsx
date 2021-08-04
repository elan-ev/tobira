import React, { useEffect, useState, useTransition } from "react";
import { Transition } from "react-transition-group";

import { AboutRoute } from "./routes/About";
import { NotFoundRoute } from "./routes/NotFound";
import { RealmRoute } from "./routes/Realm";
import { VideoRoute } from "./routes/Video";
import { ManageRoute } from "./routes/manage";
import { ManageRealmRoute } from "./routes/manage/Realm";
import { AddChildRoute } from "./routes/manage/Realm/AddChild";
import { match } from "./util";
import { bug } from "./util/err";


/**
 * All routes of this application. The order of routes matters since the first
 * matching route is used.
 */
const ROUTES = [
    AboutRoute,
    RealmRoute,
    VideoRoute,

    ManageRoute,
    ManageRealmRoute,
    AddChildRoute,

    NotFoundRoute,
] as const;

// Typecheck `ROUTES` to make sure that the `prepare` return type and
// `render` parameter type match for each individual route. If you get a
// strange error here, check your types in the route defintion.
type ArrT = typeof ROUTES;
type VerifyRoutes<T> = T extends Route<infer U> ? Route<U> : never;
type Indices = Exclude<keyof ArrT, keyof any[]>;
type StrictRoutesTy = { [I in Indices]: VerifyRoutes<ArrT[I]> };
const _VERIFIED: StrictRoutesTy = ROUTES;


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
const matchRoute = (href: string): MatchedRoute<any> => {
    const url = new URL(href);
    const currentPath = url.pathname;

    const match = ROUTES
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
    const route = ROUTES[index];

    return {
        prepared: route.prepare(params, url.searchParams),
        render: route.render,
    };
};


/**
 * The routing context is just used internally by this module to allow setting
 * a new route from `<Link>` components anywhere in the tree.
 */
const RoutingContext = React.createContext<Context | null>(null);
type Context = {
    activeRoute: MatchedRoute<any>;
    setActiveRoute: (newRoute: MatchedRoute<any>) => void;
};


type RouterProps = {
    initialRoute: MatchedRoute<any>;
};

/** Provides the required context for `<Link>` and `<ActiveRoute>` components. */
export const Router: React.FC<RouterProps> = ({ initialRoute, children }) => {
    const [activeRoute, setActiveRouteRaw] = useState(initialRoute);
    const [isPending, startTransition] = useTransition();

    const setActiveRoute = (newRoute: MatchedRoute<any>) => {
        startTransition(() => setActiveRouteRaw(newRoute));
    };

    // We need to listen to `popstate` events.
    useEffect(() => {
        const onPopState = () => {
            setActiveRoute(matchRoute(window.location.href));
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

    return (
        <RoutingContext.Provider value={{ setActiveRoute, activeRoute }}>
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

    return context.activeRoute.render(context.activeRoute.prepared);
};


type LinkProps = {
    to: string;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">;

/**
 * An internal link, using our own routing. Should be used instead of `<a>`. Has
 * to be mounted below a `<Router>`!
 *
 * This component reacts to clicks and prevents any default action (e.g. the
 * browser navigating to that link). Instead, our router is notified of the new
 * route and renders appropriately.
 */
export const Link: React.FC<LinkProps> = ({ to, children, onClick, ...props }) => {
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
        context.setActiveRoute(matchRoute(href));

        history.pushState(null, "", href);

        // If the caller specified a handler, we will call it as well.
        if (onClick) {
            onClick(e);
        }
    };

    return <a href={to} onClick={handleClick} {...props}>{children}</a>;
};


export class RouterControl {
    private context: Context;

    public constructor(context: Context) {
        this.context = context;
    }

    public goto(uri: string): void {
        const href = new URL(uri, document.baseURI).href;
        this.context.setActiveRoute(matchRoute(href));
        history.pushState(null, "", href);
    }
}

export const useRouter = (): RouterControl => {
    const context = React.useContext(RoutingContext);
    if (context === null) {
        throw new Error("`useRouter` used without a parent <Router>! That's not allowed.");
    }

    return new RouterControl(context);
};

/**
 * Intended to be called before `React.render` to obtain the initial route for
 * the application.
 */
export const matchInitialRoute: () => MatchedRoute<any> = () => matchRoute(window.location.href);

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
