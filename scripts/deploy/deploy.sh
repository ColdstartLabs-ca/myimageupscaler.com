#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

export SKIP_TESTS="false"
export SKIP_I18N="false"
export PURGE_CACHE="false"
for arg in "$@"; do
    case $arg in
        --skip-tests) SKIP_TESTS="true" ;;
        --skip-i18n) SKIP_I18N="true" ;;
        --purge) PURGE_CACHE="true" ;;
        *)
            echo "Unsupported deploy option: $arg" >&2
            echo "Only --skip-tests, --skip-i18n, and --purge are allowed." >&2
            exit 2
            ;;
    esac
done

source "$SCRIPT_DIR/common.sh"

assert_clean_worktree() {
    if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
        log_error "Working tree is not clean. Commit or stash changes before deploying."
    fi
}

# Cleanup function - removes temporary production secrets
cleanup_prod_secrets() {
    local exit_code=$?
    if [[ -f "$PROJECT_ROOT/.env.api.prod" ]] || [[ -f "$PROJECT_ROOT/.env.client.prod" ]]; then
        log_info "Cleaning up temporary production secrets..."
        rm -f "$PROJECT_ROOT/.env.api.prod" "$PROJECT_ROOT/.env.client.prod"
        log_success "Cleanup complete"
    fi
    exit $exit_code
}

# Set trap for cleanup on any exit (success, failure, or interrupt)
trap cleanup_prod_secrets EXIT

echo ""
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${CYAN}  MyImageUpscaler Deploy${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo ""

START_TIME=$(date +%s)

# A deploy must correspond to committed source. Generated production secret files are
# fetched after this check and are ignored by Git.
assert_clean_worktree

# Fetch production secrets from GCloud Secret Manager
source "$SCRIPT_DIR/steps/00-fetch-secrets.sh" && step_fetch_secrets

# This check reads the two source secret files before load-env can reconcile them.
# It has no bypass option and prevents a cross-account Stripe configuration from
# reaching either the build or Cloudflare.
echo -e "${CYAN}▸ Verifying production Stripe configuration...${NC}"
cd "$PROJECT_ROOT"
if ! yarn deploy:stripe:guard --client-env-file .env.client.prod --server-env-file .env.api.prod; then
    echo -e "${RED}✗ Stripe production configuration is unsafe. Deployment blocked.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Production Stripe configuration verified${NC}"
echo ""

# Load production environment variables
source "$PROJECT_ROOT/scripts/load-env.sh" --prod

# Capture a verified schema + data backup before every production deployment.
echo -e "${CYAN}▸ Backing up production database...${NC}"
cd "$PROJECT_ROOT"
if ! yarn db:backup; then
    echo -e "${RED}✗ Production database backup failed. Deployment blocked.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Production database backup complete${NC}"
echo ""

if [ "$SKIP_TESTS" = "false" ]; then
    echo -e "${CYAN}▸ Running tests...${NC}"
    cd "$PROJECT_ROOT"
    if ! yarn test; then
        echo -e "${RED}✗ Tests failed. Deployment blocked.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ All tests passed${NC}"
    echo ""
else
    echo -e "${YELLOW}▸ Skipping tests (--skip-tests flag)${NC}"
    echo ""
fi

echo -e "${CYAN}▸ Running required verification...${NC}"
if ! yarn verify; then
    echo -e "${RED}✗ Verification failed. Deployment blocked.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Verification passed${NC}"
echo ""

echo -e "${CYAN}▸ Running SEO guard...${NC}"
if ! yarn test:seo-guard; then
    echo -e "${RED}✗ SEO guard failed. Deployment blocked.${NC}"
    echo -e "${YELLOW}  SEO regressions detected. Fix issues before deploying.${NC}"
    echo -e "${YELLOW}  Run 'yarn test:seo-guard' locally to debug.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ SEO guard passed${NC}"
echo ""

if [ "$SKIP_I18N" = "false" ]; then
    echo -e "${CYAN}▸ Checking translations...${NC}"
    if ! yarn i18n:check --no-pseo; then
        echo -e "${RED}✗ Translation check failed. Deployment blocked.${NC}"
        echo -e "${YELLOW}  Run 'yarn i18n:check' to see details${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ All translations valid${NC}"
    echo ""
else
    echo -e "${YELLOW}▸ Skipping i18n checks (--skip-i18n flag)${NC}"
    echo ""
fi

# Validate SEO data integrity (static validation - no server required)
echo -e "${CYAN}▸ Validating SEO data...${NC}"
cd "$PROJECT_ROOT"
if ! yarn validate:seo:all; then
    echo -e "${RED}✗ SEO validation failed. Deployment blocked.${NC}"
    echo -e "${YELLOW}  Run 'yarn validate:seo:all' to see details${NC}"
    exit 1
fi
echo -e "${GREEN}✓ SEO data valid${NC}"
echo ""

# yarn verify runs ESLint with --fix. Refuse to deploy any change it (or another
# required check) leaves behind after the initial clean-tree gate.
assert_clean_worktree

source "$SCRIPT_DIR/steps/01-preflight.sh" && step_preflight
source "$SCRIPT_DIR/steps/02-build.sh" && step_build
source "$SCRIPT_DIR/steps/03-deploy.sh" && step_deploy

# Purge Cloudflare cache if requested
if [ "$PURGE_CACHE" = "true" ]; then
    echo -e "${CYAN}▸ Purging Cloudflare cache...${NC}"
    purge_result=$(cf_api POST "/zones/$CLOUDFLARE_ZONE_ID/purge_cache" '{"purge_everything":true}')
    if echo "$purge_result" | grep -q '"success":true'; then
        echo -e "  ${GREEN}✓${NC} Cache purged"
    else
        echo -e "  ${YELLOW}⚠${NC} Cache purge failed (non-blocking)"
    fi
    echo ""
fi

source "$SCRIPT_DIR/steps/04-configure.sh" && step_configure
source "$SCRIPT_DIR/steps/05-secrets.sh" && step_secrets
source "$SCRIPT_DIR/steps/06-verify.sh" && step_verify

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Done in ${DURATION}s${NC}"
echo -e "${GREEN}  https://${DOMAIN_NAME}${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
