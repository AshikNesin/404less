export { default as storageRoutes } from "./storage.routes";
export * as storageService from "./storage.service";
export * from "./storage.schema";
export { storage, getStorage, setStorageAdapter } from "./storage";
export { memoryStorage } from "./memory";
export { r2Storage } from "./r2";
export type {
  StorageAdapter,
  StorageBody,
  StoredObject,
  ListOptions,
  ListResult,
  PutOptions,
} from "./adapter";
