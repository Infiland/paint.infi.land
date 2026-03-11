import type { io as socketIoFactory } from "socket.io-client";

declare global {
  const io: typeof socketIoFactory;
}

export {};
