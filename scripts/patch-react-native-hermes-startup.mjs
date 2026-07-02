import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const hermesInstancePath = join(
  process.cwd(),
  "node_modules",
  "react-native",
  "ReactCommon",
  "react",
  "runtime",
  "hermes",
  "HermesInstance.cpp",
);

const replacements = [
  [
    "  void unstable_initializeOnJsThread() override {\n    runtime_->registerForProfiling();\n  }\n",
    "  void unstable_initializeOnJsThread() override {\n    // Avoid a startup SIGSEGV in Hermes profiling registration on TestFlight builds.\n  }\n",
  ],
  [
    "          .withEnableSampleProfiling(true)\n",
    "          .withEnableSampleProfiling(false)\n",
  ],
];

let source;
try {
  source = readFileSync(hermesInstancePath, "utf8");
} catch (error) {
  if (error && error.code === "ENOENT") {
    console.warn(
      "[patch-react-native-hermes-startup] React Native source not installed; skipping.",
    );
    process.exit(0);
  }
  throw error;
}

let patched = source;
for (const [needle, replacement] of replacements) {
  if (patched.includes(replacement)) {
    continue;
  }
  if (!patched.includes(needle)) {
    throw new Error(
      `[patch-react-native-hermes-startup] Expected Hermes source block not found in ${hermesInstancePath}`,
    );
  }
  patched = patched.replace(needle, replacement);
}

if (patched !== source) {
  writeFileSync(hermesInstancePath, patched);
  console.log("[patch-react-native-hermes-startup] Patched Hermes startup profiling.");
} else {
  console.log("[patch-react-native-hermes-startup] Hermes startup profiling already patched.");
}
