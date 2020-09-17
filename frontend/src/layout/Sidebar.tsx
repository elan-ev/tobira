import { jsx } from "@emotion/core";
import React from "react";


type Props = {
    gridArea: string,
};

export const Sidebar: React.FC<Props> = ({ gridArea }) => {
    return (
        <div css={{ backgroundColor: "#ece7e1", gridArea }}>
            <div css={{ borderBottom: "1px dashed black" }}>
                Department of Mathematics
            </div>
            <ul>
                { DUMMY_COURSES.map(name => <li key={name}>{ name }</li>) }
            </ul>
        </div>
    );
};

const DUMMY_COURSES = [
    "Algebraic Combinatorics",
    "Analysis",
    "Geometric Combinatorics",
    "Linear Algebra I",
    "Linear Algebra II",
    "Probability",
    "Single Variable Calculus",
];
