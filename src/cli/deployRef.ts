import { execFileSync } from "node:child_process";

export type GitCommand = (args: string[]) => string;

const runGit: GitCommand = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const shortSha = (sha: string) => sha.slice(0, 12);

const commitShaPattern = /^[0-9a-f]{40}$/i;

const refName = (options: { configuredRef: string; explicitRef?: string; preferCurrentCommit: boolean }) => {
  if (options.explicitRef) {
    return options.explicitRef;
  }

  return options.preferCurrentCommit ? "HEAD" : options.configuredRef;
};

export const resolveDeployGitRef = (options: {
  configuredRef: string;
  explicitRef?: string;
  git?: GitCommand;
  preferCurrentCommit: boolean;
}) => {
  const git = options.git ?? runGit;
  const targetRef = refName(options);
  const commitSha = git(["rev-parse", "--verify", `${targetRef}^{commit}`]);

  if (!commitSha || !commitShaPattern.test(commitSha)) {
    throw new Error(`Could not resolve Git ref ${targetRef} to a full commit SHA. Fetch it locally, or pass a commit SHA with --ref.`);
  }

  const fetchOutput = git(["fetch", "--quiet", "origin"]);
  const containingBranches = git(["branch", "-r", "--contains", commitSha]);

  if (!containingBranches.trim()) {
    const hint = fetchOutput ? ` Git output: ${fetchOutput}` : "";
    throw new Error(`Commit ${shortSha(commitSha)} from ${targetRef} is not available on origin. Push it before queueing the build.${hint}`);
  }

  return commitSha;
};
