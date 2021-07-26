import { Link } from "../router";
import { match } from "../util";



export const SideBox: React.FC = ({ children }) => (
    <div css={{
        backgroundColor: "var(--grey97)",
        border: "1px solid var(--grey80)",
        borderRadius: 4,
        "&:not(:first-child)": {
            marginTop: 32,
        },
    }}>{children}</div>
);

type LinkListProps = {
    items: JSX.Element[];
    className?: string;
};

/** A box with light grey background containing a list of items */
export const LinkList: React.FC<LinkListProps> = ({ items, ...rest }) => (
    <ul
        css={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            "& > li": {
                borderBottom: "1px solid var(--grey80)",
                "&:last-of-type": {
                    borderBottom: "none",
                },
                "& > *": {
                    padding: "6px 12px",
                    display: "flex",
                },
            },
        }}
        {...rest}
    >
        {items.map((child, i) => <li key={i}>{child}</li>)}
    </ul>
);



type LinkWithIconProps = {
    to: string;
    iconPos: "left" | "right";
    className?: string;
};

/** A link designed for `LinkList`. Has an icon on the left or right side. */
export const LinkWithIcon: React.FC<LinkWithIconProps> = ({ to, iconPos, children, ...rest }) => {
    const TRANSITION_DURATION = "0.1s";

    return (
        <Link
            to={to}
            css={{
                display: "flex",
                justifyContent: match(iconPos, {
                    "left": () => "flex-start",
                    "right": () => "space-between",
                }),
                alignItems: "center",
                transition: `background-color ${TRANSITION_DURATION}`,

                "& > svg": {
                    fontSize: 22,
                    color: "var(--grey65)",
                    transition: `color ${TRANSITION_DURATION}`,
                },

                "&:hover": {
                    transitionDuration: "0.05s",
                    backgroundColor: "var(--grey92)",
                    "& > svg": {
                        transitionDuration: "0.05s",
                        color: "var(--grey40)",
                    },
                },
            }}
            {...rest}
        >{children}</Link>
    );
};
