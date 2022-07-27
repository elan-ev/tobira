#!/usr/bin/env python3

import base64
import cgi
import http.server
import os
import signal
import socket
import socketserver
import sys
import urllib
from http import HTTPStatus


DUMMY_USERS = {
    "admin": ["Administrator", "ROLE_ADMIN, ROLE_USER_ADMIN, ROLE_ANONYMOUS, ROLE_USER, ROLE_SUDO"],
    "sabine": ["Sabine Rudolfs", "ROLE_USER_SABINE, ROLE_ANONYMOUS, ROLE_USER, ROLE_INSTRUCTOR, ROLE_TOBIRA_MODERATOR"],
    "augustus": ["Augustus Pagenkämper", "ROLE_USER_AUGUSTUS, ROLE_ANONYMOUS, ROLE_USER, ROLE_STUDENT"],
}

# Our actualy login logic.
def check_login(userid, password):
    if password == "tobira" and userid in DUMMY_USERS:
        [display_name, roles] = DUMMY_USERS[userid];
        return [userid, display_name, roles]
    else:
        return None

USERID_FIELD = "userid"
PASSWORD_FIELD = "password"


# The class that handles incoming HTTP requests. Only actually handles Tobira
# login requests.
#
# Instead of forwarding requests to Tobiras `POST /~session`, we use nginx to do
# that for us. We instead reply with corresponding headers and set the
# `x-accel-redirect` header.
class Handler(http.server.BaseHTTPRequestHandler):
    # Silence request logging
    def log_request(code, size):
        return

    # Handle POST requests
    def do_POST(self):
        # Tobira always sends login data in this content type.
        content_type = self.headers["content-type"]
        if content_type is None or not content_type.startswith("application/x-www-form-urlencoded"):
            self.send_response(HTTPStatus.BAD_REQUEST)
            self.end_headers()
            return

        # Read the body and parse it as query string. This also takes care of
        # URL-encoded values.
        length = int(self.headers["content-length"])
        body = self.rfile.read(length)
        vars = urllib.parse.parse_qs(body.decode())

        # If the expected keys are not present, we also reply bad request.
        if not (USERID_FIELD in vars and PASSWORD_FIELD in vars):
            self.send_response(HTTPStatus.BAD_REQUEST)
            self.end_headers()
            return


        # Actually do the authentication
        userid = vars[USERID_FIELD][0]
        password = vars[PASSWORD_FIELD][0]
        user_data = check_login(userid, password)

        # Reply correspondingly
        if user_data is None:
            # Incorrect login data
            print(f"Incorrect login {userid}:{password}")
            self.send_response(HTTPStatus.FORBIDDEN)
        else:
            # Correct login data.
            [username, display_name, roles] = user_data
            print(f"Successful login of {username} ({display_name}): {roles}")

            # All user data is send in base64 encoded headers.
            b64 = lambda s: base64.b64encode(s.encode()).decode()
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("x-tobira-username", b64(username))
            self.send_header("x-tobira-user-display-name", b64(display_name))
            self.send_header("x-tobira-user-roles", b64(roles))

            # This header is used only for our specific nginx setup.
            self.send_header("x-accel-redirect", "/~successful-login")

        self.end_headers()


# This is just for development where one wants to rapidly reuse the same port.
# Instead of this, you can also replace `DevTCPServer` with `socketserver.TCPServer`
# in main.
class DevTCPServer(socketserver.TCPServer):
    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(self.server_address)

# This is only for our test deployment where we want this script to listen on a Unix socket.
class UnixSocketHttpServer(socketserver.UnixStreamServer):
    def get_request(self):
        request, client_address = super(UnixSocketHttpServer, self).get_request()
        # This client address is faked, but that's fine for us
        return (request, ["fake", 0])


if __name__ == "__main__":
    if len(sys.argv) == 2:
        socket = sys.argv[1]

        # Remove socket if it already exists. Yes, that disconnects existing
        # connections, but its fine for test deployment.
        try:
            os.remove(socket)
        except OSError:
            pass

        httpd = UnixSocketHttpServer(socket, Handler)
        os.chmod(socket, 0o777)
        print(f"Dummy login handler listening on socket {socket}...")
    else:
        port = 3091
        httpd = DevTCPServer(("", port), Handler)
        print(f"Dummy login handler listening on port {port}...")

    # React to sigterm to be able to quickly shut down. Interestingly, on host
    # it seems to work fine without this. But in docker containers, this is
    # required. 🤷
    def terminate(signal,frame):
        httpd.server_close()
        sys.exit(0)
    signal.signal(signal.SIGTERM, terminate)

    httpd.serve_forever()
