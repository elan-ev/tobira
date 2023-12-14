import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./i18n";
import { matchInitialRoute } from "./router";
import { REDIRECT_STORAGE_KEY } from "./routes/Login";


// Potentially redirect to previous page after login.
//
// When clicking on the login button, the (then) current page is stored in
// session storage. If the login button is configured to be a link to some
// external page, the user is likely redirected to `/~login` from that external
// login page. In that case, we want to redirect the user to the page they are
// coming from.
//
// We previously had this logic in the `LoginPage` component and redirected in
// an effect. But this is not the proper tool: we don't want to cause rendering
// a component to trigger a redirect. In fact, that approach would break in
// `StrictMode`.
const redirectTo = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY);
if (window.location.pathname === "/~login" && redirectTo) {
    const newUri = new URL(redirectTo, document.baseURI).href;
    // eslint-disable-next-line no-console
    console.debug(`Requested login page after login: redirecting to previous page ${newUri}`);
    window.history.replaceState(null, "", newUri);
    window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
}

const initialRoute = matchInitialRoute();
const root = document.createElement("div");
root.style.height = "100svh";
document.body.appendChild(root);
const reactRoot = ReactDOM.createRoot(root);
reactRoot.render(<App initialRoute={initialRoute} />);
