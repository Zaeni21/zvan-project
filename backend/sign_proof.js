import fs from "fs";
import path from "path";
import { ethers } from "ethers";

const PROOF_PATH = process.env.PROOF_PATH || "../proofs/proof.json";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // must be 0x...
const OUT_META = process.env.OUT_META || "../proofs/signed_proof_meta.json";

if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY env var before running. (Never commit it)");
  process.exit(1);
}

async function main() {
  const proofRaw = fs.readFileSync(path.resolve(PROOF_PATH));
  const proofJson = JSON.parse(proofRaw.toString());

  // Choose digest: sign keccak256 of full JSON string (deterministic)
  const fileBytes = Buffer.from(JSON.stringify(proofJson));
  const digest = ethers.keccak256(fileBytes); // 0x...

  const wallet = new ethers.Wallet(PRIVATE_KEY);

  // sign raw digest without Ethereum message prefix (so it can be ecrecover'ed on-chain)
  const signatureObj = wallet._signingKey().signDigest(digest);
  const signature = ethers.joinSignature(signatureObj);

  const meta = {
    proof_path: PROOF_PATH,
    digest,
    signature,
    signer: await wallet.getAddress(),
    timestamp: Date.now(),
    raw_proof: proofJson
  };

  fs.writeFileSync(path.resolve(OUT_META), JSON.stringify(meta, null, 2));
  console.log("Signed proof meta written to", OUT_META);
  console.log(meta);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
