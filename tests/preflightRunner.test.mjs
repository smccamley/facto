import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const writeExecutable = (path, contents) => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

const writeVersionCommand = (binDir, name, output) => {
  writeExecutable(join(binDir, name), `#!/usr/bin/env bash\nprintf '%s\\n' '${output}'\n`);
};

const writeCommonCommands = ({ binDir, brewScript, xcodeVersionFile }) => {
  writeExecutable(join(binDir, "uname"), "#!/usr/bin/env bash\nprintf 'Darwin\\n'\n");
  writeExecutable(join(binDir, "sw_vers"), "#!/usr/bin/env bash\n[[ \"$1\" == '-productVersion' ]] && printf '26.5.2\\n'\n");
  writeExecutable(join(binDir, "brew"), brewScript);
  writeExecutable(
    join(binDir, "xcodebuild"),
    `#!/usr/bin/env bash
case "$1" in
  -version) printf 'Xcode %s\\nBuild version 17F113\\n' "$(cat "$FAKE_XCODE_VERSION_FILE")" ;;
  -license|-runFirstLaunch) exit 0 ;;
  *) exit 0 ;;
esac
`
  );
  writeExecutable(join(binDir, "xcrun"), "#!/usr/bin/env bash\nprintf '26.6\\n'\n");
  writeExecutable(join(binDir, "xcode-select"), "#!/usr/bin/env bash\n[[ \"$1\" == '-p' ]] && printf '/Applications/Xcode.app/Contents/Developer\\n'\n");
  writeExecutable(join(binDir, "sudo"), "#!/usr/bin/env bash\n\"$@\"\n");
  writeExecutable(
    join(binDir, "gh"),
    "#!/usr/bin/env bash\nif [[ \"$1\" == 'auth' ]]; then exit 0; fi\nprintf 'gh version 2.96.0\\n'\n"
  );
  writeExecutable(join(binDir, "ssh"), "#!/usr/bin/env bash\nprintf 'Hi test! You have successfully authenticated.\\n' >&2\n");
  writeExecutable(
    join(binDir, "npm"),
    "#!/usr/bin/env bash\nif [[ \"$1\" == 'view' && \"$2\" == 'eas-cli' ]]; then printf '20.5.1\\n'; exit 0; fi\nif [[ \"$1\" == 'view' && \"$2\" == 'expo' ]]; then printf '57.0.4\\n'; exit 0; fi\nprintf '11.16.0\\n'\n"
  );

  writeVersionCommand(binDir, "git", "git version 2.40.0");
  writeVersionCommand(binDir, "node", "v24.18.0");
  writeVersionCommand(binDir, "npx", "11.16.0");
  writeVersionCommand(binDir, "ruby", "ruby 3.2.0");
  writeVersionCommand(binDir, "pod", "1.15.0");
  writeVersionCommand(binDir, "fastlane", "2.220.0");
  writeVersionCommand(binDir, "watchman", "2024.01.01.00");
  writeFileSync(xcodeVersionFile, "26.6");
};

const runPreflight = ({ brewScript, xcodeVersion = "26.6" }) => {
  const dir = mkdtempSync(join(tmpdir(), "facto-preflight-"));
  const binDir = join(dir, "bin");
  const xcodeVersionFile = join(dir, "xcode-version.txt");
  const brewLog = join(dir, "brew.log");

  try {
    mkdirSync(binDir);
    writeCommonCommands({ binDir, brewScript, xcodeVersionFile });
    writeFileSync(xcodeVersionFile, xcodeVersion);

    const result = spawnSync("/bin/bash", ["scripts/preflight-runner-macos.sh", "--manifest", "docs/runner-toolchain.md"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPO_APPLE_APP_SPECIFIC_PASSWORD: "",
        EXPO_APPLE_ID: "",
        EXPO_ASC_API_KEY_PATH: "",
        EXPO_ASC_ISSUER_ID: "",
        EXPO_ASC_KEY_ID: "",
        FAKE_BIN_DIR: binDir,
        FAKE_BREW_LOG: brewLog,
        FAKE_XCODE_VERSION_FILE: xcodeVersionFile,
        PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
      },
    });

    return {
      result,
      brewLog: existsSync(brewLog) ? readFileSync(brewLog, "utf8") : "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const debugOutput = ({ result, brewLog }) => `stdout:\n${result.stdout}\nstderr:\n${result.stderr}\nbrew:\n${brewLog}`;

test("preflight does not mutate Homebrew on an already capable Mac", () => {
  const brewScript = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_BREW_LOG"
case "$1" in
  --version) printf 'Homebrew 6.0.11\\n' ;;
  --prefix) printf '%s\\n' "$FAKE_BIN_DIR" ;;
  install|upgrade|outdated|list) printf 'unexpected brew mutation: %s\\n' "$*" >&2; exit 42 ;;
  *) exit 0 ;;
esac
`;

  const { result, brewLog } = runPreflight({ brewScript });

  assert.equal(result.status, 0, debugOutput({ result, brewLog }));
  assert.doesNotMatch(brewLog, /(?:^|\n)(install|upgrade|outdated|list)(?:\s|$)/);
  assert.match(result.stdout, /Facto runner preflight complete/);
});

test("preflight installs Xcode repair tools only when Xcode is too old", () => {
  const brewScript = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_BREW_LOG"
case "$1" in
  --version) printf 'Homebrew 6.0.11\\n' ;;
  --prefix) printf '%s\\n' "$FAKE_BIN_DIR" ;;
  install)
    cat > "$FAKE_BIN_DIR/xcodes" <<'EOS'
#!/usr/bin/env bash
if [[ "$1" == "version" ]]; then
  printf '2.0.3\\n'
  exit 0
fi
if [[ "$1" == "install" ]]; then
  printf '%s\\n' "$2" > "$FAKE_XCODE_VERSION_FILE"
  exit 0
fi
exit 0
EOS
    chmod +x "$FAKE_BIN_DIR/xcodes"
    printf '#!/usr/bin/env bash\\nprintf "aria2 version 1.37.0\\\\n"\\n' > "$FAKE_BIN_DIR/aria2c"
    chmod +x "$FAKE_BIN_DIR/aria2c"
    ;;
  upgrade|outdated|list) exit 0 ;;
  *) exit 0 ;;
esac
`;

  const { result, brewLog } = runPreflight({ brewScript, xcodeVersion: "15.0" });

  assert.equal(result.status, 0, debugOutput({ result, brewLog }));
  assert.match(brewLog, /install xcodesorg\/made\/xcodes aria2/);
  assert.doesNotMatch(brewLog, /upgrade/);
  assert.match(result.stdout, /Installing Xcode 26.6 with xcodes/);
  assert.match(result.stdout, /Facto runner preflight complete/);
});
