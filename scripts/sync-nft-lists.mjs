import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const networks = ["mainnet", "testnet"];
const executionEnvs = ["flow"]; // In the future, we may have ["flow", "evm"]
const endpoints = {
  mainnet: "https://token-list.fixes.world/api",
  testnet: "https://testnet-token-list.fixes.world/api",
};

const queryVerifiedReviwers = async (network) => {
  try {
    const response = await fetch(`${endpoints[network]}/reviewers-for-nftlist`);
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

const queryTokenList = async (
  network,
  executionEnv,
  reviewer = undefined,
  filter = 0
) => {
  let url = `${endpoints[network]}/nft-list/${reviewer ? reviewer : ""}`;
  if (filter !== 0) {
    url += `?filter=${filter}`;
  }
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

const writeJSONFile = async (
  data,
  network,
  executionEnv,
  reviewer = undefined,
  filter = 0
) => {
  const filterKeys = ["", "-reviewed", "-managed", "-verified", "-featured"];
  const filename = join(
    process.cwd(),
    "nftlist-jsons",
    network,
    executionEnv,
    ...(reviewer === undefined
      ? ["default.json"]
      : ["reviewers", `${reviewer}${filterKeys[filter]}.json`])
  );
  let originList;
  try {
    originList = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (e) {
    console.log(`Failed to read ${filename}`);
  }

  // check diff
  if (
    originList &&
    JSON.stringify(data.tokens) === JSON.stringify(originList.tokens)
  ) {
    console.log(`No change for ${filename}`);
    return;
  }

  if (data.tokens.length === 0) {
    console.log("Failed to query token list");
    return;
  }

  // update version
  let newTokenAdded = true;
  let oldTokenDeleted = false;
  if (!!originList) {
    const origTokens = originList.tokens.map((token) => {
      return `${token.address}-${token.contractName}`;
    });
    const origTokensSet = new Set(origTokens);
    const newTokens = data.tokens.filter((token) => {
      return `${token.address}-${token.contractName}`;
    });
    const newTokensSet = new Set(newTokens);
    newTokenAdded = newTokensSet.size > origTokensSet.size;
    oldTokenDeleted = origTokensSet.size > newTokensSet.size;
  }

  if (oldTokenDeleted) {
    data.version.major = (originList ?? data).version.major + 1;
    data.version.minor = 0;
    data.version.patch = 0;
  } else if (newTokenAdded) {
    data.version.minor = (originList ?? data).version.minor + 1;
    data.version.patch = 0;
  } else {
    data.version.patch = (originList ?? data).version.patch + 1;
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
        for (const filterType of [0, 1, 2, 3, 4]) {
          const tokenList = await queryTokenList(
            network,
            executionEnv,
            reviewer.address,
            filterType
          );
          if (!tokenList) {
            console.error(
              `Failed to query token list for reviewer ${reviewer.address}, filter=${filterType} for ${network}(${executionEnv})`
            );
            continue;
          } else {
            await writeJSONFile(
              tokenList,
              network,
              executionEnv,
              reviewer.address,
              filterType
            );
          }
        }
      }
    }
  }
}
main();
