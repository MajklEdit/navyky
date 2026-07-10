import { readFile, writeFile } from "node:fs/promises";

const variablesPath = new URL("../android/variables.gradle", import.meta.url);
let variables = await readFile(variablesPath, "utf8");

if (!variables.includes("rgcfaIncludeGoogle")) {
  variables = variables.replace("ext {", "ext {\n    rgcfaIncludeGoogle = true");
  await writeFile(variablesPath, variables);
}
