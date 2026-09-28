import { fileURLToPath } from "node:url";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

const packageFolder = fileURLToPath(
  new URL("../packages/shotlog", import.meta.url),
);
let succeeded = true;
for (const entry of ["index", "server", "node"]) {
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: packageFolder,
      mainEntryPointFilePath: `<projectFolder>/dist/${entry}.d.ts`,
      compiler: { tsconfigFilePath: "<projectFolder>/tsconfig.json" },
      apiReport: {
        enabled: true,
        reportFolder: "<projectFolder>/api",
        reportTempFolder: "<projectFolder>/temp",
        reportFileName: `${entry}.api.md`,
      },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath: `${packageFolder}/package.json`,
  });
  const result = Extractor.invoke(config, {
    localBuild: process.argv.includes("--local"),
  });
  console.log(`${entry}: ${result.succeeded ? "PASS" : "FAIL"}`);
  succeeded &&= result.succeeded;
}
if (!succeeded) process.exitCode = 1;
