#!/usr/bin/env bash
# Logs a failed deploy to the phak "Deploy Fail Log" project, so time-to-detect and
# repeat failures can be judged from evidence later. Must never fail the pipeline:
# every path exits 0.
set -u

if [ -z "${PHAK_TOKEN:-}" ]; then
  echo "PHAK_TOKEN not set — skipped logging the failed deploy to phak"
  exit 0
fi

project_id="12c6d1e9-eb0c-4e6e-ace7-4a579f472d73"
run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
detected_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
title_line="$(printf '%s' "${COMMIT_TITLE:-}" | head -n 1)"

description=$(cat <<EOF
service: ${GITHUB_REPOSITORY} (GitHub Pages)
branch: ${GITHUB_REF_NAME}
job: ${GITHUB_JOB} (run ${GITHUB_RUN_ID}, attempt ${GITHUB_RUN_ATTEMPT})
job_started_at: ${JOB_STARTED_AT:-unknown}
detected_at: ${detected_at}
commit: ${GITHUB_SHA} ${title_line}
triggered_by: ${GITHUB_ACTOR}
pipeline: ${run_url}
EOF
)

payload=$(jq -n --arg p "$project_id" --arg t "Deploy failed: ${GITHUB_REPOSITORY} ${GITHUB_REF_NAME} ${GITHUB_SHA:0:7}" \
  --arg d "$description" '{project_id: $p, title: $t, description: $d}') || { echo "could not build payload"; exit 0; }

status=$(curl -sS -o /tmp/phak-response.json -w '%{http_code}' --max-time 15 \
  -X POST https://api.phak.pro/api/v1/tasks \
  -H "Authorization: Bearer ${PHAK_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload") || { echo "phak request failed — deploy result unchanged"; exit 0; }

echo "phak responded HTTP ${status}"
exit 0
