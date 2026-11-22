import { getStore } from "@netlify/blobs";

const STORE = "uk-staff";

// Site-level store so roster and check-offs survive the next production deploy.
// Strong consistency is requested because two phones can check items at once.
// Some Lambda-compatible runtimes only expose a cached edge URL; in that case
// the store falls back to eventual consistency rather than failing the shift.
export function createNetlifyStaffStore() {
  let consistency = globalThis.__ukStaffBlobsConsistency || "strong";
  let store = null;

  const open = () => getStore(STORE, { consistency });

  const run = async (fn) => {
    if (!store) store = open();
    try {
      return await fn(store);
    } catch (error) {
      if (consistency === "strong" && error?.name === "BlobsConsistencyError") {
        consistency = "eventual";
        globalThis.__ukStaffBlobsConsistency = "eventual";
        store = open();
        console.warn("Staff storage is using eventual consistency on this runtime.");
        return fn(store);
      }
      throw error;
    }
  };

  return {
    async get(key) {
      return run((current) => current.get(key, { type: "json" }));
    },
    async getWithEtag(key) {
      const found = await run((current) => current.getWithMetadata(key, { type: "json" }));
      if (!found) return null;
      return { data: found.data, etag: found.etag };
    },
    async set(key, data) {
      return run((current) => current.setJSON(key, data));
    },
    async compareAndSet(key, data, etag) {
      return run((current) => (
        etag
          ? current.setJSON(key, data, { onlyIfMatch: etag })
          : current.setJSON(key, data, { onlyIfNew: true })
      ));
    },
  };
}
