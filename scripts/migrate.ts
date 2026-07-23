import {
  closeDatabase,
  getDatabase,
  runMigrations,
} from "../src/lib/db/index";

async function main(): Promise<void> {
  const database = await getDatabase();
  const result = await runMigrations(database);

  if (result.applied.length > 0) {
    console.log(`Applied migrations: ${result.applied.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    console.log(`Already current: ${result.skipped.join(", ")}`);
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Database migration failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
