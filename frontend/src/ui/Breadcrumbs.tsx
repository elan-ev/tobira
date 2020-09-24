import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleRight, faHome } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";


type Props = {
    path: Segment[],
};

type Segment = {
    label: string,
    href: string,
}

export const Breadcrumbs: React.FC<Props> = ({ path }) => (
    <nav aria-label="breadcrumbs" css={{ marginBottom: 16 }}>
        <ol css={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Segment target="/" first active={path.length == 0}>
                <FontAwesomeIcon title="Home" icon={faHome} />
            </Segment>
            { path.map((segment, i) => (
                <Segment key={i} target={segment.href} active={i == path.length - 1}>
                    { segment.label }
                </Segment>
            )) }
        </ol>
    </nav>
);

type SegmentProps = {
    target: string,
    active: boolean,
    first?: boolean,
};

const Segment: React.FC<SegmentProps> = ({ target, active, first = false, children }) => (
    <li css={{ display: "inline" }} {...active && { "aria-current": "location" }}>
        { !first && <FontAwesomeIcon icon={faAngleRight} css={{ margin: "0 8px", color: "#888" }}/> }
        { active ?  children : <Link to={target}>{ children }</Link> }
    </li>
);
