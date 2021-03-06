#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const fse = require("fs-extra");

const scriptExists = (filePath) => {
  try {
    require.resolve(filePath);
    return true;
  } catch {
    return false;
  }
};

const getBinName = async () => {
  const binName = path.basename(process.argv[1]);
  if (binName === "bin.js") return "project";

  const nodeModulesBinContents = await fse.readFile(process.argv[1], "utf8");
  const commandsStubBinContents = await fse.readFile(
    path.join(process.cwd(), "repo-helpers-stub", "bin.js"),
    "utf8"
  );
  if (nodeModulesBinContents !== commandsStubBinContents) {
    console.log(
      "Linked binaries are out of sync with repo-helpers-stub package. Reinstalling..."
    );
    spawnSync(
      "yarn",
      [
        "add",
        "-D",
        "@jstm/core@file:./repo-helpers-stub",
        "--force",
        "--ignore-scripts",
      ],
      { stdio: "inherit" }
    );
    console.log(
      "Reinstall complete. Will attempt to continue current command using old binary but may fail."
    );
  }

  return binName;
};

const main = async () => {
  let rootDir = process.cwd();
  while (
    rootDir.includes("node_modules") ||
    rootDir.includes("repo-helpers-stub")
  )
    rootDir = path.join(rootDir, "..");
  process.chdir(rootDir);
  const binName = await getBinName();

  require("ts-node").register({
    transpileOnly: true,
    skipProject: true,
    compilerOptions: { esModuleInterop: true, downlevelIteration: true },
  });
  require("tsconfig-paths").register({
    baseUrl: rootDir,
    paths: {
      "@jstm/core": ["./src"],
    },
  });

  if (binName === "project") {
    const presetNode = require(`${rootDir}/presets/node`).default;
    const { applyPresetCli } = require(`${rootDir}/src`);
    const packageJson = require(`${rootDir}/package.json`);

    await applyPresetCli(presetNode, {
      ...packageJson,
      version: "file:./repo-helpers-stub",
    });
    return;
  }

  const binPaths = [
    `${rootDir}/presets/template/${binName}`,
    `${rootDir}/src/bin/${binName}`,
  ];
  for (const binPath of binPaths) {
    if (scriptExists(binPath)) {
      require(binPath);
      return;
    }
  }
  throw new Error(`Binary not found: ${binName}`);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
