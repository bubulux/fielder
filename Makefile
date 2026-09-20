# Thin wrappers around the pnpm scripts in package.json, which stay the source
# of truth. Everything runs in the foreground; stop a server with Ctrl-C.
.PHONY: help init dev worker dashboard mobile

help: ## Show this list
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  make %-10s %s\n", $$1, $$2}'

init: ## Write the gitignored dev files and apply D1 migrations (once per checkout)
	pnpm dev:init

dev: ## Worker on :8787 and dashboard on :5173, in parallel
	pnpm dev

worker: ## Worker only -> http://localhost:8787
	pnpm dev:worker

dashboard: ## Dashboard only -> http://localhost:5173 (needs `make worker` for /api)
	pnpm dev:dashboard

mobile: ## Metro with the Expo Go tunnel -> exp://….exp.direct
	pnpm dev:mobile
