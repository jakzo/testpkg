#!/bin/sh
set -e
unset npm_config_registry
npm publish /home/runner/work/testpkg/testpkg --json --access public --tag latest
