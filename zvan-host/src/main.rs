use anyhow::Result;
use risc0_zkvm::{default_prover, ExecutorEnv};
use serde::{Deserialize, Serialize};
use std::{env, fs, path::Path};

#[derive(Serialize, Deserialize, Debug)]
pub struct PatientRecord {
    pub name: String,
    pub email: String,
    pub phone: String,
    pub zip_code: String,
    pub birth_year: u32,
    pub reported_age: Option<u32>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AnonymizedRecord {
    pub zip3: String,
    pub age_clamped: u32,
    pub host_token: String,
    pub tags: Vec<String>,
}

fn main() -> Result<()> {
    // Usage: zvan-host <patient-json-file> <host-token> <output-receipt-path>
    let args: Vec<String> = env::args().collect();
    if args.len() < 4 {
        eprintln!("Usage: {} <patient.json> <host_token> <receipt_out_path>", args[0]);
        std::process::exit(2);
    }
    let patient_path = Path::new(&args[1]);
    let host_token = &args[2];
    let receipt_out = Path::new(&args[3]);

    let patient_json = fs::read_to_string(patient_path)?;
    let patient: PatientRecord = serde_json::from_str(&patient_json)?;

    // load compiled guest method (assumes guest compiled & in path)
    let method_code: &[u8] = include_bytes!("../zvan-guest/target/riscv-guest/release/zvan-guest");

    // build env
    let env = ExecutorEnv::builder()
        .write(&patient)?
        .write(&host_token)?
        .build()?;

    // run prover
    let prover = default_prover();
    let receipt = prover.prove(env, method_code)?;

    // decode journal (anonymized result) and print
    let anon: AnonymizedRecord = receipt.journal.decode()?;
    println!("Anonymized public output: {:?}", anon);

    // persist receipt bytes so verifier later can re-check (API may vary)
    let receipt_bytes = receipt.to_vec()?; // API returns Vec<u8>
    fs::write(receipt_out, &receipt_bytes)?;

    println!("Receipt saved to {}", receipt_out.display());
    Ok(())
}
