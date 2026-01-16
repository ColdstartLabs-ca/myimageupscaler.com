#!/bin/bash

# Configuration
GCLOUD_PROJECT="myimageupscaler-auth"
GCLOUD_ACCOUNT="myimageupscaler@myimageupscaler-auth.iam.gserviceaccount.com"
GCLOUD_SECRET_API="myimageupscaler-api-prod"
GCLOUD_SECRET_CLIENT="myimageupscaler-client-prod"
ENV_API_PROD="$PROJECT_ROOT/.env.api.prod"
ENV_CLIENT_PROD="$PROJECT_ROOT/.env.client.prod"

step_fetch_secrets() {
    log_step 0 "Fetching production secrets"

    # Check gcloud CLI
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not installed. Install from: https://cloud.google.com/sdk/docs/install"
    fi
    log_success "gcloud CLI found"

    # Check authentication
    if ! gcloud auth print-identity-token &> /dev/null; then
        log_error "Not authenticated. Run: gcloud auth login"
    fi
    log_success "gcloud authenticated"

    # Switch to the correct account for myimageupscaler project
    log_info "Switching to account $GCLOUD_ACCOUNT..."
    gcloud config set account "$GCLOUD_ACCOUNT" --quiet
    log_success "Using account $GCLOUD_ACCOUNT"

    # Fetch API secrets
    log_info "Fetching $GCLOUD_SECRET_API from project $GCLOUD_PROJECT..."
    if ! gcloud secrets versions access latest --secret="$GCLOUD_SECRET_API" --project="$GCLOUD_PROJECT" > "$ENV_API_PROD" 2>/dev/null; then
        log_error "Failed to fetch secret '$GCLOUD_SECRET_API'. Ensure it exists in GCloud Secret Manager and you have access."
    fi
    log_success ".env.api.prod written"

    # Fetch client secrets
    log_info "Fetching $GCLOUD_SECRET_CLIENT from project $GCLOUD_PROJECT..."
    if ! gcloud secrets versions access latest --secret="$GCLOUD_SECRET_CLIENT" --project="$GCLOUD_PROJECT" > "$ENV_CLIENT_PROD" 2>/dev/null; then
        rm -f "$ENV_API_PROD"  # Cleanup partial state
        log_error "Failed to fetch secret '$GCLOUD_SECRET_CLIENT'. Ensure it exists in GCloud Secret Manager and you have access."
    fi
    log_success ".env.client.prod written"
}
