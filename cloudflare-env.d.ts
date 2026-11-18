declare namespace Cloudflare {
  interface Env {
    LOCAL_CATALOG?: string;
    CATALOG_ADMIN_USER_ID?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
