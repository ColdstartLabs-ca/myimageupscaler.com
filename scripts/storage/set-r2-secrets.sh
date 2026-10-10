#!/usr/bin/env bash
# Adds the R2 S3 API credentials to the prod API secret (PRD-SQR-02).
# Follows the gcloud-secrets rule: fetch prod, change only the R2 lines, push a new version.
# Values are read with a hidden prompt and are never printed.
set -euo pipefail

PROJECT="myimageupscaler-auth"
SECRET="myimageupscaler-api-prod"

read -rsp "R2 Access Key ID: " key_id; echo
read -rsp "R2 Secret Access Key: " key_secret; echo
if [[ -z "$key_id" || -z "$key_secret" ]]; then
  echo "Error: both values are required." >&2
  exit 1
fi

tmp_dir=$(mktemp -d)
chmod 700 "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT

gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" > "$tmp_dir/current"
grep -v -E '^(R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)=' "$tmp_dir/current" > "$tmp_dir/next" || true
printf 'R2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n' "$key_id" "$key_secret" >> "$tmp_dir/next"

kept=$(grep -c -v -E '^(R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)=' "$tmp_dir/current" || true)
if (( $(wc -l < "$tmp_dir/next") != kept + 2 )); then
  echo "Error: line count check failed. Nothing was pushed." >&2
  exit 1
fi

gcloud secrets versions add "$SECRET" --project="$PROJECT" --data-file="$tmp_dir/next" >/dev/null
count=$(gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" | grep -c -E '^R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=.+')
echo "Pushed a new version of $SECRET. R2 keys present: $count/2. The previous version stays enabled."
