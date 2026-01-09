#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Parse flags
export SKIP_SECRETS="false"
export SKIP_TESTS="false"
for arg in "$@"; do
    case $arg in
        --skip-secrets) SKIP_SECRETS="true" ;;
        --skip-tests) SKIP_TESTS="true" ;;
    esac
done

source "$SCRIPT_DIR/common.sh"

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

# Fetch production secrets from GCloud Secret Manager
source "$SCRIPT_DIR/steps/00-fetch-secrets.sh" && step_fetch_secrets

# Load production environment variables
source "$PROJECT_ROOT/scripts/load-env.sh" --prod

# Run tests unless skipped
if [ "$SKIP_TESTS" = "false" ]; then
    echo -e "${CYAN}▸ Running tests...${NC}"
    cd "$PROJECT_ROOT"
    if ! yarn test; then
        echo -e "${RED}✗ Tests failed. Deployment blocked.${NC}"
        echo -e "${YELLOW}  Use --skip-tests to bypass test checking${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ All tests passed${NC}"
    echo ""
else
    echo -e "${YELLOW}▸ Skipping tests (--skip-tests flag)${NC}"
    echo ""
fi

# Check translations
echo -e "${CYAN}▸ Checking translations...${NC}"
cd "$PROJECT_ROOT"
if ! yarn i18n:check --no-pseo; then
    echo -e "${RED}✗ Translation check failed. Deployment blocked.${NC}"
    echo -e "${YELLOW}  Run 'yarn i18n:check' to see details${NC}"
    exit 1
fi
echo -e "${GREEN}✓ All translations valid${NC}"
echo ""

source "$SCRIPT_DIR/steps/01-preflight.sh" && step_preflight
source "$SCRIPT_DIR/steps/02-build.sh" && step_build
source "$SCRIPT_DIR/steps/03-deploy.sh" && step_deploy
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
