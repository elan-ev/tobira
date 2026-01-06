// Temporary workaround for react-icons, which still uses the global JSX namespace.
import React from "react";

declare global {
    namespace JSX {
        type Element = React.JSX.Element
    }
}
