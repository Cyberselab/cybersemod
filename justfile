set windows-shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

# Install workspace dependencies and update the lockfile when needed.
install:
    bun install

# Install exactly the dependencies recorded in bun.lock.
install-frozen:
    bun install --frozen-lockfile

# Run all package tests.
test:
    bun run test

# Build config followed by command.
build:
    bun run build
