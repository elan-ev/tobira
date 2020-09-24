import React from "react";
import { Link } from "react-router-dom";

import { Breadcrumbs } from "../ui/Breadcrumbs";


type Props = {
    path: string[],
};

export const Realm: React.FC<Props> = ({ path }) => {
    const isRoot = path.length === 0;
    const ids = resolvePath(path);
    if (ids == null) {
        // TODO: that should obviously handled in a better way
        return <b>Realm path not found :(</b>;
    }

    const realmId = ids[ids.length - 1];
    const realm = REALMS[realmId];

    // Prepare data for breadcrumbs
    const breadcrumbs = [];
    let tmpPath = "/r";
    for (const id of ids.slice(1)) {
        tmpPath += "/" + REALMS[id].path;
        breadcrumbs.push({
            label: REALMS[id].name,
            href: tmpPath,
        });
    }

    return <>
        { !isRoot && <Breadcrumbs path={breadcrumbs} /> }
        <h1>{ realm.name }</h1>
        <ul>
            { REALMS[realmId].children.map(id => (
                <li key={id}>
                    <Link to={"/r/" + path.concat(REALMS[id].path).join("/") }>
                        { REALMS[id].name }
                    </Link>
                </li>
            ))}
        </ul>
        <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat. Duis aute irure dolor in
            reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
            pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
            culpa qui officia deserunt mollit anim id est laborum.
        </p>
    </>;
};

// Looks up each segment of the `/` separated `path` as realm and returns a list
// of realm ids starting with 0 (root).
const resolvePath = (path: string[]): number[] | null => {
    const ids = [0];
    for (const segment of path) {
        const lastId = ids[ids.length - 1];
        const next = REALMS[lastId].children.find(child => REALMS[child].path === segment);
        if (!next) {
            return null;
        }
        ids.push(next);
    }

    return ids;
};

type Realm = {
    path: string,
    name: string,
    parent: number,
    children: number[],
};

// Dummy data
const REALMS: Record<number, Realm> = {
    0: { path: "", name: "Home", parent: 0, children: [] },
    1: { path: "lectures", name: "Lectures", parent: 0, children: [] },
    2: { path: "conferences", name: "Conferences", parent: 0, children: [] },
    3: { path: "campus", name: "Campus", parent: 0, children: [] },

    4: { path: "math", name: "Department of Mathematics", parent: 1, children: [] },
    5: { path: "cs", name: "Department of Computer Science", parent: 1, children: [] },
    6: { path: "physics", name: "Department of Physics", parent: 1, children: [] },
    7: { path: "bio", name: "Department of Biology", parent: 1, children: [] },

    8: { path: "algebra", name: "Linear Algebra I", parent: 4, children: [] },
    9: { path: "analysis", name: "Analysis", parent: 4, children: [] },
    10: { path: "single-variable-calculus", name: "Single Variable Calculus", parent: 4, children: [] },
    11: { path: "probability", name: "Probability", parent: 4, children: [] },
};

// Add children
for (const [i, realm] of Object.entries(REALMS).slice(1)) {
    REALMS[realm.parent].children.push(Number(i));
}
