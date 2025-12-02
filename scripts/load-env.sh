#!/bin/bash

# Generic Environment Loader Script
# Loads environment variables from .env.client and .env.api files

set -euo pipefail

# Function to load a single env file
load_env_file() {
    local file=$1

    if [ -f "$file" ]; then
        echo "✅ Loading environment variables from $file"

        # Export all non-comment lines
        while IFS= read -r line; do
            # Skip comments and empty lines
            [[ $line =~ ^[[:space:]]*# ]] && continue
            [[ $line =~ ^[[:space:]]*$ ]] && continue

            # Export valid KEY=VALUE pairs (support both NEXT_PUBLIC_ and non-prefixed)
            if [[ $line =~ ^[A-Z_][A-Z0-9_]*= ]]; then
                export "$line"
            fi
        done < "$file"

        return 0
    else
        return 1
    fi
}

# Load .env.client (public vars)
if ! load_env_file ".env.client"; then
    echo "❌ Environment file '.env.client' not found!"
    echo "💡 Copy .env.client.example to .env.client and fill in your values"
    exit 1
fi

# Load .env.api (server secrets)
if ! load_env_file ".env.api"; then
    echo "❌ Environment file '.env.api' not found!"
    echo "💡 Copy .env.api.example to .env.api and fill in your values"
    exit 1
fi

echo "✅ All environment variables loaded successfully"

# Function to validate required variables
validate_required_vars() {
    local missing_vars=()

    for var in "$@"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo "❌ Missing required environment variables:"
        printf '   %s\n' "${missing_vars[@]}"
        exit 1
    fi
}

# Function to print loaded vars (with masking for sensitive ones)
print_loaded_vars() {
    local sensitive_patterns=("SECRET" "KEY" "TOKEN" "PASSWORD")

    for env_file in ".env.client" ".env.api"; do
        if [ -f "$env_file" ]; then
            echo ""
            echo "📋 Variables from $env_file:"

            while IFS= read -r line; do
                # Skip comments and empty lines
                [[ $line =~ ^[[:space:]]*# ]] && continue
                [[ $line =~ ^[[:space:]]*$ ]] && continue

                # Extract key and value
                if [[ $line =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
                    key="${BASH_REMATCH[1]}"
                    value="${BASH_REMATCH[2]}"

                    # Check if this is a sensitive variable
                    is_sensitive=false
                    for pattern in "${sensitive_patterns[@]}"; do
                        if [[ $key == *"$pattern"* ]]; then
                            is_sensitive=true
                            break
                        fi
                    done

                    if [ "$is_sensitive" = true ]; then
                        # Show first 10 chars + masked
                        masked_value="${value:0:10}...***"
                        echo "   $key=$masked_value"
                    else
                        echo "   $key=$value"
                    fi
                fi
            done < "$env_file"
        fi
    done
}

# If script is called with --validate flag, validate common required vars
if [ "${1:-}" = "--validate" ]; then
    shift
    validate_required_vars "$@"
fi

# If script is called with --print flag, print loaded vars
if [ "${1:-}" = "--print" ]; then
    print_loaded_vars
fi