# Dummy authentication scripts for development and test deployments

This directory contains some scripts to have some dummy authentication system.
These are intended for developing Tobira and for our test deployment, and are thus not suitable for production environments!

## Login proxy

This option uses Tobira's own session management and login page.
Only requests to `POST /~login` are intercepted.
See `/docs/auth/` for more information!

To use this, you have to start two things (in addition to Tobira on port 3080):

- Login handler: `./login-handler.py` (listening on 3091)
- Nginx proxy: `docker-compose -f login-proxy-docker-compose.yml up` (listening on 3090)

If you then visit http://localhost:3090/, you should see your normal Tobira.
However, you can now use the login page with the users defined in `login-handler.py`.
