---
sidebar_position: 3
---

# Installation methods

Tobira can be installed via different methods.

## Manually deploy binary

As Tobira is compiled into a single binary, manually installing Tobira is fairly easy.

Get the appropriate `tobira-<target>` binary for your architecture from [our releases](https://github.com/elan-ev/tobira/releases) and copy it to your server.
You can place it anywhere you want, but we suggest creating a directory `/opt/tobira` and placing it there.
The rest of these docs also assumes that you rename it to just `tobira`, i.e. stripping the target suffix, so that the binary is `/opt/tobira/tobira`.

If you need to build your own binary, see [this document](../dev/build/release) for more information.


## Debian Packages

The Tobira Debian packages support currently maintained Debian based releases.
This guide also assumes that you have the appropriate Debian repositories installed on your server.
Find these documents in the adopter documentation in [Opencast's documentation](https://docs.opencast.org/).

Install Tobira with `apt-get install tobira` to get the latest version.
If you need a specific version, (example here is 1.3), use `apt-get install tobira=1.3-1`.
These packages are just a thin wrapper around the binaries you would otherwise deploy manually, with the sole exception of setting up a log file in `/var/log/tobira`.
