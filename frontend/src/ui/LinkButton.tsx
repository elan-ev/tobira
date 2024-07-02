import { Interpolation, Theme } from "@emotion/react";
import React from "react";
import { buttonStyle, Kind, useAppkitConfig, useColorScheme } from "@opencast/appkit";

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
}) => {
    const { isHighContrast } = useColorScheme();
    const config = useAppkitConfig();
    return <Link
        to={to}
        css={buttonStyle(config, kind, isHighContrast, extraCss)}
        {...rest}
    >{children}</Link>;
};
