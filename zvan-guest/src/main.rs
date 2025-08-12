// zvan-guest/src/main.rs
use std::io::{self, Read};

#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct PatientRecord {
    diagnosis: String,
    treatment: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct GuestInput {
    patient: PatientRecord,
    host_token: String,
}

#[derive(Debug, serde::Serialize)]
struct GuestOutput {
    anonymized_summary: String,
    host_token: String,
}

fn main() {
    // Baca input serialized (bisa JSON / bincode) dari host
    let mut input_data = Vec::new();
    io::stdin().read_to_end(&mut input_data).unwrap();

    let guest_input: GuestInput =
        bincode::deserialize(&input_data).expect("failed to deserialize guest input");

    // Proses data (contoh: bikin ringkasan anonymized)
    let summary = format!(
        "Diagnosis: {} | Treatment: {}",
        guest_input.patient.diagnosis,
        guest_input.patient.treatment
    );

    let output = GuestOutput {
        anonymized_summary: summary,
        host_token: guest_input.host_token.clone(),
    };

    // Kirim output ke host untuk dibungkus proof
    let encoded = bincode::serialize(&output).unwrap();
    io::stdout().write_all(&encoded).unwrap();
}
