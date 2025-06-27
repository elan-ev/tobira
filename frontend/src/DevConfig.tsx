import { bug, match, notNullish } from "@opencast/appkit";
import React, { PropsWithChildren, useContext, useState } from "react";
import { COLORS } from "./color";

// NOTE TO DEVELOPERS: you only need to adjust the `DevConfig` type and
// `DEFAULT` value. Everything else should work automatically.

type DevConfig = {
    treeIcons: boolean;
    nestedHome: boolean;
};
const DEFAULT: DevConfig = {
    treeIcons: false,
    nestedHome: false,
};

// -----

const ENABLED = Object.keys(DEFAULT).length > 0;

const Context = React.createContext<DevConfig | null>(null);

export const useDevConfig = (): DevConfig => notNullish(useContext(Context));

/**
 * User accessible configuration for development. Intended to let people
 * immediately switch between different design options, for example. Just for
 * development!
*/
export const DevConfig: React.FC<PropsWithChildren> = ({ children }) => {
    const [config, setConfig] = useState(DEFAULT);

    if (!ENABLED) {
        return children;
    }

    return <>
        <div css={{
            position: "fixed",
            bottom: 0,
            right: 0,
            backgroundColor: COLORS.neutral10,
            padding: "8px 16px",
            border: "2px dashed orange",
            zIndex: 250,
        }}>
            {Object.keys(DEFAULT).map(key => {
                const value = DEFAULT[key as keyof typeof DEFAULT];
                const ty = typeof value;
                const input = match(ty, {
                    "boolean": () => <input
                        type="checkbox"
                        defaultChecked={value}
                        onChange={e => setConfig(old => ({ ...old, [key]: e.target.checked }))}
                    />,
                });

                if (!input) {
                    bug(`Dev config type ${ty} not yet supported`);
                }

                return <label key={key} css={{ display: "block" }}>{input} {key}</label>;
            })}
        </div>
        <Context.Provider value={config}>{children}</Context.Provider>
    </>;
};
