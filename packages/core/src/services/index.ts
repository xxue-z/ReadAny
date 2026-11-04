export type {
  IPlatformService,
  IDatabase,
  IWebSocket,
  FetchOptions,
  FileTransferOptions,
  FilePickerOptions,
  WebSocketOptions,
  UpdateInfo,
} from "./platform";
export { setPlatformService, getPlatformService, waitForPlatformService } from "./platform";
export {
  BOOK_FILE_EXTENSIONS,
  BOOK_FILE_PICKER_FILTER,
  isSupportedBookExtension,
} from "./platform";
