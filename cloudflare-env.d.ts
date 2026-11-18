declare namespace Cloudflare {
  interface Env {
    CATALOG_ADMIN_USER_ID?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
