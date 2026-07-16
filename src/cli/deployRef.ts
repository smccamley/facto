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

export const resolveDeployGitRef = (options: {
  configuredRef: string;
  explicitRef?: string;
  git?: GitCommand;
  inferCurrentCommit: boolean;
}) => {
  if (options.explicitRef) {
    return options.explicitRef;
  }

  if (!options.inferCurrentCommit) {
    return options.configuredRef;
  }

  const git = options.git ?? runGit;
  const commitSha = git(["rev-parse", "--verify", "HEAD"]);

  if (!commitSha) {
    return options.configuredRef;
  }

  const fetchOutput = git(["fetch", "--quiet", "origin"]);
  const containingBranches = git(["branch", "-r", "--contains", commitSha]);

  if (!containingBranches.trim()) {
    const hint = fetchOutput ? ` Git output: ${fetchOutput}` : "";
    throw new Error(`Commit ${shortSha(commitSha)} is not available on origin. Push it before deploying, or pass --ref explicitly.${hint}`);
  }

  return commitSha;
};
