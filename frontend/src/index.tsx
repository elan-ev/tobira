import ReactDOM from "react-dom";

import { App } from "./App";
import "./i18n";
import { matchInitialRoute } from "./router";

const initialRoute = matchInitialRoute();
const root = document.createElement("div");
document.body.appendChild(root);
ReactDOM.render(<App initialRoute={initialRoute} />, root);
