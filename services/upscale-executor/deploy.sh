#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Run from a clean, reviewed commit after the durable database migration.
# Prerequisites: enabled APIs, Artifact Registry repository, five existing service
# accounts below, and Secret Manager references NAME:NUMERIC_VERSION (not values).
# The authenticated operator/build account needs build, deploy, IAM and actAs access.
log() { printf '[upscale-executor-deploy] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
for command in gcloud git jq tar mktemp; do command -v "$command" >/dev/null || die "Missing command: $command"; done
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
BUILD_ID="${BUILD_ID:-$SOURCE_SHA}"
[[ "$BUILD_ID" =~ ^[0-9a-f]{40}$ && "$BUILD_ID" == "$SOURCE_SHA" ]] || die "BUILD_ID must match the full checked-out Git SHA"
[[ -z "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=normal)" ]] || die "Refusing to build from a dirty worktree"

accounts=(CLOUD_RUN_SERVICE_ACCOUNT DISPATCH_SERVICE_ACCOUNT CALLBACK_SERVICE_ACCOUNT TASK_SERVICE_ACCOUNT SCHEDULER_SERVICE_ACCOUNT)
secret_refs=(SUPABASE_URL_SECRET_REF SUPABASE_SERVICE_ROLE_KEY_SECRET_REF REPLICATE_API_TOKEN_SECRET_REF GEMINI_API_KEY_SECRET_REF OPENROUTER_API_KEY_SECRET_REF REPLICATE_WEBHOOK_SECRET_REF WAKE_SECRET_REF)
[[ -z "${WAKE_PREVIOUS_SECRET_REF:-}" ]] || secret_refs+=(WAKE_PREVIOUS_SECRET_REF)
for name in GCP_PROJECT_ID GCP_REGION ARTIFACT_REGISTRY_REPOSITORY "${accounts[@]}" "${secret_refs[@]}"; do
  [[ -n "${!name:-}" ]] || die "$name must be set"
done
[[ "$GCP_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || die "Invalid GCP_PROJECT_ID"
[[ "$GCP_REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]] || die "Invalid GCP_REGION"
for name in "${secret_refs[@]}"; do
  [[ "${!name}" =~ ^[a-zA-Z0-9_-]+:[1-9][0-9]*$ ]] || die "$name must be a pinned Secret Manager NAME:NUMERIC_VERSION reference"
done
[[ -z "${CLOUD_BUILD_SERVICE_ACCOUNT:-}" ]] || accounts+=(CLOUD_BUILD_SERVICE_ACCOUNT)
for name in "${accounts[@]}"; do
  [[ "${!name}" =~ ^[a-z][a-z0-9-]*@ && "${!name}" == *@"$GCP_PROJECT_ID".iam.gserviceaccount.com ]] || die "$name must be a service account in $GCP_PROJECT_ID"
done
[[ "$CLOUD_RUN_SERVICE_ACCOUNT" != "$DISPATCH_SERVICE_ACCOUNT" && "$CLOUD_RUN_SERVICE_ACCOUNT" != "$CALLBACK_SERVICE_ACCOUNT" && "$DISPATCH_SERVICE_ACCOUNT" != "$CALLBACK_SERVICE_ACCOUNT" ]] || die "Runtime service accounts must be distinct"
SERVICE_NAME="${SERVICE_NAME:-upscale-executor}"
DISPATCHER_SERVICE_NAME="${DISPATCHER_SERVICE_NAME:-$SERVICE_NAME-dispatcher}"
CALLBACK_SERVICE_NAME="${CALLBACK_SERVICE_NAME:-$SERVICE_NAME-callbacks}"
QUEUE_NAME="${QUEUE_NAME:-upscale-executor}"
SCHEDULER_NAME="${SCHEDULER_NAME:-upscale-executor-dispatch}"
IMAGE_NAME="${IMAGE_NAME:-upscale-executor}"
for name in SERVICE_NAME DISPATCHER_SERVICE_NAME CALLBACK_SERVICE_NAME QUEUE_NAME SCHEDULER_NAME IMAGE_NAME ARTIFACT_REGISTRY_REPOSITORY; do
  [[ "${!name}" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]] || die "Invalid $name"
done
[[ "$SERVICE_NAME" != "$DISPATCHER_SERVICE_NAME" && "$SERVICE_NAME" != "$CALLBACK_SERVICE_NAME" && "$DISPATCHER_SERVICE_NAME" != "$CALLBACK_SERVICE_NAME" ]] || die "Service names must be distinct"
gc() { gcloud "$@" --project="$GCP_PROJECT_ID" --quiet; }
run() { gc run "$@" --region="$GCP_REGION"; }
PROJECT_NUMBER="$(gc projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
[[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || die "Cannot resolve project number"
for name in "$SERVICE_NAME" "$DISPATCHER_SERVICE_NAME" "$CALLBACK_SERVICE_NAME"; do
  [[ $((${#name} + ${#PROJECT_NUMBER} + 1)) -le 63 ]] || die "Service name exceeds deterministic URL limit"
done
EXECUTOR_URL="https://$SERVICE_NAME-$PROJECT_NUMBER.$GCP_REGION.run.app"
DISPATCHER_URL="https://$DISPATCHER_SERVICE_NAME-$PROJECT_NUMBER.$GCP_REGION.run.app"
CALLBACK_URL="https://$CALLBACK_SERVICE_NAME-$PROJECT_NUMBER.$GCP_REGION.run.app"
QUEUE_PATH="projects/$GCP_PROJECT_ID/locations/$GCP_REGION/queues/$QUEUE_NAME"
ENABLED_APIS="$(gc services list --enabled --format='value(config.name)')"
for api in run cloudtasks cloudscheduler artifactregistry cloudbuild secretmanager; do
  [[ $'\n'"$ENABLED_APIS"$'\n' == *$'\n'"$api.googleapis.com"$'\n'* ]] || die "Enable $api.googleapis.com before deployment"
done
for name in "${accounts[@]}"; do gc iam service-accounts describe "${!name}" --format='value(email)' >/dev/null; done
for name in "${secret_refs[@]}"; do
  ref="${!name}"
  [[ "$(gc secrets versions describe "${ref##*:}" --secret="${ref%:*}" --format='value(state)')" == ENABLED ]] || die "$name references a disabled secret version"
done
gc artifacts repositories describe "$ARTIFACT_REGISTRY_REPOSITORY" --location="$GCP_REGION" --format='value(name)' >/dev/null
QUEUE_JSON="$(gc tasks queues list --location="$GCP_REGION" --format=json | jq -c --arg name "$QUEUE_PATH" '.[] | select(.name == $name)')"
[[ -z "$QUEUE_JSON" ]] || jq -e '(.httpTarget // {}) == {}' <<<"$QUEUE_JSON" >/dev/null || die "Existing queue has HTTP overrides; use a dedicated queue"

IMAGE_REPOSITORY="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$ARTIFACT_REGISTRY_REPOSITORY/$IMAGE_NAME"
# Upload only the committed tree. CLI-generated files stay outside the checkout.
BUILD_CONTEXT="$(mktemp -d "${TMPDIR:-/tmp}/upscale-executor-build.XXXXXX")"
trap 'rm -rf -- "$BUILD_CONTEXT"' EXIT
git -C "$REPO_ROOT" archive "$SOURCE_SHA" | tar -x -C "$BUILD_CONTEXT"
build_args=(builds submit "$BUILD_CONTEXT" --config="$BUILD_CONTEXT/services/upscale-executor/cloudbuild.yaml" --substitutions="_IMAGE=$IMAGE_REPOSITORY:$BUILD_ID,_SOURCE_SHA=$BUILD_ID" --region="$GCP_REGION")
if [[ -n "${CLOUD_BUILD_SERVICE_ACCOUNT:-}" ]]; then
  build_args+=(--service-account="projects/$GCP_PROJECT_ID/serviceAccounts/$CLOUD_BUILD_SERVICE_ACCOUNT" --default-buckets-behavior=regional-user-owned-bucket)
fi
log "Building reviewed source $BUILD_ID"
gc "${build_args[@]}" >/dev/null
IMAGE_DIGEST="$(gc artifacts docker images describe "$IMAGE_REPOSITORY:$BUILD_ID" --format='value(image_summary.digest)')"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "Artifact Registry returned an invalid image digest"
IMMUTABLE_IMAGE="$IMAGE_REPOSITORY@$IMAGE_DIGEST"

queue_action=create
[[ -z "$QUEUE_JSON" ]] || queue_action=update
gc tasks queues "$queue_action" "$QUEUE_NAME" --location="$GCP_REGION" --max-concurrent-dispatches=10 --max-dispatches-per-second=10 --max-attempts=100 --max-retry-duration=900s --min-backoff=5s --max-backoff=300s >/dev/null
if [[ -n "$QUEUE_JSON" && "$(jq -r '.state' <<<"$QUEUE_JSON")" == PAUSED ]]; then gc tasks queues resume "$QUEUE_NAME" --location="$GCP_REGION" >/dev/null; fi
# These Google-managed agents mint the OIDC tokens used by their services.
for api in cloudtasks cloudscheduler; do
  gc projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-$api.iam.gserviceaccount.com" --role="roles/$api.serviceAgent" --condition=None >/dev/null
done
for identity in "$DISPATCH_SERVICE_ACCOUNT" "$CALLBACK_SERVICE_ACCOUNT"; do
  gc tasks queues add-iam-policy-binding "$QUEUE_NAME" --location="$GCP_REGION" --member="serviceAccount:$identity" --role=roles/cloudtasks.enqueuer >/dev/null
  gc iam service-accounts add-iam-policy-binding "$TASK_SERVICE_ACCOUNT" --member="serviceAccount:$identity" --role=roles/iam.serviceAccountUser --condition=None >/dev/null
done

COMMON_ENV="UPSCALE_BUILD_ID=$BUILD_ID,UPSCALE_EXECUTOR_IMAGE_DIGEST=$IMAGE_DIGEST,UPSCALE_EXECUTOR_TASK_QUEUE=$QUEUE_PATH,UPSCALE_EXECUTOR_TASK_TARGET_URL=$EXECUTOR_URL,UPSCALE_EXECUTOR_TASK_AUDIENCE=$EXECUTOR_URL,UPSCALE_EXECUTOR_TASK_SERVICE_ACCOUNT=$TASK_SERVICE_ACCOUNT,UPSCALE_EXECUTOR_HEALTH_SERVICE_ACCOUNT=$DISPATCH_SERVICE_ACCOUNT,UPSCALE_EXECUTOR_DISPATCH_AUDIENCE=$DISPATCHER_URL,UPSCALE_EXECUTOR_DISPATCH_SERVICE_ACCOUNT=$SCHEDULER_SERVICE_ACCOUNT,UPSCALE_EXECUTOR_CALLBACK_BASE_URL=$CALLBACK_URL/webhooks/replicate"
COMMON_SECRETS="NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL_SECRET_REF,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY_SECRET_REF,REPLICATE_API_TOKEN=$REPLICATE_API_TOKEN_SECRET_REF"

deploy_role() {
  local mode="$1" service="$2" identity="$3" memory="$4" concurrency="$5" maximum="$6" timeout="$7" secrets="$8" url="$9"
  local visibility=--no-allow-unauthenticated binding ref revision service_json revision_json policy
  local -a capacity=(--min-instances=0 --cpu-throttling)
  [[ "$mode" != callbacks ]] || visibility=--allow-unauthenticated
  [[ "$mode" != dispatcher ]] || capacity=(--min-instances=1 --no-cpu-throttling)
  local -a bindings
  IFS=',' read -r -a bindings <<<"$secrets"
  for binding in "${bindings[@]}"; do
    ref="${binding#*=}"
    gc secrets add-iam-policy-binding "${ref%:*}" --member="serviceAccount:$identity" --role=roles/secretmanager.secretAccessor --condition=None >/dev/null
  done
  log "Deploying $mode at $IMAGE_DIGEST"
  run deploy "$service" --image="$IMMUTABLE_IMAGE" --service-account="$identity" --cpu=1 --memory="$memory" --concurrency="$concurrency" --max-instances="$maximum" --timeout="${timeout}s" --port=8080 "${capacity[@]}" "$visibility" --invoker-iam-check --default-url --ingress=all --add-custom-audiences="$url" --set-env-vars="$COMMON_ENV,UPSCALE_EXECUTOR_MODE=$mode" --set-secrets="$secrets" --labels="component=upscale-executor,build-sha=$BUILD_ID" >/dev/null
  run services update-traffic "$service" --to-latest >/dev/null
  service_json="$(run services describe "$service" --format=json)"
  revision="$(jq -r '.status.latestReadyRevisionName // empty' <<<"$service_json")"
  [[ -n "$revision" ]] || die "$service has no ready revision"
  jq -e --arg revision "$revision" --arg audience "$url" '.status.latestCreatedRevisionName == $revision and ([.status.traffic[]? | select(.revisionName == $revision) | (.percent // 0)] | add) == 100 and .metadata.annotations["run.googleapis.com/invoker-iam-disabled"] != "true" and ((.metadata.annotations["run.googleapis.com/custom-audiences"] // "[]" | fromjson) | index($audience)) != null' <<<"$service_json" >/dev/null || die "$service traffic, audience or IAM protection differs from requested configuration"
  revision_json="$(run revisions describe "$revision" --format=json)"
  jq -e --arg image "$IMMUTABLE_IMAGE" --arg account "$identity" --arg expected_env "$COMMON_ENV,UPSCALE_EXECUTOR_MODE=$mode" --arg memory "$memory" --argjson concurrency "$concurrency" --argjson timeout "$timeout" --arg maximum "$maximum" '
    .spec as $s | $s.containers[0] as $c | ($c.env | map({key:.name,value:.value}) | from_entries) as $env |
    $c.image == $image and $s.serviceAccountName == $account and all(($expected_env | split(","))[]; split("=") as $entry | $env[$entry[0]] == $entry[1]) and
    ($c.resources.limits.cpu == "1" or $c.resources.limits.cpu == "1000m") and $c.resources.limits.memory == $memory and $s.containerConcurrency == $concurrency and $s.timeoutSeconds == $timeout and .metadata.annotations["autoscaling.knative.dev/maxScale"] == $maximum
  ' <<<"$revision_json" >/dev/null || die "$service active revision differs from requested identity or capacity"
  for binding in "${bindings[@]}"; do
    ref="${binding#*=}"
    jq -e --arg key "${binding%%=*}" --arg name "${ref%:*}" --arg version "${ref##*:}" 'any(.spec.containers[0].env[]; .name == $key and .valueFrom.secretKeyRef.name == $name and .valueFrom.secretKeyRef.key == $version)' <<<"$revision_json" >/dev/null || die "$service secret reference mismatch"
  done
  policy="$(run services get-iam-policy "$service" --format=json)"
  if [[ "$mode" == callbacks ]]; then
    jq -e 'any(.bindings[]?; .role == "roles/run.invoker" and any(.members[]?; . == "allUsers"))' <<<"$policy" >/dev/null || die "Callback service is not publicly reachable"
  else
    jq -e 'all(.bindings[]?; all(.members[]?; . != "allUsers" and . != "allAuthenticatedUsers"))' <<<"$policy" >/dev/null || die "$service has a public IAM binding"
  fi
}

CALLBACK_SECRETS="$COMMON_SECRETS,REPLICATE_WEBHOOK_SIGNING_SECRET=$REPLICATE_WEBHOOK_SECRET_REF,UPSCALE_EXECUTOR_WAKE_SECRET=$WAKE_SECRET_REF"
[[ -z "${WAKE_PREVIOUS_SECRET_REF:-}" ]] || CALLBACK_SECRETS+=",UPSCALE_EXECUTOR_WAKE_PREVIOUS_SECRET=$WAKE_PREVIOUS_SECRET_REF"
deploy_role executor "$SERVICE_NAME" "$CLOUD_RUN_SERVICE_ACCOUNT" 1Gi 1 10 900 "$COMMON_SECRETS,GEMINI_API_KEY=$GEMINI_API_KEY_SECRET_REF,OPENROUTER_API_KEY=$OPENROUTER_API_KEY_SECRET_REF" "$EXECUTOR_URL"
deploy_role callbacks "$CALLBACK_SERVICE_NAME" "$CALLBACK_SERVICE_ACCOUNT" 512Mi 10 3 60 "$CALLBACK_SECRETS" "$CALLBACK_URL"
for identity in "$TASK_SERVICE_ACCOUNT" "$DISPATCH_SERVICE_ACCOUNT"; do
  run services add-iam-policy-binding "$SERVICE_NAME" --member="serviceAccount:$identity" --role=roles/run.invoker >/dev/null
done
deploy_role dispatcher "$DISPATCHER_SERVICE_NAME" "$DISPATCH_SERVICE_ACCOUNT" 512Mi 1 2 120 "$COMMON_SECRETS" "$DISPATCHER_URL"
run services add-iam-policy-binding "$DISPATCHER_SERVICE_NAME" --member="serviceAccount:$SCHEDULER_SERVICE_ACCOUNT" --role=roles/run.invoker >/dev/null
for pair in "$SERVICE_NAME:$TASK_SERVICE_ACCOUNT" "$SERVICE_NAME:$DISPATCH_SERVICE_ACCOUNT" "$DISPATCHER_SERVICE_NAME:$SCHEDULER_SERVICE_ACCOUNT"; do
  run services get-iam-policy "${pair%%:*}" --format=json | jq -e --arg member "serviceAccount:${pair#*:}" 'any(.bindings[]?; .role == "roles/run.invoker" and any(.members[]?; . == $member))' >/dev/null || die "Required private invoker binding is missing"
done

scheduler_action=create
SCHEDULER_PATH="projects/$GCP_PROJECT_ID/locations/$GCP_REGION/jobs/$SCHEDULER_NAME"
if gc scheduler jobs list --location="$GCP_REGION" --format=json | jq -e --arg full "$SCHEDULER_PATH" --arg short "$SCHEDULER_NAME" 'any(.[]; .name == $full or .name == $short)' >/dev/null; then scheduler_action=update; fi
gc scheduler jobs "$scheduler_action" http "$SCHEDULER_NAME" --location="$GCP_REGION" --schedule='* * * * *' --time-zone=UTC --uri="$DISPATCHER_URL/dispatch" --http-method=POST --message-body='{}' --oidc-service-account-email="$SCHEDULER_SERVICE_ACCOUNT" --oidc-token-audience="$DISPATCHER_URL" --attempt-deadline=120s >/dev/null
gc tasks queues describe "$QUEUE_NAME" --location="$GCP_REGION" --format=json | jq -e '.state == "RUNNING" and .rateLimits.maxConcurrentDispatches == 10 and .rateLimits.maxDispatchesPerSecond == 10 and (.httpTarget // {}) == {}' >/dev/null || die "Queue configuration verification failed"
gc scheduler jobs describe "$SCHEDULER_NAME" --location="$GCP_REGION" --format=json | jq -e --arg url "$DISPATCHER_URL/dispatch" --arg audience "$DISPATCHER_URL" --arg identity "$SCHEDULER_SERVICE_ACCOUNT" '.state == "ENABLED" and .schedule == "* * * * *" and .httpTarget.uri == $url and .httpTarget.httpMethod == "POST" and .httpTarget.oidcToken.audience == $audience and .httpTarget.oidcToken.serviceAccountEmail == $identity' >/dev/null || die "Scheduler configuration verification failed"
log "Verified all three deployment configurations at $BUILD_ID ($IMAGE_DIGEST)"
log "Callback/wake base URL for the separately deployed admission service: $CALLBACK_URL"
log "Next release gate: verify real task delivery, signed callbacks and the database heartbeat before enabling admission."
