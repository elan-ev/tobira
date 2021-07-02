import React, { useEffect, useState, startTransition } from "react";
import { parse } from "regexparam";

import { AboutRoute } from "./page/About";
import { HomeRoute } from "./page/Home";
import { NotFoundRoute } from "./page/NotFound";
import { RealmRoute } from "./page/Realm";
import { VideoRoute } from "./page/Video";
import { bug } from "./util/err";


/**
 * All routes of this application. The order of routes matters since the first
 * matching route is used.
 */
const ROUTES = [
    AboutRoute,
    HomeRoute,
    RealmRoute,
    VideoRoute,

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
     * The path of the route, allowing parameters and wildcards.
     * See <https://github.com/lukeed/regexparam>.
     */
    path: string;

    /**
     * A function that is called as soon as the route becomes active. In
     * particular, called outside of a React rendering context.
     */
    prepare: (routeParams: Record<string, string>) => Prepared;

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
    const currentPath = new URL(href).pathname;

    const match = ROUTES
        .map((route, index) => {
            // Convert the path description to a regex and see if it matches. If
            // not, early return null.
            const path = parse(route.path);
            const matches = path.pattern.exec(currentPath);
            if (matches === null) {
                return null;
            }

            // If the regex matches, we extract the path parameters.
            const params: Record<string, string> = {};
            for (let i = 0; i < path.keys.length; i += 1) {
                params[path.keys[i]] = matches[i + 1];
            }
            return { params, index };
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
        prepared: route.prepare(params),
        render: route.render,
    };
};


/**
 * The routing context is just used internally by this module to allow setting
 * a new route from `<Link>` components anywhere in the tree.
 */
const RoutingContext = React.createContext<Context | null>(null);
type Context = {
    setActiveRoute: (newRoute: MatchedRoute<any>) => void;
};


type RouterProps = {
    initialRoute: MatchedRoute<any>;
};

/**
 * Always renders the currently active route. The given intial route is rendered
 * first, but clicks on `<Link>`  elements or going back in the browser can
 * change the route.
 */
export const Router: React.FC<RouterProps> = ({ initialRoute }) => {
    const [activeRoute, setActiveRoute] = useState(initialRoute);

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
        <RoutingContext.Provider value={{ setActiveRoute }}>
            {activeRoute.render(activeRoute.prepared)}
        </RoutingContext.Provider>
    );
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
        startTransition(() => {
            context.setActiveRoute(matchRoute(href));
        });

        history.pushState(null, "", href);

        // If the caller specified a handler, we will call it as well.
        if (onClick) {
            onClick(e);
        }
    };

    return <a href={to} onClick={handleClick} {...props}>{children}</a>;
};

/**
 * Intended to be called before `React.render` to obtain the initial route for
 * the application.
 */
export const matchInitialRoute: () => MatchedRoute<any> = () => matchRoute(window.location.href);
