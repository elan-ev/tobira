import ReactDOM from "react-dom";

import { App } from "./App";
import "./i18n";

const root = document.createElement("div");
document.body.appendChild(root);
ReactDOM.render(<App />, root);
