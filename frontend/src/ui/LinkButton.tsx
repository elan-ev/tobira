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
    const appkitConfig = useAppkitConfig();
    const { isHighContrast } = useColorScheme();
    return (
        <Link
            to={to}
            css={buttonStyle(appkitConfig, kind, isHighContrast, extraCss)}
            {...rest}
        >
            {children}
        </Link>
    );
};
