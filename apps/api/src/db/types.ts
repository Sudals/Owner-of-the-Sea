import { customType } from "drizzle-orm/pg-core";

/** Case-insensitive text (requires `CREATE EXTENSION citext`, see drizzle/0000_enable_citext.sql). */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/** Raw bytes; node-postgres returns bytea as a Buffer. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
