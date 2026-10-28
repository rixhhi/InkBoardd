let shuttingDown = false;

export function beginShutdown() {
  shuttingDown = true;
}

export function resetShutdown() {
  shuttingDown = false;
}

export function isShuttingDown() {
  return shuttingDown;
}
