// Test fixture for target/runner.test.ts — a target script that fails before ever answering.
console.error('fake target: simulated startup failure');
process.exit(1);
