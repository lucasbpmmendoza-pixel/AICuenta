import sql from "mssql";

const config: sql.config = {
  server: process.env.AZURE_SQL_SERVER!,
  database: process.env.AZURE_SQL_DATABASE!,
  user: process.env.AZURE_SQL_USER!,
  password: process.env.AZURE_SQL_PASSWORD!,
  port: Number(process.env.AZURE_SQL_PORT ?? 1433),
  options: {
    encrypt: true,             // requerido por Azure SQL
    trustServerCertificate: false,
    enableArithAbort: true,    // mejora planes de ejecución en SQL Server
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: 30_000,
  requestTimeout: 120_000,
};

// Pool singleton — se reutiliza entre requests en el mismo proceso
let pool: sql.ConnectionPool | null = null;

export async function getDb(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;

  try {
    pool = await new sql.ConnectionPool(config).connect();
    return pool;
  } catch (err) {
    pool = null;
    console.error("[db] Connection failed:", (err as Error).message);
    throw err;
  }
}
