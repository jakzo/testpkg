#!/bin/sh
set -e
unset npm_config_registry
# npm config get _authToken | head -c 5
npm publish /home/runner/work/testpkg/testpkg --json --access public --tag latest
