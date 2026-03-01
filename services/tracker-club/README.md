# Tracker Club Service

Tracker runtime that ingests club/campaign/upload snapshots into `aggregator`.

## Purpose

- Accept normalized club snapshots from portal automation
- Write club structure payloads to shared aggregator tables
- Expose runtime health/status endpoints

## API

- `GET /health`
- `GET /api/v1/status`
- `POST /api/v1/snapshot/ingest`

## Required Environment

- `TRACKER_CLUB_AGGREGATOR_BASE_URL`

Optional:

- `TRACKER_CLUB_AGGREGATOR_TOKEN`
- `TRACKER_CLUB_PROJECT_KEY`
- `TRACKER_CLUB_SOURCE_LABEL`
