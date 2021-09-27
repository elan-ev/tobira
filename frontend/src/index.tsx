import ReactDOM from "react-dom";

import { App } from "./App";
import "./i18n";
import { matchInitialRoute } from "./router";
import { ROUTES } from "./routes";


const initialRoute = matchInitialRoute(ROUTES);
const root = document.createElement("div");
document.body.appendChild(root);
const reactRoot = ReactDOM.createRoot(root);
reactRoot.render(<App initialRoute={initialRoute} />);
