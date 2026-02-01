import { Pool } from "postgres";

/**
 * Sequential migration runner.
 * Reads .sql files from api/migrations/, tracks applied versions in schema_migrations.
 * Can be run standalone or imported and called from main.ts.
 */
export async function runMigrations(databaseUrl: string, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir ?? new URL("../migrations", import.meta.url).pathname;
  const pool = new Pool(databaseUrl, 1);
  const client = await pool.connect();

  try {
    // 1. Create schema_migrations table if not exists
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Bootstrap check: existing DB without migration tracking
    const migrationRows = await client.queryObject<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM schema_migrations`
    );
    const hasMigrations = Number(migrationRows.rows[0].count) > 0;

    if (!hasMigrations) {
      // Check if this is an existing database (users table exists)
      const tableCheck = await client.queryObject<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') as exists`
      );
      if (tableCheck.rows[0].exists) {
        console.log("[migrate] Existing database detected — marking migration 001 as already applied");
        await client.queryArray(`INSERT INTO schema_migrations (version) VALUES (1)`);
      }
    }

    // 3. Read migration files and sort by numeric prefix
    const files: { version: number; name: string }[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
      const match = entry.name.match(/^(\d+)_/);
      if (!match) continue;
      files.push({ version: parseInt(match[1], 10), name: entry.name });
    }
    files.sort((a, b) => a.version - b.version);

    // 4. Get already-applied versions
    const applied = await client.queryObject<{ version: number }>(
      `SELECT version FROM schema_migrations`
    );
    const appliedSet = new Set(applied.rows.map((r) => r.version));

    // 5. Apply unapplied migrations in order
    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file.version)) continue;

      const sql = await Deno.readTextFile(`${dir}/${file.name}`);
      console.log(`[migrate] Applying migration ${file.name}...`);

      await client.queryArray("BEGIN");
      try {
        await client.queryArray(sql);
        await client.queryArray(
          `INSERT INTO schema_migrations (version) VALUES ($1)`,
          [file.version]
        );
        await client.queryArray("COMMIT");
        appliedCount++;
      } catch (err) {
        await client.queryArray("ROLLBACK");
        throw new Error(`Migration ${file.name} failed: ${err}`);
      }
    }

    if (appliedCount === 0) {
      console.log("[migrate] Database is up to date");
    } else {
      console.log(`[migrate] Applied ${appliedCount} migration(s)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow running standalone: deno run --allow-net --allow-env --allow-read migrate.ts
if (import.meta.main) {
  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    Deno.exit(1);
  }
  await runMigrations(databaseUrl);
}
