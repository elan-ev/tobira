import { Interpolation, Theme } from "@emotion/react";
import React from "react";
import { buttonStyle, Kind } from "@opencast/appkit";

import { Link } from "../router";



type LinkButtonProps = Omit<JSX.IntrinsicElements["a"], "ref"> & {
    to: string;
    kind?: Kind;
    extraCss?: Interpolation<Theme>;
};

export const LinkButton: React.FC<LinkButtonProps> = ({
    kind = "normal",
    extraCss,
    to,
    children,
    ...rest
}) => (
    <Link to={to} css={buttonStyle(kind, extraCss)} {...rest}>{children}</Link>
);
