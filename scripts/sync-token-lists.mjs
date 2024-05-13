import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const networks = ["mainnet", "testnet", "previewnet"];
const executionEnvs = ["flow"]; // In the future, we may have ["flow", "evm"]
const endpoints = {
  mainnet: "https://token-list.fixes.world/api",
  testnet: "https://testnet-token-list.fixes.world/api",
  previewnet: "https://previewnet-token-list.fixes.world/api",
};

const queryVerifiedReviwers = async (network) => {
  try {
    const response = await fetch(`${endpoints[network]}/reviewers`);
    const data = await response.json();
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      data[0].address !== undefined
    ) {
      return data.filter((one) => one.verified === true);
    } else {
      return [];
    }
  } catch (e) {
    console.error(`Failed to query reviewers for ${network}`);
    return [];
  }
};

const queryTokenList = async (network, executionEnv, reviewer = undefined) => {
  const url = `${endpoints[network]}/token-list/${reviewer ? reviewer : ""}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.tokens !== undefined) {
      return data;
    } else {
      return undefined;
    }
  } catch (e) {
    console.error(`Failed to query token list for ${network}(${executionEnv})`);
    return undefined;
  }
};

function difference(setA, setB) {
  let _difference = new Set(setA);
  for (let elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

const writeJSONFile = async (
  data,
  network,
  executionEnv,
  reviewer = undefined
) => {
  const filename = join(
    process.cwd(),
    "jsons",
    network,
    executionEnv,
    ...(reviewer === undefined
      ? ["default.json"]
      : ["reviewers", `${reviewer}.json`])
  );
  const originList = JSON.parse(fs.readFileSync(filename, "utf8"));

  // check diff
  if (JSON.stringify(data.tokens) === JSON.stringify(originList.tokens)) {
    console.log(`No change for ${filename}`);
    return;
  }

  // update version
  const origTokens = originList.tokens.map((token) => {
    return `${token.address}-${token.contractName}`;
  });
  const origTokensSet = new Set(origTokens);
  const newTokens = data.tokens.filter((token) => {
    return `${token.address}-${token.contractName}`;
  });
  const newTokensSet = new Set(newTokens);

  const newTokenAdded = difference(newTokensSet, origTokensSet).size > 0;
  const oldTokenDeleted = difference(origTokensSet, newTokensSet).size > 0;
  if (oldTokenDeleted) {
    newList.version.major = originList.version.major + 1;
    newList.version.minor = 0;
    newList.version.patch = 0;
  } else if (newTokenAdded) {
    newList.version.minor = originList.version.minor + 1;
    newList.version.patch = 0;
  } else {
    newList.version.patch = originList.version.patch + 1;
  }

  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`Wrote ${filename}`);
};

async function main() {
  for (const network of networks) {
    for (const executionEnv of executionEnvs) {
      // Step 1. Query Default JSON
      const defaultTokenList = await queryTokenList(network, executionEnv);
      if (!defaultTokenList) {
        console.error(
          `Failed to query default token list for ${network}(${executionEnv})`
        );
        continue;
      } else {
        await writeJSONFile(defaultTokenList, network, executionEnv);
      }

      // Step 2. Query Reviewers' JSON
      const reviewers = await queryVerifiedReviwers(network);

      for (const reviewer of reviewers) {
        const tokenList = await queryTokenList(
          network,
          executionEnv,
          reviewer.address
        );
        if (!tokenList) {
          console.error(
            `Failed to query token list for reviewer ${reviewer.address}`
          );
          continue;
        } else {
          await writeJSONFile(
            tokenList,
            network,
            executionEnv,
            reviewer.address
          );
        }
      }
    }
  }
}
main();
