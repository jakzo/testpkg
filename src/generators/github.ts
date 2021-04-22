import path from "path";

import type { TemplateGenerator } from "../types";
import { mergeYaml, readFileOr } from "../utils";
import { getMainBranch, getNodeTargetVersion } from "./utils/config";

export const github: TemplateGenerator = {
  files: async ({ config }) => {
    const mainBranch = await getMainBranch(config);
    const nodeTargetVersion = await getNodeTargetVersion(config);

    return [
      {
        path: [".github", "workflows", "ci.yml"],
        isCheckedIn: true,
        contents: await mergeYaml(
          `
# DO NOT MODIFY
# This file is auto-generated (make another YAML file in this directory instead
# or create a file in ./config/.github/workflows/ci.yml with contents to merge)
name: CI

on:
  push:
    branches:
      - ${mainBranch}
  pull_request:
    branches:
      - "*"

env:
  node_version: ${nodeTargetVersion}

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    outputs:
      release_required: \${{ steps.release_required.outputs.result }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v2
        with:
          # Fetch Git history so that Changesets can check if release is required
          fetch-depth: 0
      - name: Setup Node.js
        uses: actions/setup-node@v1
        with:
          node-version: \${{ env.node_version }}
      - name: Install dependencies
        run: yarn install --frozen-lockfile
      - name: Test
        run: |
          set -e
          yarn run-if-script-exists test:ci:before
          yarn test:all
          yarn run-if-script-exists test:ci:after
      - name: Check if release is required
        uses: actions/github-script@v3
        id: release_required
        with:
          script: |
            const releaseUtils = require(process.env.GITHUB_WORKSPACE + '/node_modules/@changesets/release-utils');
            const { changesets } = await releaseUtils.readChangesetState();
            return changesets.length > 0;

  release:
    name: Release
    runs-on: ubuntu-latest
    needs: test
    if: \${{ github.ref == 'refs/heads/${mainBranch}' && needs.test.outputs.release_required == 'true' }}
    environment: Release
    outputs:
      release_upload_url: \${{ steps.create_release.outputs.upload_url }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v2
        with:
          # Fetch Git history so that Changesets can generate changelogs with correct commits
          fetch-depth: 0
      - name: Setup Node.js
        uses: actions/setup-node@v1
        with:
          node-version: \${{ env.node_version }}
      - name: Install dependencies
        run: yarn install --frozen-lockfile
      - name: Bump versions according to changeset
        run: |
          set -e
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"
          yarn changeset version
          git push --no-verify
      - name: Publish to npm
        id: publish
        run: |
          set -e
          npm config set _authToken "$NODE_AUTH_TOKEN"
          yarn run-if-script-exists release:ci:before
          yarn release
          echo "::set-output name=version_tag::$(git describe --tags --abbrev=0)"
          echo "::set-output name=release_changelog::$(yarn --silent ci-github-print-changelog)"
          yarn run-if-script-exists release:ci:after
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
      - name: Create release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: \${{ steps.publish.outputs.version_tag }}
          release_name: \${{ steps.publish.outputs.version_tag }}
          body: \${{ steps.publish.outputs.release_changelog }}
`,
          await readFileOr(
            path.join("config", ".github", "workflows", "ci.yml"),
            ""
          ),
          true
        ),
      },
    ];
  },
};