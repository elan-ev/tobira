import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./i18n";
import { matchInitialRoute } from "./router";
import { LoginRoute, REDIRECT_STORAGE_KEY } from "./routes/Login";
import { checkInitialConsent } from "./ui/InitialConsent";
import CONFIG from "./config";


navigator.serviceWorker
    .register("/~sw.js", { updateViaCache: "none" })
    // eslint-disable-next-line no-console
    .catch(e => console.error("Failed to register service worker", e));

const redirect = (target: string) => {
    const newUri = new URL(target, document.baseURI).href;
    // eslint-disable-next-line no-console
    console.debug(`Requested login page after login: redirecting to previous page ${newUri}`);
    const state = {
        scrollY: 0,
        index: 0,
        ...window.history.state,
    };
    window.history.replaceState(state, "", newUri);
    window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
};

(async () => {
    // This a special route mostly useful for using custom login pages. Those
    // pages can usually be configured where they should redirect after
    // successful login.
    if (window.location.pathname === "/~session") {
        // eslint-disable-next-line no-console
        console.debug("Sending 'POST /~session' request and then redirecting");
        await fetch("/~session", { method: "POST" });
        redirect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? "/");
    }

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
    const target = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY);
    if (window.location.pathname === LoginRoute.url && target && CONFIG.auth.loginLink) {
        // eslint-disable-next-line no-console
        console.debug(`Requested login page after login: redirecting to previous page ${target}`);
        redirect(target);
    }

    const initialRoute = matchInitialRoute();
    const consentGiven = await checkInitialConsent();
    const root = document.createElement("div");
    root.style.height = "100svh";
    document.body.appendChild(root);
    const reactRoot = ReactDOM.createRoot(root);
    reactRoot.render(<App {...{ initialRoute, consentGiven }} />);
})();
