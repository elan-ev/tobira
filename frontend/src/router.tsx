import React, { useEffect, useState } from "react";
import { parse } from "regexparam";

import { bug } from "./util/err";


/**
 * All routes of this application. The order of routes matters since the first
 * matching route is used.
 */
const ROUTES: Route<any>[] = [
    // TODO: remove dummy routes
    {
        path: "/",
        prepare: params => {
            console.log(params);
            return "prepare home";
        },
        render: prepared => {
            console.log(prepared);
            return <>
                <h1>Home</h1>
                <Link to="/r/foo">Click</Link>
            </>;
        },
    },
    {
        path: "/r/*",
        prepare: params => {
            console.log(params);
            return "prepare realm";
        },
        render: prepared => {
            console.log(prepared);
            return <h1>Realm</h1>;
        },
    },
];


/** The definition of one route. */
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
        context.setActiveRoute(matchRoute(href));

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
