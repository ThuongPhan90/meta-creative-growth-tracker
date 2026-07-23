import {
  checkDatabaseHealth,
  closeDatabase,
  getDatabase,
} from "../src/lib/db/index";

async function main(): Promise<void> {
  const database = await getDatabase();
  const health = await checkDatabaseHealth(database);

  console.log(`Database: ${health.databaseName}`);
  console.log(`Postgres: ${health.serverVersion}`);
  console.log(`Applied migrations: ${health.appliedMigrations.join(", ")}`);

  if (health.pendingMigrations.length > 0) {
    console.error(
      `Pending migrations: ${health.pendingMigrations.join(", ")}`,
    );
  }
  if (health.driftedMigrations.length > 0) {
    console.error(
      `Drifted migrations: ${health.driftedMigrations.join(", ")}`,
    );
  }
  if (health.missingRelations.length > 0) {
    console.error(`Missing relations: ${health.missingRelations.join(", ")}`);
  }
  if (!health.ok) {
    process.exitCode = 1;
    return;
  }

  console.log("Database schema is ready.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Database check failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
