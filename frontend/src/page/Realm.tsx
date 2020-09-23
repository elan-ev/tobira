import { jsx } from "@emotion/core";
import React from "react";
import { match } from "react-router-dom";


type Props = {
    match: match<{ path?: string }>,
};

export const Realm: React.FC<Props> = ({ match }) => {
    // const { path } = useParams();
    const path = (match.params.path || "").split("/");

    const lastSegment = path.length == 0 ? "Home" : path[path.length - 1];
    const name = DUMMY_NAMES[lastSegment] || lastSegment;
    return <React.Fragment>
        <h1>{ name }</h1>
        <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat. Duis aute irure dolor in
            reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
            pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
            culpa qui officia deserunt mollit anim id est laborum.
        </p>
    </React.Fragment>;
};

const DUMMY_NAMES: { [key: string]: string } = {
    "lectures": "Lectures",
    "math": "Department of Mathematics",
    "algebra": "Algebra I",
};
